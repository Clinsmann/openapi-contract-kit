import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import type {
  GenerateOpenApiRuntimeOptions,
  GeneratorConfig,
  UnknownRecord,
} from './types.js';

const CONFIG_KEYS = new Set(['specPath', 'outDir', 'runtimeImport']);
type CliConfigKey = 'configPath' | 'outDir' | 'runtimeImport' | 'specPath';

const FLAG_NAMES = new Map<string, CliConfigKey>([
  ['--config', 'configPath'],
  ['--spec', 'specPath'],
  ['--out', 'outDir'],
  ['--runtime-import', 'runtimeImport'],
]);

type CliOptions = Partial<Record<CliConfigKey, string>>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseArguments(argv: readonly string[], cwd: string): CliOptions {
  const values: CliOptions = {};

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const key = flag === undefined ? undefined : FLAG_NAMES.get(flag);
    const value = argv[index + 1];

    if (key === undefined) {
      throw new Error(`Unknown argument "${flag ?? ''}"`);
    }
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Missing value for "${flag}"`);
    }

    values[key] = isAbsolute(value) ? value : resolve(cwd, value);
  }

  return values;
}

function requirePath(
  config: UnknownRecord,
  key: string,
  configPath: string
): string {
  const value = config[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Config "${configPath}" requires a non-empty "${key}"`);
  }

  return value;
}

export async function resolveGeneratorConfig(
  options: GenerateOpenApiRuntimeOptions = {}
): Promise<GeneratorConfig> {
  const argv = options.argv ?? [];
  const cwd = options.cwd ?? process.cwd();
  const cli = parseArguments(argv, cwd);
  const configPath = cli.configPath ?? resolve(cwd, 'openapi.config.json');
  let config: unknown;

  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to read OpenAPI config "${configPath}": ${message}`
    );
  }

  if (!isRecord(config)) {
    throw new Error(`OpenAPI config "${configPath}" must contain an object`);
  }

  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.has(key)) {
      throw new Error(`Unknown OpenAPI config key "${key}"`);
    }
  }

  const configDirectory = dirname(configPath);
  const resolveConfigPath = (key: 'outDir' | 'specPath'): string => {
    const value = requirePath(config, key, configPath);
    return isAbsolute(value) ? value : resolve(configDirectory, value);
  };

  const runtimeImport =
    cli.runtimeImport ?? requirePath(config, 'runtimeImport', configPath);
  if (runtimeImport.includes('\\') || runtimeImport.startsWith('.')) {
    throw new Error(`Config "${configPath}" requires a package runtimeImport`);
  }

  return {
    configPath,
    specPath: cli.specPath ?? resolveConfigPath('specPath'),
    outDir: cli.outDir ?? resolveConfigPath('outDir'),
    runtimeImport,
  };
}
