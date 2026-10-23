import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collect } from "./catalogue";

const config = { accessToken: "fixture-access-token", environment: "production", allowedAccountIds: ["123"] } as const;
const S3 = "https://pinterest-media-upload.s3-accelerate.amazonaws.com/";
const VIDEO_URL = "https://cdn.example.com/creative.mp4";
let dir: string;
let videoPath: string;
const bytes = new Uint8Array(24);
bytes.set(new TextEncoder().encode("....ftypisom"), 0);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "pinterest-video-"));
  videoPath = join(dir, "creative.mp4");
  writeFileSync(videoPath, bytes);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function tools() {
  const all = collect("pinterest_ads", config);
  return async (name: string, args: Record<string, unknown>) => {
    const tool = all.find((t) => t.name === name)!;
    const r = (await tool.handler({ adAccountId: "123", ...args })) as any;
    return { ...JSON.parse(r.content[0].text), isError: r.isError, raw: r.content[0].text as string };
  };
}

function provider() {
  let uploaded = new Uint8Array();
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith(VIDEO_URL)) {
      return new Response(init?.method === "HEAD" ? null : bytes, { headers: { "content-type": "video/mp4", "content-length": String(bytes.byteLength) } });
    }
    if (url.startsWith(S3)) {
      expect(new Headers(init?.headers).get("authorization")).toBe(null);
      expect(init?.redirect).toBe("error");
      expect(init?.body).toBeInstanceOf(ReadableStream);
      uploaded = new Uint8Array(await new Response(init?.body).arrayBuffer());
      expect(uploaded.byteLength).toBe(Number(new Headers(init?.headers).get("content-length")));
      return new Response(null, { status: 204 });
    }
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-access-token");
    if (url.endsWith("/media") && init?.method === "POST") {
      return Response.json({ media_id: "800", upload_url: S3, upload_parameters: { key: "uploads/800", policy: "private-policy", "x-amz-signature": "private-signature" } });
    }
    if (url.endsWith("/media/800")) return Response.json({ media_id: "800", status: "succeeded" });
    return Response.json({ id: "123" });
  });
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, uploaded: () => uploaded };
}

const registrations = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls.filter(([url, init]) => String(url).endsWith("/media") && (init as RequestInit | undefined)?.method === "POST");

