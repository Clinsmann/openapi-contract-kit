# npm Publishing Plan

## Decisions

- Initial version: `0.0.1`. npm does not require this version; `0.x` communicates that the API is still experimental and may change before `1.0.0`.
- First publish: manual, using an npm account with 2FA. This creates the package so Trusted Publishing can be configured without storing a publish token in GitHub.
- Future publishes: GitHub Actions Trusted Publishing with OIDC.

## One-time preparation

- Replace the license placeholder with `Ibeanu Hillary (ibeanuhillary@gmail.com)`. This email is public because `LICENSE` is included in the npm package.
- Confirm `openapi-contract-kit` is available on npm and that the GitHub repository is `Clinsmann/openapi-contract-kit`.
- Commit and push the repository to its default branch.
- Run `pnpm install` and commit the generated `pnpm-lock.yaml`; the workflows use `pnpm install --frozen-lockfile`.
- Run `pnpm test` and `pnpm run pack:check`.
- Inspect the tarball for secrets and application-specific generated output. The package should contain only the allowlisted compiled `dist/bin`, `dist/src`, `CHANGELOG.md`, `LICENSE`, and `README.md` content.

## First publish: `0.0.1`

1. Enable 2FA on the npm account and sign in locally.
2. From the prepared commit, run `pnpm publish`.
3. Do not create a GitHub Release for `0.0.1`; the release workflow would try to publish the same immutable version again.
4. Verify the package is installable from a clean directory.

## Configure Trusted Publishing

In npm package settings, add a GitHub Actions Trusted Publisher with:

- User or organization: `Clinsmann`
- Repository: `openapi-contract-kit`
- Workflow filename: `publish.yml`
- Environment: none
- Allowed action: direct `pnpm publish --provenance`

The workflow must use a GitHub-hosted runner, `id-token: write`, Node 26, pnpm `12.3.4`, and `pnpm publish --provenance`. Release-build dependency caching remains disabled.

## Future release procedure

1. Bump `version` in `package.json` to a new, unique SemVer version.
2. Regenerate or update `pnpm-lock.yaml` and add a `CHANGELOG.md` entry.
3. Run `pnpm install --frozen-lockfile`, `pnpm test`, and `pnpm run pack:check`.
4. Commit and push the release changes.
5. Create and publish a GitHub Release for that version.
6. Confirm the `Publish` workflow succeeds and verify the version on npm.

Normal pushes and pull requests run CI only. A published GitHub Release triggers `.github/workflows/publish.yml`, which runs `pnpm install --frozen-lockfile`, tests, and `pnpm publish --provenance`.

## Terminology

- **npm registry:** The public package service where users install the package.
- **GitHub Actions:** GitHub's automation service running the workflow.
- **GitHub Release:** A versioned GitHub event that triggers publishing here.
- **2FA:** A second authentication factor required for secure manual publishing.
- **OIDC:** A short-lived identity credential issued by GitHub to npm.
- **Trusted Publisher:** npm's link between this package and the authorized GitHub workflow.
- **pnpm-lock.yaml:** The exact dependency lockfile required by `pnpm install --frozen-lockfile`.
- **Provenance:** Build-origin metadata npm can attach to trusted GitHub publishes.

## Acceptance checks

- `pnpm install --frozen-lockfile` succeeds from a clean checkout.
- `pnpm test` passes.
- `pnpm run pack:check` contains no unintended files.
- `0.0.1` is published and installable.
- A later unique version publishes successfully from a GitHub Release through OIDC.
