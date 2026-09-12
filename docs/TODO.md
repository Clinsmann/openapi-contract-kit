# TODO

Planned project work, in implementation order:

- [ ] Migrate the build and package entry points to Rspack.
- [x] Migrate package management from npm to pnpm; commit the pnpm lockfile and update contributor commands.
- [ ] Replace `.mjs` source and CLI files with TypeScript equivalents, preserving the public exports and generated output.
- [x] Add basic linting and formatting with package scripts and CI coverage.
- [ ] Accept both `.yml` and `.yaml` OpenAPI documents, including clear parse errors and tests.
- [x] Update the supported Node.js engine and CI matrix to Node 24+.
- [ ] Add deterministic dry-run generation coverage for every supported scenario, without writing generated files.
- [ ] Rewrite the README as a concise library guide with installation, configuration, generation, validation, and generated-code examples.
- [ ] Add current repository status metadata to the README (likes/stars, package size, and other relevant indicators), with a reproducible update process.
- [ ] Add the final published npm package link to the README after release.
- [ ] Type validated maker results with the validated shape: for example, `makeAuthenticatedUser` should return `Result<ShapeOfAuthenticatedUser>`, where `ShapeOfAuthenticatedUser` aliases `AuthenticatedUser`.

## Definition of done

- [ ] Tests cover JSON, YAML, and YAML parsing failures.
- [ ] Dry runs cover all supported schema and endpoint scenarios and are deterministic.
- [ ] Lint, format, typecheck, tests, and packaging run successfully on Node 24+ with pnpm.
- [ ] README examples are executable against the published package.


Use Node 24 or newer across development, CI, and publishing.












OpenAPI Runtime Validator Library Notes

1. Top 10 improvements for the library

1. Add a clear intermediate model
Do not generate code directly from OpenAPI.

OpenAPI -> normalized model -> generated code

This makes the generator easier to understand and change.

2. Keep the runtime very small
The generated validators should do most of the work.

Avoid shipping Ajv, Zod, or the OpenAPI parser to the application.

3. Generate one file per endpoint
Prefer:

generated/
  login.ts
  signup.ts
  logout.ts

This helps tree shaking and makes generated code easier to inspect.

4. Give very good error messages
Bad:

Unsupported schema

Better:

Unsupported "not" schema

Operation: Login
Location: requestBody.properties.email
File: quickpay-api.yaml

5. Add a check command
For CI:

openapi-codegen check

It should fail when generated files are out of date.

6. Support dry runs
For example:

openapi-codegen generate --dry-run

Developers can see what would change without writing files.

7. Have a public support matrix
Clearly document:

Supported:
- oneOf
- allOf
- discriminator
- pattern

Not supported:
- XML
- callbacks

Do not make developers discover limitations through errors.

8. Make generation deterministic
The same OpenAPI input should always produce exactly the same files.

This is very important for CI and code reviews.

9. Create extension points
Later you might want:

OpenAPI
  -> normalized model
      -> TypeScript emitter
      -> validator emitter
      -> MSW emitter
      -> test-data emitter

You should not need to rewrite the parser for every new output.

10. Test against real APIs
Keep small fixtures, but also test larger real-world OpenAPI documents.

Small fixtures catch individual bugs. Real APIs catch combinations you did not expect.


2. Top 10 naming changes

1. Current: ShapeOfRequest
New: Request
Why: The endpoint module already gives the context.

2. Current: ShapeOfSuccessResponse
New: SuccessResponse
Why: Easier to read.

3. Current: ShapeOfErrorResponse
New: ErrorResponse
Why: Short and clear.

4. Current: ShapeOfResponse
New: Response
Why: The module already gives the endpoint context.

5. Current: makeRequest
New: validateRequest
Why: It validates; it does not really make something.

6. Current: makeResponse.success
New: validateResponse.success
Why: Says exactly what happens.

7. Current: makeResponse.error
New: validateResponse.error
Why: Same reason.

8. Current: ValidationError
New: ValidationIssue
Why: "Issue" works well for one validation problem.

9. Current: openapiRuntime.ts
New: validation.ts
Why: The file is really shared validation primitives.

10. Current: generateOpenApiRuntime.mjs
New: generateOpenApi.mjs
Why: "Runtime" makes the generator sound like runtime code.

Suggested endpoint usage:

import * as Login from "./generated/endpoints/login";

Login.URL;
Login.METHOD;

Login.validateRequest(input);

Login.validateResponse.success(status, body);
Login.validateResponse.error(status, body);

Suggested types:

Login.Request
Login.SuccessResponse
Login.ErrorResponse
Login.Response

If individual imports are useful, also consider:

LoginRequest
LoginResponse


3. Ten things that make a library developer-friendly

