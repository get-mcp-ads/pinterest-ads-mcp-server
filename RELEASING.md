# Publishing releases

A version tag publishes a release. The workflow [`release.yml`](.github/workflows/release.yml) publishes npm first, then the GitHub release, then the MCP Registry entry, because the registry reads `mcpName` from the published npm package.

## Before the tag

1. Set the same version in `package.json`, `server.json` (both `version` fields) and `PACKAGE_VERSION` in `src/server.ts`. The test suite fails when they differ.
2. Add a `## X.Y.Z - YYYY-MM-DD` section to `CHANGELOG.md`. The workflow uses that section as the GitHub release notes and stops when it is missing.
3. Run `npm run build` and `npm run catalog`, then commit the regenerated `server-card.json`.
4. Open a pull request and merge it once CI passes.

## Tag and publish

```bash
git switch main
git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tag starts `release.yml`. It installs with `npm ci`, audits runtime dependencies, typechecks, builds, runs the tests and checks that the tag matches `package.json`. It then:

1. Publishes the package to npm with provenance, through npm trusted publishing. No npm token is stored in the repository. The package needs a trusted publisher on npmjs.com for this repository and the workflow file `release.yml`.
2. Creates the GitHub release for the tag, marked as Latest, with the matching changelog section as notes.
3. Publishes `server.json` to the MCP Registry, authenticated with the `getmcpads.com` DNS key stored in the `MCP_DNS_PRIVATE_KEY` secret.

Each step skips when its target already holds this version. After a partial failure, fix the cause and run the workflow again from the Actions tab with the same tag.

## After the release

Check that `npm view @getmcpads/pinterest-ads-mcp-server version` returns the new version, that the GitHub release is marked as Latest and that the registry lists the version for `com.getmcpads/pinterest-ads`.

Before tagging, add the release to CHANGELOG.md as `## X.Y.Z - YYYY-MM-DD - Title`, then run `npm run release-history`. The README shows every release from the changelog, and the test suite fails when it falls behind.
