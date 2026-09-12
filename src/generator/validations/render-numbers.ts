import type { StandardSchema } from '../types.js';
import { indent } from './render-utils.js';

export function renderNumberConstraints(
  lines: string[],
  schema: StandardSchema
): void {
  if (
    schema.exclusiveMaximum === null &&
    schema.exclusiveMinimum === null &&
    schema.maximum === null &&
    schema.minimum === null
  )
    return;
  lines.push("if (typeof value === 'number' && Number.isFinite(value)) {");
  const checks: string[] = [];
  const addCheck = (
    expression: string,
    keyword: string,
    message: string
  ): void => {
    checks.push(
      `if (${expression}) {`,
      ...indent([
        `errors.push({ path, keyword: '${keyword}', message: ${JSON.stringify(message)} });`,
      ]),
      '}'
    );
  };
  if (schema.minimum !== null)
    addCheck(
      `value < ${schema.minimum}`,
      'minimum',
      `Number must be at least ${schema.minimum}`
    );
  if (schema.maximum !== null)
    addCheck(
      `value > ${schema.maximum}`,
      'maximum',
      `Number must be at most ${schema.maximum}`
    );
  if (schema.exclusiveMinimum !== null)
    addCheck(
      `value <= ${schema.exclusiveMinimum}`,
      'exclusiveMinimum',
      `Number must be greater than ${schema.exclusiveMinimum}`
    );
  if (schema.exclusiveMaximum !== null)
    addCheck(
      `value >= ${schema.exclusiveMaximum}`,
      'exclusiveMaximum',
      `Number must be less than ${schema.exclusiveMaximum}`
    );
  lines.push(...indent(checks), '}');
}
