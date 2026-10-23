/**
 * Startup configuration: the account allowlist is mandatory and only the exact
 * value "true" exposes writes. Both fail with a message that says what to set.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, parseAllowedAccounts, parseWriteFlag } from "../src/config.ts";

function withEnv(env, run) {
  const names = ["PINTEREST_ACCESS_TOKEN", "PINTEREST_REFRESH_TOKEN", "PINTEREST_APP_ID", "PINTEREST_APP_SECRET", "PINTEREST_AD_ACCOUNT_ID",
    "PINTEREST_DEFAULT_AD_ACCOUNT_ID", "PINTEREST_AD_ACCOUNT_IDS", "PINTEREST_ENABLE_WRITES", "PINTEREST_ENVIRONMENT", "LOG_LEVEL"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, { LOG_LEVEL: "error", ...env });
  try { return run(); } finally {
    for (const name of names) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
  }
}

test("only the exact value true exposes writes", () => {
  assert.equal(parseWriteFlag(undefined), false);
  assert.equal(parseWriteFlag(""), false);
  assert.equal(parseWriteFlag("false"), false);
  assert.equal(parseWriteFlag("true"), true);
  for (const value of ["1", "yes", "on", "TRUE", "True"]) {
    assert.throws(() => parseWriteFlag(value), /must be true or false/, value);
  }
});

test("the allowlist is required and falls back to the single default account", () => {
  assert.throws(() => parseAllowedAccounts(undefined, undefined), /PINTEREST_AD_ACCOUNT_IDS/);
  assert.throws(() => parseAllowedAccounts(" , ", undefined), /PINTEREST_AD_ACCOUNT_IDS/);
  assert.deepEqual(parseAllowedAccounts("111, 222,111", undefined), ["111", "222"]);
  assert.deepEqual(parseAllowedAccounts(undefined, "333"), ["333"]);
});

test("loadConfig refuses a missing allowlist, a bad write flag and an unlisted default", () => {
  withEnv({ PINTEREST_ACCESS_TOKEN: "fixture-token" }, () => assert.throws(() => loadConfig(), /PINTEREST_AD_ACCOUNT_IDS/));
  withEnv({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_AD_ACCOUNT_IDS: "111", PINTEREST_ENABLE_WRITES: "1" }, () => assert.throws(() => loadConfig(), /must be true or false/));
  withEnv({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_AD_ACCOUNT_IDS: "111", PINTEREST_AD_ACCOUNT_ID: "222" }, () => assert.throws(() => loadConfig(), /must be one of the accounts/));
  withEnv({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_AD_ACCOUNT_IDS: "act_111" }, () => assert.throws(() => loadConfig(), /numeric/));
  withEnv({ PINTEREST_AD_ACCOUNT_IDS: "111" }, () => assert.throws(() => loadConfig(), /PINTEREST_ACCESS_TOKEN/));
});

test("loadConfig accepts a valid configuration without echoing secrets", () => {
  const config = withEnv({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_AD_ACCOUNT_IDS: "111,222", PINTEREST_ENABLE_WRITES: "true" }, () => loadConfig());
  assert.deepEqual(config.allowedAccountIds, ["111", "222"]);
  assert.equal(config.enableWrites, true);
  assert.equal(config.defaultAdAccountId, undefined);
  const single = withEnv({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_AD_ACCOUNT_ID: "333" }, () => loadConfig());
  assert.deepEqual(single.allowedAccountIds, ["333"]);
  assert.equal(single.defaultAdAccountId, "333");
  assert.equal(single.enableWrites, false);
  try {
    withEnv({ PINTEREST_ACCESS_TOKEN: "secret-token-value", PINTEREST_ENABLE_WRITES: "yes", PINTEREST_AD_ACCOUNT_IDS: "1" }, () => loadConfig());
  } catch (error) {
    assert.ok(!String(error.message).includes("secret-token-value"));
  }
});
