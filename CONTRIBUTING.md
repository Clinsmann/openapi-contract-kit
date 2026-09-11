# Contributing

## Development

Use Node.js 26 and pnpm 12.3.4.

1. Install dependencies with `pnpm install`.
2. Run `pnpm test`.
3. Run `pnpm run pack:check`.
4. Keep generated output deterministic and JSON-only.

Changes to public exports, CLI options, generated output, or validation behavior must include tests and a changelog entry.
