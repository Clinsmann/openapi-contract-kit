# API surface documentation plan

## Objective
Rewrite the README as a short, consumer-focused library guide covering install, configure, generate, validate, generated APIs, and Fetch/Axios/React Query integration.

## Findings
- Root package export: `generateOpenApiRuntime` and `main`, plus their option/result types.
- `/runtime` export: `ValidationPath`, `ValidationIssue`, `Result<T>`, and `MakeResult<T>` types only; no runtime values.
- CLI command: `openapi-contract-kit` / `main`, with `--config`, `--spec`, `--out`, `--runtime-import`, and `--types-file` flags.
- Generated files: root types file; one maker per schema; shared validators; one endpoint module per operation.
- Generated makers return `{ ok: true, value }` or `{ ok: false, errors }`, never validation-throw; success returns the original input reference.
- Endpoint modules export `URL`, `METHOD`, `OPERATION_ID`, request/response type aliases, `makeRequest`, and `makeResponse` with `.success` and `.error` validators.
- Input is OpenAPI 3.1 JSON/YAML; JSON-only request/response bodies, required request bodies, numeric response statuses, local refs only; path/operation parameters and remote refs unsupported.
- README rewrite is documentation-only and preserves current API names and behavior.
- README examples show caller-owned error handling and transport composition.

## Implementation/documentation steps
- Completed README rewrite with install/configure/generate flow.
- Documented runtime result types, schema makers, endpoint metadata, request/response validators, and status-correlated response types.
- Added concise Fetch, Axios, and React Query usage examples.
- Documented supported input and current limitations without promising roadmap APIs.

## Validation
- Verified exports, package `exports`/`bin`, README, generator templates, model parsing, and focused tests by source inspection.
- `pnpm exec prettier --check README.md` passed.
- `git diff --check -- README.md` passed.

## DONE criteria
- Public exports and CLI are covered.
- Generated consumer API is described with concrete shapes.
- Internal-only code is clearly distinguished.
- Plan records final implementation state and validation.
