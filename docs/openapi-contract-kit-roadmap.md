# OpenAPI Contract Kit — Roadmap / TODO

## 1. Current State

The package currently owns:

- OpenAPI loading and normalization
- reference resolution
- the shared resolved model / IR
- TypeScript type generation
- runtime validator generation
- endpoint generation
- output handling
- runtime result/error types
- package-level tests

The generated application code does **not** ship a schema parser/compiler such as Ajv.

Current validation already supports primitives, objects, arrays, `$ref`, `allOf`, `oneOf`, `anyOf`, `additionalProperties`, numeric bounds, string lengths, patterns, and email format.

---

## 2. Priority 1 — Correctness and API Contract Support

These should come before cosmetic improvements.

### YAML input support

Add support for:

```text
.json
.yml
.yaml
```

Prefer detecting the parser from the file extension.

Possible flow:

```text
file
 ↓
loadDocument()
 ↓
JSON parser OR YAML parser
 ↓
normalized OpenAPI document
 ↓
same compiler pipeline
```

Add clear YAML parse errors and tests.

### Optional request bodies

Currently optional request bodies are intentionally unsupported.

Add support for:

```yaml
requestBody:
  required: false
```

Decide exactly how absence is represented:

```ts
undefined
```

versus:

```ts
null
```

This needs to be a deliberate public API decision.

### Path parameters

Add support for operation path parameters:

```text
GET /companies/{companyId}/catalogs/{id}
```

Generate their type:

```ts
type PathParams = {
  companyId: string;
  id: string;
};
```

And validate them.

### URL builder

Add a generated or shared utility such as:

```ts
buildUrl(Endpoint.URL, {
  companyId: "123",
  id: "456",
});
```

Result:

```text
/companies/123/catalogs/456
```

It should reject missing and unknown parameters.

### Multiple HTTP methods on the same path

Explicitly support and test:

```text
GET    /api/v1/catalogs/{id}
PUT    /api/v1/catalogs/{id}
DELETE /api/v1/catalogs/{id}
```

Each operation should remain its own generated endpoint contract.

For example:

```text
GetCatalog
UpdateCatalog
DeleteCatalog
```

Each gets its own `METHOD`, request/response types, and validators.

---

## 3. Priority 2 — Validation Coverage

The package should validate everything that can be determined from:

```text
OpenAPI schema + input value
```

without requiring application state.

### Structural validation

Support and test:

```text
object
array
string
number
integer
boolean
null
required properties
optional properties
nullable values
nested objects
arrays/items
enum
const
$ref
allOf
oneOf
anyOf
additionalProperties
```

### Constraint validation

Support and test:

```text
minimum
maximum
minLength
maxLength
pattern
format: email
format: date
format: date-time
```

### Do not cross into business validation

Do not validate things such as:

```text
Does this user exist?
Is this email already registered?
Does this person have permission?
Is there enough account balance?
```

Those belong to application code.

---

## 4. Priority 3 — Generated API Improvements

### Rename `make` to `validate`

Current:

```ts
makeUser(value)
makeRequest(value)
makeResponse(value)
```

Proposed:

```ts
validateUser(value)
validateRequest(value)
validateResponse(value)
```

Reason: the function validates; it does not construct, clone, transform, coerce, or mutate.

For compatibility, consider:

```ts
export const makeRequest = validateRequest;
```

during a migration period.

### Simplify generated type names

Consider changing:

```ts
ShapeOfRequest
ShapeOfSuccessResponse
ShapeOfErrorResponse
ShapeOfResponse
```

to:

```ts
Request
SuccessResponse
ErrorResponse
Response
```

Namespace-style usage becomes:

```ts
Login.Request
Login.Response
Login.validateRequest(data);
```

Retain aliases temporarily if backward compatibility matters.

### Correct result typing

A successful validator should return the actual validated type.

Example:

```ts
validateAuthenticatedUser(value)
```

should return:

```ts
Result<ShapeOfAuthenticatedUser>
```

---

## 5. Priority 4 — Generated File Layout

This needs an architectural decision.

Current:

```text
generated/
  schemas/
  endpoints/
```

