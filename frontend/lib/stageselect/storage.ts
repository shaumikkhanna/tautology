import type { SupabaseClient } from "@supabase/supabase-js";

const bucketName =
  process.env.STAGESELECT_STORAGE_BUCKET ?? "stageselect-game-images";
const maxCoverBytes = 4 * 1024 * 1024;

type CachedCover = {
  coverUrl: string;
  coverStoragePath: string;
};

export async function cacheStageSelectCover(
  supabase: SupabaseClient | null,
  input: {
    coverUrl?: string;
    igdbId: number;
  },
): Promise<CachedCover | null> {
  if (!supabase || !input.coverUrl) {
    return null;
  }

  try {
    const response = await fetch(input.coverUrl, { cache: "no-store" });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";

    if (!contentType.startsWith("image/")) {
      return null;
    }

    const contentLength = response.headers.get("content-length");

    if (contentLength && Number(contentLength) > maxCoverBytes) {
      return null;
    }

    const bytes = await response.arrayBuffer();

    if (bytes.byteLength > maxCoverBytes) {
      return null;
    }

    const extension = getImageExtension(contentType);
    const coverStoragePath = `covers/igdb-${input.igdbId}.${extension}`;
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(coverStoragePath, bytes, {
        contentType,
        upsert: true,
      });

    if (error) {
      return null;
    }

    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(coverStoragePath);

    return {
      coverUrl: data.publicUrl,
      coverStoragePath,
    };
  } catch {
    return null;
  }
}

function getImageExtension(contentType: string) {
  if (contentType.includes("png")) {
    return "png";
  }

  if (contentType.includes("webp")) {
    return "webp";
  }

  return "jpg";
}
