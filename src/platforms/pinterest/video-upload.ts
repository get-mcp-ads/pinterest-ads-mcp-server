/**
 * pinterest-ads-mcp-server: an open-source MCP server for the Pinterest Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * Native Pinterest video upload in three steps, as in the getmcpads gateway:
 * register the media (POST /media), send the bytes to the destination that
 * response names, then read the processing status. The video comes from a
 * local file or from an HTTPS URL that passes the report URL checks. Nothing
 * is stored outside this process: the upload receipt lives in memory.
 */
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import type { PinterestConfig } from "../../config.js";
import type { ToolShape } from "../../tool-quality.js";
import { assertPinterestUploadDestination } from "../../core/hosts.js";
import { refuseRedirect } from "../../core/redirects.js";
import { PinterestClient, assertSafeReportUrl } from "./client.js";

type Row = Record<string, any>;
type Collector = { tool(name: string, description: string, shape: ToolShape, handler: (args: Row) => Promise<unknown>): void };

/** Same ceiling as the gateway: 500 MB (500,000,000 bytes). */
export const MAX_VIDEO_BYTES = 500_000_000;
const RECEIPT_TTL_MS = 60 * 60_000;
const MAX_RECEIPTS = 100;
const SOURCE_CHECK_TIMEOUT_MS = 20_000;
const MIME_BY_EXTENSION: Record<string, "video/mp4" | "video/quicktime"> = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime" };
const VIDEO_MIME = new Set(["video/mp4", "video/quicktime"]);
/** ISO base media files (MP4, MOV) start with one of these boxes at byte 4. */
const VIDEO_BOXES = new Set(["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"]);

type Source =
  | { kind: "file"; path: string; size: number; mime: string; mtimeMs: number; ino: number; dev: number }
  | { kind: "url"; url: string; size: number; mime: string };
type Receipt = {
  adAccountId: string;
  environment: string;
  source: Source;
  mediaId: string;
  url: string;
  parameters: Record<string, string>;
  expires: number;
};

/** Receipts per server configuration. They never leave this process. */
const receiptStores = new WeakMap<object, Map<string, Receipt>>();
function receiptStore(config: PinterestConfig): Map<string, Receipt> {
  let store = receiptStores.get(config);
  if (!store) receiptStores.set(config, (store = new Map()));
  return store;
}

const account = { adAccountId: z.string().regex(/^\d+$/, "Pinterest IDs are numeric, without act_ prefixes.").describe("Selected Pinterest advertiser account. All requests use this account context.") };
const receipt = { uploadReceipt: z.string().regex(/^pinvid_[a-f0-9]{48}$/, "Use the uploadReceipt returned by pinterest_prepare_video_upload.").describe("Opaque receipt from pinterest_prepare_video_upload, bound to this advertiser and this video. It is kept in this server's memory and is lost when the server restarts.") };
const source = {
  filePath: z.string().min(1).max(4096).optional().describe("Absolute path of a local MP4 or MOV video file. Provide filePath or sourceUrl, not both."),
  sourceUrl: z.string().url().max(4096).optional().describe("HTTPS URL of an MP4 or MOV video. Private, loopback and link-local addresses are refused, no redirect is followed and no credential is sent. Provide filePath or sourceUrl, not both."),
};
const confirm = { confirm: z.boolean().optional().describe("Preview by default; true performs this step.") };
const output = (value: unknown, isError = false) => ({ ...(isError ? { isError: true } : {}), content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

function chosenSource(a: Row): { filePath?: string; sourceUrl?: string } {
  if (Boolean(a.filePath) === Boolean(a.sourceUrl)) throw new Error("Provide exactly one of filePath or sourceUrl.");
  if (a.filePath && !isAbsolute(a.filePath)) throw new Error("filePath must be an absolute path.");
  if (a.sourceUrl) assertSafeReportUrl(a.sourceUrl, "Video URL");
  return a.filePath ? { filePath: resolve(a.filePath) } : { sourceUrl: new URL(a.sourceUrl).href };
}

function checkSize(size: number): void {
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error("The video is empty or its size is unknown.");
  if (size > MAX_VIDEO_BYTES) throw new Error("The video exceeds 500 MB (500,000,000 bytes).");
}

async function inspectFile(path: string): Promise<Source> {
  const mime = MIME_BY_EXTENSION[extname(path).toLowerCase()];
  if (!mime) throw new Error("Only .mp4, .m4v and .mov video files are accepted.");
  const info = await stat(path).catch(() => { throw new Error("The video file cannot be read."); });
  if (!info.isFile()) throw new Error("filePath must name a regular file.");
  checkSize(info.size);
  const handle = await open(path, "r");
  try {
    const head = Buffer.alloc(12);
    await handle.read(head, 0, 12, 0);
    if (!VIDEO_BOXES.has(head.subarray(4, 8).toString("latin1"))) throw new Error("The file does not look like an MP4 or MOV video.");
  } finally {
    await handle.close();
  }
  return { kind: "file", path, size: info.size, mime, mtimeMs: info.mtimeMs, ino: info.ino, dev: info.dev };
}

async function inspectUrl(url: string): Promise<Source> {
  assertSafeReportUrl(url, "Video URL");
  const head = await fetch(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(SOURCE_CHECK_TIMEOUT_MS) });
  refuseRedirect(head, "Video URL");
  await head.body?.cancel().catch(() => undefined);
  const size = Number(head.headers.get("content-length"));
  const mime = head.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!head.ok) throw new Error(`The video URL answered HTTP ${head.status}.`);
  if (!VIDEO_MIME.has(mime)) throw new Error("The video URL must serve video/mp4 or video/quicktime.");
  checkSize(size);
  return { kind: "url", url, size, mime };
}

