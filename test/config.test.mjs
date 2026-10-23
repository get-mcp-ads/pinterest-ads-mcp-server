/**
 * Startup configuration in 2.1: nothing that worked in 2.0 stops working.
 * PINTEREST_AD_ACCOUNT_IDS is enforced when set, and recommended otherwise.
 * The legacy write values still work, with a deprecation notice on stderr.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { ALLOWLIST_NOTICE, configNotices, loadConfig, parseAllowedAccounts, parseWriteFlag } from "../src/config.ts";

const NAMES = ["PINTEREST_ACCESS_TOKEN", "PINTEREST_REFRESH_TOKEN", "PINTEREST_APP_ID", "PINTEREST_APP_SECRET", "PINTEREST_AD_ACCOUNT_ID",
  "PINTEREST_DEFAULT_AD_ACCOUNT_ID", "PINTEREST_AD_ACCOUNT_IDS", "PINTEREST_ENABLE_WRITES", "PINTEREST_ENVIRONMENT", "LOG_LEVEL"];

function withEnv(env, run) {
  const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  const write = process.stderr.write;
  for (const name of NAMES) delete process.env[name];
  Object.assign(process.env, { LOG_LEVEL: "error", ...env });
  process.stderr.write = () => true;
  try { return run(); } finally {
    process.stderr.write = write;
    for (const name of NAMES) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
  }
}

/** Start the built CLI with stdin closed, as an MCP client that disconnects at once. */
function startCli(env) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !NAMES.includes(name)));
  return spawnSync(process.execPath, ["dist/cli.js"], { input: "", env: { ...clean, LOG_LEVEL: "error", ...env }, encoding: "utf8", timeout: 15000 });
}

test("true and the legacy 2.0 values enable writes; disabled values and unset disable them", () => {
  assert.deepEqual(parseWriteFlag("true"), { enabled: true });
  for (const value of [undefined, "", "false", "FALSE", "0", "no", "off", "Off"]) {
    assert.deepEqual(parseWriteFlag(value), { enabled: false }, String(value));
  }
  for (const value of ["1", "yes", "on", "YES", "On", "TRUE", " true "]) {
    const result = parseWriteFlag(value);
    assert.equal(result.enabled, true, value);
    if (value.trim() === "true") assert.equal(result.notice, undefined);
    else assert.match(result.notice, /deprecated\. Version 3\.0\.0 will accept only true/, value);
  }
  for (const value of ["2", "enabled", "truee", "y"]) {
    assert.throws(() => parseWriteFlag(value), /must be true or false/, value);
  }
});

test("the allowlist is optional and parsed from a comma-separated list", () => {
  assert.equal(parseAllowedAccounts(undefined), undefined);
  assert.equal(parseAllowedAccounts(" , "), undefined);
  assert.deepEqual(parseAllowedAccounts("111, 222,111"), ["111", "222"]);
  assert.deepEqual(configNotices({}), [ALLOWLIST_NOTICE]);
  assert.deepEqual(configNotices({ PINTEREST_AD_ACCOUNT_IDS: "111", PINTEREST_ENABLE_WRITES: "true" }), []);
  assert.equal(configNotices({ PINTEREST_AD_ACCOUNT_IDS: "111", PINTEREST_ENABLE_WRITES: "1" }).length, 1);
});

test("without PINTEREST_AD_ACCOUNT_IDS the default account stays a default, as in 2.0", () => {
  const config = withEnv({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_AD_ACCOUNT_ID: "333", PINTEREST_ENABLE_WRITES: "1" }, () => loadConfig());
  assert.equal(config.allowedAccountIds, undefined);
  assert.equal(config.defaultAdAccountId, "333");
  assert.equal(config.enableWrites, true);
  const bare = withEnv({ PINTEREST_ACCESS_TOKEN: "fixture-token" }, () => loadConfig());
  assert.equal(bare.allowedAccountIds, undefined);
  assert.equal(bare.enableWrites, false);
});

test("with PINTEREST_AD_ACCOUNT_IDS the list is enforced and checked at startup", () => {
  const config = withEnv({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_AD_ACCOUNT_IDS: "111,222", PINTEREST_ENABLE_WRITES: "true" }, () => loadConfig());
  assert.deepEqual(config.allowedAccountIds, ["111", "222"]);
  assert.equal(config.defaultAdAccountId, undefined);
  const single = withEnv({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_AD_ACCOUNT_IDS: "111" }, () => loadConfig());
  assert.equal(single.defaultAdAccountId, "111");
  withEnv({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_AD_ACCOUNT_IDS: "111", PINTEREST_AD_ACCOUNT_ID: "222" }, () => assert.throws(() => loadConfig(), /must be one of the accounts/));
  withEnv({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_AD_ACCOUNT_IDS: "act_111" }, () => assert.throws(() => loadConfig(), /numeric/));
  withEnv({ PINTEREST_AD_ACCOUNT_IDS: "111" }, () => assert.throws(() => loadConfig(), /PINTEREST_ACCESS_TOKEN/));
  withEnv({ PINTEREST_ACCESS_TOKEN: "secret-token-value", PINTEREST_ENABLE_WRITES: "maybe" }, () => {
    assert.throws(() => loadConfig(), (error) => /must be true or false/.test(error.message) && !error.message.includes("secret-token-value"));
  });
});

test("startup notices go to stderr only, never to the MCP channel on stdout", () => {
  const legacy = startCli({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_ENABLE_WRITES: "yes" });
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.equal(legacy.stdout, "");
  assert.match(legacy.stderr, /PINTEREST_ENABLE_WRITES=yes is deprecated\. Version 3\.0\.0 will accept only true/);
  assert.match(legacy.stderr, /PINTEREST_AD_ACCOUNT_IDS is not set.*Version 3\.0\.0 will require it/);
  assert.ok(!legacy.stderr.includes("fixture-token"));

  const current = startCli({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_AD_ACCOUNT_IDS: "111", PINTEREST_ENABLE_WRITES: "true" });
  assert.equal(current.status, 0, current.stderr);
  assert.equal(current.stdout, "");
  assert.doesNotMatch(current.stderr, /deprecated|Version 3\.0\.0/);

  const invalid = startCli({ PINTEREST_ACCESS_TOKEN: "fixture-token", PINTEREST_ENABLE_WRITES: "maybe" });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.match(invalid.stderr, /must be true or false/);
});
