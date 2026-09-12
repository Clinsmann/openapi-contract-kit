export type UnknownRecord = Record<string, unknown>;

export type JsonPrimitive = boolean | null | number | string;

export type SchemaType =
  | 'array'
  | 'boolean'
  | 'integer'
  | 'null'
  | 'number'
  | 'object'
  | 'string';

export type DocumentContext = {
  readonly documentPath: string;
  readonly pointer: string;
};

export type ResolvedReference = DocumentContext & {
  readonly canonicalKey: string;
  readonly value: unknown;
};

export type BooleanSchema = {
  readonly booleanSchema: boolean;
  readonly location: string;
};

export type SchemaProperty = {
  readonly name: string;
  readonly required: boolean;
  readonly schema: NormalizedSchema;
};

export type StandardSchema = {
  readonly additionalProperties: boolean | NormalizedSchema;
  readonly allOf: readonly NormalizedSchema[];
  readonly anyOf: readonly NormalizedSchema[];
  readonly booleanSchema: null;
  readonly constValue: JsonPrimitive | undefined;
  readonly enumValues: readonly JsonPrimitive[] | null;
  readonly exclusiveMaximum: number | null;
  readonly exclusiveMinimum: number | null;
  readonly format: 'email' | null;
  readonly items: NormalizedSchema | null;
  readonly location: string;
  readonly maximum: number | null;
  readonly maxLength: number | null;
  readonly minimum: number | null;
  readonly minLength: number | null;
  readonly oneOf: readonly NormalizedSchema[];
  readonly pattern: string | null;
  readonly properties: readonly SchemaProperty[];
  readonly reference: string | null;
  readonly types: readonly SchemaType[] | null;
};

export type NormalizedSchema = BooleanSchema | StandardSchema;

export type SchemaEntry = {
  readonly canonicalKey: string;
  readonly name: string;
  readonly schema: NormalizedSchema;
};

export type ResponseModel = {
  readonly isSuccess: boolean;
  readonly schemaName: string | null;
  readonly status: number;
};

export type OperationModel = {
  readonly method: string;
  readonly name: string;
  readonly operationId: string;
  readonly path: string;
  readonly request: {
    readonly schemaName: string | null;
  };
  readonly responses: readonly ResponseModel[];
};

export type OpenApiModel = {
  readonly operations: readonly OperationModel[];
  readonly schemas: readonly SchemaEntry[];
};

export type GeneratorConfig = {
  readonly configPath: string;
  readonly outDir: string;
  readonly runtimeImport: string;
  readonly specPath: string;
};

export type GenerateOpenApiRuntimeOptions = {
  readonly argv?: readonly string[];
  readonly cwd?: string;
};

export type GenerateOpenApiRuntimeResult = {
  readonly operationCount: number;
  readonly operationNames: readonly string[];
  readonly schemaCount: number;
};
