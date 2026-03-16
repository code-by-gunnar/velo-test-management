#!/bin/bash
# Usage: ./scripts/release.sh 1.0.0
# Bumps version in all package.json files, commits, tags, and pushes to production.

set -e

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh <version>"
  echo "Example: ./scripts/release.sh 1.0.0"
  exit 1
fi

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be in semver format (e.g., 1.0.0)"
  exit 1
fi

echo "Releasing v${VERSION}..."

# Ensure we're on master and clean
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "master" ]; then
  echo "Error: Must be on master branch (currently on ${BRANCH})"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree is dirty. Commit or stash changes first."
  exit 1
fi

# Bump versions in all package.json files
echo "Bumping version to ${VERSION}..."
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" apps/api/package.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" apps/web/package.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" packages/types/package.json

# Commit and tag
git add apps/api/package.json apps/web/package.json packages/types/package.json
git commit -m "release: v${VERSION}"
git tag -a "v${VERSION}" -m "Release v${VERSION}"

# Push commit and tag
git push origin master
git push origin "v${VERSION}"

# Sync staging
git checkout staging
git merge master --no-edit
git push origin staging
git checkout master

echo ""
echo "✓ Released v${VERSION}"
echo "  - All package.json files bumped"
echo "  - Git tag v${VERSION} created and pushed"
echo "  - Production and staging deployed"
