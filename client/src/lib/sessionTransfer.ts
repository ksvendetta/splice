// Encoding a project into QR frames, and reassembling it on the scanning side.
//
// A QR code holds at most 2,953 bytes no matter how large it is drawn, so any
// real project spans several frames that the sharing screen cycles through and
// the scanner collects until it has them all.
//
// Two things decide whether this actually works against a phone camera:
//
//  1. How small the payload is. Ids are 41% of the raw JSON and, being random,
//     barely compress — so they are stripped for transport (see compact()).
//     Only the *relationships* travel; fresh ids are minted on arrival.
//  2. How dense each frame is. A frame near the byte ceiling encodes to a high
//     QR version whose modules are too fine to read off a screen. Frames are
//     kept small AND uniform: an earlier version chunked with a plain stride,
//     which left a short remainder frame that scanned easily while every full
//     frame failed — the phone would collect exactly one code.
//
// Frame format (plain text, one QR each):
//   FSM2|<sessionId>|<index>|<total>|<enc>|<data>
// <enc> is "d" for deflate-raw or "p" for uncompressed, <data> is base64url.
// The header repeats on every frame so frames can arrive in any order, and
// <sessionId> keeps two different shares from being mixed.

export const FRAME_PREFIX = "FSM2";

// Maximum base64url characters per frame. Deliberately well under the QR byte
// ceiling: at this size a frame encodes to roughly 57 modules, which stays
// readable off a monitor instead of only decoding from a perfect render.
export const FRAME_PAYLOAD_LIMIT = 300;

export type TransferPayload = {
  mode: "fiber" | "copper";
  cables: any[];
  circuits: any[];
  spliceName: string | null;
};

export type ParsedFrame = {
  sessionId: string;
  index: number;
  total: number;
  encoding: "d" | "p";
  data: string;
};

/* ── Compact wire form ──────────────────────────────────────────────────────
 * Cables and circuits become positional arrays referring to each other by
 * index, which drops both the ids and every repeated JSON key. Circuit ids are
 * not referenced by anything, so they are not sent at all.
 */

type CompactProject = {
  v: 2;
  m: 0 | 1; // 0 = fiber, 1 = copper
  s: string | null;
  c: Array<[string, number, number, 0 | 1, number, string | null]>;
  q: Array<[number, string, number, number, number, number, number, number | null, number | null]>;
};

function compact(payload: TransferPayload): CompactProject {
  const index = new Map<string, number>();
  payload.cables.forEach((cable, i) => index.set(cable.id, i));
  const idx = (id: unknown) => (typeof id === "string" && index.has(id) ? index.get(id)! : -1);

  return {
    v: 2,
    m: payload.mode === "copper" ? 1 : 0,
    s: payload.spliceName ?? null,
    c: payload.cables.map(cable => [
      cable.name,
      cable.fiberCount,
      cable.ribbonSize ?? 12,
      cable.type === "Feed" ? 0 : 1,
      idx(cable.parentCableId),
      cable.spliceName ?? null,
    ]),
    q: payload.circuits.map(circuit => [
      idx(circuit.cableId),
      circuit.circuitId,
      circuit.position,
      circuit.fiberStart,
      circuit.fiberEnd,
      circuit.isSpliced,
      idx(circuit.feedCableId),
      circuit.feedFiberStart ?? null,
      circuit.feedFiberEnd ?? null,
    ]),
  };
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function expand(data: CompactProject): TransferPayload {
  if (data?.v !== 2) throw new Error("This code was made by a different app version.");

  // Mint ids first so relationships can be rebuilt by index.
  const cableIds = data.c.map(() => newId());

  const cables = data.c.map(([name, fiberCount, ribbonSize, type, parent, spliceName], i) => ({
    id: cableIds[i],
    name,
    fiberCount,
    ribbonSize,
    type: type === 0 ? "Feed" : "Distribution",
    parentCableId: parent >= 0 ? cableIds[parent] : null,
    spliceName: spliceName ?? null,
  }));

  const circuits = data.q.map(
    ([cable, circuitId, position, fiberStart, fiberEnd, isSpliced, feed, feedStart, feedEnd]) => ({
      id: newId(),
      cableId: cable >= 0 ? cableIds[cable] : null,
      circuitId,
      position,
      fiberStart,
      fiberEnd,
      isSpliced,
      feedCableId: feed >= 0 ? cableIds[feed] : null,
      feedFiberStart: feedStart,
      feedFiberEnd: feedEnd,
    })
  );

  return { mode: data.m === 1 ? "copper" : "fiber", cables, circuits, spliceName: data.s ?? null };
}

/* ── Bytes and framing ──────────────────────────────────────────────────── */

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function runStream(bytes: Uint8Array, stream: ReadableWritablePair<Uint8Array, Uint8Array>) {
  const blob = new Blob([bytes as BlobPart]);
  const buffer = await new Response(blob.stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(buffer);
}

// CompressionStream is available in Chromium (so in the Android WebView) and
// current Firefox/Safari. Where it is missing we still work, just with more
// frames to scan.
async function deflate(bytes: Uint8Array): Promise<{ bytes: Uint8Array; encoding: "d" | "p" }> {
  if (typeof CompressionStream === "undefined") return { bytes, encoding: "p" };
  try {
    return { bytes: await runStream(bytes, new CompressionStream("deflate-raw")), encoding: "d" };
  } catch {
    return { bytes, encoding: "p" };
  }
}

async function inflate(bytes: Uint8Array, encoding: "d" | "p"): Promise<Uint8Array> {
  if (encoding === "p") return bytes;
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress the scanned project.");
  }
  return await runStream(bytes, new DecompressionStream("deflate-raw"));
}

function newSessionId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alikes
  let id = "";
  const random = new Uint8Array(6);
  crypto.getRandomValues(random);
  for (let i = 0; i < random.length; i += 1) id += alphabet[random[i] % alphabet.length];
  return id;
}

