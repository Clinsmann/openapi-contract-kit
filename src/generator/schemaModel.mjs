import { basename, extname } from 'node:path';

import {
  isRecord,
  locationOf,
  pointerChild,
  requireRecord,
} from './documents.mjs';

const SCHEMA_TYPES = new Set([
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

function requireNumber(value, keyword, location) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `Schema keyword "${keyword}" at ${location} must be finite`
    );
  }

  return value;
}

function validatePrimitive(value, keyword, location) {
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
}

export function toPascalIdentifier(value, fallback = 'Schema') {
  const words = value
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .split(/[^A-Za-z0-9_$]+/u)
    .filter(Boolean);
  let identifier = words
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
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
  #documents;
  #names = new Map();
  #rawSchemas = new Map();
  #rootPath;

  constructor(documents, rootPath) {
    this.#documents = documents;
    this.#rootPath = rootPath;
  }

  register(rawSchema, context, suggestedName) {
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

  async schemaNameFor(schema, context, suggestedName) {
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

  async build() {
    const schemas = await this.#normaliseAllSchemas();
    this.#rejectReferenceCycles(schemas);
    return schemas.sort((left, right) => left.name.localeCompare(right.name));
  }

  #suggestReferenceName(resolved) {
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

  async #normaliseAllSchemas() {
    const normalised = new Map();
    const entries = [...this.#rawSchemas.entries()];

    for (let index = 0; index < entries.length; index += 1) {
      const [canonicalKey, entry] = entries[index];
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

  async #normaliseSchema(rawSchema, context) {
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

    let reference = null;
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

    let types = null;
    if (schema.type !== undefined) {
      const rawTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (
        rawTypes.length === 0 ||
        rawTypes.some((type) => !SCHEMA_TYPES.has(type))
      ) {
        throw new Error(`Unsupported schema type at ${location}`);
      }
      types = [...new Set(rawTypes)];
    }

    const required = schema.required ?? [];
    if (
      !Array.isArray(required) ||
      required.some((property) => typeof property !== 'string')
    ) {
      throw new Error(
        `Schema required list at ${location} must contain strings`
      );
    }

    const rawProperties = schema.properties ?? {};
    requireRecord(rawProperties, location, 'Schema properties');
    const propertyNames = [
      ...Object.keys(rawProperties),
      ...required.filter(
        (property) =>
          !Object.prototype.hasOwnProperty.call(rawProperties, property)
      ),
    ];
    const properties = [];
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

    let additionalProperties = true;
    if (schema.additionalProperties !== undefined) {
      additionalProperties =
        typeof schema.additionalProperties === 'boolean'
          ? schema.additionalProperties
          : await this.#normaliseSchema(schema.additionalProperties, {
              documentPath: context.documentPath,
              pointer: pointerChild(context.pointer, 'additionalProperties'),
            });
    }

    const normaliseList = async (keyword) => {
      if (schema[keyword] === undefined) {
        return [];
      }
      if (!Array.isArray(schema[keyword]) || schema[keyword].length === 0) {
        throw new Error(
          `Schema keyword "${keyword}" at ${location} must be non-empty`
        );
      }
      return Promise.all(
        schema[keyword].map((child, index) =>
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

    let items = null;
    if (schema.items !== undefined) {
      items = await this.#normaliseSchema(schema.items, {
        documentPath: context.documentPath,
        pointer: pointerChild(context.pointer, 'items'),
      });
    }

    let enumValues = null;
    if (schema.enum !== undefined) {
      if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
        throw new Error(`Schema enum at ${location} must be non-empty`);
      }
      for (const value of schema.enum) {
        validatePrimitive(value, 'enum', location);
      }
      enumValues = schema.enum;
    }
    if (schema.const !== undefined) {
      validatePrimitive(schema.const, 'const', location);
    }

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
    }
    if (schema.format !== undefined && schema.format !== 'email') {
      throw new Error(
        `Unsupported schema format "${schema.format}" at ${location}`
      );
    }

    const numberKeyword = (keyword) =>
      schema[keyword] === undefined
        ? null
        : requireNumber(schema[keyword], keyword, location);
    const integerKeyword = (keyword) => {
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
      constValue: schema.const,
      enumValues,
      exclusiveMaximum: numberKeyword('exclusiveMaximum'),
      exclusiveMinimum: numberKeyword('exclusiveMinimum'),
      format: schema.format ?? null,
      items,
      location,
      maximum: numberKeyword('maximum'),
      maxLength: integerKeyword('maxLength'),
      minimum: numberKeyword('minimum'),
      minLength: integerKeyword('minLength'),
      oneOf: await normaliseList('oneOf'),
      pattern: schema.pattern ?? null,
      properties,
      reference,
      types,
    };
  }

  #rejectReferenceCycles(schemas) {
    const schemaByName = new Map(
      schemas.map((entry) => [entry.name, entry.schema])
    );
    const visiting = [];
    const visited = new Set();

    const collectReferences = (schema, references) => {
      if (schema.reference !== null && schema.reference !== undefined) {
        references.add(schema.reference);
      }
      for (const property of schema.properties ?? []) {
        collectReferences(property.schema, references);
      }
      if (
        schema.additionalProperties !== true &&
        schema.additionalProperties !== false &&
        schema.additionalProperties !== undefined
      ) {
        collectReferences(schema.additionalProperties, references);
      }
      if (schema.items !== null && schema.items !== undefined) {
        collectReferences(schema.items, references);
      }
      for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
        for (const child of schema[keyword] ?? []) {
          collectReferences(child, references);
        }
      }
    };

    const visit = (name) => {
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
      const references = new Set();
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

