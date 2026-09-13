import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';

import { buildOpenApiModel } from '../src/generator/model.js';

type OperationFixture = Record<string, unknown>;

type OpenApiFixture = {
  readonly components: {
    schemas: Record<string, unknown>;
  };
  readonly info: Record<string, string>;
  readonly openapi: string;
  readonly paths: {
    '/test': {
      post: OperationFixture;
    };
    [path: string]: Record<string, OperationFixture>;
  };
};

function createSpec(): OpenApiFixture {
  return {
    openapi: '3.1.0',
    info: { title: 'Model test', version: '1.0.0' },
    paths: {
      '/test': {
        post: {
          operationId: 'test.run',
          responses: {
            200: { description: 'Success' },
          },
        },
      },
    },
    components: {
      schemas: {
        Value: { type: 'string' },
      },
    },
  };
}

async function withDirectory<T>(
  callback: (directory: string) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'openapi-model-'));

  try {
    return await callback(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function expectModelFailure(
  spec: unknown,
  expected: RegExp
): Promise<void> {
  await withDirectory(async (directory) => {
    const specPath = join(directory, 'openapi.json');
    await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`);
    await assert.rejects(buildOpenApiModel(specPath), expected);
  });
}

test('loads JSON and resolves a local external schema by canonical name', async () => {
  await withDirectory(async (directory) => {
    const sharedPath = join(directory, 'shared.yaml');
    const specPath = join(directory, 'openapi.json');
    await writeFile(
      sharedPath,
      `components:
  schemas:
    ExternalInput:
      type: object
      properties:
        value:
          type: string
      required:
        - value
`
    );
    await writeFile(
      specPath,
      `${JSON.stringify(
        {
          openapi: '3.1.0',
          info: { title: 'External reference', version: '1.0.0' },
          paths: {
            '/external': {
              post: {
                operationId: 'external.create',
                requestBody: {
                  required: true,
                  content: {
                    'application/json': {
                      schema: {
                        $ref: './shared.yaml#/components/schemas/ExternalInput',
                      },
                    },
                  },
                },
                responses: { '204': { description: 'Created' } },
              },
            },
          },
          components: { schemas: {} },
        },
        null,
        2
      )}\n`
    );

    const model = await buildOpenApiModel(specPath);
    assert.deepEqual(
      model.schemas.map(({ name }) => name),
      ['SharedExternalInput']
    );
    assert.equal(
      model.operations.at(0)?.request.schemaName,
      'SharedExternalInput'
    );
  });
});

test('loads YAML documents by extension', async () => {
  await withDirectory(async (directory) => {
    const yaml = `openapi: 3.1.0
info:
  title: YAML model test
  version: 1.0.0
paths:
  /test:
    post:
      operationId: test.run
      responses:
        '200':
          description: Success
components:
  schemas:
    Value: &value
      type: string
    Alias: *value
`;

    for (const extension of ['.yml', '.yaml']) {
      const specPath = join(directory, `openapi${extension}`);
      await writeFile(specPath, yaml);
      const model = await buildOpenApiModel(specPath);
      assert.deepEqual(
        model.schemas.map(({ name }) => name),
        ['Alias', 'Value']
      );
    }
  });
});

test('reports YAML parse errors and unsupported document extensions', async () => {
  await withDirectory(async (directory) => {
    const malformedPath = join(directory, 'malformed.yaml');
    await writeFile(malformedPath, 'openapi: [3.1.0\n');
    await assert.rejects(
      buildOpenApiModel(malformedPath),
      /Unable to parse OpenAPI document.*malformed\.yaml/u
    );

    const duplicatePath = join(directory, 'duplicate.yaml');
    await writeFile(duplicatePath, 'openapi: 3.1.0\nopenapi: 3.1.0\n');
    await assert.rejects(
      buildOpenApiModel(duplicatePath),
      /Unable to parse OpenAPI document.*duplicate\.yaml/u
    );

    const unsupportedPath = join(directory, 'openapi.txt');
    await writeFile(unsupportedPath, JSON.stringify(createSpec()));
    await assert.rejects(
      buildOpenApiModel(unsupportedPath),
      /Unsupported OpenAPI document extension ".txt"/u
    );
  });
});

test('rejects reference cycles, remote references, and unresolved references', async () => {
  const cyclic = createSpec();
  cyclic.components.schemas = {
    Left: { $ref: '#/components/schemas/Right' },
    Right: { $ref: '#/components/schemas/Left' },
  };
  await expectModelFailure(cyclic, /Cyclic schema reference/);

  const remote = createSpec();
  remote.components.schemas.Value = {
    $ref: 'https://example.com/schema.json',
  };
  await expectModelFailure(remote, /Remote \$ref/);

  const unresolved = createSpec();
  unresolved.components.schemas.Value = {
    $ref: '#/components/schemas/Missing',
  };
  await expectModelFailure(unresolved, /Unresolved \$ref/);
});

test('rejects ambiguous generated names and operation IDs', async () => {
  const collidingSchemas = createSpec();
  collidingSchemas.components.schemas = {
    User: { type: 'string' },
    user: { type: 'string' },
  };
  await expectModelFailure(collidingSchemas, /Schema name collision/);

  const missingOperationId = createSpec();
  delete missingOperationId.paths['/test'].post.operationId;
  await expectModelFailure(missingOperationId, /Missing operationId/);

  const duplicateOperationId = createSpec();
  duplicateOperationId.paths['/other'] = {
    get: {
      operationId: 'test.run',
      responses: { 200: { description: 'Success' } },
    },
  };
  await expectModelFailure(duplicateOperationId, /Duplicate operationId/);

  const contractNameCollision = createSpec();
  contractNameCollision.components.schemas = {
    RunRequest: { type: 'string' },
  };
  await expectModelFailure(
    contractNameCollision,
    /Generated API name collision/
  );
});

test('fails closed for unsupported operation inputs and response variants', async () => {
  const parameters = createSpec();
  parameters.paths['/test'].post.parameters = [
    { in: 'query', name: 'search', schema: { type: 'string' } },
  ];
  await expectModelFailure(parameters, /Operation parameters are unsupported/);

  const defaultResponse = createSpec();
  defaultResponse.paths['/test'].post.responses = {
    default: { description: 'Fallback' },
  };
  await expectModelFailure(
    defaultResponse,
    /Response status "default" is unsupported/
  );

  const multipleMediaTypes = createSpec();
  multipleMediaTypes.paths['/test'].post.responses = {
    200: {
      description: 'Success',
      content: {
        'application/json': { schema: { type: 'string' } },
        'text/plain': { schema: { type: 'string' } },
      },
    },
  };
  await expectModelFailure(
    multipleMediaTypes,
    /must use only application\/json/
  );
});
