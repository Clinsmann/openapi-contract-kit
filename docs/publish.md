# Prepare a release

Prepare the next patch release.

1. Bump the patch version in `package.json` and update the lockfile:

```bash
pnpm version patch --no-git-tag-version
pnpm install --lockfile-only
```

2. Find all changes since the latest Git tag:

```bash
git log "$(git describe --tags --abbrev=0)..HEAD" --oneline
```

3. Review those changes and prepend release notes to `CHANGELOG.md`:

```md
## [VERSION] - YYYY-MM-DD

- Highlight the important user-facing changes.
- Summarize related commits into meaningful release notes.
```

Keep the release notes concise. Focus on meaningful changes since the last tag rather than copying commit messages verbatim.

Do not commit, tag, push, create a GitHub Release, or publish the package.
