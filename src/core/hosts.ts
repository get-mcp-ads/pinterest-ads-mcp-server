/**
 * pinterest-ads-mcp-server: an open-source MCP server for the Pinterest Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * Every host this server sends a credential to is listed here. The API and
 * the token endpoint share these two hosts. A test fails when another host
 * appears in the source.
 */
export const PINTEREST_API_BASES = {
  production: "https://api.pinterest.com/v5",
  sandbox: "https://api-sandbox.pinterest.com/v5",
} as const;

/**
 * POST /media returns the upload destination for a video: an Amazon S3 bucket
 * that Pinterest chooses. It receives the video bytes and the signed form
 * fields from that same response, never the Pinterest access token. The value
 * is data from the API, so it is checked against this pattern before use.
 */
const PINTEREST_UPLOAD_HOST = /(^|\.)s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/;

export function assertPinterestUploadDestination(raw: unknown): string {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error("Pinterest returned an unsupported upload destination.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !PINTEREST_UPLOAD_HOST.test(url.hostname)) {
    throw new Error("Pinterest returned an unsupported upload destination.");
  }
  return url.href;
}
