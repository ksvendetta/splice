// Encoding a project into QR frames, and reassembling it on the scanning side.
//
// A QR code holds at most 2,953 bytes no matter how large it is drawn, which
// only covers very small projects — a 288-circuit project is ~8.9 KB even
// after deflate. Anything larger is split across frames that the sharing
// screen cycles through and the scanner collects until it has them all.
//
// Frame format (plain text, one QR each):
//   FSM1|<sessionId>|<index>|<total>|<enc>|<data>
// where <enc> is "d" for deflate-raw and "p" for uncompressed, and <data> is
// base64url. The header repeats on every frame so frames can arrive in any
// order, and <sessionId> keeps two different shares from being mixed.

export const FRAME_PREFIX = "FSM1";

// base64url characters per frame. Chosen well under the 2,953-byte ceiling:
// smaller frames mean a lower QR version with chunkier modules, which a phone
// camera locks onto far more reliably than a dense version-40 code.
//
// 600 is measured, not guessed. Rendering a frame and decoding it back with
// jsQR, 1200-byte frames failed outright at 460px and only decoded from a
// pixel-perfect render above ~5 px per module; 800-byte frames failed once the
// image was resampled the way a camera resolves part of a screen. At 600 bytes
// (81 modules at EC level M) every resampling step still decoded, which is the
// headroom a camera pointed at a monitor actually needs.
export const FRAME_PAYLOAD_LIMIT = 600;

export type TransferPayload = {
  mode: "fiber" | "copper";
  cables: unknown[];
  circuits: unknown[];
  spliceName: string | null;
};

export type ParsedFrame = {
  sessionId: string;
  index: number;
  total: number;
  encoding: "d" | "p";
  data: string;
};

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

/** Splits a project into the QR frames that represent it. Always >= 1 frame. */
export async function encodeFrames(payload: TransferPayload): Promise<string[]> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const { bytes, encoding } = await deflate(json);
  const text = toBase64Url(bytes);

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += FRAME_PAYLOAD_LIMIT) {
    chunks.push(text.slice(i, i + FRAME_PAYLOAD_LIMIT));
  }
  if (chunks.length === 0) chunks.push("");

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

  // The payload itself may contain no "|", but rejoin defensively.
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
    return JSON.parse(new TextDecoder().decode(raw)) as TransferPayload;
  }
}
