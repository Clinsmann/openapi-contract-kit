# OpenAPI Generated Types and Validators

## 1. Feature Summary

Generate both static TypeScript types and concrete runtime validator functions from an OpenAPI YAML spec, in a single generation pass over one shared, resolved schema representation (the IR). Every named schema gets its own standalone maker function (e.g. `makeUser`, `makeLoginRequest`). Endpoint modules compose these flat makers instead of defining their own validation logic. The generator reads its input spec path and output directory from a config file, so the whole `scripts/` folder can be copied into another project, repointed at that project's YAML, and run with one command — no code changes.

## 2. API Contracts

Name Method Path
━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Login POST /v1/login
───────────────────────── ──────── ───────────────────────────────
Signup POST /v1/signup
───────────────────────── ──────── ───────────────────────────────
Logout POST /v1/logout
───────────────────────── ──────── ───────────────────────────────
ResetPassword POST /v1/reset-password
───────────────────────── ──────── ───────────────────────────────
ForgotPassword POST /v1/forgot-password
───────────────────────── ──────── ───────────────────────────────
EmailVerification POST /v1/email-verification
───────────────────────── ──────── ───────────────────────────────
ResendVerificationEmail POST /v1/resend-verification-email
───────────────────────── ──────── ───────────────────────────────
GetLoggedInUser GET /v1/me

### Two tiers of generated output

**Schema makers** — one per named schema, the actual validation logic:

- `makeUser(input)`, `makeLoginRequest(input)`, `makeLoginSuccessResponse(input)`, etc.
- Each returns `{ ok: true, value }` or `{ ok: false, errors }`.
- Importable and callable on their own, outside any endpoint.

**Endpoint modules** — one per operation, composed from schema makers, exporting:

- `URL`
- `METHOD`
- `OPERATION_ID`
- `ShapeOfRequest`, `ShapeOfSuccessResponse`, `ShapeOfErrorResponse`, `ShapeOfResponse` (types)
- `makeRequest` — the request-body schema maker for this operation (or a null-body maker for bodyless requests)
- `makeResponse` — dispatches by status code; also carries `makeResponse.success` and `makeResponse.error`, which are direct references to that operation's response schema makers

Makers never throw, mutate input, coerce values, insert defaults, or remove unknown fields.

## 3. Files & Functions to Touch

Create:

- `.agents/plans/openapi-runtime-validator.md`
- `openapi.config.json` — `{ "specPath": "...", "outDir": "..." }`, the single place a copied setup gets repointed at a new project
- `scripts/generateOpenApiRuntime.mjs`
- `scripts/generateOpenApiRuntime.test.mjs`
- `scripts/fixtures/openapi-runtime.yaml`
- `src/api/openapiRuntime.ts` — shared result/error primitives only (`Result<T>`, error type, path type)

Modify:

