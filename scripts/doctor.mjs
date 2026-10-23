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
const hasAccounts = accounts.some(present);
const writeFlag = (process.env.PINTEREST_ENABLE_WRITES ?? "").trim();
const writeFlagValid = ["", "true", "false"].includes(writeFlag);
const runtime = await runtimeCheck();
if (runtime.warning) console.error(runtime.warning);

const result = {
  package: "@getmcpads/pinterest-ads-mcp-server",
  ok: (hasAccess || hasRefresh) && hasAccounts && writeFlagValid,
  runtime,
  auth: {
    accessTokenMode: hasAccess,
    refreshTokenMode: hasRefresh,
    requiredAccess: requiredAccess.map((name) => ({ name, present: present(name) })),
    requiredRefresh: requiredRefresh.map((name) => ({ name, present: present(name) })),
  },
  accounts: {
    allowlistConfigured: hasAccounts,
    variables: accounts.map((name) => ({ name, present: present(name) })),
  },
  writes: { enabled: writeFlag === "true", valid: writeFlagValid },
  optional: optional.map((name) => ({ name, present: present(name) })),
  note: "Set PINTEREST_ACCESS_TOKEN or PINTEREST_REFRESH_TOKEN + PINTEREST_APP_ID + PINTEREST_APP_SECRET, and PINTEREST_AD_ACCOUNT_IDS. PINTEREST_ENABLE_WRITES accepts true or false.",
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
