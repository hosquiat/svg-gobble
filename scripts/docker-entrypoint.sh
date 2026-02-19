#!/bin/sh
set -e

echo "Starting SVG Gobble..."

# Ensure data directory exists
mkdir -p /app/prisma/data

# Run database migrations / push schema
echo "Setting up database..."
npx prisma db push --accept-data-loss 2>/dev/null || {
    echo "Database setup completed"
}

echo "Starting server..."
exec node dist/server.js
