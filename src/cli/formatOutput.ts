import { styleText } from 'node:util';

import type { GenerateOpenApiRuntimeResult } from '../generator/types.js';

export type CliOutputStream = {
  readonly isTTY?: boolean;
};

function canUseColor(stream: CliOutputStream): boolean {
  return (
    stream.isTTY === true &&
    process.env.NO_COLOR === undefined &&
    process.env.TERM !== 'dumb'
  );
}

function styleCliText(
  format: Parameters<typeof styleText>[0],
  text: string,
  stream: CliOutputStream
): string {
  return canUseColor(stream)
    ? styleText(format, text, { validateStream: false })
    : text;
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export function formatSuccessOutput(
  result: GenerateOpenApiRuntimeResult,
  stream: CliOutputStream
): string {
  if (stream.isTTY !== true) {
    return `Generated ${result.schemaCount} schemas and ${result.operationCount} endpoints.\n`;
  }

  const marker = styleCliText('green', '✔', stream);
  const heading = styleCliText('bold', 'OpenAPI generation complete', stream);
  const schemas = styleCliText(
    'dim',
    `Schemas:   ${formatCount(result.schemaCount, 'schema')}`,
    stream
  );
  const endpoints = styleCliText(
    'dim',
    `Endpoints: ${formatCount(result.operationCount, 'endpoint')}`,
    stream
  );

  return `${marker} ${heading}\n\n  ${schemas}\n  ${endpoints}\n`;
}

export function formatFailureOutput(
  message: string,
  stream: CliOutputStream
): string {
  if (stream.isTTY !== true) {
    return `OpenAPI generation failed: ${message}\n`;
  }

  const marker = styleCliText('red', '✖', stream);
  const heading = styleCliText('bold', 'OpenAPI generation failed', stream);
  return `${marker} ${heading}\n\n  ${message}\n`;
}