1. Simple API
Developers should understand basic usage quickly.

Example:

generate({
  input: "openapi.yaml",
  output: "src/generated",
});

2. Good defaults
A developer should not need many configuration options before the library works.

3. Useful errors
Tell them what failed, where it failed, and what they can do about it.

4. Good TypeScript types
Autocomplete should guide the developer.

They should rarely need to read the source code.

5. Predictable behavior
The same input should always produce the same result.

6. Small documentation with good examples
Start with:

Install
Generate
Import
Validate

Then document advanced features separately.

7. Easy upgrades
Avoid breaking generated names or APIs unnecessarily.

If there is a breaking change, document exactly what developers need to change.

8. Easy debugging
Generated code should be readable.

For example:

if (typeof value.email !== "string") {
  ...
}

This is easier to debug than large, mysterious generated output.

9. Fast commands
Developers will run generation often.

For example:

yarn openapi:generate

It should feel cheap to run.

10. Easy escape hatches
Do not force every project into exactly one setup.

For example:

generate({
  naming: customNaming,
  resolve: customResolver,
});

Keep the normal path simple.


Main recommendation

The biggest naming change should be:

make -> validate

In this design, the library does not transform, construct, coerce, or mutate input.

validateRequest() describes the behavior more accurately than makeRequest().



















10 ways to make the package and generated code very small

1. Keep the generator as a devDependency only
None of the parser, YAML, ref resolver, AST helpers, or codegen libraries should ship to the app.

2. Make generated validators plain functions
Prefer:

export function validateUser(x: unknown) { ... }

Avoid generated classes, schema objects, reflection metadata, or runtime factories if size is the priority.

3. Avoid a runtime validation library
Do not ship Zod, Ajv, Valibot, or another generic validator at runtime if bundle size is the goal.

Compile validation checks into plain TypeScript/JavaScript.

4. Generate one module per endpoint or schema
This lets tree shaking remove unused contracts.

Prefer:

generated/
  login.ts
  signup.ts
  user.ts

Avoid one giant registry object that references everything.

5. Use ESM and mark the package side-effect free
For example:

{
  "type": "module",
  "sideEffects": false
}

This helps bundlers remove unused code.

6. Share tiny validation helpers carefully
Instead of repeating common checks everywhere, use very small helpers such as:

isString(x)
isObject(x)

But keep them tiny. Too much abstraction can make small bundles larger.

7. Do not emit runtime code for TypeScript-only information
Types, aliases, descriptions, examples, titles, and other metadata should not become runtime constants unless the application actually needs them.

8. Strip OpenAPI metadata after generation
Do not embed the original schema into the runtime.

Avoid:

const schema = { ...originalOpenApiSchema }

The runtime should only contain executable checks and endpoint constants that are actually needed.

9. Keep runtime error objects small
Verbose validation errors can add a lot of generated code.

Instead of:

{
  operationId,
  schemaName,
  keyword,
  expected,
  actual,
  message,
  path
}

consider:

{
  path,
  code
}

Human-readable messages can be added in development tooling if needed.

10. Reuse shared schema validators
If many endpoints use User, generate validateUser() once and import it.

Do not inline the same validator into many endpoint files.

Main architectural rule

Build-time complexity is cheap.
Runtime complexity is expensive.

Good model:

OpenAPI
  ->
smart generator
  ->
tiny generated functions

Optional extra improvement

Support two output modes:

debug mode
- richer error messages
- easier debugging
- larger generated code

production mode
- compact error codes
- minimal metadata
- smaller generated code









-----------------









That means your library should validate both structure and schema-level constraints.

For example, it should validate:

object vs array vs string vs number vs boolean vs null
required fields
optional fields
nullable fields
nested objects
arrays and array item types
enums
oneOf
allOf
discriminators
$ref
additionalProperties
minimum / maximum numbers
min/max string length
regex patterns
formats like email
documented request bodies
documented response bodies
documented response status codes
bodyless requests/responses as null




Questions suggestions to architecture:
1. can we make the normaliser work in a way that we can use json or yaml based on configuration provided, ot the file exention?


 ['quickpay-api.ts', emitRootTypes(model)], why do we have this, quickpay is another project? what is going on?


  The important architectural choice is that both static types and runtime validators are generated from
  the same model. This prevents the type generator and validator generator from independently interpreting
  the OpenAPI document. : how about we have a normalisation layer, that produces a normalised version of the spec, then we can use it to generate both types and validators independently

  can you also add brief comments in each section, explaining what each one do in the entire scheme of things.

  We also want the final API name to be configuratble and required: not 'quickpay-api.ts'

  also instead of using schemas/endpoints, lets do it a folder per endpoint, and put all the resources for that endpoint in one folder.

  
