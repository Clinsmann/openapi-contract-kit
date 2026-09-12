# openapi-contract-kit

[![CI](https://github.com/Clinsmann/openapi-contract-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Clinsmann/openapi-contract-kit/actions/workflows/ci.yml)

JSON-first OpenAPI 3.1 contract generation and runtime validation for TypeScript applications.

`openapi-contract-kit` reads a JSON OpenAPI document and generates:

- TypeScript schema types
- `ShapeOf*` compatibility aliases
- Runtime schema makers
- Request validators
- Status-aware response validators
- Standalone endpoint modules

## Installation

```bash
pnpm add -D openapi-contract-kit
```

Requires Node.js 24 or newer and pnpm 12.3.4.

## Quick start

Create `openapi.config.json`:

```json
{
  "specPath": "openapi.json",
  "outDir": "src/api/generated",
  "runtimeImport": "openapi-contract-kit/runtime"
}
```

Add a generation script:

```json
{
  "scripts": {
    "openapi:generate": "openapi-contract-kit"
  }
}
```

Generate contracts:

```bash
pnpm run openapi:generate
```

## Generated validation

Generated makers validate input and return a discriminated result. They do not
throw validation errors, so the caller decides whether to log, return, throw, or
otherwise handle the failure:

```ts
import { makeWidgetInput } from './generated/schemas/WidgetInput.js';

try {
  const result = makeWidgetInput(input);

  if (!result.ok) {
    console.error(result.errors);
    throw new Error('The widget input is invalid');
  }

  return result.value;
} catch (error) {
  // Handle the validation error or application error here.
  console.error(error);
}
```

Validation errors contain a path, keyword, and message. Successful validation returns the original input without mutating or cloning it.

When no application exception is needed, handle the result directly:

```ts
const result = makeWidgetInput(input);

if (!result.ok) {
  return result.errors;
}

const validatedInput = result.value;
```

The focused fixture and acceptance tests cover structural validation, primitive types, references, unions, additional-property behavior, and declared email format validation. String length, patterns, and numeric ranges remain available when declared in consumer schemas.

## Supported input

The generator supports JSON OpenAPI 3.1 documents with objects, primitive types, nullable values, arrays, enums, constants, unions, local `$ref` references, additional-property rules, string and numeric constraints, and email format validation.

## Current limitations

- YAML documents are not supported.
- Remote `$ref` references are not supported.
- Unsupported schema keywords fail generation.
- Path and operation parameters are not currently generated.
- Generated output is application-specific and should not be published with this package.

## Development

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run pack:check
```

## Versioning

The package follows semantic versioning. Changes to generated contracts, public exports, CLI flags, or validation behavior are documented in `CHANGELOG.md`.

## License

MIT
