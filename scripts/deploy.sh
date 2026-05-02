#!/usr/bin/env bash
# Usage: ./scripts/deploy.sh <version>
# Example: ./scripts/deploy.sh 1.2.3
#
# Run this on the target Linux server.
# It pulls the specified image version and restarts the stack via docker compose.
set -euo pipefail

REGISTRY="git.sogenius.io"
OWNER="hos"
IMAGE_NAME="svg-gobble"

# ── version ──────────────────────────────────────────────────────────────────
VERSION="${1:-latest}"
VERSION="${VERSION#v}"

FULL_IMAGE="${REGISTRY}/${OWNER}/${IMAGE_NAME}"
VERSIONED_TAG="${FULL_IMAGE}:${VERSION}"

COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker-compose.yml"
COMPOSE_PROD_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker-compose.prod.yml"

echo "==> Deploying ${VERSIONED_TAG}"
echo

# ── login ────────────────────────────────────────────────────────────────────
echo "==> Logging in to ${REGISTRY}"
if [[ -n "${GITEA_TOKEN:-}" ]]; then
  echo "${GITEA_TOKEN}" | docker login "${REGISTRY}" --username "${GITEA_USER:-${OWNER}}" --password-stdin
else
  docker login "${REGISTRY}"
fi

# ── pull ──────────────────────────────────────────────────────────────────────
echo "==> Pulling ${VERSIONED_TAG}"
docker pull "${VERSIONED_TAG}"

# ── deploy ────────────────────────────────────────────────────────────────────
echo "==> Starting stack"
APP_IMAGE="${VERSIONED_TAG}" \
  docker compose \
    -f "${COMPOSE_FILE}" \
    -f "${COMPOSE_PROD_FILE}" \
    up -d --remove-orphans

echo "==> Removing dangling images"
docker image prune -f

echo
echo "Done. Running containers:"
docker compose -f "${COMPOSE_FILE}" -f "${COMPOSE_PROD_FILE}" ps
