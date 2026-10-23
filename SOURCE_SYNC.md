# Source synchronization

Reviewed on 2026-10-23 against getmcpads source revision `3e1c2c8`. The previous review covered revision `41cc1ca`.

## Synchronized in 2.1.0

- Add `pinterest_rename_campaign`, `pinterest_rename_adgroup` and `pinterest_rename_ad`. Each sends only the entity ID and the new name, plus the ad account on campaigns, then reads the entity back (gateway commit `958ba80`).
- Add the native video upload flow: `pinterest_prepare_video_upload` registers the media with `POST /media`, `pinterest_upload_video` sends the bytes to the upload destination that Pinterest returns, and `pinterest_get_video_upload` reads the processing status. The gateway reads frozen Launcher files. This server reads a local file path or an HTTPS URL that passes the same checks as async report URLs. The upload receipt stays in this process's memory instead of being encrypted with a hosted signing key.
- Refuse incomplete sync analytics responses instead of dropping rows, and read targeting analytics from `MetricsResponse.data` (native part of gateway commit `858251a`).
- Rename the attribution default in `pinterest://attribution` to `defaultAttribution`, as in gateway commit `1a77582`.
- Filter account discovery to the configured accounts, as the gateway does for selected accounts. This server also refuses any request that names an unlisted ad account.

## Reviewed and left out

- Alerts and performance monitoring (`858251a`), pricing plans (`5d25e18`), partner integrations (`22c13ca`, `30df757`), client memory (`569c3a9`) and the hosted error envelope (`21a8ad7`, `69ef8a7`) belong to the hosted product.
- The rename matrix served by `get_capabilities` is a discovery meta-tool and stays hosted. The rename tools themselves are included.
- The publisher and legal identity change in `1a77582` is not applied to this repository's notices.

The public server remains self-contained. Hosted billing, workspaces, account-selection storage, creative galleries, Launcher files and frozen media, alerts, Google Sheets exports, client memory and MCP Apps UI are outside this synchronization. Existing standalone protections are retained: the SSRF guard on report downloads, the exclusion of lead records and the default redaction of business member identifiers.

Validation uses synthetic data. No live advertising write is required by the test suite. The generated server-card.json is the source of truth for this revision's tool schemas.

Maintainer: Emmanuel, getmcpads. Contact: hello@getmcpads.com.
