import { NextResponse } from "next/server";
import { hasIgdbConfig, searchIgdbGames } from "@/lib/igdb/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json(
      { error: "Search query is required." },
      { status: 400 },
    );
  }

  if (!hasIgdbConfig()) {
    return NextResponse.json(
      {
        error:
          "IGDB is not configured. Add IGDB_CLIENT_ID and IGDB_CLIENT_SECRET.",
      },
      { status: 503 },
    );
  }

  try {
    const results = await searchIgdbGames(query);

    return NextResponse.json({ results });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "IGDB search failed.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
