# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
npm install && cd client && npm install && cd ..

# Development (run in separate terminals)
npm run dev           # Server: runs prisma db push + ts-node (port 3000)
npm run dev:client    # Client: Vite dev server (port 5173, proxies /api to :3000)

# Build
npm run build         # Compile server TypeScript → dist/
npm run build:client  # Vite build → client/dist/
npm run build:all     # Both

# Production
npm start             # node dist/server.js (serves API + static client build)

# Database
npm run db:push       # Apply schema changes (npx prisma db push)
npm run db:studio     # Prisma Studio GUI
npx prisma generate   # Regenerate client after schema changes

# Docker
docker compose up --build -d
docker compose logs -f
```

## Architecture

This is a **monorepo** with two separate TypeScript projects:
- **`/` (server)** — Express.js API + SQLite via Prisma, compiled to `dist/`
- **`/client/` (frontend)** — React 18 + Vite + Tailwind CSS

In production, the server serves the built client from `client/dist/` as static files and handles all `/api/*` routes.

### Server (`src/`)

- `server.ts` — Express app entry; mounts routers, seeds default collection, starts cron jobs, serves static client
- `routes/` — REST API handlers: `collections.ts`, `svgs.ts`, `settings.ts`, `backup.ts`, `googleDrive.ts`
- `services/` — `backupService.ts` (local + Google Drive backup), `googleDriveService.ts` (OAuth + Drive API calls to `App Backups/svg-gobble/` folder)
- `jobs/` — `archiveCleanup.ts` (cron: purge old archived items), `backupJob.ts` (cron: scheduled backups)
- `extractor.ts` — Cheerio-based SVG extraction from HTML (inline, external `<img src>`, CSS background)
- `fetcher.ts` — Axios wrapper to fetch URLs and resolve external SVG references
- `utils/hash.ts` — SHA hash of SVG content used for duplicate detection

### Database (Prisma / SQLite)

Key models in `prisma/schema.prisma`:
- **`Collection`** — Hierarchical (self-referencing `parentId`). One collection has `isDefault: true` (seeded on first start, cannot be deleted/archived). Soft-delete via `archivedAt`.
- **`Svg`** — Belongs to a Collection. Has `contentHash` (indexed) for duplicate detection. Soft-delete via `archivedAt`.
- **`Settings`** — Singleton row (id = `"singleton"`): card size, show sizes/names, backup config.
- **`GoogleDriveAuth`** / **`GoogleDriveConfig`** — Singleton rows for OAuth tokens and credentials.

The collections API endpoint (`GET /api/collections`) returns only **root collections** (where `parentId = null`) with `children` nested 3 levels deep. This means the tree is limited to 3 levels of nesting.

### Client (`client/src/`)

- `App.tsx` — Single-page app; owns all state: active collection, view mode (`collection` | `all-svgs`), selection, search, UI toggles
- `api/client.ts` — Typed fetch wrappers for all API endpoints (`collectionsApi`, `svgsApi`, `settingsApi`, `backupApi`, `googleDriveApi`)
- `hooks/useCollections.ts` — Central data hook; calls REST API and calls `refetch()` (full collection tree reload) after every mutation
- `hooks/useLocalStorage.ts` — Persists UI state (active collection ID, card size, sidebar width, etc.)
- `hooks/useSettings.ts` — Fetches/updates server-side settings
- `components/` — `Sidebar`, `SvgGrid`, `UploadZone`, `SvgEditor` (CodeMirror XML editor + SVGO optimization), `SettingsPage`, modals
- `types.ts` — Shared TypeScript interfaces (`Collection`, `ExtractedSvg`, `Settings`, etc.)

### Data Flow Pattern

Every mutation (add SVG, rename collection, etc.) goes through `useCollections` which always calls `refetch()` afterward — this reloads the full collection tree from the server. There is no optimistic updating.

The `flattenCollections()` utility (exported from `useCollections`) flattens the nested tree into a flat array for lookups. The "All SVGs" view aggregates SVGs across all non-archived collections using this flattened list.

### SVG Deduplication

When uploading SVGs, the client calls `POST /api/svgs/check-duplicates` with SVG content strings and an optional `collectionId`. The server hashes each SVG and compares against existing `contentHash` values in the database. Duplicates trigger a modal to skip or add anyway.

### Environment Variables

```env
DATABASE_URL="file:./data/svg-gobble.db"  # Required
PORT=3000                                   # Optional, default 3000
BACKUP_DIR=/app/backups                     # Optional
GOOGLE_CLIENT_ID=...                        # Optional: Google Drive OAuth
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-drive/oauth-callback
```

Google Drive credentials can also be stored in the DB (via Settings UI) instead of env vars.