Possible endpoint-oriented structure:

```text
generated/
  endpoints/
    login/
      index.ts
    signup/
      index.ts
    getLoggedInUser/
      index.ts

  schemas/
    user.ts
    apiError.ts
```

This keeps endpoint organization while preserving shared schema deduplication.

Do not duplicate shared schemas into every endpoint folder.

---

## 6. Priority 5 — Configuration

### Required generated API name

Remove project-specific names like:

```text
quickpay-api.ts
```

from generic generator behavior.

Possible config:

```json
{
  "input": "./openapi.json",
  "output": "./src/api/generated",
  "name": "quickpay"
}
```

or:

```json
{
  "apiName": "quickpay"
}
```

Only require a name if it actually affects public generated identifiers.

### Input format

Prefer deriving parser choice from extension:

```text
.json → JSON
.yaml → YAML
.yml  → YAML
```

Avoid a separate `format` option unless a real use case needs it.

---

## 7. Priority 6 — Error Experience

Improve generator errors.

Bad:

```text
Unsupported schema
```

Better:

```text
Unsupported OpenAPI schema keyword: not

Operation:
  createUser

Location:
  paths./users.post.requestBody
  .content.application/json.schema

Schema:
  #/components/schemas/CreateUser

Suggestion:
  `not` is currently unsupported.
  Rewrite the schema using oneOf/anyOf if possible,
  or open a feature request.
```

### Generator errors

Examples:

```text
UnsupportedSchemaError
ReferenceResolutionError
InvalidOperationError
InvalidConfigurationError
UnsafeOutputDirectoryError
```

### Runtime validation issues

Example:

```ts
{
  path: ["user", "email"],
  keyword: "format",
  message: "Expected a valid email address"
}
```

### Question: classes or plain objects for errors?

Recommendation:

- Use classes for generator exceptions.
- Use plain `ValidationIssue` objects for expected runtime validation failures.

Example:

```ts
class UnsupportedSchemaError extends Error {}
class ReferenceResolutionError extends Error {}
```

and:

```ts
type ValidationIssue = {
  path: readonly (string | number)[];
  keyword: string;
  message: string;
};
```

---

## 8. Priority 7 — CLI / Developer Experience

### Dry run

Add:

```bash
openapi-contract-kit generate --dry-run
```

It should:

- perform the full generation
- write nothing
- still surface failures
- optionally report which files would change

### Check command

Add:

```bash
openapi-contract-kit check
```

Useful for CI.

Possible output:

```text
Generated contracts are up to date.
```

or:

```text
Generated contracts are stale.

Changed:
  endpoints/Login.ts

Added:
  schemas/User.ts

Removed:
  schemas/OldUser.ts
```

### Generation summary

After successful generation:

```text
✓ Generated OpenAPI contracts

8 operations
14 schemas
21 validators

Endpoints:
  POST   /v1/login          → Login
  POST   /v1/signup         → Signup
  GET    /v1/me             → GetLoggedInUser

Output:
  src/api/generated
```

Consider:

```bash
--quiet
```

for CI.

---

## 9. Priority 8 — Source Code Cleanup

### Convert `.mjs` implementation to TypeScript

Suggested structure:

```text
src/
  config.ts
  loader.ts
  resolver.ts
  normalize.ts
  model.ts

  emit/
    types.ts
    validators.ts
    endpoints.ts

  errors/
    errors.ts

  cli.ts
```

Compile these for the npm package.

---

## 10. Priority 9 — Documentation

The README should follow a predictable flow:

1. What is it?
2. Install
3. Configure
4. Generate
5. Validate a request
6. Validate a response
7. Fetch example
8. Supported OpenAPI features
9. Unsupported features
10. Generated output
11. Errors and troubleshooting
12. Architecture

Example install:

```bash
pnpm add -D openapi-contract-kit
```

Example config:

```json
{
  "input": "./openapi.yaml",
  "output": "./src/api/generated"
}
```

Example request validation:

```ts
const result = Login.validateRequest(input);
```

Example response validation:

```ts
const result = Login.validateResponse({
  status: response.status,
  body: await response.json(),
});
```

