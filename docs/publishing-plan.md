# npm Publishing Plan

## Decisions

- Initial version: `0.0.1`. npm does not require this version; `0.x` communicates that the API is still experimental and may change before `1.0.0`.
- First publish: manual, using an npm account with 2FA. This creates the package so Trusted Publishing can be configured without storing a publish token in GitHub.
- Future publishes: GitHub Actions Trusted Publishing with OIDC.

## One-time preparation

- Replace the license placeholder with `Ibeanu Hillary (ibeanuhillary@gmail.com)`. This email is public because `LICENSE` is included in the npm package.
- Confirm `openapi-contract-kit` is available on npm and that the GitHub repository is `Clinsmann/openapi-contract-kit`.
- Commit and push the repository to its default branch.
- Run `npm install` and commit the generated `package-lock.json`; the workflows use `npm ci`.
- Run `npm test` and `npm run pack:check`.
- Inspect the tarball for secrets and application-specific generated output. The package should contain only the allowlisted `bin`, `src`, `CHANGELOG.md`, `LICENSE`, and `README.md` content.

## First publish: `0.0.1`

1. Enable 2FA on the npm account and sign in locally.
2. From the prepared commit, run `npm publish`.
3. Do not create a GitHub Release for `0.0.1`; the release workflow would try to publish the same immutable version again.
4. Verify the package is installable from a clean directory.

## Configure Trusted Publishing

In npm package settings, add a GitHub Actions Trusted Publisher with:

- User or organization: `Clinsmann`
- Repository: `openapi-contract-kit`
- Workflow filename: `publish.yml`
- Environment: none
- Allowed action: direct `npm publish`

The workflow must use a GitHub-hosted runner, `id-token: write`, Node `22.14.0` or newer, and npm `11.5.1` or newer. The current workflow uses Node 24 and disables release-build dependency caching.

## Future release procedure

1. Bump `version` in `package.json` to a new, unique SemVer version.
2. Regenerate or update `package-lock.json` and add a `CHANGELOG.md` entry.
3. Run `npm ci`, `npm test`, and `npm run pack:check`.
4. Commit and push the release changes.
5. Create and publish a GitHub Release for that version.
6. Confirm the `Publish` workflow succeeds and verify the version on npm.

Normal pushes and pull requests run CI only. A published GitHub Release triggers `.github/workflows/publish.yml`, which runs `npm ci`, tests, and `npm publish`.

## Terminology

- **npm registry:** The public package service where users install the package.
- **GitHub Actions:** GitHub's automation service running the workflow.
- **GitHub Release:** A versioned GitHub event that triggers publishing here.
- **2FA:** A second authentication factor required for secure manual publishing.
- **OIDC:** A short-lived identity credential issued by GitHub to npm.
- **Trusted Publisher:** npm's link between this package and the authorized GitHub workflow.
- **package-lock.json:** The exact dependency lockfile required by `npm ci`.
- **Provenance:** Build-origin metadata npm can attach to trusted GitHub publishes.

## Acceptance checks

- `npm ci` succeeds from a clean checkout.
- `npm test` passes.
- `npm run pack:check` contains no unintended files.
- `0.0.1` is published and installable.
- A later unique version publishes successfully from a GitHub Release through OIDC.
