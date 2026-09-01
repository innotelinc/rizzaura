#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# build-release-artifacts.sh — bundle the release payload.
#
# Produces, under dist/release/:
#   rizzaura-platform-<version>-source.tar.gz   full source tree
#   dist-app.tar.gz / dist-rankings.tar.gz / dist-community.tar.gz / dist-admin.tar.gz
#   SHA256SUMS                                   checksums for every file
#
# Run from the repo root after `npm run build`. Consumed by
# .github/workflows/release.yml on every v* tag.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
VERSION="${VERSION:-$(git describe --tags --abbrev=0 2>/dev/null || echo dev)}"
OUT="dist/release"
mkdir -p "$OUT"

echo "── bundling source (v${VERSION}) ──"
tar --exclude=.git --exclude=node_modules --exclude=.env -czf "$OUT/rizzaura-platform-${VERSION}-source.tar.gz" .

echo "── bundling per-service dists ──"
for svc in app rankings community admin; do
  if [ -d "apps/$svc/dist" ]; then
    tar -czf "$OUT/dist-$svc.tar.gz" -C "apps/$svc" dist
    echo "  dist-$svc.tar.gz"
  else
    echo "  WARN apps/$svc/dist missing — skipped"
  fi
done

echo "── checksums ──"
(cd "$OUT" && sha256sum *.tar.gz > SHA256SUMS)
cat "$OUT/SHA256SUMS"
echo "PASS artifacts in $OUT"