/**
 * Splits text into equal-length pieces, none longer than FRAME_PAYLOAD_LIMIT.
 * Equal length is the point: a stride-based split leaves a short final frame
 * that scans far more easily than the rest, which is misleading in use.
 */
function evenChunks(text: string): string[] {
  if (text.length === 0) return [""];
  const count = Math.ceil(text.length / FRAME_PAYLOAD_LIMIT);
  const size = Math.ceil(text.length / count);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

/** Splits a project into the QR frames that represent it. Always >= 1 frame. */
export async function encodeFrames(payload: TransferPayload): Promise<string[]> {
  const json = new TextEncoder().encode(JSON.stringify(compact(payload)));
  const { bytes, encoding } = await deflate(json);
  const chunks = evenChunks(toBase64Url(bytes));
  const sessionId = newSessionId();
  return chunks.map(
    (chunk, i) => `${FRAME_PREFIX}|${sessionId}|${i}|${chunks.length}|${encoding}|${chunk}`
  );
}

/** Reads one scanned frame. Returns null for anything that is not our format. */
export function parseFrame(text: string): ParsedFrame | null {
  const parts = text.split("|");
  if (parts.length < 6 || parts[0] !== FRAME_PREFIX) return null;

  const [, sessionId, rawIndex, rawTotal, encoding] = parts;
  const index = Number(rawIndex);
  const total = Number(rawTotal);
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1) return null;
  if (index < 0 || index >= total) return null;
  if (encoding !== "d" && encoding !== "p") return null;

  return { sessionId, index, total, encoding, data: parts.slice(5).join("|") };
}

/**
 * Collects frames as they are scanned. Frames can arrive in any order and
 * repeat freely, which is what happens when a phone watches a cycling screen.
 */
export class FrameCollector {
  private frames = new Map<number, string>();
  private sessionId: string | null = null;
  private total = 0;
  private encoding: "d" | "p" = "d";

  /** Adds a frame; returns true if it belonged to the set in progress. */
  add(frame: ParsedFrame): boolean {
    // A frame from a different share replaces what we had — the user has
    // clearly moved on to another project.
    if (this.sessionId !== frame.sessionId) {
      this.frames.clear();
      this.sessionId = frame.sessionId;
      this.total = frame.total;
      this.encoding = frame.encoding;
    }
    this.frames.set(frame.index, frame.data);
    return true;
  }

  get received(): number {
    return this.frames.size;
  }

  get expected(): number {
    return this.total;
  }

  get complete(): boolean {
    return this.total > 0 && this.frames.size === this.total;
  }

  /** Indexes still missing, for prompting the user to keep scanning. */
  get missing(): number[] {
    const gaps: number[] = [];
    for (let i = 0; i < this.total; i += 1) if (!this.frames.has(i)) gaps.push(i);
    return gaps;
  }

  reset(): void {
    this.frames.clear();
    this.sessionId = null;
    this.total = 0;
  }

  async decode(): Promise<TransferPayload> {
    if (!this.complete) throw new Error("Not all frames have been scanned yet.");
    let text = "";
    for (let i = 0; i < this.total; i += 1) text += this.frames.get(i) ?? "";
    const raw = await inflate(fromBase64Url(text), this.encoding);
    return expand(JSON.parse(new TextDecoder().decode(raw)) as CompactProject);
  }
}
