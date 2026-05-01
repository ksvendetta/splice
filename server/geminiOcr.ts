/**
 * Gemini Vision OCR — uses Google's Gemini model to extract text from images.
 * Far more accurate than traditional OCR for messy/angled/low-contrast text.
 *
 * Requires GEMINI_API_KEY environment variable.
 */

export interface GeminiOcrResult {
  text: string;
  blocks: Array<{ text: string; confidence: number }>;
}

export async function runGeminiOcr(
  base64Image: string,
  mimeType: string = "image/jpeg",
): Promise<GeminiOcrResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const body = {
    contents: [
      {
        parts: [
          {
            text: `Extract ALL text from this image exactly as it appears.
Return ONLY the raw text content, one line per line of text in the image.
Do not add any commentary, labels, headers, or formatting.
Do not describe the image.
Do not add quotes around the text.
If there are circuit IDs, cable labels, or technical identifiers, preserve them exactly as written.
Preserve the exact spacing and line breaks as they appear in the image.`,
          },
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096,
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();

  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error("Gemini returned no candidates");
  }

  const text =
    candidate.content?.parts
      ?.map((p: any) => p.text)
      .filter(Boolean)
      .join("\n") ?? "";

  return {
    text: text.trim(),
    blocks: [{ text: text.trim(), confidence: 1.0 }],
  };
}
