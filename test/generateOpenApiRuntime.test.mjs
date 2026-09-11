import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { generateOpenApiRuntime } from '../src/generator/generateOpenApiRuntime.mjs';
import { resolveGeneratorConfig } from '../src/generator/config.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturePath = join(projectRoot, 'test/fixtures/openapi-runtime.json');
const runtimeTypesPath = join(projectRoot, 'src/runtime.d.ts');

async function createFixtureProject() {
  const directory = await mkdtemp(join(tmpdir(), 'quickpay-openapi-runtime-'));
  const specPath = join(directory, 'openapi.json');
  const outputPath = join(directory, 'src/api/generated');
  const packageDirectory = join(
    directory,
    'node_modules/openapi-contract-kit'
  );
  const configPath = join(directory, 'openapi.config.json');

  await cp(fixturePath, specPath);
  await mkdir(packageDirectory, { recursive: true });
  await cp(runtimeTypesPath, join(packageDirectory, 'runtime.d.ts'));
  await writeFile(join(packageDirectory, 'runtime.mjs'), 'export {};\n');
  await writeFile(
    join(packageDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'openapi-contract-kit',
        type: 'module',
        exports: {
          './runtime': {
            types: './runtime.d.ts',
            import: './runtime.mjs',
          },
        },
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        specPath: 'openapi.json',
        outDir: 'src/api/generated',
        runtimeImport: 'openapi-contract-kit/runtime',
      },
      null,
      2
    )}\n`
  );

  return {
    configPath,
    directory,
    outputPath,
    specPath,
  };
}

async function snapshotFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await snapshotFiles(filePath);
      files.push(
        ...nestedFiles.map(([filePath, content]) => [
          `${entry.name}/${filePath}`,
          content,
        ])
      );
    } else {
      files.push([entry.name, await readFile(filePath, 'utf8')]);
    }
  }

  return files.sort(([left], [right]) => left.localeCompare(right));
}

async function compileFixtureProject(directory) {
  const consumerPath = join(directory, 'consumer.ts');
  const tsconfigPath = join(directory, 'tsconfig.json');

  await writeFile(
    consumerPath,
    `import type { WidgetInput, ShapeOfWidgetInput } from './src/api/generated/quickpay-api';
import type { ShapeOfResponse } from './src/api/generated/endpoints/CreateWidget';

const currentName: WidgetInput = {
  email: 'user@example.com', role: 'admin', score: 10, code: 'ABC', tags: [],
  settings: {}, pet: { kind: 'cat', meows: true }, externalId: 1,
};
const legacyName: ShapeOfWidgetInput = currentName;
const response: ShapeOfResponse = { status: 204, body: null };
void legacyName;
void response;

// @ts-expect-error invalid enum value
const invalidRole: WidgetInput = { ...currentName, role: 'owner' };
// @ts-expect-error status and body must remain correlated
const invalidResponse: ShapeOfResponse = { status: 204, body: {} };
void invalidRole;
void invalidResponse;
`
  );
  await writeFile(
    tsconfigPath,
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'CommonJS',
          moduleResolution: 'Node',
          strict: true,
          skipLibCheck: true,
          rootDir: '.',
          outDir: 'dist',
        },
        include: ['src/**/*.ts', 'consumer.ts'],
      },
      null,
      2
    )}\n`
  );

  await execFileAsync(process.env.TSC_BIN ?? 'tsc', ['--project', tsconfigPath], {
    cwd: projectRoot,
  });
}

