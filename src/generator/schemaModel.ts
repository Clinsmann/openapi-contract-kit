import { basename, extname } from 'node:path';

import {
  isRecord,
  locationOf,
  pointerChild,
  requireRecord,
} from './documents.js';
import type {
  DocumentContext,
  JsonPrimitive,
  NormalizedSchema,
  ResolvedReference,
  SchemaEntry,
  SchemaType,
} from './types.js';

const SCHEMA_TYPES = new Set<string>([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
]);
const ANNOTATION_KEYWORDS = new Set([
  '$anchor',
  '$comment',
  '$defs',
  '$id',
  '$schema',
  'default',
  'deprecated',
  'description',
  'discriminator',
  'example',
  'examples',
  'externalDocs',
  'readOnly',
  'title',
  'writeOnly',
  'xml',
]);
const ASSERTION_KEYWORDS = new Set([
  '$ref',
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'enum',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'format',
  'items',
  'maxLength',
  'maximum',
  'minLength',
  'minimum',
  'oneOf',
  'pattern',
  'properties',
  'required',
  'type',
]);
const RESERVED_IDENTIFIERS = new Set([
  'any',
  'boolean',
  'constructor',
  'declare',
  'default',
  'enum',
  'extends',
  'false',
  'infer',
  'interface',
  'keyof',
  'never',
  'null',
  'number',
  'object',
  'makeresult',
  'string',
  'symbol',
  'true',
  'type',
  'undefined',
  'unknown',
  'result',
  'validationissue',
  'validationpath',
]);

type RawSchemaEntry = {
  readonly context: DocumentContext;
  readonly name: string;
  readonly rawSchema: unknown;
};

function requireNumber(
  value: unknown,
  keyword: string,
  location: string
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `Schema keyword "${keyword}" at ${location} must be finite`
    );
  }

  return value;
}

