export function indent(lines: readonly string[], spaces = 2): string[] {
  const prefix = ' '.repeat(spaces);
  return lines.map((line) => (line.length === 0 ? line : `${prefix}${line}`));
}
