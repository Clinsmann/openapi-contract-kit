export type GenerateOpenApiRuntimeOptions = {
  readonly argv?: readonly string[];
  readonly cwd?: string;
};

export type GenerateOpenApiRuntimeResult = {
  readonly operationCount: number;
  readonly operationNames: readonly string[];
  readonly schemaCount: number;
};

export function generateOpenApiRuntime(
  options?: GenerateOpenApiRuntimeOptions
): Promise<GenerateOpenApiRuntimeResult>;

export function main(argv?: readonly string[]): Promise<void>;
