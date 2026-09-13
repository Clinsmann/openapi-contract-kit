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
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'vitest';

import {
  generateOpenApiRuntime,
  main,
} from '../src/generator/generateOpenApiRuntime.js';
import { resolveGeneratorConfig } from '../src/generator/config.js';
import { emitSchemaMakers } from '../src/generator/emitMakers.js';
import { buildOpenApiModel } from '../src/generator/model.js';

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const fixturePath = join(projectRoot, 'test/fixtures/openapi-runtime.json');
const runtimeTypesPath = join(projectRoot, 'dist/src/runtime.d.ts');

type FixtureProject = {
  readonly configPath: string;
  readonly directory: string;
  readonly outputPath: string;
  readonly specPath: string;
};

type FileSnapshot = Array<[string, string]>;

type ValidationIssue = {
  readonly keyword: string;
  readonly path: readonly (number | string)[];
};

type CapturedMainOptions = {
  readonly argv: readonly string[];
  readonly isTTY: boolean;
  readonly stream: NodeJS.WriteStream;
};

async function createFixtureProject(): Promise<FixtureProject> {
  const directory = await mkdtemp(join(tmpdir(), 'quickpay-openapi-runtime-'));
  const specPath = join(directory, 'openapi.json');
  const outputPath = join(directory, 'src/api/generated');
  const packageDirectory = join(directory, 'node_modules/openapi-contract-kit');
  const configPath = join(directory, 'openapi.config.json');

  await cp(fixturePath, specPath);
  await mkdir(packageDirectory, { recursive: true });
  await cp(runtimeTypesPath, join(packageDirectory, 'runtime.d.ts'));
  await writeFile(join(packageDirectory, 'runtime.js'), 'export {};\n');
  await writeFile(
    join(packageDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'openapi-contract-kit',
        type: 'module',
        exports: {
          './runtime': {
            types: './runtime.d.ts',
            import: './runtime.js',
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
        typesFile: 'contracts.ts',
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

async function snapshotFiles(directory: string): Promise<FileSnapshot> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: FileSnapshot = [];

  for (const entry of entries) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles: FileSnapshot = await snapshotFiles(filePath);
      files.push(
        ...nestedFiles.map(([filePath, content]): [string, string] => [
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

async function compileFixtureProject(directory: string): Promise<void> {
  const consumerPath = join(directory, 'consumer.ts');
  const tsconfigPath = join(directory, 'tsconfig.json');

  await writeFile(
    consumerPath,
    `import type { WidgetInput, ShapeOfWidgetInput } from './src/api/generated/contracts';
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
          target: 'ES5',
          lib: ['ES2017'],
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

  await execFileAsync(
    process.env.TSC_BIN ?? 'tsc',
    ['--project', tsconfigPath],
    {
      cwd: projectRoot,
    }
  );
}

async function captureMainOutput({
  argv,
  stream,
  isTTY,
}: CapturedMainOptions): Promise<string> {
  const originalWrite = stream.write;
  const originalIsTTY = stream.isTTY;
  const chunks: string[] = [];

  Object.defineProperty(stream, 'isTTY', {
    configurable: true,
    value: isTTY,
  });
  Object.defineProperty(stream, 'write', {
    configurable: true,
    value: (chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    },
  });

  try {
    await main(argv);
  } finally {
    Object.defineProperty(stream, 'write', {
      configurable: true,
      value: originalWrite,
    });
    Object.defineProperty(stream, 'isTTY', {
      configurable: true,
      value: originalIsTTY,
    });
  }

  return chunks.join('');
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/gu, '');
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
    assert.equal(fromConfig.typesFile, 'contracts.ts');

    await writeFile(
      project.configPath,
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
    await assert.rejects(
      resolveGeneratorConfig({
        argv: ['--config', project.configPath],
        cwd: projectRoot,
      }),
      /requires a non-empty "typesFile"/
    );

    await writeFile(
      project.configPath,
      `${JSON.stringify(
        {
          specPath: 'openapi.json',
          outDir: 'src/api/generated',
          runtimeImport: 'openapi-contract-kit/runtime',
          typesFile: '../contracts.ts',
        },
        null,
        2
      )}\n`
    );
    await assert.rejects(
      resolveGeneratorConfig({
        argv: ['--config', project.configPath],
        cwd: projectRoot,
      }),
      /root-level \.ts filename/
    );

    await writeFile(
      project.configPath,
      `${JSON.stringify(
        {
          specPath: 'openapi.json',
          outDir: 'src/api/generated',
          runtimeImport: 'openapi-contract-kit/runtime',
          typesFile: 'contracts.ts',
        },
        null,
        2
      )}\n`
    );

    const fromCli = await resolveGeneratorConfig({
      argv: [
        '--config',
        project.configPath,
        '--spec',
        'test/fixtures/openapi-runtime.json',
        '--out',
        'tmp-generated',
        '--types-file',
        'cli-contracts.ts',
      ],
      cwd: projectRoot,
    });
    assert.equal(fromCli.specPath, fixturePath);
    assert.equal(fromCli.outDir, join(projectRoot, 'tmp-generated'));
    assert.equal(fromCli.typesFile, 'cli-contracts.ts');

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
      typesFile: 'contracts.ts',
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

test('runs the compiled CLI entry point', async () => {
  const project = await createFixtureProject();

  try {
    const { stderr, stdout } = await execFileAsync(
      process.execPath,
      [
        join(projectRoot, 'dist/bin/openapi-contract-kit.js'),
        '--config',
        project.configPath,
      ],
      { cwd: projectRoot }
    );

    assert.equal(stderr, '');
    assert.equal(stdout, 'Generated 11 schemas and 2 endpoints.\n');
    await access(join(project.outputPath, 'contracts.ts'));
  } finally {
    await rm(project.directory, { force: true, recursive: true });
  }
});

test('exports the compiled package API', async () => {
  const packageApi = await import('openapi-contract-kit');
  const runtime = await import('openapi-contract-kit/runtime');

  assert.equal(typeof packageApi.generateOpenApiRuntime, 'function');
  assert.equal(typeof packageApi.main, 'function');
  assert.deepEqual(Object.keys(runtime), []);
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
      join(project.outputPath, 'contracts.ts'),
      'utf8'
    );
    const widgetInputMaker = await readFile(
      join(project.outputPath, 'schemas/WidgetInput.ts'),
      'utf8'
    );
    const createWidgetEndpoint = await readFile(
      join(project.outputPath, 'endpoints/CreateWidget.ts'),
      'utf8'
    );
    const sharedValidators = await readFile(
      join(project.outputPath, 'schemas/validators.ts'),
      'utf8'
    );
    assert.match(types, /export type WidgetInput =/);
    assert.match(types, /export type ShapeOfWidgetInput = WidgetInput;/);
    assert.match(widgetInputMaker, /from '..\/contracts';/u);
    assert.match(widgetInputMaker, /import type \{ ShapeOfWidgetInput \}/u);
    assert.match(widgetInputMaker, /Result<ShapeOfWidgetInput>/u);
    assert.doesNotMatch(widgetInputMaker, /Result<WidgetInput>/u);
    assert.match(createWidgetEndpoint, /from '..\/contracts';/u);
    assert.doesNotMatch(widgetInputMaker, /new RegExp\(/u);
    assert.match(sharedValidators, /new RegExp\(/u);
    assert.equal(
      (sharedValidators.match(/Expected email format/gu) ?? []).length,
      1
    );

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

    const validInput: Record<string, unknown> = {
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

    const structuralOnlyInput = {
      ...validInput,
      email: 'user@example.com',
      score: -1,
      code: 'x',
    };
    const structuralOnlyResult = makeWidgetInput(structuralOnlyInput);
    assert.equal(structuralOnlyResult.ok, true);
    assert.equal(structuralOnlyResult.value, structuralOnlyInput);

    const invalidEmailInputs = [
      'not-an-email',
      'user @example.com',
      '@example.com',
      'user@',
      'user@example',
      'user..name@example.com',
      'user@example-.com',
      'user@example.c',
    ];
    for (const email of invalidEmailInputs) {
      const result = makeWidgetInput({ ...validInput, email });
      assert.equal(result.ok, false);
      assert.equal(
        result.errors.some(
          ({ keyword, path }: ValidationIssue) =>
            keyword === 'format' &&
            JSON.stringify(path) === JSON.stringify(['email'])
        ),
        true
      );
    }

    const invalidInput = structuredClone(validInput);
    invalidInput.email = 123;
    invalidInput.settings = { theme: 1 };
    invalidInput.pet = { kind: 'bird' };
    const beforeValidation = structuredClone(invalidInput);
    const invalidResult = makeWidgetInput(invalidInput);
    assert.equal(invalidResult.ok, false);
    assert.deepEqual(invalidInput, beforeValidation);
    assert.deepEqual(
      invalidResult.errors.map(({ path, keyword }: ValidationIssue) => ({
        path,
        keyword,
      })),
      [
        { path: ['email'], keyword: 'type' },
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
          ({ keyword, path }: ValidationIssue) =>
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

test('deduplicates identical inline validators across schema makers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'quickpay-openapi-dedupe-'));
  const specPath = join(directory, 'openapi.json');

  try {
    const spec = JSON.parse(await readFile(fixturePath, 'utf8')) as {
      components: { schemas: Record<string, unknown> };
    };
    spec.components.schemas.SignupInput = {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
      },
      required: ['email'],
    };
    await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`);

    const model = await buildOpenApiModel(specPath);
    const files = emitSchemaMakers(model, {
      configPath: join(directory, 'openapi.config.json'),
      outDir: join(directory, 'generated'),
      runtimeImport: 'openapi-contract-kit/runtime',
      specPath,
      typesFile: 'contracts.ts',
    });
    const validators = files.get('schemas/validators.ts');
    const widgetInput = files.get('schemas/WidgetInput.ts');
    const signupInput = files.get('schemas/SignupInput.ts');

    assert.notEqual(validators, undefined);
    assert.notEqual(widgetInput, undefined);
    assert.notEqual(signupInput, undefined);
    assert.equal(
      (validators?.match(/Expected email format/gu) ?? []).length,
      1
    );
    assert.doesNotMatch(widgetInput ?? '', /Expected email format/u);
    assert.doesNotMatch(signupInput ?? '', /Expected email format/u);
  } finally {
    await rm(directory, { force: true, recursive: true });
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

test('formats interactive CLI output and preserves captured output', async () => {
  const project = await createFixtureProject();
  const previousNoColor = process.env.NO_COLOR;
  const previousExitCode = process.exitCode;

  try {
    delete process.env.NO_COLOR;
    const interactiveSuccess = await captureMainOutput({
      argv: ['--config', project.configPath],
      isTTY: true,
      stream: process.stdout,
    });
    assert.match(interactiveSuccess, /\u001b\[/u);
    const plainInteractiveSuccess = stripAnsi(interactiveSuccess);
    assert.match(plainInteractiveSuccess, /✔ OpenAPI generation complete/u);
    assert.match(plainInteractiveSuccess, /Schemas:\s+11 schemas/u);
    assert.match(plainInteractiveSuccess, /Endpoints:\s+2 endpoints/u);

    process.env.NO_COLOR = '1';
    const uncoloredSuccess = await captureMainOutput({
      argv: ['--config', project.configPath],
      isTTY: true,
      stream: process.stdout,
    });
    assert.doesNotMatch(uncoloredSuccess, /\u001b\[/u);
    assert.match(uncoloredSuccess, /✔ OpenAPI generation complete/u);

    delete process.env.NO_COLOR;
    const capturedSuccess = await captureMainOutput({
      argv: ['--config', project.configPath],
      isTTY: false,
      stream: process.stdout,
    });
    assert.equal(capturedSuccess, 'Generated 11 schemas and 2 endpoints.\n');

    const interactiveFailure = await captureMainOutput({
      argv: ['--unknown'],
      isTTY: true,
      stream: process.stderr,
    });
    assert.equal(process.exitCode, 1);
    assert.match(interactiveFailure, /\u001b\[/u);
    const plainInteractiveFailure = stripAnsi(interactiveFailure);
    assert.match(plainInteractiveFailure, /✖ OpenAPI generation failed/u);
    assert.match(plainInteractiveFailure, /Unknown argument/u);

    process.exitCode = undefined;
    const capturedFailure = await captureMainOutput({
      argv: ['--unknown'],
      isTTY: false,
      stream: process.stderr,
    });
    assert.equal(
      capturedFailure,
      'OpenAPI generation failed: Unknown argument "--unknown"\n'
    );
  } finally {
    if (previousNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = previousNoColor;
    }
    process.exitCode = previousExitCode;
    await rm(project.directory, { force: true, recursive: true });
  }
});