- `package.json` — add `"openapi:generate": "node scripts/generateOpenApiRuntime.mjs"`, runnable as `pnpm openapi:generate` (the script itself is plain Node, so it also runs fine under `yarn` or `npm run` in whatever project it's copied into)
- `pnpm-lock.yaml` (this project's own install only — copies of the generator into other projects don't carry this file)

Remove:

- `scripts/appendOpenApiShapeAliases.mjs`

Generated and ignored (written under `outDir` from config, default `src/api/generated`):

- `src/api/generated/schemas/*.ts` — one file per named schema, each exporting its `make<SchemaName>` function
- `src/api/generated/endpoints/*.ts` — one file per operation, composing schema makers as described above
- `src/api/generated/index.ts` — barrel re-exporting every endpoint module by name (kept generic, not project-specific, so it doesn't need renaming when copied)

### Generator pipeline

1. Resolve spec path + output dir from `openapi.config.json`, overridable with `--spec <path>` and `--out <dir>` CLI flags.
2. Document loading — parse the YAML directly into a JS object. OpenAPI 3.1 schemas are already JSON Schema, so no separate YAML→JSON-Schema conversion step exists.
3. Reference resolution — resolve every local and external `$ref` once, into a single deduped map keyed by canonical component name. This map is the **IR**, and is the only thing every later step reads from.
4. Schema naming — assign stable names/aliases (e.g. `ShapeOfLoginRequest`) directly on the IR entries, before either emitter runs.
5. Operation collection — walk paths/methods in stable order, require unique `operationId`, derive endpoint names.
6. Type emission — reads the IR, writes `ShapeOf<Name>` types.
7. Schema maker emission — reads the same IR, writes one `make<Name>` function per schema.
8. Endpoint rendering — composes schema makers into `URL`/`METHOD`/`makeRequest`/`makeResponse` per operation.
9. Deterministic file writing.

Because steps 6 and 7 both read step 3–4's output and nothing else, generated types and generated makers can't drift apart from separate naming passes.

## 4. Database / Data Layer Changes

None.

## 5. Mock API

None. Tests call generated makers directly. `chance` from the separate mock-api package is not used.

## 6. Storybook

None.

## 7. API Layer

Static types and runtime makers are both emitted from the same resolved schema IR, in the same generation pass — no separate use of `openapi-typescript` or any other type-generation library.

Generated application modules must not import or execute Ajv, a schema parser, or any generic runtime validator. Ajv and ajv-formats are removed unless needed internally to assist code generation itself (never shipped to app code).

The existing Axios instance, `authApi`, `AUTH_ENDPOINTS`, fetchers, hooks, and API calls remain unchanged.

Generation will:

- treat 200–299 statuses as success;
- treat all other documented statuses as errors;
- correlate each response status with its own body type;
- represent bodyless requests as `null`;
- validate documented responses without content as `body: null`;
- reject undocumented statuses.

Generation-only dependencies (YAML parsing, ref resolution) belong in devDependencies and stay development-only.

### Portability

The generator takes its input spec path and output directory from `openapi.config.json` (overridable via `--spec`/`--out` CLI flags) and contains no hardcoded project-specific paths or names. To reuse in another project: copy `scripts/`, `openapi.config.json`, and `src/api/openapiRuntime.ts`; edit `specPath` in the config to point at that project's YAML; add the `openapi:generate` script to that project's `package.json`; run it. No generator code changes needed.

## 8. Components

None.

## 9. Business Logic / Algorithms

1. Read `specPath`/`outDir` from config, or CLI flags if given.
2. Parse the OpenAPI 3.1 YAML document directly into a JS object.
3. Resolve local and external `$ref` values into one canonical, deduped schema map — the IR.
4. Preserve/assign component names while resolving references, so both emitters use the same aliases (`ShapeOfLoginRequest`) and maker names (`makeLoginRequest`).
5. Collect operations in stable path/method order.
6. Require unique `operationId` values.
7. Derive endpoint names from the final operation ID segment; use the full PascalCase operation ID when leaf names collide.
8. From the IR, generate one standalone maker function per named schema, covering: primitive types; enums; objects; required and optional properties; nullable values; arrays; nested schemas; `$ref`; `allOf`; `oneOf`; discriminators; typed and forbidden `additionalProperties`; minimum/maximum; string length limits; formats; patterns.
9. From the same IR, generate the matching `ShapeOf<Name>` static types.
10. Generate endpoint modules that compose the flat schema makers: `makeRequest` is the operation's request-body schema maker (or a null-body maker); `makeResponse` dispatches by status and exposes `makeResponse.success` / `makeResponse.error` as direct references to that operation's response schema makers.
11. Convert validation paths to `readonly (string | number)[]`.
12. Generate stable imports, function names, status ordering, schema ordering, and error ordering.
13. Return the original valid input without mutation or transformation.

## 10. Testing

Add a focused fixture (`scripts/fixtures/openapi-runtime.yaml`) containing every retained schema feature.

Test production generation:

- all eight endpoint names;
- exact `URL`, `METHOD`, `OPERATION_ID`;
- generated request and response types;
- namespace-style consumer imports (e.g. `import { Login } from '.../endpoints/login'`).

Test makers, by concrete name (e.g. `makeLoginRequest`, `makeUser`, `makeLoginSuccessResponse`, `makeLoginErrorResponse`):

- valid login request;
- missing request fields;
- incorrect field types;
- malformed email;
- password length violations;
- valid nested login success response;
- invalid nested user fields;
- ordinary API errors;
- distinct 422 validation error;
- undocumented statuses;
- `makeResponse.success` / `makeResponse.error` mismatch against actual status;
- malformed response wrappers;
- bodyless request acceptance of `null`;
- bodyless request rejection of objects;
- bodyless response validation;
- a schema maker called directly, outside any endpoint module.

Test schema features: enums, arrays, optional properties, nullable properties, `$ref`, `allOf`, `oneOf`, discriminators, typed additionalProperties, forbidden additionalProperties, minimum, maximum, formats, patterns.

Test generation failures: missing `operationId`; duplicate `operationId`; unresolved `$ref`; unsupported non-JSON request body; unsupported non-JSON response body; unsupported schema feature.

Test determinism:

- generate twice, compare all generated files byte-for-byte;
- verify aliases and maker names are not duplicated across files;
- verify operation/status/error ordering is stable.

Test portability:

- run the generator with a temp config pointing `specPath` at the fixture YAML and `outDir` at a temp directory;
- confirm output lands only in that temp directory;
- confirm the project's own default config/output is untouched.

Use temporary fixture/output directories and clean generated imports/test state after each test.

Targeted validation only:

- `pnpm openapi:generate`;
- `scripts/generateOpenApiRuntime.test.mjs`;
- TypeScript checks for generated files and test consumers;
- ESLint and Prettier only for changed files.

## 11. Edge Cases / Validation Rules

- Generated makers are build-time output, not runtime factories.
- No Ajv schema compilation at application startup.
- No runtime `$ref` resolution.
- No input coercion, default insertion, unknown-field removal, or input mutation.
- Intentional absence uses `null`.
- Every documented response status is handled; undocumented statuses fail.
- Status and body remain correlated.
- Unsupported schemas fail generation with operation ID and schema location.
- Each named schema produces exactly one maker; a schema reused in multiple places is not re-generated per use site.
- Existing `ShapeOf<Type>` aliases remain available.
- Generated output remains ignored and reproducible.
- The generator has no hardcoded project-specific paths — spec path and output dir always come from config or CLI flags.
- No clients, adapters, fetchers, routers, server handlers, mock servers, UI, or Storybook changes.

## 12. Phases

Phase 1: Create and persist this plan at `.agents/plans/openapi-runtime-validator.md`.

Phase 2: Replace the legacy alias-append command with a config-driven generator that builds one shared IR and emits static types and flat schema makers from it.

Phase 3: Remove runtime schema compilation and reduce `src/api/openapiRuntime.ts` to shared result/error primitives.

Phase 4: Add the focused fixture and complete generator/runtime/portability tests.

Phase 5: Generate all production contracts and run targeted validation.

## DONE Criteria

- The plan file exists and reflects the final implementation.
- Static types and runtime makers are both generated from the same resolved schema IR, from the OpenAPI document.
- Every named schema has its own standalone `make<Name>` function, callable outside any endpoint.
- Generated modules do not compile schemas at runtime.
- All eight endpoint contracts are generated, each composing schema makers into `makeRequest`/`makeResponse.success`/`makeResponse.error`.
- The generator reads spec path and output dir from `openapi.config.json` (or CLI flags) with no hardcoded paths, and can be copied into another project and repointed without code changes.
- `pnpm openapi:generate` runs generation end-to-end.
- All planned schema features and failure cases are tested.
- Generated output is deterministic.
- All generated files type-check.
- Targeted tests, lint, and formatting pass.
- No unrelated files or application API behavior are changed.








# OpenAPI Generated Types and Runtime Validators

## 1. Feature Summary

Generate static TypeScript API types and concrete runtime makers from the committed OpenAPI 3.1 JSON document in one deterministic pass over a shared resolved model. Preserve current root schema names and legacy `ShapeOf<Name>` aliases while adding standalone schema makers and status-correlated endpoint modules.

## 2. API Contracts

| Name                      | Method | Path                            |
| ------------------------- | ------ | ------------------------------- |
| `Login`                   | POST   | `/v1/login`                     |
| `Signup`                  | POST   | `/v1/signup`                    |
| `Logout`                   | POST   | `/v1/logout`                    |
| `ResetPassword`           | POST   | `/v1/reset-password`            |
| `ForgotPassword`          | POST   | `/v1/forgot-password`           |
| `EmailVerification`       | POST   | `/v1/email-verification`        |
| `ResendVerificationEmail` | POST   | `/v1/resend-verification-email` |
| `GetLoggedInUser`         | GET    | `/v1/me`                        |

Each endpoint module exports `URL`, `METHOD`, `OPERATION_ID`, `ShapeOfRequest`, `ShapeOfSuccessResponse`, `ShapeOfErrorResponse`, `ShapeOfResponse`, `makeRequest`, and callable `makeResponse` with `.success` and `.error` dispatchers. Makers return `Result<T>` with either the original input or ordered `ValidationIssue` values containing `path`, `keyword`, and `message`.

## 3. Package Scope

The npm package owns the generator, resolved OpenAPI model, emitters, output writer, runtime type declarations, and package-level tests. It accepts JSON OpenAPI 3.1 documents only and does not publish application-specific specs or generated QuickPay output.

Consumers provide their own `openapi.config.json`, commit their JSON specification, and keep generated application contracts locally. The runtime is imported through `openapi-contract-kit/runtime`.

## 4. Supported Validation Rules

- Require OpenAPI 3.1 and resolve local and local-file JSON pointers by canonical file-plus-fragment key.
- Reject unresolved, remote, and cyclic references.
- Support JSON Schema primitives, primitive enums/const, objects, required/optional properties, nullable type unions, arrays, `$ref`, `allOf`, `oneOf`, `anyOf`, typed/forbidden `additionalProperties`, numeric bounds, string lengths, JavaScript-compatible patterns, and `email` format.
- Ignore annotation-only keywords and reject every unrecognised assertion keyword.
- Do not coerce, default, strip, mutate, or clone input.
- Omitted `additionalProperties` allows and preserves unknown own properties; `false` rejects them.
- `oneOf` requires exactly one matching branch; `anyOf` requires at least one.

## 5. Output and Testing

- Render all output in memory, stage it beside `outDir`, then atomically replace only a generator-owned directory.
- Refuse unsafe roots or non-owned unexpected output.
- Ensure two runs are byte-identical and removed schemas/operations leave no stale files.
- Test configuration precedence, model validation, generated types, makers, endpoint status/body correlation, deterministic output, failure safety, and alternate output directories.
- The focused fixture acceptance scope is structural validation: object shape, fields, primitive types, arrays, nullability, references, unions, and additional-property behavior. Email format, string length, patterns, and numeric ranges remain optional generator capabilities but are not required by this fixture.
- Run package tests and consumer generation tests at their narrowest scopes.

## 6. Phases

- [x] Extract the generator and runtime contracts into the standalone package.
- [x] Make JSON the only supported OpenAPI input format.
- [x] Add package metadata, documentation, CLI exports, and npm packaging checks.
- [x] Update the QuickPay consumer to use the package runtime and CLI.
- [x] Add focused package CI and release workflows.
- [ ] Publish the first npm release after replacing the legal-owner placeholder in `LICENSE`.
- [ ] Update consumers from the local `file:` dependency to the published semver range.

## DONE Criteria

- [x] The package owns generator, model, emitters, output handling, runtime types, and focused tests.
- [x] JSON-only OpenAPI generation is deterministic and stale-safe.
- [x] Current root names and legacy `ShapeOf` aliases compile without consumer changes.
- [x] No runtime schema parser/compiler is shipped.
- [ ] The package is published and consumed through a released npm version.
