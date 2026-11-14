#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

IMAGE="${IMAGE:-git.neo24.net/self-projects/tpm:latest}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
BUILDER="${BUILDER:-tpm-builder}"

if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  docker buildx create --name "$BUILDER" --use
else
  docker buildx use "$BUILDER"
fi

docker buildx build \
  --platform "$PLATFORMS" \
  -t "$IMAGE" \
  --push \
  .
