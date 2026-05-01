/**
 * Google Cloud Vision OCR server-side proxy.
 *
 * Calls the Vision API TEXT_DETECTION endpoint and returns the full text
 * annotation plus per-block confidence data.
 *
 * Requires the GOOGLE_CLOUD_VISION_API_KEY environment variable.
 */

export interface GoogleOcrResult {
  /** Full extracted text */
  text: string;
  /** Per-block text with confidence */
  blocks: Array<{ text: string; confidence: number }>;
}

/**
 * Send a base-64 encoded image to Google Cloud Vision TEXT_DETECTION.
 * @param base64Image  The raw base-64 string (no data-url prefix).
 * @returns Extracted text and per-block confidence.
 */
export async function runGoogleVisionOcr(
  base64Image: string,
): Promise<GoogleOcrResult> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_CLOUD_VISION_API_KEY is not set. " +
        "Please set it in your environment variables.",
    );
  }

  const body = {
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: "TEXT_DETECTION", maxResults: 50 }],
      },
    ],
  };

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Vision API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const annotations = data.responses?.[0];

  if (annotations?.error) {
    throw new Error(
      `Google Vision API returned error: ${annotations.error.message}`,
    );
  }

  const fullText = annotations?.fullTextAnnotation?.text ?? "";

  // Extract per-block text with confidence from the full text annotation
  const blocks: Array<{ text: string; confidence: number }> = [];

  const pages = annotations?.fullTextAnnotation?.pages ?? [];
  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      const blockText = (block.paragraphs ?? [])
        .flatMap((p: any) =>
          (p.words ?? []).map((w: any) =>
            (w.symbols ?? []).map((s: any) => s.text).join(""),
          ),
        )
        .join(" ");
      blocks.push({
        text: blockText,
        confidence: block.confidence ?? 0,
      });
    }
  }

  return { text: fullText, blocks };
}
