# Vitest migration

## Objective

Migrate the 12 existing Node test-runner tests to Vitest while preserving compiled-output, CLI, filesystem, process, and validation coverage.

## Implementation

- Add Vitest 5 as a development dependency and update the lockfile.
- Run the build first, then execute the two source test files explicitly with Vitest's `forks` pool so compiled `dist/test` files are not discovered a second time.
- Replace `node:test` imports with explicit Vitest `test` imports; retain Node strict assertions and existing cleanup.
- Ignore Vitest artifacts in `.gitignore`.

## Verification

- `pnpm test` passes all 12 tests.
- Typecheck, targeted formatting, and packaging checks pass.
- No production source, public API, generated fixture, CI, or historical planning files change.

## Status

- [x] Plan created before implementation changes.
- [x] Dependency and runner changes implemented.
- [x] Tests and targeted validation pass: Vitest reports 2 files and 12 tests passing; typecheck, targeted Prettier, and packaging checks also pass.
