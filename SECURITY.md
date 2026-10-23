# Security Policy

This server holds a token that can read, and when writes are enabled modify,
live advertising accounts. We take reports seriously.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting on this repository:
[Report a vulnerability](https://github.com/get-mcp-ads/pinterest-ads-mcp-server/security/advisories/new).

We aim to acknowledge a report within 3 business days and to ship a fix or a
documented mitigation within 30 days. We will credit you in the advisory unless
you ask us not to.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 2.1.x   | ✅        |
| < 2.1   | ❌        |

## What this server does with your token

- The access token, and the refresh credentials when used, are read once from
  the environment at startup and kept in memory. None is ever written to disk
  or logged, at any log level.
- **Credentials go to the Pinterest API only**: `api.pinterest.com`, or
  `api-sandbox.pinterest.com` when `PINTEREST_ENVIRONMENT=sandbox`. These hosts
  are listed in `src/core/hosts.ts`. *A test fails the build if another host
  appears in the source.*
- **Only the listed ad accounts are reachable.** A request that names an ad
  account outside `PINTEREST_AD_ACCOUNT_IDS` is refused before it is sent, and
  account discovery only returns the listed accounts.
- Every request has a timeout and a bound on the size of the response it reads.
- **No fetch follows a redirect.** Every outbound call sets `redirect: "error"`,
  so a redirect cannot forward your token to another host. *A test fails the
  build if any fetch omits this.*
- No telemetry, no analytics, no phone-home.

## Async report downloads

Pinterest runs large reports asynchronously and returns a download URL on a
host it chooses. That URL is **data returned by the API, not a value to trust
blindly**, so it is validated before being fetched:

- HTTPS only.
- No loopback, link-local or private address, so a crafted or mistaken value
  cannot become a request to the machine running the server or to a cloud
  metadata endpoint.
- No redirect followed.
- No credential attached to that request.

## Video uploads

`pinterest_upload_video` sends a video to the upload destination that
Pinterest returns from `POST /media`, an Amazon S3 bucket:

- The destination must be HTTPS on an Amazon S3 host, without credentials or a
  custom port. Any other value is refused.
- The request carries the signed form fields from the same Pinterest response,
  never the Pinterest access token. Those form fields are kept in memory and are
  not returned to the model.
- A video named by URL is checked like an async report URL: HTTPS only, no
  loopback, link-local or private address, no redirect and no credential. A
  local file must be an absolute path to a regular `.mp4`, `.m4v` or `.mov`
  file that starts like a video. Both are limited to 500 MB.

## Personal data

Two distinct protections, and they work differently.

**Lead records are not exposed at all.** `pinterest_get_lead_assets` returns
lead form and subscription configuration, but never the lead export itself,
because those rows carry personal information submitted by end users. This is
an exclusion, not a redaction: the data never leaves Pinterest through this
server.

**Business member identifiers are redacted by default.** Member IDs, email
addresses and usernames are replaced before they reach the model when reading
members, asset members and invites. `includePersonalIdentifiers: true` returns
the raw values, and defaults to `false`. Use it only with explicit
authorisation, since these are your colleagues' addresses.

## Handling your token safely

- Grant `ads:read` only. Add `ads:write` **only** if you enable writes.
- Treat the token like a password: it is a bearer credential.
- Your MCP client config file is usually plain text on disk. Check its
  permissions, and never commit it.
- Rotate the token if you suspect exposure.

## Scope

Vulnerabilities in the Pinterest API itself are not in scope here; report those
to Pinterest.