function requirePrimitive(
  value: unknown,
  keyword: string,
  location: string
): JsonPrimitive {
  if (
    value !== null &&
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    throw new Error(
      `Schema keyword "${keyword}" at ${location} supports primitive JSON values only`
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(
      `Schema keyword "${keyword}" at ${location} must be finite`
    );
  }

  return value;
}

function isSchemaType(value: unknown): value is SchemaType {
  return typeof value === 'string' && SCHEMA_TYPES.has(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

export function toPascalIdentifier(value: string, fallback = 'Schema'): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .split(/[^A-Za-z0-9_$]+/u)
    .filter(Boolean);
  let identifier = words
    .map((word) => `${word[0] ?? ''}${word.slice(1)}`)
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join('');

  if (identifier.length === 0) {
    identifier = fallback;
  }
  if (!/^[A-Za-z_$]/u.test(identifier)) {
    identifier = `${fallback}${identifier}`;
  }
  if (RESERVED_IDENTIFIERS.has(identifier.toLowerCase())) {
    identifier = `${fallback}${identifier}`;
  }

  return identifier;
}

export class SchemaRegistry {
  #documents: import('./documents.js').DocumentStore;
  #names = new Map<string, string>();
  #rawSchemas = new Map<string, RawSchemaEntry>();
  #rootPath: string;

  constructor(
    documents: import('./documents.js').DocumentStore,
    rootPath: string
  ) {
    this.#documents = documents;
    this.#rootPath = rootPath;
  }

  register(
    rawSchema: unknown,
    context: DocumentContext,
    suggestedName: string
  ): string {
    const canonicalKey = locationOf(context.documentPath, context.pointer);
    const existing = this.#rawSchemas.get(canonicalKey);

    if (existing !== undefined) {
      return existing.name;
    }

    const name = toPascalIdentifier(suggestedName);
    const nameKey = name.toLowerCase();
    const existingCanonicalKey = this.#names.get(nameKey);

    if (
      existingCanonicalKey !== undefined &&
      existingCanonicalKey !== canonicalKey
    ) {
      throw new Error(
        `Schema name collision for "${name}" at ${canonicalKey} and ${existingCanonicalKey}`
      );
    }

    this.#names.set(nameKey, canonicalKey);
    this.#rawSchemas.set(canonicalKey, {
      context,
      name,
      rawSchema,
    });
    return name;
  }

  async schemaNameFor(
    schema: unknown,
    context: DocumentContext,
    suggestedName: string
  ): Promise<string> {
    if (
      isRecord(schema) &&
      schema.$ref !== undefined &&
      Object.keys(schema).length === 1
    ) {
      const resolved = await this.#documents.resolveReference(
        schema.$ref,
        context.documentPath
      );
      return this.register(
        resolved.value,
        { documentPath: resolved.documentPath, pointer: resolved.pointer },
        this.#suggestReferenceName(resolved)
      );
    }

    return this.register(schema, context, suggestedName);
  }

  async build(): Promise<readonly SchemaEntry[]> {
    const schemas = await this.#normaliseAllSchemas();
    this.#rejectReferenceCycles(schemas);
    return schemas.sort((left, right) => left.name.localeCompare(right.name));
  }

  #suggestReferenceName(resolved: ResolvedReference): string {
    const segments = resolved.pointer.split('/').filter(Boolean);
    const pointerName = segments.at(-1) ?? 'Schema';

    if (resolved.documentPath === this.#rootPath) {
      return pointerName;
    }

    const fileName = basename(
      resolved.documentPath,
      extname(resolved.documentPath)
    );
    return `${fileName}-${pointerName}`;
  }

  async #normaliseAllSchemas(): Promise<SchemaEntry[]> {
    const normalised = new Map<string, SchemaEntry>();
    const entries = [...this.#rawSchemas.entries()];

    for (let index = 0; index < entries.length; index += 1) {
      const entryPair = entries[index];
      if (entryPair === undefined) {
        continue;
      }
      const [canonicalKey, entry] = entryPair;
      if (normalised.has(canonicalKey)) {
        continue;
      }
      normalised.set(canonicalKey, {
        canonicalKey,
        name: entry.name,
        schema: await this.#normaliseSchema(entry.rawSchema, entry.context),
      });

      for (const nextEntry of this.#rawSchemas.entries()) {
        if (!entries.some(([key]) => key === nextEntry[0])) {
          entries.push(nextEntry);
        }
      }
    }

    return [...normalised.values()];
  }

  async #normaliseSchema(
    rawSchema: unknown,
    context: DocumentContext
  ): Promise<NormalizedSchema> {
    const location = locationOf(context.documentPath, context.pointer);

    if (typeof rawSchema === 'boolean') {
      return { booleanSchema: rawSchema, location };
    }
    const schema = requireRecord(rawSchema, location, 'Schema');

    for (const keyword of Object.keys(schema)) {
      if (
        !ANNOTATION_KEYWORDS.has(keyword) &&
        !ASSERTION_KEYWORDS.has(keyword)
      ) {
        throw new Error(
          `Unsupported schema keyword "${keyword}" at ${location}`
        );
      }
    }

    let reference: string | null = null;
    if (schema.$ref !== undefined) {
      const resolved = await this.#documents.resolveReference(
        schema.$ref,
        context.documentPath
      );
      reference = this.register(
        resolved.value,
        { documentPath: resolved.documentPath, pointer: resolved.pointer },
        this.#suggestReferenceName(resolved)
      );
    }

    let types: SchemaType[] | null = null;
    if (schema.type !== undefined) {
      const rawTypes: readonly unknown[] = Array.isArray(schema.type)
        ? schema.type
        : [schema.type];
      if (rawTypes.length === 0) {
        throw new Error(`Unsupported schema type at ${location}`);
      }
      const uniqueTypes: SchemaType[] = [];
      for (const type of rawTypes) {
        if (!isSchemaType(type)) {
          throw new Error(`Unsupported schema type at ${location}`);
        }
        if (!uniqueTypes.includes(type)) {
          uniqueTypes.push(type);
        }
      }
      types = uniqueTypes;
    }

    const rawRequired = schema.required;
    if (rawRequired !== undefined && !isStringArray(rawRequired)) {
      throw new Error(
        `Schema required list at ${location} must contain strings`
      );
    }
    const required = rawRequired ?? [];

    const rawProperties = schema.properties ?? {};
    requireRecord(rawProperties, location, 'Schema properties');
    const properties: Array<{
      readonly name: string;
      readonly required: boolean;
      readonly schema: NormalizedSchema;
    }> = [];
    const propertyNames = [
      ...Object.keys(rawProperties),
      ...required.filter(
        (property) =>
          !Object.prototype.hasOwnProperty.call(rawProperties, property)
      ),
    ];
    for (const propertyName of propertyNames) {
      const propertySchema = Object.prototype.hasOwnProperty.call(
        rawProperties,
        propertyName
      )
        ? Reflect.get(rawProperties, propertyName)
        : true;
      properties.push({
        name: propertyName,
        required: required.includes(propertyName),
        schema: await this.#normaliseSchema(propertySchema, {
          documentPath: context.documentPath,
          pointer: pointerChild(
            pointerChild(context.pointer, 'properties'),
            propertyName
          ),
        }),
      });
    }

    let additionalProperties: boolean | NormalizedSchema = true;
    if (schema.additionalProperties !== undefined) {
      additionalProperties =
        typeof schema.additionalProperties === 'boolean'
          ? schema.additionalProperties
          : await this.#normaliseSchema(schema.additionalProperties, {
              documentPath: context.documentPath,
              pointer: pointerChild(context.pointer, 'additionalProperties'),
            });
    }

    const normaliseList = async (
      keyword: 'allOf' | 'anyOf' | 'oneOf'
    ): Promise<readonly NormalizedSchema[]> => {
      const rawValue = schema[keyword];
      if (rawValue === undefined) {
        return [];
      }
      if (!Array.isArray(rawValue) || rawValue.length === 0) {
        throw new Error(
          `Schema keyword "${keyword}" at ${location} must be non-empty`
        );
      }
      return Promise.all(
        rawValue.map((child, index) =>
          this.#normaliseSchema(child, {
            documentPath: context.documentPath,
            pointer: pointerChild(
              pointerChild(context.pointer, keyword),
              index
            ),
          })
        )
      );
    };

    const items =
      schema.items === undefined
        ? null
        : await this.#normaliseSchema(schema.items, {
            documentPath: context.documentPath,
            pointer: pointerChild(context.pointer, 'items'),
          });

    let enumValues: JsonPrimitive[] | null = null;
    if (schema.enum !== undefined) {
      if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
        throw new Error(`Schema enum at ${location} must be non-empty`);
      }
      enumValues = schema.enum.map((value) =>
        requirePrimitive(value, 'enum', location)
      );
    }

    const constValue =
      schema.const === undefined
        ? undefined
        : requirePrimitive(schema.const, 'const', location);

    let pattern: string | null = null;
    if (schema.pattern !== undefined) {
      if (typeof schema.pattern !== 'string') {
        throw new Error(`Schema pattern at ${location} must be a string`);
      }
      try {
        new RegExp(schema.pattern, 'u');
      } catch {
        throw new Error(
          `Schema pattern at ${location} is not valid JavaScript`
        );
      }
      pattern = schema.pattern;
    }

    let format: 'email' | null = null;
    if (schema.format !== undefined) {
      if (schema.format !== 'email') {
        throw new Error(
          `Unsupported schema format "${String(schema.format)}" at ${location}`
        );
      }
      format = 'email';
    }

    const numberKeyword = (keyword: string): number | null => {
      const value = schema[keyword];
      return value === undefined
        ? null
        : requireNumber(value, keyword, location);
    };
    const integerKeyword = (keyword: string): number | null => {
      const value = numberKeyword(keyword);
      if (value !== null && (!Number.isInteger(value) || value < 0)) {
        throw new Error(
          `Schema keyword "${keyword}" at ${location} must be >= 0`
        );
      }
      return value;
    };

    return {
      additionalProperties,
      allOf: await normaliseList('allOf'),
      anyOf: await normaliseList('anyOf'),
      booleanSchema: null,
      constValue,
      enumValues,
      exclusiveMaximum: numberKeyword('exclusiveMaximum'),
      exclusiveMinimum: numberKeyword('exclusiveMinimum'),
      format,
      items,
      location,
      maximum: numberKeyword('maximum'),
      maxLength: integerKeyword('maxLength'),
      minimum: numberKeyword('minimum'),
      minLength: integerKeyword('minLength'),
      oneOf: await normaliseList('oneOf'),
      pattern,
      properties,
      reference,
      types,
    };
  }

  #rejectReferenceCycles(schemas: readonly SchemaEntry[]): void {
    const schemaByName = new Map(
      schemas.map((entry) => [entry.name, entry.schema])
    );
    const visiting: string[] = [];
    const visited = new Set<string>();

    const collectReferences = (
      schema: NormalizedSchema,
      references: Set<string>
    ): void => {
      if (schema.booleanSchema !== null) {
        return;
      }
      if (schema.reference !== null) {
        references.add(schema.reference);
      }
      for (const property of schema.properties) {
        collectReferences(property.schema, references);
      }
      if (typeof schema.additionalProperties !== 'boolean') {
        collectReferences(schema.additionalProperties, references);
      }
      if (schema.items !== null) {
        collectReferences(schema.items, references);
      }
      for (const children of [schema.allOf, schema.anyOf, schema.oneOf]) {
        for (const child of children) {
          collectReferences(child, references);
        }
      }
    };

    const visit = (name: string): void => {
      if (visited.has(name)) {
        return;
      }
      const cycleIndex = visiting.indexOf(name);
      if (cycleIndex !== -1) {
        const cycle = [...visiting.slice(cycleIndex), name].join(' -> ');
        throw new Error(`Cyclic schema reference: ${cycle}`);
      }

      const schema = schemaByName.get(name);
      if (schema === undefined) {
        throw new Error(`Unresolved schema model reference "${name}"`);
      }
      visiting.push(name);
      const references = new Set<string>();
      collectReferences(schema, references);
      for (const reference of [...references].sort()) {
        visit(reference);
      }
      visiting.pop();
      visited.add(name);
    };

    for (const { name } of schemas) {
      visit(name);
    }
  }
}
