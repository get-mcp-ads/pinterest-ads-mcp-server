import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { collect } from "./catalogue";
import { createServer } from "../../src/server";
import { PinterestClient, readBoundedText, requestedAdAccountIds } from "../../src/platforms/pinterest/client";

/** Calls through the SDK, so input defaults apply as they do for a real client. */
async function overMcp(config: Record<string, unknown>, name: string, args: Record<string, unknown>) {
  const server = createServer({ logLevel: "error", ...config } as never);
  const client = new Client({ name: "allowlist-test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    const r = (await client.callTool({ name, arguments: args })) as any;
    return { ...JSON.parse(r.content[0].text), isError: r.isError };
  } finally {
    await client.close();
    await server.close();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function caller(config: Record<string, unknown>) {
  const tools = collect("pinterest_ads", config);
  return async (name: string, args: Record<string, unknown>) => {
    const r = (await tools.find((t) => t.name === name)!.handler(args)) as any;
    return { ...JSON.parse(r.content[0].text), isError: r.isError };
  };
}

describe("Pinterest renames", () => {
  const config = { accessToken: "fixture", environment: "sandbox", allowedAccountIds: ["549755885176"] };
  it.each([
    ["pinterest_rename_campaign", "campaignId", "campaigns"],
    ["pinterest_rename_adgroup", "adGroupId", "ad_groups"],
    ["pinterest_rename_ad", "adId", "ads"],
  ])("%s previews, then PATCHes the id and name only", async (name, param, entity) => {
    const current = { id: "549755885175", ad_account_id: "549755885176", campaign_id: "549755885177", name: "Old", status: "PAUSED" };
    const calls: Array<{ method: string; path: string; body: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname.replace(/^\/v5/, "");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method: init?.method ?? "GET", path, body });
      if (init?.method === "PATCH") return Response.json({ items: [{ data: { ...current, ...body[0] }, exceptions: [] }] });
      if (path === "/ad_accounts/549755885176") return Response.json({ id: "549755885176", owner: { id: "u" } });
      return Response.json(path.includes("/campaigns/") && entity !== "campaigns" ? { ...current, id: "549755885177" } : { ...current, name: calls.some((c) => c.method === "PATCH") ? "FR_Brand" : "Old" });
    }));
    const call = caller(config);
    const preview = await call(name, { adAccountId: "549755885176", [param]: "549755885175", name: "FR_Brand" });
    expect(preview).toMatchObject({ applied: false, payload: { id: "549755885175", name: "FR_Brand" } });
    expect(calls).toHaveLength(0);
    const applied = await call(name, { adAccountId: "549755885176", [param]: "549755885175", name: "FR_Brand", confirm: true });
    expect(applied.isError, JSON.stringify(applied)).toBeUndefined();
    expect(applied.applied).toBe(true);
    const item = { id: "549755885175", name: "FR_Brand", ...(entity === "campaigns" ? { ad_account_id: "549755885176" } : {}) };
    expect(calls.filter((c) => c.method === "PATCH").map((c) => [c.path, c.body])).toEqual([[`/ad_accounts/549755885176/${entity}`, [item]]]);
  });

  it("refuses an empty or overlong name before any request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const call = caller(config);
    expect((await call("pinterest_rename_ad", { adAccountId: "549755885176", adId: "1", name: "   ", confirm: true })).isError).toBe(true);
    expect((await call("pinterest_rename_ad", { adAccountId: "549755885176", adId: "1", name: "x".repeat(256), confirm: true })).isError).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Pinterest account allowlist", () => {
  const config = { accessToken: "fixture", environment: "production", allowedAccountIds: ["111"] } as const;

  it("finds the account named in the path, the query and the body", () => {
    expect(requestedAdAccountIds("/ad_accounts/222/campaigns?page_size=1")).toEqual(["222"]);
    expect(requestedAdAccountIds("/pins/9?ad_account_id=333")).toEqual(["333"]);
    expect(requestedAdAccountIds("/catalogs", JSON.stringify([{ ad_account_id: "444" }]))).toEqual(["444"]);
  });

  it("refuses an unlisted account before any network call, for reads and write previews", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const client = new PinterestClient({ ...config, logLevel: "error" });
    await expect(client.getAdAccount("222")).rejects.toThrow("PINTEREST_AD_ACCOUNT_IDS");
    await expect(client.getResource("/pins/1", { ad_account_id: "222" })).rejects.toThrow("not in PINTEREST_AD_ACCOUNT_IDS");
    await expect(client.mutate("/ad_accounts/222/campaigns", "POST", [{ name: "x" }])).rejects.toThrow("PINTEREST_AD_ACCOUNT_IDS");
    const call = caller(config);
    const preview = await call("pinterest_update_campaign_status", { adAccountId: "222", campaignId: "5", status: "PAUSED" });
    expect(preview).toMatchObject({ isError: true, applied: false });
    expect(preview.error).toContain("PINTEREST_AD_ACCOUNT_IDS");
    const report = await overMcp(config, "pinterest_run_report", { adAccountId: "222", startDate: "2026-10-01", endDate: "2026-10-02" });
    expect(report.isError).toBe(true);
    expect(report.error).toContain("PINTEREST_AD_ACCOUNT_IDS");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("filters account discovery to the listed accounts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [{ id: "111", name: "Listed" }, { id: "222", name: "Other" }], bookmark: null })));
    const call = caller(config);
    const listed = await call("pinterest_list_ad_accounts", {});
    expect(listed.accounts.map((a: { id: string }) => a.id)).toEqual(["111"]);
    expect(listed.rowCount).toBe(1);
  });
});

