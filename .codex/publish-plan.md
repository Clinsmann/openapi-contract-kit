# Publish guide preparation

## Objective

Prepare `docs/publish.md` as an accurate, executable guide for releasing this
package through the repository's GitHub Release workflow.

## Findings

- `package.json` uses pnpm 12.3.4 and Node.js 24+.
- Releases are published by `.github/workflows/publish.yml` when a GitHub
  Release is published.
- The workflow runs install, build, unit tests, and `pnpm publish --provenance
  --no-git-checks`.
- The existing draft reused a shell variable across separate code blocks.
- `docs/publish.md` already contained the intended release flow; preserve its
  scope and wording unless required for correctness.

## Implementation

- Recompute `VERSION` in each shell block that uses it.
- Keep local publishing explicitly prohibited because CI owns npm publishing.

## Validation

- Read the final Markdown and inspect the focused diff.
- Preserve pre-existing user modifications.

## DONE criteria

- The guide matches the package scripts and publish workflow.
- Every shell snippet can resolve its own `VERSION` variable.
- Changelog and tag checks are documented.
- No unrelated files are modified.

## Final state

- Completed: `VERSION` is initialized in the commit/tag and GitHub Release
  snippets independently.
- Verified: targeted Prettier check and `git diff --check` pass.
- Completed: release execution touched only `package.json`, `CHANGELOG.md`, and this task plan; the pre-existing `docs/publish.md` change was preserved.

## Release execution (2026-09-13)

- Completed: bumped `package.json` from `0.0.5` to `0.0.6` using pnpm 12.3.4 with `--no-git-checks` because the worktree contained pre-existing user changes.
- Completed: ran `pnpm install --lockfile-only`; no lockfile content changed.
- Completed: reviewed commits after `v0.0.5` and prepended `0.0.6` release notes to `CHANGELOG.md`.
- Remaining: no commit, tag, push, GitHub Release, or package publish was performed, per `docs/publish.md`.