describe("Pinterest native video upload", () => {
  it("exposes the status read without writes and the upload steps only with writes", () => {
    const names = collect("pinterest_ads", config).map((t) => t.name);
    for (const name of ["pinterest_prepare_video_upload", "pinterest_upload_video", "pinterest_get_video_upload"]) expect(names).toContain(name);
    const reads = collect("pinterest_ads", config).filter((t) => !t.write).map((t) => t.name);
    expect(reads).toContain("pinterest_get_video_upload");
    expect(reads).not.toContain("pinterest_upload_video");
  });

  it("previews a local file without any network call", async () => {
    const p = provider();
    const call = tools();
    const preview = await call("pinterest_prepare_video_upload", { filePath: videoPath });
    expect(preview).toMatchObject({ applied: false, source: { filePath: videoPath, byteLength: 24, mimeType: "video/mp4" } });
    expect(p.fetcher).not.toHaveBeenCalled();
  });

  it("uploads exactly the local bytes, hides the signed form fields and proves readiness separately", async () => {
    const p = provider();
    const call = tools();
    const prepared = await call("pinterest_prepare_video_upload", { filePath: videoPath, confirm: true });
    expect(prepared.isError, prepared.raw).not.toBe(true);
    expect(prepared.raw).not.toContain("private-policy");
    expect(prepared.raw).not.toContain("private-signature");
    const uploadReceipt = prepared.result.uploadReceipt;
    expect(uploadReceipt).toMatch(/^pinvid_[a-f0-9]{48}$/);

    const preview = await call("pinterest_upload_video", { filePath: videoPath, uploadReceipt });
    expect(preview).toMatchObject({ applied: false, mediaId: "800" });
    expect(p.fetcher.mock.calls.some(([url]) => String(url).startsWith(S3))).toBe(false);

    const uploaded = await call("pinterest_upload_video", { filePath: videoPath, uploadReceipt, confirm: true });
    expect(uploaded).toMatchObject({ applied: true, ready: false, result: { mediaId: "800", byteLength: 24 } });
    const body = new TextDecoder().decode(p.uploaded());
    expect(body).toContain("ftypisom");
    expect(body).toContain('name="policy"');
    expect(body).toContain('filename="creative.mp4"');
    expect(await call("pinterest_get_video_upload", { uploadReceipt })).toMatchObject({ ready: true, failed: false, mediaId: "800" });
    expect(registrations(p.fetcher)).toHaveLength(1);
  });

  it("streams an HTTPS source without credentials and checks it again before the transfer", async () => {
    const p = provider();
    const call = tools();
    const preview = await call("pinterest_prepare_video_upload", { sourceUrl: VIDEO_URL });
    expect(preview.applied).toBe(false);
    expect(p.fetcher).not.toHaveBeenCalled();
    const prepared = await call("pinterest_prepare_video_upload", { sourceUrl: VIDEO_URL, confirm: true });
    expect(prepared.isError, prepared.raw).not.toBe(true);
    const sourceCalls = p.fetcher.mock.calls.filter(([url]) => String(url).startsWith(VIDEO_URL));
    expect(sourceCalls.every(([, init]) => new Headers((init as RequestInit).headers).get("authorization") === null && (init as RequestInit).redirect === "error")).toBe(true);
    const uploaded = await call("pinterest_upload_video", { sourceUrl: VIDEO_URL, uploadReceipt: prepared.result.uploadReceipt, confirm: true });
    expect(uploaded).toMatchObject({ applied: true, result: { byteLength: 24 } });
    expect(new TextDecoder().decode(p.uploaded())).toContain("ftypisom");
  });

  it("refuses private URLs, plain HTTP, relative paths and non-video files before any request", async () => {
    const p = provider();
    const call = tools();
    for (const sourceUrl of ["https://127.0.0.1/video.mp4", "https://169.254.169.254/latest", "https://localhost/video.mp4", "http://cdn.example.com/video.mp4", "https://user:pass@cdn.example.com/video.mp4", "https://[::1]/video.mp4"]) {
      expect((await call("pinterest_prepare_video_upload", { sourceUrl, confirm: true })).isError, sourceUrl).toBe(true);
    }
    expect((await call("pinterest_prepare_video_upload", { filePath: "creative.mp4", confirm: true })).isError).toBe(true);
    expect((await call("pinterest_prepare_video_upload", { filePath: videoPath, sourceUrl: VIDEO_URL, confirm: true })).isError).toBe(true);
    const text = join(dir, "notes.mp4");
    writeFileSync(text, "not a video at all, just text");
    expect((await call("pinterest_prepare_video_upload", { filePath: text, confirm: true })).error).toContain("does not look like");
    const secret = join(dir, "id_rsa");
    writeFileSync(secret, bytes);
    expect((await call("pinterest_prepare_video_upload", { filePath: secret, confirm: true })).error).toContain(".mp4");
    expect(p.fetcher).not.toHaveBeenCalled();
  });

  it.each([[500_000_000, false], [500_000_001, true]])("enforces the 500 MB limit at exactly %i bytes", async (size, rejected) => {
    const p = provider();
    const original = p.fetcher.getMockImplementation()!;
    p.fetcher.mockImplementation(async (url: string, init?: RequestInit) => init?.method === "HEAD"
      ? new Response(null, { headers: { "content-type": "video/mp4", "content-length": String(size) } })
      : original(url, init));
    const result = await tools()("pinterest_prepare_video_upload", { sourceUrl: VIDEO_URL, confirm: true });
    expect(Boolean(result.isError)).toBe(rejected);
    expect(registrations(p.fetcher)).toHaveLength(rejected ? 0 : 1);
  });

  it("binds the receipt to its advertiser, its video and the allowlist", async () => {
    const p = provider();
    const call = tools();
    const prepared = await call("pinterest_prepare_video_upload", { filePath: videoPath, confirm: true });
    p.fetcher.mockClear();
    const other = join(dir, "other.mp4");
    writeFileSync(other, bytes);
    expect((await call("pinterest_upload_video", { filePath: other, uploadReceipt: prepared.result.uploadReceipt, confirm: true })).error).toContain("differs");
    expect((await call("pinterest_upload_video", { adAccountId: "999", filePath: videoPath, uploadReceipt: prepared.result.uploadReceipt, confirm: true })).isError).toBe(true);
    expect((await call("pinterest_prepare_video_upload", { adAccountId: "999", filePath: videoPath })).error).toContain("PINTEREST_AD_ACCOUNT_IDS");
    expect((await call("pinterest_get_video_upload", { uploadReceipt: "pinvid_" + "0".repeat(48) })).error).toContain("Unknown upload receipt");
    expect(p.fetcher).not.toHaveBeenCalled();
  });

  it("refuses a local file that changed after registration", async () => {
    provider();
    const call = tools();
    const changing = join(dir, "changing.mp4");
    writeFileSync(changing, bytes);
    const prepared = await call("pinterest_prepare_video_upload", { filePath: changing, confirm: true });
    utimesSync(changing, new Date(), new Date(Date.now() + 60_000));
    expect((await call("pinterest_upload_video", { filePath: changing, uploadReceipt: prepared.result.uploadReceipt, confirm: true })).error).toContain("changed");
  });

  it("still reads processing status after the receipt expires, never another upload", async () => {
    provider();
    const call = tools();
    const prepared = await call("pinterest_prepare_video_upload", { filePath: videoPath, confirm: true });
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 61 * 60_000);
    expect(await call("pinterest_get_video_upload", { uploadReceipt: prepared.result.uploadReceipt })).toMatchObject({ ready: true });
    expect((await call("pinterest_upload_video", { filePath: videoPath, uploadReceipt: prepared.result.uploadReceipt, confirm: true })).error).toContain("expired");
  });

  it("refuses an upload destination outside Amazon S3", async () => {
    const p = provider();
    const original = p.fetcher.getMockImplementation()!;
    p.fetcher.mockImplementation(async (url: string, init?: RequestInit) => url.endsWith("/media") && init?.method === "POST"
      ? Response.json({ media_id: "800", upload_url: "https://attacker.example/upload", upload_parameters: {} })
      : original(url, init));
    expect((await tools()("pinterest_prepare_video_upload", { filePath: videoPath, confirm: true })).error).toContain("unsupported upload destination");
  });

  it.each(["redirect", "truncated", "oversized"])("stops a %s source transfer without following another destination", async (failure) => {
    const p = provider();
    const call = tools();
    const prepared = await call("pinterest_prepare_video_upload", { sourceUrl: VIDEO_URL, confirm: true });
    const original = p.fetcher.getMockImplementation()!;
    p.fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (!url.startsWith(VIDEO_URL)) return original(url, init);
      if (failure === "redirect") {
        expect(init?.redirect).toBe("error");
        throw new TypeError("fetch failed: unexpected redirect");
      }
      return new Response(new Uint8Array(failure === "truncated" ? 12 : 25), { headers: { "content-type": "video/mp4", "content-length": "24" } });
    });
    const result = await call("pinterest_upload_video", { sourceUrl: VIDEO_URL, uploadReceipt: prepared.result.uploadReceipt, confirm: true });
    expect(result.isError).toBe(true);
    expect(p.fetcher.mock.calls.some(([url]) => String(url).includes("untrusted.example"))).toBe(false);
    expect(registrations(p.fetcher)).toHaveLength(1);
  });

  it("reports an S3 refusal as not stored and a network failure as an unknown outcome", async () => {
    const p = provider();
    const call = tools();
    const prepared = await call("pinterest_prepare_video_upload", { filePath: videoPath, confirm: true });
    const original = p.fetcher.getMockImplementation()!;
    p.fetcher.mockImplementation(async (url: string, init?: RequestInit) => url.startsWith(S3) ? new Response("denied", { status: 403 }) : original(url, init));
    expect((await call("pinterest_upload_video", { filePath: videoPath, uploadReceipt: prepared.result.uploadReceipt, confirm: true })).error).toContain("refused the upload with HTTP 403");
    p.fetcher.mockImplementation(async (url: string, init?: RequestInit) => { if (url.startsWith(S3)) throw new TypeError("socket hang up"); return original(url, init); });
    const unknown = await call("pinterest_upload_video", { filePath: videoPath, uploadReceipt: prepared.result.uploadReceipt, confirm: true });
    expect(unknown).toMatchObject({ isError: true, retrySafe: false });
    expect(unknown.error).toContain("outcome unknown");
  });
});
