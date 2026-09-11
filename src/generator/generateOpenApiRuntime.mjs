import { fileURLToPath } from 'node:url';

import { resolveGeneratorConfig } from './config.mjs';
import { emitEndpointModules } from './emitEndpoints.mjs';
import { emitSchemaMakers } from './emitMakers.mjs';
import { emitRootTypes } from './emitTypes.mjs';
import { buildOpenApiModel } from './model.mjs';
import { writeGeneratedOutput } from './writeOutput.mjs';

export async function generateOpenApiRuntime({
  argv = [],
  cwd = process.cwd(),
} = {}) {
  const config = await resolveGeneratorConfig({ argv, cwd });
  const model = await buildOpenApiModel(config.specPath);
  const files = new Map([
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

export async function main(argv = process.argv.slice(2)) {
  try {
    const result = await generateOpenApiRuntime({ argv });
    process.stdout.write(
      `Generated ${result.schemaCount} schemas and ${result.operationCount} endpoints.\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`OpenAPI generation failed: ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
