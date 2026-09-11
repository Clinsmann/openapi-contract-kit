import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildOpenApiModel } from '../src/generator/model.mjs';

function createSpec() {
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

async function withDirectory(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'openapi-model-'));

  try {
    return await callback(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function expectModelFailure(spec, expected) {
  await withDirectory(async (directory) => {
    const specPath = join(directory, 'openapi.json');
    await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`);
    await assert.rejects(buildOpenApiModel(specPath), expected);
  });
}

test('loads JSON and resolves a local external schema by canonical name', async () => {
  await withDirectory(async (directory) => {
    const sharedPath = join(directory, 'shared.json');
    const specPath = join(directory, 'openapi.json');
    await writeFile(
      sharedPath,
      `${JSON.stringify(
        {
          components: {
            schemas: {
              ExternalInput: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
              },
            },
          },
        },
        null,
        2
      )}\n`
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
                        $ref: './shared.json#/components/schemas/ExternalInput',
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
    assert.equal(model.operations[0].request.schemaName, 'SharedExternalInput');
  });
});

test('rejects YAML OpenAPI documents', async () => {
  await withDirectory(async (directory) => {
    const specPath = join(directory, 'openapi.yaml');
    await writeFile(specPath, JSON.stringify(createSpec()));
    await assert.rejects(
      buildOpenApiModel(specPath),
      /Only JSON OpenAPI documents are supported/
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
