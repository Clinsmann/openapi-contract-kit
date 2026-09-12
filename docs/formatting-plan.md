# Prettier Formatting

## Objective

Add Prettier-only formatting for maintained TypeScript and configuration files without changing runtime behavior or formatting Markdown documentation. Use root-level Prettier commands with `.prettierignore` defining the boundary.

## Implementation

- [x] Add Prettier configuration and ignore rules for dependencies, generated output, transient output, the lockfile, and Markdown.
- [x] Add root-level `format` and `format:check` package scripts.
- [x] Add the formatting check to CI and document contributor commands.
- [x] Format the agreed TypeScript and configuration scope.

## Verification

- [x] `pnpm run format:check` passes for the root scan with ignored files excluded.
- [x] Markdown, dependencies, generated output, coverage output, and the lockfile are excluded.
- [x] A second `pnpm run format` pass produced an identical diff hash and no file changes.
- [x] The scoped diff has no whitespace errors; source and test changes are Prettier-only.

## DONE Criteria

- [x] All implementation and verification items are complete.
- [x] Only files required for formatting were changed.
- [x] Linting and Markdown formatting remain out of scope.
