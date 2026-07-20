#!/bin/bash
# Vercel ignoreCommand: exit 0 = SKIP the build, exit 1 = proceed.
# Vercel only hosts the marketing site now (app is self-hosted) — skip deploys
# unless marketing-facing files changed. Runs in the project root (apps/web).
# Referenced from vercel.json (inline commands are capped at 256 chars).

# Preview deployments are disabled — the marketing site only needs Production.
# Skip any non-production deployment (VERCEL_ENV is "preview"/"development").
if [ -n "$VERCEL_ENV" ] && [ "$VERCEL_ENV" != "production" ]; then
  echo "Non-production deployment ($VERCEL_ENV) — skipping Vercel build"
  exit 0
fi

# Shallow clone without a parent commit → can't diff → build to be safe
git rev-parse HEAD^ >/dev/null 2>&1 || exit 1

if git diff --quiet HEAD^ HEAD -- \
  src/pages/index.tsx \
  src/pages/_app.tsx \
  src/pages/_document.tsx \
  src/components/layout/marketing-nav.tsx \
  src/components/layout/marketing-footer.tsx \
  src/components/ui \
  src/styles \
  public \
  vercel.json \
  next.config.ts \
  tailwind.config.ts \
  scripts/vercel-ignore.sh; then
  echo "No marketing changes — skipping Vercel build"
  exit 0
fi

echo "Marketing files changed — building"
exit 1
