# openapi-contract-kit

![CI](https://github.com/Clinsmann/openapi-contract-kit/actions/workflows/ci.yml/badge.svg)

Generate TypeScript types and runtime validators from an OpenAPI 3.1 document.
The generated code validates data; your HTTP client still performs the request
and your application decides how validation failures are handled.

## Install

```bash
pnpm add -D openapi-contract-kit
```

Requires Node.js 24 or newer.

## Configure and generate

Create `openapi.config.json` next to your OpenAPI document:

```json
{
  "specPath": "openapi.json",
  "outDir": "src/api/generated",
  "runtimeImport": "openapi-contract-kit/runtime",
  "typesFile": "contracts.ts"
}
```

Add a script and generate:

```json
{
  "scripts": {
    "openapi:generate": "openapi-contract-kit"
  }
}
```

```bash
pnpm run openapi:generate
```

The CLI also accepts `--config`, `--spec`, `--out`, `--runtime-import`, and
`--types-file`. Paths from the config file are resolved relative to that file.

Generation produces a root types file, one maker per schema, shared validators,
and one endpoint module per OpenAPI operation:

```text
src/api/generated/
├── contracts.ts
├── schemas/
│   ├── WidgetInput.ts
│   └── validators.ts
└── endpoints/
    └── CreateWidget.ts
```



## Validate generated data

Schema makers accept `unknown` and return a discriminated `Result`. They do not
throw validation errors, and successful validation returns the original input.

```ts
import { makeWidgetInput } from './generated/schemas/WidgetInput.js';

const result = makeWidgetInput(input);

if (!result.ok) {
  console.error(result.errors);
  // Return, log, or throw according to your application's policy.
  throw new Error('Invalid widget input');
}

const widgetInput = result.value;
```

Each issue has this shape:

```ts
{
  path: ['email'],
  keyword: 'format',
  message: 'Expected a valid email address'
}
```

The shared runtime types are available from `openapi-contract-kit/runtime`:

```ts
import type {
  Result,
  ValidationIssue,
  ValidationPath,
} from 'openapi-contract-kit/runtime';
```



## Use generated endpoint modules

For an operation such as `POST /widgets` with operation ID
`catalog.createWidget`, the generated module exposes metadata, types, and
validators:

```ts
import {
  METHOD,
  OPERATION_ID,
  URL,
  makeRequest,
  makeResponse,
} from './generated/endpoints/CreateWidget.js';
import type {
  ShapeOfRequest,
  ShapeOfResponse,
} from './generated/endpoints/CreateWidget.js';

URL;          // '/widgets'
METHOD;       // 'POST'
OPERATION_ID; // 'catalog.createWidget'

const request: ShapeOfRequest = {
  email: 'user@example.com',
  role: 'admin',
};

const requestResult = makeRequest(request);
```

Responses are validated as `{ status, body }`. The generated response types
keep each status code correlated with its body type:

```ts
const responseResult = makeResponse({
  status: 201,
  body: responseBody,
});

if (!responseResult.ok) {
  throw new Error('The server returned an invalid response');
}

const response: ShapeOfResponse = responseResult.value;
```

Use the attached validators when the calling context already knows whether the
response should be successful or an error:

```ts
const success = makeResponse.success({ status: 201, body: responseBody });
const failure = makeResponse.error({ status: 400, body: errorBody });
```

Bodyless responses use `body: null`. Undocumented statuses and mismatched body
shapes return validation issues.

## Use with Fetch

```ts
const httpResponse = await fetch(URL, {
  method: METHOD,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(request),
});

const body = httpResponse.status === 204
  ? null
  : await httpResponse.json();

const validated = makeResponse({
  status: httpResponse.status,
  body,
});

if (!validated.ok) {
  throw new Error(`Invalid ${OPERATION_ID} response`);
}

return validated.value;
```



## Use with Axios

```ts
const httpResponse = await axios.post(URL, request);

const validated = makeResponse({
  status: httpResponse.status,
  body: httpResponse.data,
});

if (!validated.ok) {
  throw new Error('Invalid API response');
}

return validated.value.body;
```

Axios errors can be handled in the same way by validating the response carried
on the error, when present:

```ts
if (axios.isAxiosError(error) && error.response) {
  const validated = makeResponse.error({
    status: error.response.status,
    body: error.response.data,
  });

  if (!validated.ok) {
    throw new Error('Invalid API error response');
  }
}
```



## Use with React Query

Validate inside `queryFn` so React Query receives either typed data or a thrown
application error:

```ts
import { useQuery } from '@tanstack/react-query';

function useWidget() {
  return useQuery({
    queryKey: ['widget'],
    queryFn: async () => {
      const response = await fetch(URL, { method: METHOD });
      const body = response.status === 204 ? null : await response.json();
      const validated = makeResponse({ status: response.status, body });

      if (!validated.ok) {
        throw new Error('Invalid widget response');
      }

      return validated.value;
    },
  });
}
```

The caller owns the thrown error. React Query can then expose it through its
normal loading, error, retry, and success states.

## Supported input and limitations

The generator supports OpenAPI 3.1 JSON, `.yml`, and `.yaml` documents with
objects, primitive types, nullable values, arrays, enums, constants, unions,
local `$ref` references, additional-property rules, string and numeric
constraints, and email format validation.

Currently unsupported:

- Remote or anchor `$ref` references
- Path and operation parameters
- Optional request bodies
- Non-JSON request or response bodies
- Wildcard or default response statuses
- Unsupported schema keywords

Generated output is application-specific and should not be published as part of
this package.

## License

MIT