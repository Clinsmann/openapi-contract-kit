# Contributing

## Development

Use Node.js 26 and pnpm 12.3.4.

1. Install dependencies with `pnpm install`.
2. Run `pnpm run lint`.
3. Run `pnpm run format` after editing TypeScript or configuration files.
4. Run `pnpm run format:check`.
5. Run `pnpm run typecheck`.
6. Run `pnpm test`.
7. Run `pnpm run pack:check`.
8. Keep generated output deterministic and JSON-only.

Changes to public exports, CLI options, generated output, or validation behavior must include tests and a changelog entry.
