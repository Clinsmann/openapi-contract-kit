# Changelog

## [0.0.6] - 2026-09-13

- Consolidated generated API output into a single `api.ts` file with operation-specific request and response makers.
- Added YAML OpenAPI document support and configurable root schema type filenames.
- Improved generated validation behavior, including status-independent responses and deduplicated inline validators.
- Require a configurable `typesFile` value for generated root schema types and add the `--types-file` CLI override.
- Accept `.json`, `.yml`, and `.yaml` OpenAPI documents using extension-based parsing.


## [0.0.5] - 2026-09-12

- Tighten generated pragmatic email-format validation and modularize primitive and constraint renderers.

## [0.0.4] - 2026-09-12

- Lowered the supported Node.js baseline to Node 24 and added CI coverage for Node 24 and 26.

## [0.0.3] - 2026-09-12

- Fixed GitHub Release publishing from detached tag checkouts by disabling pnpm branch checks in the publish workflow.

## [0.0.2] - 2026-09-12

- Added linting to the development and CI workflows.
- Streamlined the test workflow around the build and unit-test commands.
- Updated the CI and publishing workflows for the current toolchain.

## [0.1.0] - 2026-09-11

- Initial public release.
- JSON OpenAPI 3.1 generator.
- Generated schema and endpoint runtime validators.
