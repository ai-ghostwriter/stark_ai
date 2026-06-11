import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { FetchText, OpenUrl, ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";

export const youtubeVideoSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["play", "get_info", "trending", "summarize"] },
    query: { type: "string" },
    url: { type: "string" },
    region: { type: "string" },
    save: { type: "boolean" },
  },
};

const videoFilter = "EgIQAQ%3D%3D";

export function extractYoutubeVideoId(url: string): string | null {
  return /(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/.exec(url)?.[1] ?? null;
}

function firstVideoUrl(html: string): string | null {
  const seen = new Set<string>();
  for (const match of html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)) {
    const id = match[1]!;
    if (seen.has(id) || html.includes(`/shorts/${id}`)) continue;
    seen.add(id);
    return `https://www.youtube.com/watch?v=${id}`;
  }
  return null;
}

function videoInfo(html: string) {
  const title = /"title":\{"runs":\[\{"text":"([^"]+)"/.exec(html)?.[1];
  const channel = /"ownerChannelName":"([^"]+)"/.exec(html)?.[1];
  const viewsRaw = /"viewCount":"(\d+)"/.exec(html)?.[1];
  const durationRaw = /"lengthSeconds":"(\d+)"/.exec(html)?.[1];
  return {
    title,
    channel,
    views: viewsRaw ? Number(viewsRaw).toLocaleString("en-US") : undefined,
    duration: durationRaw ? `${Math.floor(Number(durationRaw) / 60)}:${String(Number(durationRaw) % 60).padStart(2, "0")}` : undefined,
  };
}

export function createYoutubeVideo(deps: { open: OpenUrl; fetchText: FetchText }) {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const action = String(args.action ?? "play").toLowerCase();
    try {
      if (action === "play") {
        const query = String(args.query ?? "").trim();
        if (!query) return failure("MISSING_QUERY", "Tell me what to play.");
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${videoFilter}`;
        const html = await deps.fetchText(searchUrl).catch(() => "");
        const target = firstVideoUrl(html) ?? searchUrl;
        await deps.open(target);
        return success({ action, query, url: target, opened: true, manualSelectionRequired: target === searchUrl });
      }
      if (action === "get_info") {
        const url = String(args.url ?? "").trim();
        const id = extractYoutubeVideoId(url);
        if (!id) return failure("INVALID_URL", "Provide a valid YouTube URL.");
        const html = await deps.fetchText(`https://www.youtube.com/watch?v=${id}`);
        return success({ action, videoId: id, url, info: videoInfo(html) });
      }
      if (action === "trending") {
        const region = String(args.region ?? "US").toUpperCase();
        const html = await deps.fetchText(`https://www.youtube.com/feed/trending?gl=${encodeURIComponent(region)}`);
        const titles = [...html.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)"/g)].slice(0, 8).map((m, i) => ({ rank: i + 1, title: m[1] }));
        return success({ action, region, results: titles });
      }
      if (action === "summarize") {
        const path = join(homedir(), "Desktop", `youtube_summary_${Date.now()}.txt`);
        await writeFile(path, "YouTube transcript summarization belongs to the brain, not the tool.\n", "utf8");
        return failure("LLM_ACTION_UNSUPPORTED", "YouTube summarization requires LLM reasoning and was not ported.", { savedNote: path });
      }
      return failure("UNKNOWN_ACTION", `Unknown YouTube action: ${action}`);
    } catch (error) {
      return failure("YOUTUBE_FAILED", "YouTube action failed.", errorMessage(error));
    }
  };
}
