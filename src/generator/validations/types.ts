import type { SchemaProperty } from '../types.js';

export type ChildFunctions = {
  readonly additionalProperties: string | null;
  readonly allOf: readonly string[];
  readonly anyOf: readonly string[];
  readonly items: string | null;
  readonly oneOf: readonly string[];
  readonly properties: readonly (SchemaProperty & {
    readonly functionName: string;
  })[];
  readonly reference: string | null;
};
