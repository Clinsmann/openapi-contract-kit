export function renderAllOf(
  lines: string[],
  children: readonly string[]
): void {
  for (const child of children) lines.push(`${child}(value, path, errors);`);
}

export function renderUnionConstraint(
  lines: string[],
  keyword: 'anyOf' | 'oneOf',
  branches: readonly string[],
  isExclusive: boolean
): void {
  if (branches.length === 0) return;
  const variable = `${keyword}Matches`;
  lines.push(`let ${variable} = 0;`);
  for (const [index, branch] of branches.entries()) {
    const errorsName = `${keyword}Errors${index}`;
    lines.push(
      `const ${errorsName}: ValidationIssue[] = [];`,
      `if (${branch}(value, path, ${errorsName})) {`,
      `  ${variable} += 1;`,
      '}'
    );
  }
  const invalidExpression = isExclusive
    ? `${variable} !== 1`
    : `${variable} === 0`;
  const expectation = isExclusive ? 'exactly one' : 'at least one';
  lines.push(
    `if (${invalidExpression}) {`,
    `  errors.push({ path, keyword: '${keyword}', message: 'Expected ${expectation} matching branch' });`,
    '}'
  );
}
