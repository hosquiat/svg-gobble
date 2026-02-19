# SVG Gobble Setup Guide

This guide covers how to set up and run SVG Gobble locally or with Docker.

## Prerequisites

- Node.js 20+ (for local development)
- npm or yarn
- Docker & Docker Compose (for containerized deployment)

## Quick Start (Local Development)

### 1. Install Dependencies

```bash
# Install server dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env
```

The default `.env` works out of the box for local development:

```env
DATABASE_URL="file:./data/svg-gobble.db"
```

### 3. Initialize Database

```bash
# Generate Prisma client and create database
npx prisma generate
npx prisma db push
```

### 4. Build and Run

```bash
# Build the client
cd client && npm run build && cd ..

# Build the server
npm run build

# Start the server
npm start
```

The application will be available at `http://localhost:3000`

### Development Mode

For development with hot-reload:

```bash
# Terminal 1: Run the server in dev mode
npm run dev

# Terminal 2: Run the client dev server
cd client && npm run dev
```

## Docker Deployment

### 1. Configure Environment

Create a `.env` file in the project root:

```env
# Required
DATABASE_URL="file:./data/svg-gobble.db"

# Optional: Google Drive backup integration
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-drive/oauth-callback
```

### 2. Build and Run

```bash
docker compose up --build -d
```

The application will be available at `http://localhost:3000`

### Data Persistence

Docker uses named volumes for persistent storage:

- `svg-gobble-data` - SQLite database
- `svg-gobble-backups` - Backup files

To back up your data:

```bash
# Create a backup of the database volume
docker run --rm -v svg-gobble-data:/data -v $(pwd):/backup alpine tar czf /backup/db-backup.tar.gz -C /data .

# Create a backup of the backups volume
docker run --rm -v svg-gobble-backups:/data -v $(pwd):/backup alpine tar czf /backup/backups-backup.tar.gz -C /data .
```

## Google Drive Integration (Optional)

To enable automatic backups to Google Drive, you can either configure it via environment variables OR directly in the app settings.

### Option A: Configure in App (Recommended)

1. Open SVG Gobble in your browser
2. Go to Settings > Backup tab
3. Click "Configure Google Drive"
4. Follow the on-screen instructions to set up Google Cloud credentials
5. Enter your Client ID and Client Secret
6. Click "Save & Connect" to authorize

### Option B: Configure via Environment Variables

#### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the **Google Drive API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"

#### 2. Create OAuth Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Web application"
4. Add authorized redirect URI:
   - For local: `http://localhost:3000/api/google-drive/oauth-callback`
   - For production: `https://your-domain.com/api/google-drive/oauth-callback`
5. Copy the Client ID and Client Secret

#### 3. Configure Environment

Add to your `.env` file:

```env
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-drive/oauth-callback
```

#### 4. Connect in App

1. Open SVG Gobble in your browser
2. Go to Settings > Backup tab
3. Click "Connect Google Drive"
4. Authorize the application
5. Enable "Google Drive" as a backup destination

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database path | `file:./data/svg-gobble.db` |
| `PORT` | Server port | `3000` |
| `BACKUP_DIR` | Directory for local backups | `/app/backups` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | - |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL | `http://localhost:3000/api/google-drive/oauth-callback` |

### Backup Settings

Configure in Settings > Backup:

- **Automatic backups**: Enable/disable scheduled backups
- **Schedule**: Choose from presets or set custom cron expression
- **Retention**: How long to keep backups (7-90 days)
- **Destinations**: Local storage and/or Google Drive

## Database Migrations

When updating to a new version with schema changes:

```bash
# For local development
npx prisma db push

# For Docker (the entrypoint handles this automatically)
docker compose up --build
```

## Troubleshooting

### Database Issues

If you encounter database errors:

```bash
# Reset the database (WARNING: deletes all data)
rm -rf prisma/data
npx prisma db push
```

### Permission Issues (Docker)

If you see permission errors:

```bash
# Fix volume permissions
docker compose down
docker volume rm svg-gobble-data svg-gobble-backups
docker compose up --build
```

### Google Drive Connection Issues

1. Verify your OAuth credentials are correct
2. Check that the redirect URI matches exactly
3. Ensure Google Drive API is enabled in your project
4. Try revoking access at [Google Account Permissions](https://myaccount.google.com/permissions) and reconnecting

## API Endpoints

### Collections
- `GET /api/collections` - List all collections
- `POST /api/collections` - Create collection
- `PUT /api/collections/:id` - Update collection
- `DELETE /api/collections/:id` - Delete collection

### SVGs
- `POST /api/collections/:id/svgs` - Add SVGs to collection
- `PUT /api/svgs/:id` - Update SVG
- `DELETE /api/svgs/:id` - Delete SVG

### Settings
- `GET /api/settings` - Get settings
- `PUT /api/settings` - Update settings

### Backup
- `GET /api/backup` - List backups
- `POST /api/backup` - Create backup
- `POST /api/backup/:id/restore` - Restore backup
- `DELETE /api/backup/:id` - Delete backup
- `GET /api/backup/:id/download` - Download backup
- `GET /api/backup/export` - Export all data
- `POST /api/backup/import` - Import data

### Google Drive
- `GET /api/google-drive/status` - Connection status
- `GET /api/google-drive/auth-url` - Get OAuth URL
- `POST /api/google-drive/disconnect` - Disconnect

### Scraping
- `POST /scrape` - Scrape SVGs from URL
- `POST /parse` - Parse SVGs from HTML

## Health Check

```bash
curl http://localhost:3000/health
```

Returns:
```json
{
  "status": "ok",
  "timestamp": "2026-02-15T12:00:00.000Z"
}
```