Example fetch usage:

```ts
const request = Login.validateRequest({
  email,
  password,
});

if (!request.ok) {
  return request;
}

const response = await fetch(Login.URL, {
  method: Login.METHOD,
  headers: {
    "content-type": "application/json",
  },
  body: JSON.stringify(request.value),
});

const body = await response.json();

const validated = Login.validateResponse({
  status: response.status,
  body,
});
```

Architecture section:

```text
OpenAPI
  ↓
loader
  ↓
resolver
  ↓
normalizer / IR
  ↓
types + validators + endpoints
```

Each section should explain what it does and why it exists.

---

## 11. Priority 10 — Tests

### Input tests

```text
JSON
YAML
invalid JSON
invalid YAML
unsupported OpenAPI version
```

### Reference tests

```text
local pointer
local-file pointer
unresolved pointer
remote ref
anchor ref
cyclic ref
```

### Schema tests

```text
primitive
object
array
nullable
enum
const
allOf
anyOf
oneOf
additionalProperties
number bounds
string length
pattern
email
date
date-time
```

### Operation tests

```text
GET
POST
PUT
PATCH
DELETE
same path + multiple methods
required request body
optional request body
bodyless request
success responses
error responses
bodyless responses
undocumented status
```

### Runtime behavior tests

Add an explicit identity-preservation test:

```ts
const input = {
  email: "me@example.com"
};

const result = validateUser(input);

assert(result.ok);
assert.strictEqual(result.value, input);
```

This proves the same object reference is returned after successful validation.

### Determinism tests

```text
same input twice
→ byte-for-byte identical output
```

### Dry-run tests

```text
dry run
→ same calculation
→ zero filesystem modification
```

### Stale-file tests

Removing an operation/schema should remove its generated output safely.

---

## 12. Bundle Size / Generated Code Size

Keep these as explicit non-functional goals:

- generator remains a dev dependency
- no Ajv/Zod/etc. runtime
- ESM output
- side-effect-free modules
- one validator per unique normalized schema
- reuse validators instead of duplicating them
- do not emit OpenAPI descriptions/examples into runtime unless needed
- do not ship the OpenAPI document
- keep validation result objects small
- tree-shakable endpoint entrypoints

Shared validator deduplication is already implemented and should remain under **Completed**, not TODO.

---

## 13. Architecture Decisions / Questions

### Q1. Should JSON/YAML selection come from configuration or file extension?

Recommendation:

```text
extension by default
```

Add an override only if a real use case appears.

### Q2. Should there be a normalization layer before types and validators?

Yes.

The shared normalized model / IR should be the one source of truth for both type generation and validator generation.

This question can probably move to **Resolved Decisions**.

### Q3. Why does anything say `quickpay-api.ts`?

It should not be hardcoded inside the generic package.

Determine whether this is:

- stale consumer code
- generated filename configuration
- actual package coupling

If it is package coupling, remove it.

### Q4. Should API/output name be required?

Decision needed.

Possible config:

```json
{
  "name": "quickpay"
}
```

Only require it if it affects public generated identifiers.

### Q5. Should generated output be organized by schema/endpoint or endpoint folders?

Decision needed.

Recommended hybrid:

```text
schemas/
  shared reusable validators

endpoints/
  login/
  signup/
```

Do not duplicate schemas per endpoint.

### Q6. Should generator errors use classes?

Recommendation:

```text
Yes for generator exceptions.
No for ValidationIssue values.
```

### Q7. What are pointer/ref/anchor/remote references?

Documentation topic.

Examples:

```text
#/components/schemas/User
```

A `$ref` means: use another schema here.

The part:

```text
/components/schemas/User
```

is a JSON Pointer, meaning a path inside a JSON document.

External local file:

```text
./shared.json#/components/schemas/User
```

means: load `shared.json`, then follow that pointer.

Remote ref:

```text
https://example.com/schema.json#/User
```

loads another document over the network.

Anchor ref:

```text
#User
```

refers to a named JSON Schema anchor rather than a JSON Pointer.

Pointer escaping:

```text
~1 → /
~0 → ~
```

