import { NextResponse } from "next/server";
import {
  createRequestSupabaseClient,
  getBearerToken,
  hasServerSupabaseConfig,
} from "@/lib/supabase/server";
import {
  generateFlashcardsFromPdf,
  hasGeminiConfig,
} from "@/lib/flashcards/gemini";

const maxPdfSizeBytes = 8 * 1024 * 1024;
const allowedModes = new Set(["handwritten", "typed"]);

export const runtime = "nodejs";

class RouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function POST(request: Request) {
  if (!hasServerSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }

  const supabase = createRequestSupabaseClient(accessToken);

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const mode = formData.get("mode");
    const setId = formData.get("setId");

    if (!(file instanceof File)) {
      throw new RouteError("Upload a PDF file.", 400);
    }

    if (file.type !== "application/pdf") {
      throw new RouteError("Only PDF uploads are supported.", 400);
    }

    if (file.size > maxPdfSizeBytes) {
      throw new RouteError(
        "PDF uploads are limited to 8 MB for this first pass.",
        400,
      );
    }

    if (typeof mode !== "string" || !allowedModes.has(mode)) {
      throw new RouteError("Choose a valid source type.", 400);
    }

    if (typeof setId !== "string" || !setId.trim()) {
      throw new RouteError("Choose a card set first.", 400);
    }

    const { data: setRow, error: setError } = await supabase
      .from("flashcard_sets")
      .select("id")
      .eq("id", setId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (setError || !setRow) {
      throw new RouteError("Choose one of your card sets.", 400);
    }

    const pdfBuffer = Buffer.from(await file.arrayBuffer());

    if (!hasGeminiConfig()) {
      return NextResponse.json(
        {
          error:
            "Gemini is not configured on the Next.js server. Add GEMINI_API_KEY to frontend/.env.local and restart the dev server.",
        },
        { status: 503 },
      );
    }

    const draftCards = await generateFlashcardsFromPdf({
      pdfBuffer,
      fileName: file.name,
      mode,
    });

    if (draftCards.length === 0) {
      return NextResponse.json(
        {
          error:
            "Gemini could not find enough readable study material to make flashcards.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      draftCards,
      extraction: {
        status: "llm_generated",
        pageCount: null,
        characterCount: null,
      },
      message: `${draftCards.length} draft card${draftCards.length === 1 ? "" : "s"} generated from the PDF. Review and edit before importing.`,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not generate flashcards.";
    const status = error instanceof RouteError ? error.status : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
