#!/usr/bin/env bash
# Usage: ./scripts/publish.sh <version>
# Example: ./scripts/publish.sh 1.2.3
#
# Builds the Docker image and pushes it to the Gitea registry with an explicit
# version tag and a moving 'latest' tag.
set -euo pipefail

REGISTRY="git.sogenius.io"
OWNER="hos"
IMAGE_NAME="svg-gobble"

# ── version ──────────────────────────────────────────────────────────────────
VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  # Fall back to the current git tag if no argument supplied
  VERSION="$(git describe --tags --exact-match 2>/dev/null || true)"
fi
if [[ -z "$VERSION" ]]; then
  echo "Error: version required. Pass it as an argument or create a git tag first."
  echo "  Usage: $0 <version>   e.g. $0 1.2.3"
  exit 1
fi
# Strip a leading 'v' so both 'v1.2.3' and '1.2.3' produce the same tag
VERSION="${VERSION#v}"

FULL_IMAGE="${REGISTRY}/${OWNER}/${IMAGE_NAME}"
VERSIONED_TAG="${FULL_IMAGE}:${VERSION}"
LATEST_TAG="${FULL_IMAGE}:latest"

echo "==> Registry : ${REGISTRY}"
echo "==> Image    : ${FULL_IMAGE}"
echo "==> Tags     : ${VERSION}, latest"
echo

# ── login ────────────────────────────────────────────────────────────────────
echo "==> Logging in to ${REGISTRY}"
# Use GITEA_TOKEN env var when available (CI/CD), otherwise prompt interactively.
if [[ -n "${GITEA_TOKEN:-}" ]]; then
  echo "${GITEA_TOKEN}" | docker login "${REGISTRY}" --username "${GITEA_USER:-${OWNER}}" --password-stdin
else
  docker login "${REGISTRY}"
fi

# ── build ─────────────────────────────────────────────────────────────────────
echo "==> Building image"
docker build \
  --tag "${VERSIONED_TAG}" \
  --tag "${LATEST_TAG}" \
  --label "org.opencontainers.image.version=${VERSION}" \
  --label "org.opencontainers.image.revision=$(git rev-parse HEAD 2>/dev/null || echo unknown)" \
  --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  .

# ── push ──────────────────────────────────────────────────────────────────────
echo "==> Pushing ${VERSIONED_TAG}"
docker push "${VERSIONED_TAG}"

echo "==> Pushing ${LATEST_TAG}"
docker push "${LATEST_TAG}"

echo
echo "Done. Pushed:"
echo "  ${VERSIONED_TAG}"
echo "  ${LATEST_TAG}"
