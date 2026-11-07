export type VideoProvider = "youtube" | "bunny" | "vimeo" | "r2";

export interface ParsedVideo {
  provider: VideoProvider;
  id: string;
  url: string;
  thumbnail?: string;
}

export function parseVideoUrl(
  provider: VideoProvider,
  raw: string,
): ParsedVideo | { error: string } {
  const url = raw.trim();
  if (!url) return { error: "أدخل رابط الفيديو" };

  // R2 recordings store an object key, not a URL; it is never validated or
  // rewritten here (playback URLs are minted server-side).
  if (provider === "r2") {
    return { provider: "r2", id: url, url };
  }

  if (provider === "youtube") {
    // youtube.com/watch?v=, youtu.be/, youtube.com/shorts/
    const patterns = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?[^#]*v=([A-Za-z0-9_-]{11})/,
      /(?:https?:\/\/)?youtu\.be\/([A-Za-z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) {
        return {
          provider,
          id: m[1],
          url,
          thumbnail: `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`,
        };
      }
    }
    return { error: "رابط يوتيوب غير صالح" };
  }

  if (provider === "bunny") {
    const m = url.match(
      /^https:\/\/iframe\.mediadelivery\.net\/embed\/(\d+)\/([A-Za-z0-9-]+)(?:[/?#].*)?$/,
    );
    if (m) {
      return { provider, id: `${m[1]}/${m[2]}`, url };
    }
    return {
      error: "الرابط يجب أن يكون بصيغة https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}",
    };
  }

  if (provider === "vimeo") {
    const m = url.match(/^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)(?:[/?#].*)?$/);
    if (m) {
      return { provider, id: m[1], url };
    }
    return { error: "الرابط يجب أن يكون بصيغة vimeo.com/{videoId}" };
  }

  return { error: "مزود غير مدعوم" };
}
