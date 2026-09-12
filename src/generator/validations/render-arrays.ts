export function renderArrayConstraints(
  lines: string[],
  itemValidator: string | null
): void {
  if (itemValidator === null) return;
  lines.push(
    'if (Array.isArray(value)) {',
    '  for (let index = 0; index < value.length; index += 1) {',
    '    const item = value[index];',
    `    ${itemValidator}(item, [...path, index], errors);`,
    '  }',
    '}'
  );
}
