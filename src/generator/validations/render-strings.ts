import type { StandardSchema } from '../types.js';
import { indent } from './render-utils.js';

const EMAIL_FORMAT_PATTERN =
  "^[A-Za-z0-9!#$%&'*+\\/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+\\/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\\.[A-Za-z]{2,63}$";

export function renderStringConstraints(
  lines: string[],
  schema: StandardSchema
): void {
  if (
    schema.format === null &&
    schema.maxLength === null &&
    schema.minLength === null &&
    schema.pattern === null
  )
    return;
  lines.push("if (typeof value === 'string') {");
  const checks: string[] = [];
  if (schema.minLength !== null)
    checks.push(
      `if (Array.from(value).length < ${schema.minLength}) {`,
      ...indent([
        `errors.push({ path, keyword: 'minLength', message: 'String is shorter than ${schema.minLength} characters' });`,
      ]),
      '}'
    );
  if (schema.maxLength !== null)
    checks.push(
      `if (Array.from(value).length > ${schema.maxLength}) {`,
      ...indent([
        `errors.push({ path, keyword: 'maxLength', message: 'String is longer than ${schema.maxLength} characters' });`,
      ]),
      '}'
    );
  if (schema.pattern !== null)
    checks.push(
      `if (!new RegExp(${JSON.stringify(schema.pattern)}, 'u').test(value)) {`,
      ...indent([
        `errors.push({ path, keyword: 'pattern', message: 'String does not match the documented pattern' });`,
      ]),
      '}'
    );
  if (schema.format === 'email') {
    checks.push(
      `if (!new RegExp(${JSON.stringify(EMAIL_FORMAT_PATTERN)}).test(value)) {`,
      ...indent([
        `errors.push({ path, keyword: 'format', message: 'Expected email format' });`,
      ]),
      '}'
    );
  }
  lines.push(...indent(checks), '}');
}
