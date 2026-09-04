export type AiFlashcardDraft = {
  id: string;
  question: string;
  answer: string;
  sourcePage: number | null;
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
const maxGeneratedCards = 16;

export function hasGeminiConfig() {
  return Boolean(geminiApiKey);
}

export async function generateFlashcardsFromPdf({
  pdfBuffer,
  fileName,
  mode,
}: {
  pdfBuffer: Buffer;
  fileName: string;
  mode: string;
}) {
  if (!geminiApiKey) {
    throw new Error("Gemini is not configured.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: buildPrompt(fileName, mode) },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: pdfBuffer.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    },
  );
  const data = (await response.json()) as GeminiGenerateResponse;

  if (!response.ok) {
    throw new Error(data.error?.message ?? "Gemini could not read this PDF.");
  }

  return parseGeminiDraftCards(data);
}

function buildPrompt(fileName: string, mode: string) {
  const sourceDescription =
    mode === "handwritten"
      ? "handwritten notes"
      : "typed notes";

  return `
You are helping create high-quality study flashcards from a student PDF named "${fileName}".
The source is ${sourceDescription}. Read the PDF carefully, including handwriting if present.

Return only valid JSON with this shape:
{
  "cards": [
    {
      "question": "A clear, atomic study question",
      "answer": "A short grounded answer",
      "sourcePage": 1
    }
  ]
}

Rules:
- Create at most ${maxGeneratedCards} cards.
- Use only facts visible in the PDF.
- Prefer definitions, concept explanations, formula meanings, compare/contrast points, and common confusions.
- Make each card atomic: one idea per question.
- Keep answers concise but useful.
- Do not create broad cards like "Explain page 5".
- If handwriting is unclear, skip that fact or include "[unclear]" only when the surrounding card is still useful.
- If the PDF does not contain enough readable study material, return {"cards":[]}.
`.trim();
}

function parseGeminiDraftCards(data: GeminiGenerateResponse) {
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini did not return draft cards.");
  }

  const parsed = JSON.parse(stripJsonFence(text)) as {
    cards?: unknown;
  };

  if (!Array.isArray(parsed.cards)) {
    throw new Error("Gemini returned an unexpected card format.");
  }

  return parsed.cards
    .map((card, index) => normalizeDraftCard(card, index))
    .filter((card): card is AiFlashcardDraft => Boolean(card))
    .slice(0, maxGeneratedCards);
}

function normalizeDraftCard(card: unknown, index: number) {
  if (!card || typeof card !== "object") {
    return null;
  }

  const maybeCard = card as {
    question?: unknown;
    answer?: unknown;
    sourcePage?: unknown;
  };
  const question =
    typeof maybeCard.question === "string"
      ? capitalizeFirstLetter(maybeCard.question.trim())
      : "";
  const answer =
    typeof maybeCard.answer === "string"
      ? capitalizeFirstLetter(maybeCard.answer.trim())
      : "";
  const sourcePage =
    typeof maybeCard.sourcePage === "number" && Number.isFinite(maybeCard.sourcePage)
      ? Math.max(1, Math.floor(maybeCard.sourcePage))
      : null;

  if (!question || !answer) {
    return null;
  }

  return {
    id: `draft-${index + 1}`,
    question,
    answer,
    sourcePage,
  };
}

function stripJsonFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function capitalizeFirstLetter(value: string) {
  return value.replace(/^(\s*)([a-z])/, (_match, prefix: string, letter: string) =>
    `${prefix}${letter.toUpperCase()}`,
  );
}
