# OpenAPI Contract Kit — Roadmap & Notes

## 1. Roadmap

- [x] Move package management from npm to pnpm; commit the lockfile; update contributor commands.
- [ ] Replace `.mjs` source and CLI files with TypeScript, keeping the same public exports and generated output.
- [x] Add linting and formatting, with package scripts and CI.
- [ ] Accept `.yml` and `.yaml` specs, with clear parse errors and tests.
- [x] Update the supported Node engine and CI matrix to Node 24+.
- [ ] Add deterministic dry-run generation, covering every supported scenario, without writing files.
- [ ] Rewrite the README as a short library guide: install, configure, generate, validate, generated-code examples.
- [ ] Add repo status metadata to the README (stars, package size, etc.), with a reproducible update process.
- [ ] Add the published npm package link to the README.
- [ ] Type validated maker results with their validated shape, e.g. `makeAuthenticatedUser` returns `Result<ShapeOfAuthenticatedUser>`.
- [ ] Support for path-item reference

**Definition of done**
- [ ] Tests cover JSON, YAML, and YAML parse failures.
- [ ] Dry runs cover all supported schema and endpoint scenarios, and are deterministic.
- [ ] Lint, format, typecheck, tests, and packaging pass on Node 24+ with pnpm.
- [ ] README examples run against the published package.

## 2. Current Limitations

Full desired validation scope was reconfirmed: all primitive types, required/optional/nullable properties, nested objects, arrays, enums, `oneOf`, `allOf`, discriminators, `$ref`, `additionalProperties`, min/max numbers, min/max string length, patterns, email format, documented request/response bodies with status codes, bodyless bodies as `null`, plus YAML input. All of this is already supported, except YAML input and optional request bodies (tracked below).

The generator currently excludes:
- YAML input
- Remote `$ref`
- Anchor `$ref`
- Path and operation parameters
- Optional request bodies
- Non-JSON media types
- Default or wildcard response statuses
- Unsupported schema assertion keywords
- Recursive schema references

Static vs runtime gap:
- Only the runtime validator enforces exact `oneOf` semantics; TypeScript unions can't do this.
- Only the runtime validator enforces numeric ranges, regexes, and email format.
- Typed `additionalProperties` is fully checked at runtime. The generated type shows it as an index signature only when there are no other declared properties.

## 3. Feature Requests

**Output & configuration**
- Make the output API file name configurable and required, instead of hardcoding `quickpay-api.ts`.
- Change the layout to one folder per endpoint, holding all resources for that endpoint, instead of separate `schemas/` and `endpoints/` folders.
- Log the generated endpoint names to the console at the end of a successful run.
- Add a utility to build/validate a URL from `Endpoint.URL` and a params object, e.g. `myUtilityName(Endpoint.URL, { id, companyId })`, with a clear error when a param is missing or extra.

**Validation & schema support**
- Support optional request bodies.
- Add `date` and `date-time` string formats, alongside the existing `email` format.

**Errors**
- Make error messages more descriptive, and suggest possible fixes.

**Docs & testing**
- Add a short description or comment for each section, tool, or piece of generated logic, explaining its role in the system, with examples where useful.
- Add a usage example for `makeResponse(input)`, `makeResponse.success(input)`, `makeResponse.error(input)`, e.g. paired with a `fetch` call.
- Generate code docs (e.g. JSDoc) for the generated logic, dynamically.
- Add a README example for an endpoint path with multiple methods, e.g. `GET /catalogs/:id`, `PUT /catalogs/:id`, `DELETE /catalogs/:id` — show what `METHOD` and the types resolve to.
- Add a test and an explaining comment for the multi-method case above.
- Add a test confirming a validator returns the exact same object reference for valid input, instead of a clone.

## 4. Naming Change Proposal (`make` → `validate`)

| Current | New | Why |
|---|---|---|
| `ShapeOfRequest` | `Request` | Endpoint module already gives the context |
| `ShapeOfSuccessResponse` | `SuccessResponse` | Easier to read |
| `ShapeOfErrorResponse` | `ErrorResponse` | Short and clear |
| `ShapeOfResponse` | `Response` | Endpoint module already gives the context |
| `makeRequest` | `validateRequest` | It validates, it doesn't construct anything |
| `makeResponse.success` | `validateResponse.success` | States exactly what happens |
| `makeResponse.error` | `validateResponse.error` | Same reason |
| `ValidationError` | `ValidationIssue` | "Issue" fits a single validation problem |
| `openapiRuntime.ts` | `validation.ts` | File holds shared validation primitives |
| `generateOpenApiRuntime.mjs` | `generateOpenApi.mjs` | "Runtime" makes the generator sound like runtime code |

