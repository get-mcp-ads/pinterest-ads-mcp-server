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
  defaultAdAccountId: accountId.optional(),
  /**
   * Ad accounts this server may reach. loadConfig always sets it from the
   * environment; only programmatic callers of createServer may omit it.
   */
  allowedAccountIds: z.array(accountId).min(1).max(200).optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
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

/** Only the exact value "true" exposes writes. Other values stop the server with a clear message. */
export function parseWriteFlag(raw: string | undefined): boolean {
  const value = (raw ?? "").trim();
  if (value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error("PINTEREST_ENABLE_WRITES must be true or false. Since version 2.1.0, values such as 1, yes or on are refused.");
}

/** Comma-separated ad account IDs. Without PINTEREST_AD_ACCOUNT_IDS, PINTEREST_AD_ACCOUNT_ID alone is the allowlist. */
export function parseAllowedAccounts(list: string | undefined, defaultAccount: string | undefined): string[] {
  const ids = (list ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (ids.length === 0 && defaultAccount) ids.push(defaultAccount.trim());
  if (ids.length === 0) {
    throw new Error("Set PINTEREST_AD_ACCOUNT_IDS to the comma-separated Pinterest ad account IDs this server may use. Requests to any other account are refused.");
  }
  return [...new Set(ids)];
}

export function loadConfig(): PinterestConfig {
  const defaultAdAccountId = process.env["PINTEREST_AD_ACCOUNT_ID"] || process.env["PINTEREST_DEFAULT_AD_ACCOUNT_ID"] || undefined;
  const allowedAccountIds = parseAllowedAccounts(process.env["PINTEREST_AD_ACCOUNT_IDS"], defaultAdAccountId);
  const raw = {
    enableWrites: parseWriteFlag(process.env["PINTEREST_ENABLE_WRITES"]),
    environment: process.env["PINTEREST_ENVIRONMENT"] || "production",
    accessToken: process.env["PINTEREST_ACCESS_TOKEN"] || undefined,
    refreshToken: process.env["PINTEREST_REFRESH_TOKEN"] || undefined,
    appId: process.env["PINTEREST_APP_ID"] || undefined,
    appSecret: process.env["PINTEREST_APP_SECRET"] || undefined,
    defaultAdAccountId: defaultAdAccountId ?? (allowedAccountIds.length === 1 ? allowedAccountIds[0] : undefined),
    allowedAccountIds,
    logLevel: process.env["LOG_LEVEL"] ?? "info",
  };

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(", ");
    logger.error("config", `Invalid configuration: ${message}`);
    throw new Error(`Invalid Pinterest configuration: ${message}`);
  }

  logger.system(`Pinterest Ads MCP Server configured for ${allowedAccountIds.length} ad account${allowedAccountIds.length === 1 ? "" : "s"}`);
  return result.data;
}
