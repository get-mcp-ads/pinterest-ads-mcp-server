#!/usr/bin/env node

const requiredAccess = ["PINTEREST_ACCESS_TOKEN"];
const requiredRefresh = ["PINTEREST_REFRESH_TOKEN", "PINTEREST_APP_ID", "PINTEREST_APP_SECRET"];
const accounts = ["PINTEREST_AD_ACCOUNT_IDS", "PINTEREST_AD_ACCOUNT_ID"];
const optional = ["PINTEREST_ENABLE_WRITES", "PINTEREST_ENVIRONMENT", "LOG_LEVEL"];

function present(name) {
  return typeof process.env[name] === "string" && process.env[name].length > 0;
}

// The check lives in src/runtime-check.ts and ships in the build.
async function runtimeCheck() {
  try {
    const { nodeRuntimeWarning } = await import("../dist/index.js");
    const warning = nodeRuntimeWarning();
    return { node: process.versions.node, ok: !warning, ...(warning ? { warning } : {}) };
  } catch {
    return { node: process.versions.node, ok: false, warning: "Run npm run build first, then npm run doctor again to check this Node.js release." };
  }
}

const hasAccess = requiredAccess.every(present);
const hasRefresh = requiredRefresh.every(present);
const hasAllowlist = present("PINTEREST_AD_ACCOUNT_IDS");
const writeFlag = (process.env.PINTEREST_ENABLE_WRITES ?? "").trim();
const writeValue = writeFlag.toLowerCase();
const writeFlagValid = ["", "true", "false", "1", "yes", "on", "0", "no", "off"].includes(writeValue);
const writesEnabled = ["true", "1", "yes", "on"].includes(writeValue);
const warnings = [];
if (!hasAllowlist) warnings.push("PINTEREST_AD_ACCOUNT_IDS is not set, so every ad account the token can access is reachable. Version 3.0.0 will require it.");
if (writesEnabled && writeFlag !== "true") warnings.push(`PINTEREST_ENABLE_WRITES=${writeFlag} is deprecated. Version 3.0.0 will accept only true to enable writes.`);
if (!writeFlagValid) warnings.push("PINTEREST_ENABLE_WRITES must be true or false.");
const runtime = await runtimeCheck();
if (runtime.warning) console.error(runtime.warning);

const result = {
  package: "@getmcpads/pinterest-ads-mcp-server",
  ok: (hasAccess || hasRefresh) && writeFlagValid,
  runtime,
  auth: {
    accessTokenMode: hasAccess,
    refreshTokenMode: hasRefresh,
    requiredAccess: requiredAccess.map((name) => ({ name, present: present(name) })),
    requiredRefresh: requiredRefresh.map((name) => ({ name, present: present(name) })),
  },
  accounts: {
    allowlistConfigured: hasAllowlist,
    variables: accounts.map((name) => ({ name, present: present(name) })),
  },
  writes: { enabled: writeFlagValid && writesEnabled, valid: writeFlagValid },
  warnings,
  optional: optional.map((name) => ({ name, present: present(name) })),
  note: "Set PINTEREST_ACCESS_TOKEN or PINTEREST_REFRESH_TOKEN + PINTEREST_APP_ID + PINTEREST_APP_SECRET. PINTEREST_AD_ACCOUNT_IDS is recommended. PINTEREST_ENABLE_WRITES=true enables writes.",
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
