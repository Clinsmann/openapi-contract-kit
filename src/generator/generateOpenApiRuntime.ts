import { fileURLToPath } from 'node:url';

import {
  formatFailureOutput,
  formatSuccessOutput,
} from '../cli/formatOutput.js';
import { resolveGeneratorConfig } from './config.js';
import { emitEndpointModules } from './emitEndpoints.js';
import { emitSchemaMakers } from './emitMakers.js';
import { emitRootTypes } from './emitTypes.js';
import { buildOpenApiModel } from './model.js';
import type {
  GenerateOpenApiRuntimeOptions,
  GenerateOpenApiRuntimeResult,
} from './types.js';
import { writeGeneratedOutput } from './writeOutput.js';

export async function generateOpenApiRuntime(
  options: GenerateOpenApiRuntimeOptions = {}
): Promise<GenerateOpenApiRuntimeResult> {
  const argv = options.argv ?? [];
  const cwd = options.cwd ?? process.cwd();
  const config = await resolveGeneratorConfig({ argv, cwd });
  const model = await buildOpenApiModel(config.specPath);
  const files = new Map<string, string>([
    ['quickpay-api.ts', emitRootTypes(model)],
    ...emitSchemaMakers(model, config),
    ...emitEndpointModules(model, config),
  ]);

  await writeGeneratedOutput(config.outDir, files, {
    protectedPaths: [config.configPath, config.specPath],
  });

  return {
    operationCount: model.operations.length,
    operationNames: model.operations.map(({ name }) => name),
    schemaCount: model.schemas.length,
  };
}

export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<void> {
  try {
    const result = await generateOpenApiRuntime({ argv });
    process.stdout.write(formatSuccessOutput(result, process.stdout));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(formatFailureOutput(message, process.stderr));
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
