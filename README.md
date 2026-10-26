<div align="center">

# Pinterest Ads MCP server

### Connect the dots in your Pinterest campaigns.

Explore reporting, audiences, catalogs and native campaign operations from your MCP client.

[![Release](https://img.shields.io/github/v/release/get-mcp-ads/pinterest-ads-mcp-server?color=2448e5)](https://github.com/get-mcp-ads/pinterest-ads-mcp-server/releases/latest)
[![CI](https://github.com/get-mcp-ads/pinterest-ads-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/get-mcp-ads/pinterest-ads-mcp-server/actions/workflows/ci.yml)
[![Smithery](https://smithery.ai/badge/getmcpads/getmcpads-pinterest-ads)](https://smithery.ai/servers/getmcpads/getmcpads-pinterest-ads)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22.23.4%20%7C%2024.22.1%20%7C%2026.12.1-brightgreen.svg)](package.json)

[Watch the film](https://www.getmcpads.com/home/film/get-mcp-ads-brand-film-1080p.mp4) · [What's new](#whats-new) · [Install](#install-this-release) · [Tool reference](#tools) · [Try hosted getmcpads](https://www.getmcpads.com/tools/pinterest-ads?utm_source=github&utm_medium=readme&utm_campaign=pinterest-ads)

[![Watch the getmcpads film: every ad account in one conversation with your AI assistant](https://www.getmcpads.com/home/film/brand-film-poster-promise.webp)](https://www.getmcpads.com/home/film/get-mcp-ads-brand-film-1080p.mp4)

**[Play the 45-second film](https://www.getmcpads.com/home/film/get-mcp-ads-brand-film-1080p.mp4)**

</div>

The film shows hosted getmcpads with sample data. Its MCP Apps, from creative galleries and alerts to Google Sheets exports and bulk launches, belong to the hosted product. This repository provides the standalone native API tools.

**29 read tools** · **30 write tools**, disabled by default.

Run locally with your own platform credentials and a client that supports stdio MCP, such as Claude Desktop, Claude Code or Cursor. Your requests go directly to the platform. For managed connections, including supported ChatGPT setups, use the hosted option.

## What's new

<!-- release-history:start -->
**[v2.1.1: Zod 4 security update](https://github.com/get-mcp-ads/pinterest-ads-mcp-server/releases/tag/v2.1.1) · October 26, 2026**

- Update `zod` to 4.6.7. Every Zod release before 4.6.6 is covered by the high-severity advisory GHSA-mrhx-c7xc-m3w5: validating an oversized constrained collection can exhaust memory, and no Zod 3 release carries the fix. `npm audit --omit=dev` reports no vulnerability again.
- Keep the Zod 3 validation behaviour. A parameter default is still validated and completed before use, so an omitted object must still supply its required fields.
- Keep each parameter's own description when the parameter is optional or has a default. Zod 4 stores a description on the wrapped schema only, so the shared fallback description could otherwise replace it.
- Tool names, parameters and descriptions published over MCP are unchanged. `server-card.json` is regenerated with Zod 4's JSON Schema output, which spells some constraints differently.

**Earlier releases**

| Version | Date | Highlights |
| --- | --- | --- |
| 2.1.0 | October 23, 2026 | Rename tools and native video uploads |
| 2.0.1 | September 23, 2026 | Public repository restored |
| 2.0.0 | September 20, 2026 | Gateway sync and security fixes |
| 1.1.0 | September 13, 2026 | Platform capability sync and quality contracts |
| 1.0.2 | August 30, 2026 | Announce the package version over MCP. |
| 1.0.1 | August 30, 2026 | Add `server.json` and `mcpName` for the official MCP Registry, under `com.getmcpads/pinterest-ads`. |
| 1.0.0 | August 29, 2026 | First open-source release |

[Full changelog](CHANGELOG.md) · [All releases](https://github.com/get-mcp-ads/pinterest-ads-mcp-server/releases)
<!-- release-history:end -->

Source synchronization: [SOURCE_SYNC.md](SOURCE_SYNC.md).

### Upgrade notes

Requires **Node.js 22.23.4, 24.22.1 or 26.12.1**, or a newer release of those lines. On an older runtime the server starts and writes a warning to stderr. CI covers Node 22, 24 and 26.

This release has no breaking change, and existing configurations keep working. Two changes are planned for 3.0.0, and the server announces each one on stderr at startup when it applies to your configuration:

- `PINTEREST_AD_ACCOUNT_IDS` will be required. Set it now to restrict the server to the listed ad accounts. Until then, `PINTEREST_AD_ACCOUNT_ID` remains a default account, not a restriction.
- `PINTEREST_ENABLE_WRITES` will accept only `true` to enable writes. Replace `1`, `yes` or `on` with `true`.

The `pinterest://attribution` resource now names its default `defaultAttribution`. The former `defaults` key remains as an alias until 3.0.0.

Read the current tool schemas before reusing saved arguments. Writes remain optional and require explicit confirmation. Hosted creative integrations and MCP Apps UI are outside this release.

## Install this release

This is a GitHub source release. npm and MCP Registry versions are published separately. The commands below select this exact version; unpinned `npx` examples later in this document select the version currently available on npm.

```bash
git clone --branch v2.1.1 --depth 1 https://github.com/get-mcp-ads/pinterest-ads-mcp-server.git
cd pinterest-ads-mcp-server
npm ci
npm run build
```

Configure your MCP client to run `node` with the absolute path to `dist/cli.js` and the platform credentials documented below.

> **Prefer a managed connection?** [Use Pinterest Ads with hosted getmcpads](https://www.getmcpads.com/tools/pinterest-ads?utm_source=github&utm_medium=readme&utm_campaign=pinterest-ads). Connect your account, select the data your assistant may access and use the hosted MCP connection. See the site for current features and plans.

## What you get

| | |
|---|---|
| **29 read tools** | Reporting, campaigns and ad groups, audiences, targeting, keywords, conversions, catalogs, business assets, billing, Pins, trends and video processing status |
| **30 write tools** | Off by default. Create paused campaigns, ad groups and ads, and change their status, budgets, settings and names. Upload videos and manage boards, Pins and catalogs. Each one **previews before it applies** |
| **7 resources** | Live catalogues the model can read: reporting columns, attribution windows, creative assets, catalog reporting, surface map, recipes |
| **Organic alongside paid** | Pin analytics and trends, not just the ad account |
| **Privacy by construction** | Lead records are not exposed at all, and member identifiers are redacted by default |

### Raw column names, on purpose

Pinterest names its reporting columns in its own way, and this server accepts those names
directly rather than inventing friendly aliases on top. A column that exists in the API works
here; one that does not fails immediately rather than being silently translated into
something else.

`pinterest://reporting-columns` lists what is available, and `pinterest_validate_report`
checks a request before it runs.

---

## Privacy, built into what the tools return

Two protections, and they work differently.

**Lead records are never exposed.** `pinterest_get_lead_assets` returns lead form and
subscription configuration, but never the lead export itself, because those rows carry
personal information submitted by end users. This is an exclusion, not a redaction: the data
does not leave Pinterest through this server at all.

**Business member identifiers are redacted by default.** Member IDs, email addresses and
usernames are replaced before they reach the model when you read members, asset members or
invites. `includePersonalIdentifiers: true` returns the raw values and defaults to `false`.
These are your colleagues' addresses, so the default is the safe one.

---

## Getting a token

You need a Pinterest access token with the **`ads:read`** scope.

1. Create an app in the [Pinterest developer portal](https://developers.pinterest.com/).
2. Note the **App ID** and **App secret**.
3. Run the OAuth flow while signed in to the account that can access your ad accounts.
   Request `ads:read`, and `ads:write` only if you plan to enable writes.
4. Keep the **access token**, and the **refresh token** if you want the server to renew it.

📖 [Pinterest API authentication](https://developers.pinterest.com/docs/getting-started/authentication/)

You can run with just `PINTEREST_ACCESS_TOKEN`, but it expires. Supplying
`PINTEREST_REFRESH_TOKEN`, `PINTEREST_APP_ID` and `PINTEREST_APP_SECRET` together lets the
server renew the token itself, which is what you want for daily use.

Run **`pinterest_health_check`** as your first call. It verifies the token and lists the ad
accounts you can reach, without printing the token.

---

## Setup

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "pinterest-ads": {
      "command": "npx",
      "args": ["-y", "@getmcpads/pinterest-ads-mcp-server"],
      "env": {
        "PINTEREST_ACCESS_TOKEN": "your-token-here",
        "PINTEREST_AD_ACCOUNT_IDS": "your-ad-account-id"
      }
    }
  }
}
```

`PINTEREST_AD_ACCOUNT_IDS` is optional and recommended. It restricts the server to the listed ad accounts, and version 3.0.0 will require it.

Restart Claude Desktop. Ask it: *"list my Pinterest ad accounts"*.

### Claude Code

```bash
claude mcp add pinterest-ads --env PINTEREST_ACCESS_TOKEN=your-token --env PINTEREST_AD_ACCOUNT_IDS=your-ad-account-id -- npx -y @getmcpads/pinterest-ads-mcp-server
```

### Cursor

`.cursor/mcp.json` in your project, same shape as the Claude Desktop config above.

### From source

```bash
git clone https://github.com/get-mcp-ads/pinterest-ads-mcp-server.git
cd pinterest-ads-mcp-server
npm install && npm run build
cp .env.example .env   # then fill in your credentials
npm start
```

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PINTEREST_ACCESS_TOKEN` | none | Access token with `ads:read` |
| `PINTEREST_REFRESH_TOKEN` | none | With the two below, lets the server renew the token |
| `PINTEREST_APP_ID` | none | App ID, needed for refresh |
| `PINTEREST_APP_SECRET` | none | App secret, needed for refresh |
| `PINTEREST_AD_ACCOUNT_IDS` | none | Recommended. Comma-separated ad account IDs the server may use. When set, requests that name another account are refused. Version 3.0.0 will require it |
| `PINTEREST_AD_ACCOUNT_ID` | none | Optional default, saves passing it on every call. When `PINTEREST_AD_ACCOUNT_IDS` is set, it must be one of those accounts |
| `PINTEREST_ENABLE_WRITES` | *unset* | Set to `true` to register the 30 write tools. `1`, `yes` and `on` also work and are deprecated. An unrecognized value stops the server |
| `PINTEREST_ENVIRONMENT` | `production` | `production` or `sandbox`, with credentials issued for that environment |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

Either the access token, or the refresh trio. The server refuses to start with neither.
Without `PINTEREST_AD_ACCOUNT_IDS`, every ad account the token can access is reachable, and the server says so on stderr at startup.

```bash
npm run doctor
```

---

## Writes, and why they preview first

Write tools are **disabled by default**. Enable them with `PINTEREST_ENABLE_WRITES=true`, and
grant `ads:write` on top of `ads:read`.

When enabled, every write tool returns a preview and changes nothing:

```jsonc
// pinterest_update_adgroup_budget { adAccountId: "549…", adGroupId: "268…", dailyBudget: 50 }
{
  "applied": false,
  "action": "pinterest_update_adgroup_budget",
  "change": { "adAccount": "549…", "adGroup": "268…",
              "field": "budget_in_micro_currency", "amount": 50,
              "inMicroCurrency": 50000000 },
  "message": "Preview only, nothing was changed. Repeat the same call with confirm: true to apply this change to the live account."
}
```

Only a second call carrying `confirm: true` touches the live account.

This is deliberate. An assistant composes these calls, and it can pick the wrong ad account,
the wrong campaign, or the wrong order of magnitude on a budget. A mandatory preview makes
the mistake visible before it costs money, and gives a human the stopping point the protocol
does not guarantee on its own.

Two further guardrails:

- **`pinterest_create_campaign` always creates the campaign `PAUSED`.** There is no option to
  create it active.
- **Amounts are converted to micro units for you.** Pinterest holds money in millionths, so
  12.50 in the account currency is `12500000`. The preview shows both, so a
  factor-of-a-million mistake is visible before it applies. A daily and a lifetime budget
  sent together are refused rather than silently resolved.

| Tool | What it changes |
|---|---|
| `pinterest_update_campaign_status` / `pinterest_update_adgroup_status` | Pause, reactivate or archive |
| `pinterest_update_campaign_budget` / `pinterest_update_adgroup_budget` | Daily or lifetime budget |
| `pinterest_create_campaign` | Creates a campaign, always `PAUSED` |
| `pinterest_rename_campaign` / `pinterest_rename_adgroup` / `pinterest_rename_ad` | The name, and nothing else |
| `pinterest_prepare_video_upload` / `pinterest_upload_video` | Registers a video, then sends it to the upload destination Pinterest returns |

---

## Tools

Every tool is listed below. See [server-card.json](server-card.json) for complete parameter and output schemas.

<details>
<summary><b>29 read tools</b></summary>

| Tool | Purpose |
| --- | --- |
| `pinterest_health_check` | Read-only Pinterest Ads health check. |
| `pinterest_list_ad_accounts` | List Pinterest ad accounts accessible to the configured credentials. |
| `pinterest_get_delivery_metrics` | Read Pinterest resources/delivery_metrics. |
| `pinterest_validate_report` | Validate and preview how a Pinterest report will execute. |
| `pinterest_run_report` | Run a read-only Pinterest Ads report. |
| `pinterest_get_creative_assets` | Fetch Pinterest creative assets and period performance when available. |
| `pinterest_run_catalog_report` | Run Pinterest catalog reporting by PRODUCT_GROUP or PRODUCT_ITEM. |
| `pinterest_get_catalog_inventory` | List Pinterest catalog inventory surfaces: catalogs, product groups, product group promotions, and optional product samples. |
| `pinterest_run_conversion_product_report` | Run Pinterest async conversion product reporting by brand, category, brand+category, SKU, or SKU group via reports/brand_category_sku. |
| `pinterest_list_ad_creatives` | List the ad account's ad creatives across every status (the API silently omits ARCHIVED ads unless asked) with their pin media resolved: public i.pinimg.com image URLs up to 1200px, video cover, and video_url when the app is allowed to read it. |
| `pinterest_get_write_schema` | Read the official Pinterest v5 native request schema and Sandbox limitations before composing a write. |
| `pinterest_get_account_entities` | Read Pinterest ad-account entities and configuration. |
| `pinterest_run_targeting_report` | Run live targeting analytics for an ad account, campaigns, ad groups, or ads, broken down by age, gender, location, interest, keyword, audience, placement, device, or other Pinterest targeting types. |
| `pinterest_get_targeting_options` | Read Pinterest's official targeting option catalog for app type, gender, locale, age, location/geo, interest, keyword, or audience. |
| `pinterest_get_keyword_intelligence` | Read assigned targeting keywords, Pinterest country-level keyword metrics, suggested terms, or related terms. |
| `pinterest_get_audiences` | Read audience, customer-list, sharing, and Business-received audience inventory without uploading or changing audience membership. |
| `pinterest_get_audience_insights` | Read aggregated Pinterest Audience Insights for the advertiser's total or engaged audience, Pinterest's total audience, or the scope/type endpoint. |
| `pinterest_estimate_delivery` | Run non-mutating Pinterest planning computations: ad-group audience size, bid floors, or campaign delivery estimates. |
| `pinterest_get_conversion_setup` | Inspect Pinterest conversion measurement configuration: conversion tags, oCPM-eligible/page-visit tags, Event Quality Score, advertiser-defined events, and conversion-deletion request status. |
| `pinterest_get_catalog_diagnostics` | Read deep catalog inventory and diagnostics: catalogs, feeds, feed processing results, item issues, product groups, product counts/products, available filter values, and catalog item lookups. |
| `pinterest_run_specialized_export` | Start or inspect non-mutating Pinterest data jobs for Marketing Mix Modeling (MMM), bulk advertiser entity downloads, or catalog diagnostics. |
| `pinterest_get_lead_assets` | Read lead-form definitions and lead subscription configuration. |
| `pinterest_get_business_assets` | Read Pinterest Business Access inventory: employers/linked businesses, assets, members, partners, assigned assets, received audiences, and invites. |
| `pinterest_get_billing_and_orders` | Read billing profiles/invoices, invoice download URLs, order lines, ads-credit discounts, and SSIO account/order status. |
| `pinterest_get_pin_analytics` | Read paid Pin analytics, organic multi/single-Pin analytics, user-account analytics, top Pins, or top video Pins. |
| `pinterest_get_organic_inventory` | Read organic Pinterest content used alongside ads: Pins, boards, Pins on a board, Pin product tags, or search results. |
| `pinterest_get_trends` | Read Pinterest Trends: top growing/monthly/yearly/seasonal keywords by supported region, growing product categories, product-category details, featured topics, or editorial articles. |
| `pinterest_get_platform_resources` | Read Pinterest platform metadata and readiness resources: supported ad-account countries, delivery metric definitions, metrics readiness, lead-form questions, media upload metadata, commerce integration metadata, or the authenticated user account. |
| `pinterest_get_video_upload` | Read processing status for this advertiser-bound uploaded video. Only ready:true permits video Pin creation. |

</details>

<details>
<summary><b>30 write tools</b></summary>

Disabled by default. Calls preview unless explicitly confirmed. Check the configuration and exact schema before use.

| Tool | Purpose |
| --- | --- |
| `pinterest_create_campaign` | Create a PAUSED campaign. |
| `pinterest_update_campaign_status` | Update the status of an existing campaign. |
| `pinterest_update_adgroup_status` | Update the status of an existing adgroup. |
| `pinterest_update_ad_status` | Update the status of an existing ad. |
| `pinterest_update_campaign_budget` | Set exactly one daily or lifetime campaign budget in major account currency units. |
| `pinterest_update_adgroup_budget` | Set exactly one daily or lifetime ad group budget in major account currency units. |
| `pinterest_update_campaign_configuration` | Update native campaign settings. |
| `pinterest_update_adgroup_configuration` | Update native ad group settings. |
| `pinterest_update_ad` | Update native ad settings. |
| `pinterest_rename_campaign` | Rename one campaign. The name is the only thing that changes. |
| `pinterest_rename_adgroup` | Rename one ad group. The name is the only thing that changes. |
| `pinterest_rename_ad` | Rename one ad. The name is the only thing that changes. |
| `pinterest_create_adgroup` | Create a PAUSED ad group with explicit native bidding, targeting, budget and schedule. |
| `pinterest_create_ad` | Create a PAUSED ad from an accessible Pin. |
| `pinterest_create_product_group_promotion` | Create a PAUSED shopping or collections promotion from a catalog product group. |
| `pinterest_update_product_group_promotion` | Update a catalog product group promotion. |
| `pinterest_create_collection_ad` | Create a PAUSED collection with an explicitly selected image/video hero Pin and an accessible catalog product group. |
| `pinterest_create_board` | Create /boards in the selected advertiser context. |
| `pinterest_update_board` | Update /boards in the selected advertiser context. |
| `pinterest_create_pin` | Create /pins in the selected advertiser context. |
| `pinterest_update_pin` | Update a Pin. |
| `pinterest_register_media` | Register media upload; returned upload_url/parameters are not confirmation that a video is uploaded or ready. |
| `pinterest_prepare_video_upload` | Register a native Pinterest video upload for a local file or an HTTPS URL and keep its opaque receipt in memory. |
| `pinterest_upload_video` | Stream the registered video to the native destination saved in uploadReceipt, without the Pinterest access token. |
| `pinterest_create_catalog` | Create /catalogs in the selected advertiser context. |
| `pinterest_create_catalog_feed` | Create /catalogs/feeds in the selected advertiser context. |
| `pinterest_update_catalog_feed` | Update /catalogs/feeds in the selected advertiser context. |
| `pinterest_create_product_group` | Create /catalogs/product_groups in the selected advertiser context. |
| `pinterest_update_product_group` | Update /catalogs/product_groups in the selected advertiser context. |
| `pinterest_batch_catalog_items` | Submit native CREATE/UPDATE/UPSERT/DELETE catalog item operations. |

</details>

<details>
<summary><b>7 resources</b></summary>

| URI | Contents |
|---|---|
| `pinterest://manifest` | What this server exposes, and its current mode |
| `pinterest://reporting-columns` | Every reporting column the API accepts |
| `pinterest://attribution` | Attribution windows and their defaults |
| `pinterest://creative-assets` | How creative assets are shaped |
| `pinterest://catalog-reporting` | Catalog-specific reporting columns |
| `pinterest://surface-map` | Which tool covers which part of the API |
| `pinterest://recipes` | Step-by-step workflows |

</details>

---

## Security

- **The token is never logged**, at any log level, or written to disk.
- **Credentials go to the Pinterest API only**: `api.pinterest.com`, or `api-sandbox.pinterest.com`
  in sandbox mode. *A test fails the build if another host appears in the source.*
- **`PINTEREST_AD_ACCOUNT_IDS` restricts the reachable ad accounts.** When it is set, a request that
  names another account is refused before it is sent, and discovery only returns listed accounts.
- **No fetch follows a redirect.** Every outbound call sets `redirect: "error"`, so a redirect
  cannot forward your token to another host. *A test fails the build if any fetch omits this.*
- **Async report URLs are validated before being fetched.** Pinterest returns a download URL
  on a host it chooses; that value is data from the API, not something to trust. HTTPS only,
  no private or loopback address, no redirect, and no credential attached.
- **Video uploads go to the destination Pinterest returns**, an Amazon S3 host checked before use,
  with signed form fields and never the access token. A video URL you pass gets the same checks
  as a report URL. Every request has a timeout and a response size limit.
- **No telemetry.** Outside the Pinterest API, the server only contacts the report and upload
  URLs that Pinterest returns, and a video URL that you pass to the upload tools.

Full policy, including how personal data is handled: [SECURITY.md](SECURITY.md).

---

## Looking for a managed, multi-platform version?

[Try hosted Pinterest Ads](https://www.getmcpads.com/tools/pinterest-ads?utm_source=github&utm_medium=readme&utm_campaign=pinterest_ads_hosted) if you want to use this source without operating a local server.
getmcpads also connects advertising, Search Console and GA4 through one MCP URL.
Source availability and plan limits are listed on the site; connecting an account is still required.

1. Follow the [Pinterest Ads connection guide](https://www.getmcpads.com/guides/sources/pinterest-ads).
2. Select the account or property your assistant may read.
3. Connect [Claude](https://www.getmcpads.com/guides/setup/claude),
   [ChatGPT](https://www.getmcpads.com/guides/setup/chatgpt) or
   [Codex](https://www.getmcpads.com/guides/setup/codex).
4. Try a read-only review: “Review campaign performance using your selected ad account. State missing data and do not change anything.”

See the [current hosted tool catalogue](https://www.getmcpads.com/tools/pinterest-ads)
and [pricing](https://www.getmcpads.com/pricing) before choosing a paid plan.
This Apache 2.0 adapter remains independently useful with your own credentials.

---

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
Please read [SECURITY.md](SECURITY.md) before reporting anything security-related.

## Licence

[Apache License 2.0](LICENSE). See also [NOTICE](NOTICE).

Pinterest is a trademark of Pinterest, Inc.
**This project is not affiliated with, endorsed by, or sponsored by Pinterest, Inc.**
It is an independent client of a public API.

## MCP contracts and desktop bundle

Every tool declares read/write annotations, parameter descriptions and a structured output schema. Successful calls expose the payload as `structuredContent.result`; errors retain `isError: true`. The generated [server card](server-card.json) contains definitions only.

Run `npm run bundle -- /path/to/output` to build a `.mcpb` desktop bundle from the current catalog. Credentials are entered locally during installation. Write tools remain disabled unless explicitly enabled.

## More from getmcpads

[Meta Ads](https://github.com/get-mcp-ads/meta-ads-mcp-server) · [Google Ads](https://github.com/get-mcp-ads/google-ads-mcp-server) · [Google Analytics 4](https://github.com/get-mcp-ads/google-analytics-mcp-server) · [Google Search Console](https://github.com/get-mcp-ads/google-search-console-mcp-server) · [TikTok Ads](https://github.com/get-mcp-ads/tiktok-ads-mcp-server) · [X Ads](https://github.com/get-mcp-ads/x-ads-mcp-server)

Maintained by **Emmanuel** at [getmcpads](https://www.getmcpads.com). Questions: [hello@getmcpads.com](mailto:hello@getmcpads.com).
