# Status-independent generated API migration

## Objective

Generate one public `api.ts` containing reusable entity makers and scoped
endpoint APIs. Request and response makers validate data only and return
`Result<ShapeOf...>` aliases. Status is checked only through an explicit
`{ status }` option or `makeResponseStatus`.

## Final API

- `CreateWidget.URL`, `.METHOD`, `.OPERATION_ID`
- `CreateWidget.makeRequest(data)`
- `CreateWidget.makeResponse(data, { status }?)`
- `CreateWidget.makeResponseStatus(status)`
- `makeUser(data): Result<ShapeOfUser>`
- `makeUserType(data): Result<ShapeOfUserType>`
- `makeLoginResponse(data): Result<ShapeOfLoginResponse>`
- `ShapeOfCreateWidget.Request` and `.Response` are data-only aliases.
- Failed results remain `{ ok: false, errors }`; successful results retain the
  original input reference.

## Generated layout

```text
generated/
├── contracts.ts
├── api.ts
├── validators.ts
└── .openapi-runtime-manifest.json
```

`contracts.ts` contains raw types and `ShapeOf` aliases. `api.ts` contains all
public makers and endpoint scopes. `validators.ts` contains shared validators.

## Completed changes

- Removed `isSuccess` response modeling and status-based body dispatch.
- Added status-independent response unions and optional status validation.
- Consolidated generated runtime output into `api.ts`.
- Added operation-specific request/response makers and endpoint scopes.
- Ensured all maker signatures use `ShapeOf...` aliases.
- Updated output safety, tests, fixtures, and README.

## Validation

- Focused generator and model tests pass.
- Generated fixture consumer compilation passes.
- TypeScript typecheck passes.
- Focused ESLint validation passes.
