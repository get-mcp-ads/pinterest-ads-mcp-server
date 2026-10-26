/** Copyright 2026 GetMCPAds. SPDX-License-Identifier: Apache-2.0 */
import { z } from "zod";
import { logger } from "./core/logger.js";
import { PINTEREST_API_BASES } from "./core/hosts.js";

const accountId = z.string().regex(/^\d{1,32}$/, "Pinterest ad account IDs are numeric.");

const configSchema = z.object({
  enableWrites: z.boolean().optional(),
  environment: z.enum(["production", "sandbox"]).optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  defaultAdAccountId: z.string().optional(),
  /**
   * Ad accounts this server may reach, from PINTEREST_AD_ACCOUNT_IDS. Unset
   * keeps the 2.0 behaviour: every account the token can access. Version
   * 3.0.0 will require it.
   */
  allowedAccountIds: z.array(accountId).min(1).max(200).optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).prefault("info"),
}).refine((config) => {
  if (config.accessToken) return true;
  return Boolean(config.refreshToken && config.appId && config.appSecret);
}, {
  message: "Set PINTEREST_ACCESS_TOKEN or PINTEREST_REFRESH_TOKEN + PINTEREST_APP_ID + PINTEREST_APP_SECRET",
}).refine((config) => !config.defaultAdAccountId || !config.allowedAccountIds || config.allowedAccountIds.includes(config.defaultAdAccountId), {
  message: "PINTEREST_AD_ACCOUNT_ID must be one of the accounts listed in PINTEREST_AD_ACCOUNT_IDS",
});

export type RefreshedPinterestTokens = { accessToken: string; refreshToken?: string; expiresIn?: number };
export type PinterestConfig = z.infer<typeof configSchema> & {
  onTokenRefresh?: (tokens: RefreshedPinterestTokens) => Promise<void>;
};

export function pinterestApiBase(config: Pick<PinterestConfig, "environment">): string {
  if (config.environment && !["production", "sandbox"].includes(config.environment)) throw new Error("Invalid Pinterest environment");
  return config.environment === "sandbox" ? PINTEREST_API_BASES.sandbox : PINTEREST_API_BASES.production;
}

const LEGACY_ENABLED = new Set(["1", "yes", "on"]);
const LEGACY_DISABLED = new Set(["0", "no", "off"]);

/**
 * `true` enables writes. `false`, `0`, `no`, `off` or no value disable them.
 * The 2.0 values 1, yes and on still enable writes with a deprecation notice,
 * because version 3.0.0 will accept only true. Anything else stops the server
 * with a clear message.
 */
export function parseWriteFlag(raw: string | undefined): { enabled: boolean; notice?: string } {
  const original = (raw ?? "").trim();
  const value = original.toLowerCase();
  if (original === "true") return { enabled: true };
  if (value === "" || value === "false" || LEGACY_DISABLED.has(value)) return { enabled: false };
  if (value === "true" || LEGACY_ENABLED.has(value)) {
    return { enabled: true, notice: `PINTEREST_ENABLE_WRITES=${original} is deprecated. Version 3.0.0 will accept only true to enable writes.` };
  }
  throw new Error("PINTEREST_ENABLE_WRITES must be true or false. Leave it unset to keep write tools disabled.");
}

/** Comma-separated ad account IDs from PINTEREST_AD_ACCOUNT_IDS, or undefined when the variable is unset or empty. */
export function parseAllowedAccounts(list: string | undefined): string[] | undefined {
  const ids = (list ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return ids.length ? [...new Set(ids)] : undefined;
}

export const ALLOWLIST_NOTICE =
  "PINTEREST_AD_ACCOUNT_IDS is not set, so every ad account the token can access is reachable. Set it to the comma-separated ad account IDs this server may use. Version 3.0.0 will require it.";

/** One-line startup notices for stderr. They never contain a credential. */
export function configNotices(env: NodeJS.ProcessEnv = process.env): string[] {
  const notices: string[] = [];
  const writes = parseWriteFlag(env["PINTEREST_ENABLE_WRITES"]);
  if (writes.notice) notices.push(writes.notice);
  if (!parseAllowedAccounts(env["PINTEREST_AD_ACCOUNT_IDS"])) notices.push(ALLOWLIST_NOTICE);
  return notices;
}

export function loadConfig(): PinterestConfig {
  const defaultAdAccountId = process.env["PINTEREST_AD_ACCOUNT_ID"] || process.env["PINTEREST_DEFAULT_AD_ACCOUNT_ID"] || undefined;
  const allowedAccountIds = parseAllowedAccounts(process.env["PINTEREST_AD_ACCOUNT_IDS"]);
  const writes = parseWriteFlag(process.env["PINTEREST_ENABLE_WRITES"]);
  const raw = {
    enableWrites: writes.enabled,
    environment: process.env["PINTEREST_ENVIRONMENT"] || "production",
    accessToken: process.env["PINTEREST_ACCESS_TOKEN"] || undefined,
    refreshToken: process.env["PINTEREST_REFRESH_TOKEN"] || undefined,
    appId: process.env["PINTEREST_APP_ID"] || undefined,
    appSecret: process.env["PINTEREST_APP_SECRET"] || undefined,
    defaultAdAccountId: defaultAdAccountId ?? (allowedAccountIds?.length === 1 ? allowedAccountIds[0] : undefined),
    allowedAccountIds,
    logLevel: process.env["LOG_LEVEL"] ?? "info",
  };

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(", ");
    logger.error("config", `Invalid configuration: ${message}`);
    throw new Error(`Invalid Pinterest configuration: ${message}`);
  }

  // Written whatever LOG_LEVEL says, and to stderr only: stdout carries the MCP protocol.
  for (const notice of configNotices()) process.stderr.write(`[pinterest-ads-mcp] WARN config: ${notice}\n`);
  logger.system(allowedAccountIds
    ? `Pinterest Ads MCP Server configured for ${allowedAccountIds.length} ad account${allowedAccountIds.length === 1 ? "" : "s"}`
    : "Pinterest Ads MCP Server configured");
  return result.data;
}
