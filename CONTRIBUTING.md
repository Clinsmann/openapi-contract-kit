# Contributing

## Development

Use Node.js 26 and pnpm 12.3.4.

1. Install dependencies with `pnpm install`.
2. Run `pnpm run typecheck`.
3. Run `pnpm test`.
4. Run `pnpm run pack:check`.
5. Keep generated output deterministic and JSON-only.

Changes to public exports, CLI options, generated output, or validation behavior must include tests and a changelog entry.
