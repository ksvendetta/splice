/**
 * Groq Vision OCR — uses Llama vision model via Groq's free API.
 * Fast and accurate text extraction from images.
 *
 * Requires GROQ_API_KEY environment variable.
 */

export interface GroqOcrResult {
  text: string;
  blocks: Array<{ text: string; confidence: number }>;
}

export async function runGroqOcr(
  base64Image: string,
  mimeType: string = "image/jpeg",
): Promise<GroqOcrResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set.");
  }

  const body = {
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract ALL text from this image exactly as it appears.
Return ONLY the raw text content, one line per line of text in the image.
Do not add any commentary, labels, headers, or formatting.
Do not describe the image.
Do not add quotes around the text.
If there are circuit IDs, cable labels, or technical identifiers, preserve them exactly as written.
Preserve the exact spacing and line breaks as they appear in the image.`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 4096,
  };

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";

  return {
    text,
    blocks: [{ text, confidence: 1.0 }],
  };
}