### Q8. What are path-item references and path-level parameters?

Needs a documentation explanation and then a decision about whether to support them.

### Q9. What happens when several operation IDs have the same final name?

Current intended behavior:

```text
users.create → UsersCreate
admin.create → AdminCreate
```

Document and test it.

### Q10. What should happen when one path supports multiple HTTP methods?

Each HTTP method is a separate OpenAPI operation and therefore a separate generated endpoint contract.

Add tests and a README example.

---

## 14. Explanations / Documentation Requests

These are documentation backlog items rather than engineering TODOs:

- Explain IR / normalized model.
- Explain `$ref`.
- Explain JSON Pointer.
- Explain remote references.
- Explain anchors.
- Explain pointer escaping.
- Explain path-level parameters.
- Explain operation-level parameters.
- Explain endpoint naming collision rules.
- Explain exact `oneOf` runtime semantics.
- Explain runtime validation versus TypeScript validation.
- Explain why numeric ranges/email/regex cannot be represented fully by TypeScript.
- Explain `additionalProperties`.
- Explain why input identity is preserved.
- Explain `makeResponse`, `.success`, `.error`.
- Add a `fetch()` usage example.
- Add generated-code comments/JSDoc where useful.

---

## 15. Later / Nice-to-Have

Keep these below the core work:

- plugin/emitter architecture
- MSW generator
- test-data generator
- Fast Check integration
- debug vs production validator output
- custom naming hooks
- custom resolver hooks
- remote `$ref`
- anchor `$ref`
- recursive schemas
- non-JSON media types
- wildcard/default response statuses
- richer package/repository metrics in README

Repository stars/package-size badges are low priority compared with API correctness and docs.

---

## 16. Explicitly Out of Scope for Now

Keep an explicit section so the project does not expand endlessly:

```text
HTTP client generation
fetch wrapper generation
Axios adapters
server routers
mock server
React hooks
UI
Storybook
business-rule validation
database validation
authorization logic
```

The package should remain focused on generated contracts and runtime validation, not application infrastructure.

---

## 17. Suggested Implementation Order

1. Fix `Result<Shape>` typing.
2. YAML support.
3. Better generator errors.
4. Convert generator source from `.mjs` to TypeScript.
5. Dry-run.
6. `check` command.
7. Path parameter model + URL builder.
8. Optional request bodies.
9. `date` / `date-time`.
10. Multiple-method/same-path tests.
11. Naming cleanup (`make` → `validate`) with compatibility aliases.
12. README rewrite and architecture/reference docs.
13. Revisit generated directory structure.
14. Optimize bundle/generated size based on actual measurements.

---

## 18. Cleanup Notes

Remove stale brainstorming duplicates from the planning document once each item has been moved into one of the sections above.

Avoid repeating items that are already implemented, such as:

- deterministic generation
- small runtime
- shared schema validators
- shared normalized model / IR
- validator deduplication
- no runtime schema compiler
- preserved input identity

Keep one canonical place for each decision or TODO.

---

## 19. Completed / Already in Place

These should stay visible so future planning does not accidentally re-add them as TODOs:

- Generator extracted into standalone package.
- Runtime contracts moved into the package.
- Package metadata, CLI exports, and npm packaging checks added.
- Consumer updated to use the package runtime and CLI.
- Focused package CI and release workflows added.
- Shared validator deduplication implemented.
- One validator generated per unique normalized schema node.
- Named schema makers remain stable wrappers/public entrypoints.
- No runtime schema parser/compiler is shipped.
- Generation is deterministic.
- Output handling is stale-safe.
- Input is not coerced, defaulted, stripped, mutated, or cloned.
- Status/body correlation is part of endpoint response validation.

---

## 20. Main Principles

```text
Build-time complexity is cheap.
Runtime complexity is expensive.
```

```text
OpenAPI
  ↓
smart compiler
  ↓
small, readable, tree-shakable generated code
```

```text
One normalized model
  ↓
types
validators
endpoints
```

```text
Schema validation belongs in the library.
Business validation belongs in the application.
```

```text
If the generator is unsure or unsupported:
fail closed.
```
