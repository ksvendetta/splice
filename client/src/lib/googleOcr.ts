/**
 * Client-side wrapper for the server OCR endpoint.
 *
 * Sends a base-64 data-URL image to POST /api/ocr which tries
 * Groq → Gemini → Google Cloud Vision on the server side.
 */

export interface OcrResult {
  /** All recognized text */
  text: string;
  /** Per-block results with confidence */
  blocks: Array<{ text: string; confidence: number }>;
  /** Which engine was used (e.g. "Groq (Llama Vision)", "Gemini Flash", "Google Cloud Vision") */
  engine?: string;
}

/**
 * Run server-side OCR on a base64 data-URL image.
 * Returns null if the request fails (caller should fall back to Tesseract).
 */
export async function runGoogleOcr(
  imageDataUrl: string,
): Promise<OcrResult | null> {
  try {
    const response = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageDataUrl }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn("Server OCR failed:", err.error || response.statusText);
      return null;
    }

    const data: OcrResult = await response.json();
    if (!data.text?.trim()) {
      return null;
    }

    return data;
  } catch (err) {
    console.warn("Server OCR request failed, will use Tesseract fallback:", err);
    return null;
  }
}