test('resolves config paths relative to the config file and CLI paths from cwd', async () => {
  const project = await createFixtureProject();

  try {
    const fromConfig = await resolveGeneratorConfig({
      argv: ['--config', project.configPath],
      cwd: projectRoot,
    });
    assert.equal(fromConfig.specPath, project.specPath);
    assert.equal(fromConfig.outDir, project.outputPath);

    const fromCli = await resolveGeneratorConfig({
      argv: [
        '--config',
        project.configPath,
        '--spec',
        'test/fixtures/openapi-runtime.json',
        '--out',
        'tmp-generated',
      ],
      cwd: projectRoot,
    });
    assert.equal(fromCli.specPath, fixturePath);
    assert.equal(fromCli.outDir, join(projectRoot, 'tmp-generated'));

    await assert.rejects(
      resolveGeneratorConfig({
        argv: ['--config', project.configPath, '--unknown'],
        cwd: projectRoot,
      }),
      /Unknown argument/
    );

    const unsafeConfig = {
      specPath: 'openapi.json',
      outDir: '.',
      runtimeImport: 'openapi-contract-kit/runtime',
    };
    await writeFile(
      project.configPath,
      `${JSON.stringify(unsafeConfig, null, 2)}\n`
    );
    await assert.rejects(
      generateOpenApiRuntime({
        argv: ['--config', project.configPath],
        cwd: projectRoot,
      }),
      /contains protected input/
    );
  } finally {
    await rm(project.directory, { force: true, recursive: true });
  }
});

test('generates deterministic types, standalone makers, and endpoint contracts', async () => {
  const project = await createFixtureProject();

  try {
    const firstResult = await generateOpenApiRuntime({
      argv: ['--config', project.configPath],
      cwd: projectRoot,
    });
    const firstSnapshot = await snapshotFiles(project.outputPath);
    const secondResult = await generateOpenApiRuntime({
      argv: ['--config', project.configPath],
      cwd: projectRoot,
    });
    const secondSnapshot = await snapshotFiles(project.outputPath);

    assert.equal(firstResult.operationCount, 2);
    assert.equal(firstResult.schemaCount, 11);
    assert.deepEqual(secondResult, firstResult);
    assert.deepEqual(secondSnapshot, firstSnapshot);
    await assert.rejects(
      access(join(project.outputPath, 'index.ts')),
      /ENOENT/
    );

    const types = await readFile(
      join(project.outputPath, 'quickpay-api.ts'),
      'utf8'
    );
    assert.match(types, /export type WidgetInput =/);
    assert.match(types, /export type ShapeOfWidgetInput = WidgetInput;/);

    await compileFixtureProject(project.directory);

    const compiledRoot = join(project.directory, 'dist/src/api/generated');
    const { makeWidgetInput } = await import(
      join(compiledRoot, 'schemas/WidgetInput.js')
    );
    const { makeErrorResponse } = await import(
      join(compiledRoot, 'schemas/ErrorResponse.js')
    );
    const { makeResponse } = await import(
      join(compiledRoot, 'endpoints/CreateWidget.js')
    );
    const { makeRequest: makePingRequest, makeResponse: makePingResponse } =
      await import(join(compiledRoot, 'endpoints/Ping.js'));

    const validInput = {
      email: 'user@example.com',
      role: 'admin',
      score: 42,
      code: 'ABC',
      tags: ['stable'],
      note: null,
      settings: { theme: 'dark' },
      pet: { kind: 'cat', meows: true },
      externalId: 100,
    };
    const validResult = makeWidgetInput(validInput);
    assert.equal(validResult.ok, true);
    assert.equal(validResult.value, validInput);

    const invalidInput = structuredClone(validInput);
    invalidInput.email = 'not-an-email';
    invalidInput.settings = { theme: 1 };
    invalidInput.pet = { kind: 'bird' };
    const beforeValidation = structuredClone(invalidInput);
    const invalidResult = makeWidgetInput(invalidInput);
    assert.equal(invalidResult.ok, false);
    assert.deepEqual(invalidInput, beforeValidation);
    assert.deepEqual(
      invalidResult.errors.map(({ path, keyword }) => ({ path, keyword })),
      [
        { path: ['email'], keyword: 'format' },
        { path: ['settings', 'theme'], keyword: 'type' },
        { path: ['pet'], keyword: 'oneOf' },
      ]
    );

    const missingEmail = structuredClone(validInput);
    delete missingEmail.email;
    const invalidCases = [
      {
        input: missingEmail,
        keyword: 'required',
        path: ['email'],
      },
      {
        input: { ...validInput, role: 'owner' },
        keyword: 'enum',
        path: ['role'],
      },
      {
        input: { ...validInput, score: -1 },
        keyword: 'minimum',
        path: ['score'],
      },
      {
        input: { ...validInput, score: 101 },
        keyword: 'maximum',
        path: ['score'],
      },
      {
        input: { ...validInput, code: 'AB' },
        keyword: 'minLength',
        path: ['code'],
      },
      {
        input: { ...validInput, code: 'ABCDEFGHI' },
        keyword: 'maxLength',
        path: ['code'],
      },
      {
        input: { ...validInput, code: 'abc' },
        keyword: 'pattern',
        path: ['code'],
      },
      {
        input: { ...validInput, tags: [1] },
        keyword: 'type',
        path: ['tags', 0],
      },
      {
        input: { ...validInput, note: 1 },
        keyword: 'type',
        path: ['note'],
      },
      {
        input: { ...validInput, externalId: false },
        keyword: 'anyOf',
        path: ['externalId'],
      },
    ];
    for (const invalidCase of invalidCases) {
      const result = makeWidgetInput(invalidCase.input);
      assert.equal(result.ok, false);
      assert.equal(
        result.errors.some(
          ({ keyword, path }) =>
            keyword === invalidCase.keyword &&
            JSON.stringify(path) === JSON.stringify(invalidCase.path)
        ),
        true
      );
    }
    assert.equal(
      makeErrorResponse({ message: 'No', extra: true }).errors[0].keyword,
      'additionalProperties'
    );

    const responseBody = {
      status: 'success',
      data: { ...validInput, id: 'widget-1' },
    };
    assert.equal(makeResponse({ status: 201, body: responseBody }).ok, true);
    assert.equal(makeResponse.success({ status: 204, body: null }).ok, true);
    assert.equal(
      makeResponse.error({
        status: 422,
        body: { message: 'Invalid', errors: { email: ['Required'] } },
      }).ok,
      true
    );
    assert.equal(
      makeResponse.success({ status: 400, body: { message: 'No' } }).ok,
      false
    );
    assert.equal(makeResponse({ status: 299, body: null }).ok, false);

    assert.deepEqual(makePingRequest(null), { ok: true, value: null });
    assert.equal(makePingRequest({}).ok, false);
    assert.equal(makePingResponse({ status: 200, body: null }).ok, true);
    assert.equal(makePingResponse.error({ status: 500, body: null }).ok, false);
  } finally {
    await rm(project.directory, { force: true, recursive: true });
  }
});

