#!/bin/sh
set -e

echo "Starting SVG Gobble..."

# ── Load persisted DB config (written by the settings UI) ────────────────────
DB_CONFIG_FILE="/app/prisma/data/db-config.json"
if [ -f "$DB_CONFIG_FILE" ]; then
  # Parse type and url with Node (already available in the image)
  PARSED=$(node -e "
    const c = require('$DB_CONFIG_FILE');
    process.stdout.write(c.type + '|' + c.url);
  " 2>/dev/null || true)

  if [ -n "$PARSED" ]; then
    SAVED_TYPE=$(echo "$PARSED" | cut -d'|' -f1)
    SAVED_URL=$(echo "$PARSED" | cut -d'|' -f2-)
    # Only apply if the caller didn't already set DATABASE_TYPE explicitly
    if [ -z "$DATABASE_TYPE" ] || [ "$DATABASE_TYPE" = "sqlite" ]; then
      DATABASE_TYPE="$SAVED_TYPE"
      DATABASE_URL="$SAVED_URL"
      echo "Using saved database config: $DATABASE_TYPE"
    fi
  fi
fi

# Auto-detect DB type from URL if DATABASE_TYPE not explicitly set
DATABASE_URL="${DATABASE_URL:-file:./data/svg-gobble.db}"
if [ -z "$DATABASE_TYPE" ] || [ "$DATABASE_TYPE" = "sqlite" ]; then
  case "$DATABASE_URL" in
    mysql://*|mysql2://*) DATABASE_TYPE="mysql" ;;
    *) DATABASE_TYPE="sqlite" ;;
  esac
fi
DB_TYPE="$DATABASE_TYPE"
export DATABASE_TYPE DATABASE_URL

# ── Schema setup ─────────────────────────────────────────────────────────────
if [ "$DB_TYPE" = "mysql" ]; then
  echo "Database: MySQL/MariaDB"
  MAX_RETRIES=30
  i=0
  echo "Waiting for database connection..."
  until npx prisma db push --schema=prisma/schema.mysql.prisma --accept-data-loss > /dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge "$MAX_RETRIES" ]; then
      echo "ERROR: Could not connect to MySQL after ${MAX_RETRIES} attempts. Check DATABASE_URL."
      exit 1
    fi
    echo "  Not ready yet, retrying ($i/$MAX_RETRIES)..."
    sleep 2
  done
  echo "MySQL schema ready."
else
  echo "Database: SQLite"
  mkdir -p /app/prisma/data
  npx prisma db push --accept-data-loss > /dev/null 2>&1 || true
  echo "SQLite schema ready."
fi

echo "Starting server..."
exec node dist/server.js
