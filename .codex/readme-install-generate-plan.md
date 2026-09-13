# README installation and generation guidance

## Objective

Clarify how consumers install the package, configure and run generation, add a
repeatable package script, and handle disposable generated output.

## Decisions

- Generated output is disposable and should be ignored by Git.
- The documented default output directory is `src/api/generated/`.
- The `generate` script is shown in the consumer application's `package.json`,
  not this package's `package.json`, because this repository has no generation
  config.

## Implementation

- Split the README workflow into Install, Configure, Add a generation script,
  Generate, and Generated files sections.
- Document config fields, CLI overrides, regeneration triggers, and the
  `.gitignore` rule.
- Document `src/api/generated/` as a consumer-project `.gitignore` entry; do
  not add it to this generator repository's `.gitignore`.

## Validation

- Run `git diff --check`.
- Attempt targeted Prettier checks for `README.md` and `.gitignore`; the local
  Prettier binary was unavailable and registry access is unavailable.
- Review the focused diff and preserve unrelated pre-existing changes.

## DONE criteria

- A new consumer can install, configure, script, and run generation from the
  README without inferring missing steps.
- The README clearly states generated files are not committed.
- The default generated directory is documented for consumers to ignore.
- No source or package behavior changes are made.

## Final state

- Completed: README now separates installation, configuration, script setup,
  generation, and generated-file guidance.
- Completed: README documents disposable generated output and custom `outDir`
  ignore guidance.
- Completed: `src/api/generated/` added to `.gitignore`.
- Verified: `git diff --check` passes.
- Not run: Prettier check, because no local Prettier binary is installed and
  the configured registry is unreachable.
