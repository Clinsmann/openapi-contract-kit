# openapi-contract-kit

![CI](https://github.com/Clinsmann/openapi-contract-kit/actions/workflows/ci.yml/badge.svg)

[![npm package size](https://img.shields.io/npm/package-size/openapi-contract-kit)](https://
www.npmjs.com/package/openapi-contract-kit)

[![npm unpacked size](https://img.shields.io/npm/unpacked-size/openapi-contract-kit)](https://
www.npmjs.com/package/openapi-contract-kit)


Generate TypeScript types and runtime validators from OpenAPI 3.1 documents.
The generated code validates data; your HTTP client owns transport and error
handling.

## Install and generate

```bash
pnpm add -D openapi-contract-kit
```

Create `openapi.config.json`:

```json
{
  "specPath": "openapi.json",
  "outDir": "src/api/generated",
  "runtimeImport": "openapi-contract-kit/runtime",
  "typesFile": "contracts.ts"
}
```

```bash
openapi-contract-kit
```

Generation produces one public runtime module, one type module, and shared
validators:

```text
src/api/generated/
├── contracts.ts
├── api.ts
├── validators.ts
└── .openapi-runtime-manifest.json
```

## Generated API

For `POST /widgets` with operation ID `catalog.createWidget`, `api.ts` exports
the `CreateWidget` scope:

```ts
import {
  CreateWidget,
  makeUser,
  makeUserType,
} from './generated/api.js';
import type { ShapeOfCreateWidget } from './generated/contracts.js';

CreateWidget.URL;          // '/widgets'
CreateWidget.METHOD;       // 'POST'
CreateWidget.OPERATION_ID; // 'catalog.createWidget'

const request: ShapeOfCreateWidget.Request = {
  email: 'user@example.com',
  role: 'admin',
};

const requestResult = CreateWidget.makeRequest(request);
const responseResult = CreateWidget.makeResponse(responseData);
```

`ShapeOfCreateWidget.Request` and `ShapeOfCreateWidget.Response` are aliases to
the generated request and response data types. Response types contain data
only; they are never `{ status, body }` wrappers.

Reusable component schemas produce top-level makers. Every maker returns a
`Result<ShapeOf...>`:

```ts
const userResult = makeUser(userData);
const userTypeResult = makeUserType(userTypeData);

if (!userResult.ok) {
  console.error(userResult.errors);
} else {
  return userResult.value;
}
```

Operation-specific aliases are also generated, including for direct schema
references:

```ts
const loginResult = makeLoginResponse(data);
// Result<ShapeOfLoginResponse>
```

Successful validation returns the original input reference. Validation never
throws and never mutates input.

## Optional status validation

Response data validation ignores status by default:

```ts
const result = CreateWidget.makeResponse(responseData);
```

Pass status explicitly when it should be checked:

```ts
const result = CreateWidget.makeResponse(responseData, {
  status: httpResponse.status,
});

const isSupported = CreateWidget.makeResponseStatus(httpResponse.status);
```

`makeResponseStatus` returns a boolean indicating whether the status is
documented. Status validation does not select the response body schema; the
response type is the union of all documented response body types. Bodyless
responses validate `null`.

## Runtime result

The runtime package exports types only:

```ts
import type {
  Result,
  ValidationIssue,
  ValidationPath,
} from 'openapi-contract-kit/runtime';
```

Results are discriminated by `ok`:

```ts
type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ValidationIssue[] };
```

## Supported input

The generator supports OpenAPI 3.1 JSON, YAML, objects, primitive types,
nullable values, arrays, enums, constants, unions, local references,
additional-property rules, string and numeric constraints, and email format
validation.

Currently unsupported are remote or recursive references, path and operation
parameters, optional request bodies, non-JSON media types, and default or
wildcard response statuses.
