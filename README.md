# openapi-contract-kit

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

Requires Node.js 26 and pnpm 12.3.4.

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

Schema makers return a discriminated result:

```ts
const result = makeLoginRequest(input);

if (!result.ok) {
  console.error(result.errors);
}
```

Validation errors contain a path, keyword, and message. Successful validation returns the original input without mutating or cloning it.

The focused fixture and acceptance tests cover structural validation: object shape, declared fields, primitive types, arrays, nullability, references, unions, and additional-property behavior. They do not require form-level checks such as email format, string length, patterns, or numeric ranges. Those constraints remain available when declared in consumer schemas.

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
pnpm test
pnpm run pack:check
```

## Versioning

The package follows semantic versioning. Changes to generated contracts, public exports, CLI flags, or validation behavior are documented in `CHANGELOG.md`.

## License

MIT
