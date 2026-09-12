import type { StandardSchema } from '../types.js';
import type { ChildFunctions } from './types.js';
import { indent } from './render-utils.js';

export function renderObjectConstraints(
  lines: string[],
  schema: StandardSchema,
  children: ChildFunctions
): void {
  if (
    children.properties.length === 0 &&
    children.additionalProperties === null &&
    schema.additionalProperties !== false
  )
    return;
  lines.push(
    "if (typeof value === 'object' && value !== null && !Array.isArray(value)) {"
  );
  const checks: string[] = [];
  for (const property of children.properties) {
    const hasProperty = `Object.prototype.hasOwnProperty.call(value, ${JSON.stringify(property.name)})`;
    const propertyPath = `[...path, ${JSON.stringify(property.name)}]`;
    const validation = `${property.functionName}(Reflect.get(value, ${JSON.stringify(property.name)}), ${propertyPath}, errors);`;
    if (property.required)
      checks.push(
        `if (!${hasProperty}) {`,
        ...indent([
          `errors.push({ path: ${propertyPath}, keyword: 'required', message: 'Required property is missing' });`,
        ]),
        '} else {',
        ...indent([validation]),
        '}'
      );
    else checks.push(`if (${hasProperty}) {`, ...indent([validation]), '}');
  }
  if (
    schema.additionalProperties === false ||
    children.additionalProperties !== null
  ) {
    const propertyNames = children.properties.map(({ name }) => name);
    const isAdditional =
      propertyNames.length === 0
        ? 'true'
        : `![${propertyNames.map((name) => JSON.stringify(name)).join(', ')}].includes(key)`;
    const additional = [`if (${isAdditional}) {`];
    if (schema.additionalProperties === false)
      additional.push(
        ...indent([
          `errors.push({ path: [...path, key], keyword: 'additionalProperties', message: 'Unknown property is not allowed' });`,
        ])
      );
    else if (children.additionalProperties !== null)
      additional.push(
        ...indent([
          `${children.additionalProperties}(Reflect.get(value, key), [...path, key], errors);`,
        ])
      );
    additional.push('}');
    checks.push(
      'for (const key of Object.keys(value)) {',
      ...indent(additional),
      '}'
    );
  }
  lines.push(...indent(checks), '}');
}
