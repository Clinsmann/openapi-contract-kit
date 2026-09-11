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
