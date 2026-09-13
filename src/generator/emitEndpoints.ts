import { renderEntityMakers } from './emitMakers.js';
import type { GeneratorConfig, OpenApiModel, ResponseModel } from './types.js';

function indent(lines: readonly string[], amount = 2): string[] {
  const prefix = ' '.repeat(amount);
  return lines.map((line) => `${prefix}${line}`);
}

function renderStatusValidator(
  operation: OpenApiModel['operations'][number]
): string[] {
  const statuses = operation.responses.map(({ status }) => status).join(', ');
  return [
    `export function make${operation.name}ResponseStatus(status: unknown): boolean {`,
    ...indent([
      `return typeof status === 'number' && Number.isInteger(status) && [${statuses}].includes(status);`,
    ]),
    '}',
  ];
}

function renderRequestMaker(
  operation: OpenApiModel['operations'][number]
): string[] {
  if (operation.request.schemaName === `${operation.name}Request`) {
    return [];
  }

  const functionName = `make${operation.name}Request`;
  const resultType = `Result<ShapeOf${operation.name}Request>`;

  if (operation.request.schemaName !== null) {
    return [
      `export function ${functionName}(input: unknown): ${resultType} {`,
      ...indent([`return make${operation.request.schemaName}(input);`]),
      '}',
    ];
  }

  return [
    `export function ${functionName}(input: unknown): ${resultType} {`,
    ...indent([
      'const errors: ValidationIssue[] = [];',
      'if (input !== null) {',
      ...indent([
        "errors.push({ path: [], keyword: 'nullBody', message: 'Expected null' });",
        'return { ok: false, errors };',
      ]),
      '}',
      'return { ok: true, value: input };',
    ]),
    '}',
  ];
}

function renderResponseValidation(
  responses: readonly ResponseModel[]
): string[] {
  const schemaNames = [
    ...new Set(
      responses
        .map(({ schemaName }) => schemaName)
        .filter((name): name is string => name !== null)
    ),
  ];
  const lines = ['const candidateErrorSets: ValidationIssue[][] = [];'];

  if (responses.some(({ schemaName }) => schemaName === null)) {
    lines.push(
      'if (input === null) {',
      ...indent(['return { ok: true, value: input };']),
      '}'
    );
  }

  for (const name of schemaNames) {
    lines.push(
      '{',
      ...indent([
        'const candidateErrors: ValidationIssue[] = [];',
        `if (validate${name}(input, [], candidateErrors)) {`,
        ...indent(['return { ok: true, value: input };']),
        '}',
        'candidateErrorSets.push(candidateErrors);',
      ]),
      '}'
    );
  }

  lines.push(
    "errors.push(...(candidateErrorSets[0] ?? [{ path: [], keyword: 'response', message: 'Invalid response data' }]));",
    'return { ok: false, errors };'
  );
  return lines;
}

function renderResponseMaker(
  operation: OpenApiModel['operations'][number]
): string[] {
  const functionName = `make${operation.name}Response`;
  return [
    `export function ${functionName}(`,
    ...indent(['input: unknown,', 'options?: { readonly status: unknown }']),
    `): Result<ShapeOf${operation.name}Response> {`,
    ...indent([
      'const errors: ValidationIssue[] = [];',
      `if (options !== undefined && !make${operation.name}ResponseStatus(options.status)) {`,
      ...indent([
        "errors.push({ path: ['status'], keyword: 'status', message: 'Undocumented response status' });",
        'return { ok: false, errors };',
      ]),
      '}',
      ...renderResponseValidation(operation.responses),
    ]),
    '}',
  ];
}

function renderEndpointScope(
  operation: OpenApiModel['operations'][number]
): string[] {
  return [
    `export const ${operation.name} = {`,
    ...indent([
      `URL: ${JSON.stringify(operation.path)},`,
      `METHOD: ${JSON.stringify(operation.method)},`,
      `OPERATION_ID: ${JSON.stringify(operation.operationId)},`,
      `makeRequest: make${operation.name}Request,`,
      `makeResponse: make${operation.name}Response,`,
      `makeResponseStatus: make${operation.name}ResponseStatus,`,
    ]),
    '} as const;',
  ];
}

function renderOperation(
  operation: OpenApiModel['operations'][number]
): string {
  return [
    ...renderRequestMaker(operation),
    '',
    ...renderResponseMaker(operation),
    '',
    ...renderStatusValidator(operation),
    '',
    ...renderEndpointScope(operation),
  ].join('\n');
}

function renderImports(model: OpenApiModel, config: GeneratorConfig): string[] {
  const typeNames = [
    ...new Set([
      ...model.schemas.map(({ name }) => `ShapeOf${name}`),
      ...model.operations.flatMap(({ name }) => [
        `ShapeOf${name}Request`,
        `ShapeOf${name}Response`,
      ]),
    ]),
  ];
  const validatorNames = model.schemas.map(({ name }) => `validate${name}`);
  const imports = [
    `import type { Result, ValidationIssue } from ${JSON.stringify(config.runtimeImport)};`,
  ];

  if (typeNames.length > 0) {
    imports.push(
      `import type { ${typeNames.join(', ')} } from './${config.typesFile.slice(0, -3)}';`
    );
  }
  if (validatorNames.length > 0) {
    imports.push(
      `import { ${validatorNames.join(', ')} } from './validators.js';`
    );
  }
  return imports;
}

export function emitEndpointModules(
  model: OpenApiModel,
  config: GeneratorConfig
): Map<string, string> {
  const sections = [
    '/**',
    ' * Generated by openapi-contract-kit.',
    ' * Do not edit directly.',
    ' */',
    '',
    ...renderImports(model, config),
    '',
    renderEntityMakers(model),
    '',
    ...model.operations.flatMap((operation, index) => [
      renderOperation(operation),
      ...(index === model.operations.length - 1 ? [] : ['']),
    ]),
    '',
  ];
  return new Map([['api.ts', sections.join('\n')]]);
}
