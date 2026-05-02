# SVG Gobble

A self-hosted web app for scraping, organizing, and managing SVG files from any webpage.

![Stack](https://img.shields.io/badge/stack-Node.js%20%2B%20React%20%2B%20SQLite-blue)

## What it does

Paste a URL or raw HTML — SVG Gobble extracts every SVG on the page and drops them into a collection. From there you can browse, edit, optimize, duplicate, archive, and back up your library. A built-in duplicate detector (content hashing) prevents clutter when re-importing from the same source.

**Core features:**
- Scrape SVGs from a URL or paste raw HTML
- Hierarchical collections with emoji icons
- In-browser SVG editor with syntax highlighting
- Duplicate detection before import
- SVGO optimization (minimal / default / aggressive presets)
- Scheduled backups with configurable retention
- Google Drive backup sync (OAuth)
- Soft-delete / archive with automatic cleanup

---

## Tech stack

| Layer | Tech |
|-------|------|
| Server | Node.js, Express, TypeScript |
| Database | SQLite via Prisma |
| Scraping | Cheerio, Axios |
| Frontend | React 18, Vite, TailwindCSS |
| Editor | CodeMirror |
| Optimization | SVGO |
| Scheduling | node-cron |
| Container | Docker / Docker Compose |

---

## Project layout

```
svg-gobble/
├── src/
│   ├── server.ts               # Express entry point
│   ├── routes/                 # REST handlers
│   │   ├── collections.ts
│   │   ├── svgs.ts
│   │   ├── settings.ts
│   │   ├── backup.ts
│   │   └── googleDrive.ts
│   ├── services/
│   │   ├── backupService.ts
│   │   └── googleDriveService.ts
│   ├── jobs/
│   │   ├── backupJob.ts        # Scheduled backups
│   │   └── archiveCleanup.ts   # Auto-delete expired archives
│   ├── extractor.ts            # SVG extraction logic
│   ├── fetcher.ts              # URL fetching
│   └── db.ts                   # Prisma client
├── client/
│   └── src/
│       ├── App.tsx
│       ├── components/
│       ├── hooks/
│       │   ├── useCollections.ts
│       │   ├── useSettings.ts
│       │   └── useLocalStorage.ts
│       └── api/client.ts
├── prisma/schema.prisma
├── docker-compose.yml
└── docker-compose.prod.yml
```

---

## Running locally

**Requirements:** Node.js 18+, npm

```bash
# 1. Install dependencies
npm install
cd client && npm install && cd ..

# 2. Configure environment
cp .env.example .env        # edit DATABASE_URL, PORT if needed

# 3. Set up the database
npx prisma generate
npx prisma db push

# 4. Start dev servers (two terminals)
npm run dev                 # backend  → http://localhost:3000
cd client && npm run dev    # frontend → http://localhost:5173
```

The Vite dev server proxies API calls to the backend, so use port 5173 for the full app during development.

---

## Running with Docker

```bash
docker compose up --build -d
```

App available at `http://localhost:3000`. Data and backups are persisted to named volumes.

For production:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

---

## Production build (no Docker)

```bash
npm run build:all   # compiles server + client
npm start           # serves everything from port 3000
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./data/svg-gobble.db` | SQLite database path |
| `PORT` | `3000` | HTTP server port |
| `BACKUP_DIR` | `/app/backups` | Where backup files are stored |
| `GOOGLE_CLIENT_ID` | — | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth app client secret |
| `GOOGLE_REDIRECT_URI` | — | OAuth redirect URI |

Google Drive credentials are optional. When omitted, the Google Drive backup option is hidden in the UI.

---

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/scrape` | Scrape SVGs from a URL |
| POST | `/parse` | Extract SVGs from raw HTML |
| GET/POST/PUT/DELETE | `/api/collections` | Collection CRUD |
| POST | `/api/collections/:id/archive` | Archive a collection |
| POST | `/api/collections/:id/restore` | Restore from archive |
| PUT/DELETE | `/api/svgs/:id` | Update or delete an SVG |
| POST | `/api/svgs/:id/duplicate` | Duplicate an SVG |
| POST | `/api/svgs/check-duplicates` | Pre-import duplicate check |
| GET/PUT | `/api/settings` | App settings |
| GET/POST/DELETE | `/api/backup` | Backup management |
| GET | `/api/google-drive/status` | Google Drive connection status |
| GET | `/api/google-drive/auth-url` | Start OAuth flow |
| POST | `/api/google-drive/disconnect` | Revoke OAuth |
| GET | `/health` | Health check |

---

## Google Drive setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable the **Google Drive API**
3. Create OAuth 2.0 credentials (Web application type)
4. Set your redirect URI (e.g. `http://localhost:3000/api/google-drive/callback`)
5. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` to your `.env`
6. Connect in **Settings → Backup → Google Drive** inside the app

---

## Database schema

- **Collection** — hierarchical folders; supports emoji, parent-child nesting, soft-delete
- **Svg** — SVG content with SHA-256 hash for duplicate detection; belongs to a collection
- **Settings** — singleton row: display preferences (card size, labels), backup schedule/retention, SVGO preset
- **Backup** — backup file metadata: filename, size, type, status, optional Google Drive file ID
- **GoogleDriveAuth** — OAuth tokens (access, refresh, expiry)
- **GoogleDriveConfig** — stored OAuth app credentials

---

## Contributing

1. Fork the repo and create a branch
2. Run `npm run dev` + `cd client && npm run dev`
3. Make changes, test, open a PR against `main`
