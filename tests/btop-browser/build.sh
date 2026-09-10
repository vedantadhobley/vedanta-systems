#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
builder="btop-browser-build-$$"
docker buildx create --name "$builder" --driver docker-container \
  --driver-opt memory=4g,memory-swap=4g,cpu-period=100000,cpu-quota=200000 >/dev/null
trap 'docker buildx rm "$builder" >/dev/null' EXIT
docker buildx build --builder "$builder" --load --progress=plain \
  -f tests/btop-browser/Dockerfile -t vedanta-systems-btop-browser-tests:20260910 .
