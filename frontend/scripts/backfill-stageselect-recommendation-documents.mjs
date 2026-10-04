import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { getRecommendationDocumentFields } from "../lib/stageselect/recommendations/semantic.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const shouldWrite = process.argv.includes("--write");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.",
  );
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pageSize = 250;
let offset = 0;
let scanned = 0;
let changed = 0;

while (true) {
  const { data, error } = await supabase
    .from("stageselect_games")
    .select(
      "id, title, summary, release_date, platforms, genres, themes, keywords, game_modes, player_perspectives, recommendation_document, recommendation_document_hash",
    )
    .order("id")
    .range(offset, offset + pageSize - 1);

  if (error) {
    throw new Error(error.message);
  }

  const games = data ?? [];

  for (const game of games) {
    scanned += 1;
    const fields = await getRecommendationDocumentFields({
      title: game.title,
      summary: game.summary,
      releaseYear: game.release_date
        ? Number(game.release_date.slice(0, 4))
        : null,
      platforms: stringArray(game.platforms),
      genres: stringArray(game.genres),
      themes: stringArray(game.themes),
      keywords: stringArray(game.keywords),
      gameModes: stringArray(game.game_modes),
      playerPerspectives: stringArray(game.player_perspectives),
    });

    if (
      game.recommendation_document === fields.recommendation_document &&
      game.recommendation_document_hash ===
        fields.recommendation_document_hash
    ) {
      continue;
    }

    changed += 1;

    if (shouldWrite) {
      const { error: updateError } = await supabase
        .from("stageselect_games")
        .update(fields)
        .eq("id", game.id);

      if (updateError) {
        throw new Error(`Could not update ${game.id}: ${updateError.message}`);
      }
    }
  }

  if (games.length < pageSize) {
    break;
  }

  offset += pageSize;
}

console.log(
  `${shouldWrite ? "Updated" : "Would update"} ${changed} of ${scanned} cached games.`,
);

if (!shouldWrite && changed > 0) {
  console.log("Run again with --write after reviewing the dry-run count.");
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}
