# TODO

Planned project work, in implementation order:

- [ ] Migrate the build and package entry points to Rspack.
- [ ] Migrate package management from npm to pnpm; commit the pnpm lockfile and update contributor commands.
- [ ] Replace `.mjs` source and CLI files with TypeScript equivalents, preserving the public exports and generated output.
- [ ] Add basic linting and formatting with package scripts and CI coverage.
- [ ] Accept both `.yml` and `.yaml` OpenAPI documents, including clear parse errors and tests.
- [ ] Update the supported Node.js engine and CI matrix to Node 26.
- [ ] Add deterministic dry-run generation coverage for every supported scenario, without writing generated files.
- [ ] Rewrite the README as a concise library guide with installation, configuration, generation, validation, and generated-code examples.
- [ ] Add current repository status metadata to the README (likes/stars, package size, and other relevant indicators), with a reproducible update process.
- [ ] Add the final published npm package link to the README after release.
- [ ] Type validated maker results with the validated shape: for example, `makeAuthenticatedUser` should return `Result<ShapeOfAuthenticatedUser>`, where `ShapeOfAuthenticatedUser` aliases `AuthenticatedUser`.

## Definition of done

- [ ] Tests cover JSON, YAML, and YAML parsing failures.
- [ ] Dry runs cover all supported schema and endpoint scenarios and are deterministic.
- [ ] Lint, format, typecheck, tests, and packaging run successfully on Node 26 with pnpm.
- [ ] README examples are executable against the published package.


use node 26 on all places.