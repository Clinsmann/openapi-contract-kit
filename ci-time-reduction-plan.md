# CI time reduction

## Objective

Reduce CI wall-clock time by removing repeated TypeScript compilation while preserving the existing local script behavior.

## Findings

- `.github/workflows/ci.yml` runs `pnpm test` and `pnpm run pack:check`.
- Both scripts currently invoke `pnpm run build`.
- The integration tests require generated declarations in `dist/src/runtime.d.ts`, so CI must build before tests.
- `format:check` and `typecheck` are independent checks, but this change intentionally keeps the single job to avoid duplicating dependency setup for this small package.

## Implementation

- Add `test:unit`, which runs the existing Vitest command without compiling.
- Change CI to run `build` once, then `test:unit` and `pnpm pack --dry-run`.
- Change publish verification to run `build` once, then `test:unit` before publishing.
- Preserve `test` and `pack:check` for local use.

## Validation

- Passed `pnpm run format:check`.
- Passed `pnpm run typecheck`.
- Passed `pnpm run build`.
- Passed `pnpm run test:unit` (2 files, 12 tests).
- Passed `pnpm pack --dry-run`.
- Passed `git diff --check`.
- Final status contains only the plan, package manifest, and the two workflows.

## DONE criteria

- CI and publish workflows compile only once before their dependent work.
- Existing local script contracts remain intact.
- All targeted validation passes.
- Only the plan, package manifest, and the two workflows are touched.

## Current state

DONE. CI and publish workflows now compile once and reuse the generated output.