describe("Pinterest without PINTEREST_AD_ACCOUNT_IDS", () => {
  const config = { accessToken: "fixture", environment: "production", defaultAdAccountId: "111" } as const;

  it("keeps the 2.0 behaviour: the default account is not a restriction", async () => {
    const fetcher = vi.fn(async () => Response.json({ id: "222" }));
    vi.stubGlobal("fetch", fetcher);
    const client = new PinterestClient({ ...config, logLevel: "error" });
    await expect(client.getAdAccount("222")).resolves.toMatchObject({ id: "222" });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/ad_accounts/222");
    const preview = await caller(config)("pinterest_update_campaign_status", { adAccountId: "222", campaignId: "5", status: "PAUSED" });
    expect(preview).toMatchObject({ applied: false, adAccountId: "222" });
    expect(preview.isError).toBeUndefined();
  });

  it("returns every accessible account from discovery", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [{ id: "111", name: "Default" }, { id: "222", name: "Other" }], bookmark: null })));
    const listed = await caller(config)("pinterest_list_ad_accounts", {});
    expect(listed.accounts.map((a: { id: string }) => a.id)).toEqual(["111", "222"]);
  });
});

describe("Pinterest response bounds", () => {
  it("refuses a response larger than its bound", async () => {
    await expect(readBoundedText(new Response("x".repeat(64)), 16)).rejects.toThrow("byte limit");
    await expect(readBoundedText(new Response("x".repeat(8), { headers: { "content-length": "1000" } }), 16)).rejects.toThrow("byte limit");
    expect(await readBoundedText(new Response("ok"), 16)).toBe("ok");
  });

  it("redacts the access token from provider error text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "token pina_secret_value_123 is invalid" }, { status: 400 })));
    const client = new PinterestClient({ accessToken: "pina_secret_value_123", logLevel: "error", allowedAccountIds: ["111"] });
    await expect(client.getAdAccount("111")).rejects.toThrow(/\[redacted\] is invalid/);
  });

  it("reads targeting analytics from MetricsResponse.data and rejects incomplete rows", async () => {
    const config = { accessToken: "fixture", defaultAdAccountId: "111", allowedAccountIds: ["111"] };
    const args = { level: "AD_GROUP", entityIds: ["44"], startDate: "2026-10-01", endDate: "2026-10-10", targetingTypes: ["KEYWORD"], columns: ["SPEND_IN_DOLLAR"], executionMode: "sync" };
    const fetcher = vi.fn(async () => Response.json({ data: [{ AD_GROUP_ID: "44", TARGETING_TYPE: "KEYWORD", SPEND_IN_DOLLAR: 12.5 }] }));
    vi.stubGlobal("fetch", fetcher);
    const ok = await overMcp(config, "pinterest_run_report", args);
    expect(ok.isError, JSON.stringify(ok)).toBeUndefined();
    expect(ok.rowCount, JSON.stringify(ok)).toBe(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/ad_groups/targeting_analytics");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ AD_GROUP_ID: "44" }, "broken"] })));
    expect((await overMcp(config, "pinterest_run_report", args)).isError).toBe(true);
  });
});
