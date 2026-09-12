# README validation-flow documentation

## Objective

Document the existing non-throwing validation flow and package/generated exports in `README.md`.

## Decisions

- Makers return `Result` values and do not throw validation errors.
- Callers may inspect `errors`, return them, or throw their own application error.
- The documentation covers the package root, runtime subpath, generated schema modules, and generated endpoint modules.
- The pre-existing `docs/openapi-contract-kit-roadmap.md` change is out of scope.

## Completed implementation

- Added a `try/catch` example showing caller-controlled logging and throwing.
- Added a direct result-handling example.
- Added the current package and generated export map.

## Validation

- `git diff --check -- README.md`: passed.
- `pnpm exec prettier --check README.md`: blocked because dependencies were unavailable and pnpm could not resolve the configured registry.
- Local Prettier executable was unavailable.

## DONE criteria

- README accurately describes the current API.
- No source, tests, package configuration, or roadmap files were changed.
- Formatting issues are absent according to `git diff --check`.