function sameSource(saved: Source, given: { filePath?: string; sourceUrl?: string }): boolean {
  return saved.kind === "file" ? saved.path === given.filePath : saved.url === given.sourceUrl;
}

/** Open the registered video again, refusing it when it changed since registration. */
async function openSource(saved: Source, timeoutMs: number): Promise<ReadableStream<Uint8Array>> {
  if (saved.kind === "file") {
    const now = await stat(saved.path).catch(() => undefined);
    if (!now || now.size !== saved.size || now.mtimeMs !== saved.mtimeMs || now.ino !== saved.ino || now.dev !== saved.dev) {
      throw new Error("The video file changed after registration. Prepare a new upload for it.");
    }
    return Readable.toWeb(createReadStream(saved.path)) as ReadableStream<Uint8Array>;
  }
  assertSafeReportUrl(saved.url, "Video URL");
  const input = await fetch(saved.url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  refuseRedirect(input, "Video URL");
  const mime = input.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!input.ok || !input.body || Number(input.headers.get("content-length")) !== saved.size || mime !== saved.mime) {
    await input.body?.cancel().catch(() => undefined);
    throw new Error("The video at this URL no longer matches the registered size and type. Prepare a new upload for it.");
  }
  return input.body;
}

/** A bounded multipart stream: the video is never buffered and must match the registered length. */
function multipart(parameters: Record<string, string>, video: ReadableStream<Uint8Array>, size: number, mime: string) {
  const boundary = "getmcpads-" + randomUUID();
  const encoder = new TextEncoder();
  const prefix = encoder.encode(Object.entries(parameters).map(([key, value]) => {
    if (!/^[\w.-]+$/.test(key) || key === "file" || typeof value !== "string" || value.length > 16000) throw new Error("Invalid native upload parameters.");
    return `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
  }).join("") + `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="creative.${mime === "video/mp4" ? "mp4" : "mov"}"\r\nContent-Type: ${mime}\r\n\r\n`);
  const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
  const reader = video.getReader();
  let stage = 0, count = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (stage === 0) { controller.enqueue(prefix); stage = 1; return; }
        const next = await reader.read();
        if (next.done) {
          if (count !== size) throw new Error("The video length changed during upload.");
          controller.enqueue(suffix); controller.close(); reader.releaseLock(); return;
        }
        count += next.value.byteLength;
        if (count > size || count > MAX_VIDEO_BYTES) throw new Error("The video exceeds its registered size.");
        controller.enqueue(next.value);
      } catch (error) {
        await reader.cancel().catch(() => undefined);
        controller.error(error);
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return { body, boundary, length: prefix.byteLength + size + suffix.byteLength };
}

function describeSource(saved: Source) {
  return saved.kind === "file"
    ? { filePath: saved.path, byteLength: saved.size, mimeType: saved.mime }
    : { sourceUrl: saved.url, byteLength: saved.size, mimeType: saved.mime };
}

export function registerPinterestVideoUploads(c: Collector, config: PinterestConfig, readOnly: boolean): void {
  const api = new PinterestClient(config);
  const receipts = receiptStore(config);
  const environment = config.environment ?? "production";
  const register = (name: string, description: string, shape: ToolShape, execute: (a: Row) => Promise<unknown>) => {
    const schema = z.object(shape).strict();
    c.tool(name, description, schema.shape, async (raw) => {
      try { return output(await execute(schema.parse(raw))); }
      catch (error) { return output({ applied: false, error: (error as Error).message, retrySafe: false }, true); }
    });
  };
  const readReceipt = (value: string, adAccountId: string, allowExpired = false): Receipt => {
    const saved = receipts.get(value);
    if (!saved) throw new Error("Unknown upload receipt. Receipts are kept in memory and are lost when the server restarts; read the media with pinterest_get_platform_resources instead.");
    if (saved.adAccountId !== adAccountId || saved.environment !== environment) throw new Error("This upload receipt belongs to another advertiser or environment.");
    if (!allowExpired && saved.expires <= Date.now()) throw new Error("This upload receipt expired. Prepare a new upload.");
    assertPinterestUploadDestination(saved.url);
    return saved;
  };

  if (readOnly) {
    register("pinterest_get_video_upload", "Read processing status for this advertiser-bound uploaded video. Only ready:true permits video Pin creation; registration or HTTP 204 is insufficient.", { ...account, ...receipt }, async (a) => {
      const saved = readReceipt(a.uploadReceipt, a.adAccountId, true);
      await api.getAdAccount(a.adAccountId);
      const media = await api.getResource(`/media/${saved.mediaId}`, {}) as Row;
      if (String(media.media_id) !== saved.mediaId) throw new Error("Pinterest returned another media ID.");
      return { mediaId: saved.mediaId, status: media.status, ready: media.status === "succeeded", failed: media.status === "failed" };
    });
    return;
  }

  register("pinterest_prepare_video_upload", "Register a native Pinterest video upload for a local file or an HTTPS URL and keep its opaque receipt in memory before transferring bytes. Does not create a Pin or ad. Preview, confirm, upload, then check processing.", { ...account, ...source, ...confirm }, async (a) => {
    const given = chosenSource(a);
    api.assertAllowedRequest(`/ad_accounts/${a.adAccountId}`);
    // A local file is inspected during the preview; a URL is only contacted once confirmed.
    const local = given.filePath ? await inspectFile(given.filePath) : undefined;
    if (!a.confirm) {
      return {
        applied: false, action: "pinterest_prepare_video_upload", environment, adAccountId: a.adAccountId,
        source: local ? describeSource(local) : { sourceUrl: given.sourceUrl },
        validation: { local: true, pinterest: false },
        message: "Preview only, nothing was registered. Repeat the same call with confirm: true to register this video upload with Pinterest.",
      };
    }
    const inspected = local ?? await inspectUrl(given.sourceUrl!);
    await api.getAdAccount(a.adAccountId);
    const media = await api.mutate("/media", "POST", { media_type: "video" }) as Row;
    if (!/^\d+$/.test(String(media.media_id ?? "")) || !media.upload_parameters || typeof media.upload_parameters !== "object") {
      throw new Error("Pinterest media registration outcome unknown; inspect before registering again.");
    }
    const url = assertPinterestUploadDestination(media.upload_url);
    const parameters = Object.fromEntries(Object.entries(media.upload_parameters as Row).map(([key, value]) => [key, String(value)]));
    for (const [key, value] of receipts) if (value.expires + RECEIPT_TTL_MS <= Date.now()) receipts.delete(key);
    while (receipts.size >= MAX_RECEIPTS) receipts.delete(receipts.keys().next().value!);
    const expires = Date.now() + RECEIPT_TTL_MS;
    const uploadReceipt = "pinvid_" + randomBytes(24).toString("hex");
    receipts.set(uploadReceipt, { adAccountId: a.adAccountId, environment, source: inspected, mediaId: String(media.media_id), url, parameters, expires });
    return {
      applied: true, result: { mediaId: String(media.media_id), uploadReceipt }, source: describeSource(inspected),
      expiresAt: new Date(expires).toISOString(), ready: false,
      next: "Call pinterest_upload_video with the same source and this uploadReceipt.",
    };
  });

  register("pinterest_upload_video", "Stream the registered video to the native destination saved in uploadReceipt. No bearer credential is sent to storage. Does not register another media or activate advertising. Follow with pinterest_get_video_upload.", { ...account, ...source, ...receipt, ...confirm }, async (a) => {
    const given = chosenSource(a);
    const saved = readReceipt(a.uploadReceipt, a.adAccountId);
    if (!sameSource(saved.source, given)) throw new Error("Upload source differs from the registered video.");
    if (!a.confirm) {
      return {
        applied: false, action: "pinterest_upload_video", environment, adAccountId: a.adAccountId, mediaId: saved.mediaId,
        source: describeSource(saved.source), validation: { local: true, pinterest: false },
        message: "Preview only, nothing was sent. Repeat the same call with confirm: true to transfer this video.",
      };
    }
    await api.getAdAccount(a.adAccountId);
    // At least 500 KB/s, and never less than two minutes.
    const timeoutMs = Math.max(120_000, Math.ceil(saved.source.size / 500_000) * 1000);
    const video = await openSource(saved.source, timeoutMs);
    const form = multipart(saved.parameters, video, saved.source.size, saved.source.mime);
    let response: Response;
    try {
      response = await fetch(assertPinterestUploadDestination(saved.url), {
        method: "POST", redirect: "error", body: form.body, duplex: "half", signal: AbortSignal.timeout(timeoutMs),
        headers: { "content-type": `multipart/form-data; boundary=${form.boundary}`, "content-length": String(form.length) },
      } as RequestInit);
      await response.body?.cancel().catch(() => undefined);
    } catch {
      throw new Error("Pinterest video transfer outcome unknown. Check the media with pinterest_get_video_upload; do not register another video automatically.");
    }
    if (response.status >= 400 && response.status < 500) {
      throw new Error(`Pinterest storage refused the upload with HTTP ${response.status}. Check the media with pinterest_get_video_upload before preparing a new upload.`);
    }
    if (!response.ok) {
      throw new Error(`Pinterest video transfer outcome unknown after HTTP ${response.status}. Check the media with pinterest_get_video_upload; do not register another video automatically.`);
    }
    return { applied: true, result: { mediaId: saved.mediaId, byteLength: saved.source.size }, ready: false, next: "Call pinterest_get_video_upload until ready is true before creating a video Pin." };
  });
}