Suggested usage:
```ts
import * as Login from "./generated/endpoints/login";

Login.URL;
Login.METHOD;
Login.validateRequest(input);
Login.validateResponse.success(status, body);
Login.validateResponse.error(status, body);

// types
Login.Request;
Login.SuccessResponse;
Login.ErrorResponse;
Login.Response;
```

Main idea: the library validates input, instead of transforming, constructing, coercing, or mutating it. `validateRequest()` describes that better than `makeRequest()`.

## 5. Open Questions

- Should we add an explicit normalization layer, so the normalized model can feed the type emitter and the validator emitter independently, instead of both reading raw OpenAPI directly?
- Should the normalizer pick JSON vs YAML from config, or from the file extension?
- What is `['quickpay-api.ts', emitRootTypes(model)]` for in the code — is QuickPay a separate project? Please clarify why this name is there.
- Should error states use classes, or plain types? Should they live in one dedicated file?
- Please explain, in our context: pointer, reference, anchor reference, remote reference, and JSON Pointer rules (e.g. `~1` → `/`, `~0` → `~`).
- Please explain why `model.ts` rejects path-item references, path-level parameters, and operation-level parameters.
- When one path supports multiple HTTP methods (e.g. `GET`, `PUT`, `DELETE` on `/catalogs/:id`), what does `METHOD` resolve to, and what types get generated for each method?

## 6. Design Guidelines (Reference)

Background principles from earlier brainstorming, kept for reference. Main rule: build-time complexity is cheap, runtime complexity is expensive.

**Architecture & maintainability**
1. Add a clear intermediate model: OpenAPI → normalized model → generated code.
2. Keep the runtime small — no Ajv, Zod, or the OpenAPI parser in shipped app code.
3. Generate one file per endpoint, for tree shaking and easier inspection.
4. Give descriptive errors: what failed, which operation, which location, which file.
5. Add a `check` command for CI, that fails when generated files are out of date.
6. Support dry runs, so developers see changes before writing files.
7. Publish a clear support matrix: what's supported (`oneOf`, `allOf`, discriminator, pattern, ...) and what's not (XML, callbacks, ...).
8. Keep generation deterministic: the same input always produces the same files.
9. Create extension points, so new outputs (MSW, test data, ...) don't need a new parser.
10. Test against small fixtures and real-world OpenAPI documents.

**Developer experience**
1. Keep the main API simple, e.g. `generate({ input, output })`.
2. Ship good defaults, so it works with little config.
3. Give useful errors: what failed, where, and what to do about it.
4. Give good TypeScript types, so autocomplete guides the developer.
5. Keep behavior predictable: same input, same result.
6. Keep docs short, with an install → generate → import → validate flow; put advanced topics separately.
7. Make upgrades easy; document any breaking change clearly.
8. Keep generated code readable and easy to debug.
9. Keep commands fast, so generation feels cheap to run often.
10. Add escape hatches (custom naming, custom resolver), without forcing one setup on every project.

**Bundle size**
1. Keep the generator itself a devDependency only.
2. Make generated validators plain functions, instead of classes or runtime factories.
3. Compile checks into plain TS/JS, instead of shipping Zod, Ajv, or Valibot at runtime.
4. Generate one module per endpoint or schema, so tree shaking removes unused contracts.
5. Use ESM and mark the package `"sideEffects": false`.
6. Keep shared validation helpers (`isString`, `isObject`) very small.
7. Keep TypeScript-only info (types, descriptions, examples) out of runtime constants.
8. Strip OpenAPI metadata after generation, keeping the original schema out of the runtime output.
9. Keep runtime error objects small, e.g. `{ path, code }`; add human-readable messages in dev tooling only.
10. Reuse shared validators (e.g. one `validateUser()`), instead of inlining the same check in every endpoint file.

Optional: support a debug mode (richer errors, larger output) and a production mode (compact codes, smaller output).




the idea is that when you make a call, the caller handle error throwing

so eg: 


try {
   // but the main approach and the default approach we should push is eg.
  const validatedAuthorisedUser = makeLoginResponse(dataHere, "Custom error message will go here incase of error")

// here is where our tool is mostly useful
  
  //we want to be able to do this
  if (!validatedAuthorisedUser.ok) {
    console.error(validatedAuthorisedUser.errors);
    // throw the error here if you want
  }

  return validatedAuthorisedUser.value

 

  // then when the above throws the catch will catch it and do with the validation error what they will.
}(catch) {
  // error is handled here, whatever happens here is none of our business
}