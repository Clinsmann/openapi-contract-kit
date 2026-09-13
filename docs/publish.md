# Publish a patch release

Prepare and publish the next patch release.

## 1. Prepare

From the repository root:

```bash
pnpm version patch --no-git-tag-version
pnpm install --lockfile-only

VERSION="$(node -p "require('./package.json').version")"
PREVIOUS_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"

if [ -n "$PREVIOUS_TAG" ]; then
  RANGE="$PREVIOUS_TAG..HEAD"
else
  RANGE="HEAD"
fi

git log "$RANGE" --pretty=format:'- %s (%h)'
```

Using those commits:

* Add a concise, user-facing entry to the top of `CHANGELOG.md`:

```md
## [$VERSION] - YYYY-MM-DD

- User-facing change or fix.
```

* Exclude internal, release-only, and unrelated changes.
* Prepare a GitHub Release title:

```text
v$VERSION — Short user-facing summary
```

## 2. Validate

```bash
VERSION="$(node -p "require('./package.json').version")"

grep -q "^## \[$VERSION\]" CHANGELOG.md
test -z "$(git tag -l "v$VERSION")"
pnpm install --frozen-lockfile
pnpm run lint
pnpm run format:check
pnpm test
pnpm run pack:check
```

Stop if any validation fails.

## 3. Commit and tag

```bash
git add package.json pnpm-lock.yaml CHANGELOG.md
git commit -m "chore: release v$VERSION"
git tag --annotate "v$VERSION" --message "Release v$VERSION"
git push origin HEAD --follow-tags
```

## 4. Publish GitHub Release

```bash
gh release create "v$VERSION" \
  --verify-tag \
  --title "v$VERSION — Short user-facing summary" \
  --generate-notes
```

Review the generated notes before publishing.

Publishing the GitHub Release triggers `.github/workflows/publish.yml`, which builds, tests, and publishes with provenance.

**Never run `pnpm publish` locally.**