test('removes stale owned files and refuses to replace unexpected output', async () => {
  const project = await createFixtureProject();

  try {
    await generateOpenApiRuntime({
      argv: ['--config', project.configPath],
      cwd: projectRoot,
    });
    await access(join(project.outputPath, 'schemas/Obsolete.ts'));

    const spec = JSON.parse(await readFile(project.specPath, 'utf8'));
    delete spec.components.schemas.Obsolete;
    await writeFile(project.specPath, `${JSON.stringify(spec, null, 2)}\n`);
    await generateOpenApiRuntime({
      argv: ['--config', project.configPath],
      cwd: projectRoot,
    });
    await assert.rejects(
      access(join(project.outputPath, 'schemas/Obsolete.ts')),
      /ENOENT/
    );

    await writeFile(join(project.outputPath, 'manual.ts'), 'manual\n');
    await assert.rejects(
      generateOpenApiRuntime({
        argv: ['--config', project.configPath],
        cwd: projectRoot,
      }),
      /unexpected file/
    );
  } finally {
    await rm(project.directory, { force: true, recursive: true });
  }
});

test('rejects unsupported schemas before changing the last good output', async () => {
  const project = await createFixtureProject();

  try {
    await generateOpenApiRuntime({
      argv: ['--config', project.configPath],
      cwd: projectRoot,
    });
    const beforeFailure = await snapshotFiles(project.outputPath);
    const spec = JSON.parse(await readFile(project.specPath, 'utf8'));
    spec.components.schemas.WidgetInput.not = { type: 'null' };
    await writeFile(project.specPath, `${JSON.stringify(spec, null, 2)}\n`);

    await assert.rejects(
      generateOpenApiRuntime({
        argv: ['--config', project.configPath],
        cwd: projectRoot,
      }),
      /Unsupported schema keyword "not"/
    );
    assert.deepEqual(await snapshotFiles(project.outputPath), beforeFailure);
  } finally {
    await rm(project.directory, { force: true, recursive: true });
  }
});
