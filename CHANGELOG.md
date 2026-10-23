# Changelog

## 2.1.0 - 2026-10-23 - Rename tools and native video uploads
- Add `pinterest_rename_campaign`, `pinterest_rename_adgroup` and `pinterest_rename_ad`. Each previews, then changes the name only.
- Add the native video upload flow: `pinterest_prepare_video_upload`, `pinterest_upload_video` and `pinterest_get_video_upload`. The video comes from a local file or an HTTPS URL that passes the report URL checks, and goes to the upload destination Pinterest returns, without the access token.
- Add the optional account allowlist `PINTEREST_AD_ACCOUNT_IDS`. When it is set, requests that name another ad account are refused before they are sent, and account discovery only returns listed accounts. When it is unset, the server writes a notice to stderr at startup, and `PINTEREST_AD_ACCOUNT_ID` remains a default account as in 2.0.
- Deprecate `1`, `yes` and `on` for `PINTEREST_ENABLE_WRITES`. They still enable writes, with a notice on stderr. Unrecognized values now stop the server at startup instead of silently disabling writes.
- Refuse incomplete sync analytics responses and read targeting analytics from `MetricsResponse.data`.
- Rename the attribution default in `pinterest://attribution` to `defaultAttribution`. The former `defaults` key remains as an alias.
- Add timeouts and response size limits to every Pinterest request, and redact the access token from provider error text.
- Update `@modelcontextprotocol/sdk` to 1.32.1 and regenerate the lockfile. `npm audit --omit=dev` reports no vulnerabilities.
- Require Node.js 22.23.4, 24.22.1, 26.12.1 or a newer release. The server writes a warning to stderr on an older runtime, and `npm run doctor` reports it.
- Publish releases from version tags with `release.yml`, which replaces `publish-mcp.yml`. CI covers Node 22, 24 and 26 and audits runtime dependencies. Dependabot proposes updates weekly.
- Expose 29 read tools and 30 write tools.
- No breaking change. Version 3.0.0 will require `PINTEREST_AD_ACCOUNT_IDS` and will accept only `true` to enable writes.

## 2.0.1 - 2026-09-23 - Public repository restored

- Restore public source hosting under the get-mcp-ads GitHub organization.
- Update repository and support links while preserving npm package and MCP registry names.
- No changes to platform tools or credential requirements.

## 2.0.0 - 2026-09-20 - Gateway sync and security fixes
- Update native campaign/ad-group validation, budget ownership and exact readback checks.
- Add the native collection-ad tool and preserve private report URL and redirect guards.
- Exclude hosted frozen-file video upload workflows.
- Require Node.js 22.12 or newer and check Node 22/24 in CI.
- Update vulnerable dependencies and regenerate the MCP catalog.
- No hosted creative UI or MCP Apps integrations.


## 1.1.0 - 2026-09-13 - Platform capability sync and quality contracts
- Synchronize applicable platform features with GetMCPAds commit b1471be while retaining local read-only exploration tools and credential configuration.
- Expose 28 read tools and 24 explicitly enabled write tools.
- Add MCP annotations, parameter descriptions, structured results, server identity and an offline-generated discovery card.
- Preserve preview/confirmation boundaries; test provider request construction and errors with mocked APIs.
- Refuse credential-bearing redirects and document provider-specific limitations.

No live advertiser mutation is performed by the release tests.

## 1.0.2 - 2026-08-30

- Announce the package version over MCP. Version 1.0.1 still reported 1.0.0 in the handshake.

## 1.0.1 - 2026-08-30

- Add `server.json` and `mcpName` for the official MCP Registry, under `com.getmcpads/pinterest-ads`.
- Skip registry publication when a version is already listed.

## 1.0.0 - 2026-08-29 - First open-source release

- Publish the server as open source under the Apache-2.0 license.
