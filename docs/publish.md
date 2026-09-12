# Publishing a patch release

This repository publishes from a GitHub Release. The release tag, `package.json` version, and changelog heading must match.

## 1. Bump the patch version

Run this from the repository root:

```bash
pnpm version patch --no-git-tag-version
pnpm install --lockfile-only
```

For example, `0.0.1` becomes `0.0.2` and the GitHub tag will be `v0.0.2`.

## 2. Generate a changelog draft

The release process checks the changes between the previous tag and the new release commit. This command creates a temporary Markdown changelog draft from that exact commit range:

```bash
VERSION="$(node -p "require('./package.json').version")"
if PREVIOUS_TAG="$(git describe --tags --abbrev=0 2>/dev/null)"; then
  RANGE="$PREVIOUS_TAG..HEAD"
else
  RANGE="HEAD"
fi
{
  echo "## [$VERSION] - $(date -u +%Y-%m-%d)"
  echo
  git log "$RANGE" --pretty=format:'- %s (%h)'
  echo
} > "/tmp/openapi-contract-kit-$VERSION-changelog.md"
cat "/tmp/openapi-contract-kit-$VERSION-changelog.md"
```

Review and edit the draft, then prepend the final entry to `CHANGELOG.md`. Do not copy commit messages blindly; remove internal or unrelated changes.

The changelog draft is for the repository’s `CHANGELOG.md`. GitHub Release notes are generated separately from the same tag history in step 5.

## 3. Validate the release

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

The tag check must print nothing before creating the release.

## 4. Commit and tag

```bash
VERSION="$(node -p "require('./package.json').version")"
git add package.json pnpm-lock.yaml CHANGELOG.md
git commit -m "chore: release v$VERSION"
git tag --annotate "v$VERSION" --message "Release v$VERSION"
git push origin HEAD --follow-tags
```

## 5. Publish the GitHub Release

With GitHub CLI:

```bash
VERSION="$(node -p "require('./package.json').version")"
gh release create "v$VERSION" --verify-tag --title "v$VERSION" --generate-notes
```

`--generate-notes` compares `v$VERSION` with the previous GitHub release/tag and generates the release notes from those changes. Review the generated notes before publishing.

Or use GitHub’s web UI to create a release from the pushed `v$VERSION` tag and select **Generate release notes**, then publish it. Publishing the release triggers `.github/workflows/publish.yml`, which runs the build, tests, and `pnpm publish --provenance`.

Do not run `pnpm publish` locally for normal future releases; the GitHub workflow owns publishing.
