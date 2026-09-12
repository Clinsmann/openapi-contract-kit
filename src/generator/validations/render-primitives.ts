import type { JsonPrimitive, SchemaType } from '../types.js';
import { indent } from './render-utils.js';

export function typeExpression(type: SchemaType, value = 'value'): string {
  switch (type) {
    case 'array':
      return `Array.isArray(${value})`;
    case 'boolean':
      return `typeof ${value} === 'boolean'`;
    case 'integer':
      return `typeof ${value} === 'number' && Number.isFinite(${value}) && Number.isInteger(${value})`;
    case 'null':
      return `${value} === null`;
    case 'number':
      return `typeof ${value} === 'number' && Number.isFinite(${value})`;
    case 'object':
      return `typeof ${value} === 'object' && ${value} !== null && !Array.isArray(${value})`;
    case 'string':
      return `typeof ${value} === 'string'`;
    default: {
      const exhaustive: never = type;
      throw new Error(`Unsupported normalised schema type "${exhaustive}"`);
    }
  }
}

export function renderPrimitiveConstraints(
  lines: string[],
  constValue: JsonPrimitive | undefined,
  enumValues: readonly JsonPrimitive[] | null
): void {
  if (constValue !== undefined) {
    lines.push(
      `if (!Object.is(value, ${JSON.stringify(constValue)})) {`,
      ...indent([
        `errors.push({ path, keyword: 'const', message: 'Expected the documented constant value' });`,
      ]),
      '}'
    );
  }
  if (enumValues !== null) {
    const values = enumValues.map((value) => JSON.stringify(value)).join(', ');
    lines.push(
      `if (![${values}].some((candidate) => Object.is(candidate, value))) {`,
      ...indent([
        `errors.push({ path, keyword: 'enum', message: 'Expected a documented enum value' });`,
      ]),
      '}'
    );
  }
}
