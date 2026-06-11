import type { OpenUrl, ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";

export const browserControlSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["go_to", "search", "get_url"] },
    url: { type: "string" },
    query: { type: "string" },
    engine: { type: "string", enum: ["google", "bing", "duckduckgo"] },
  },
};

const searchEngines: Record<string, string> = {
  google: "https://www.google.com/search?q=",
  bing: "https://www.bing.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
};

export function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return "about:blank";
  if (url.includes("://") || url === "about:blank") return url;
  if (!url.includes(".")) url = `${url}.com`;
  return `https://${url}`;
}

export function createBrowserControl(deps: { open: OpenUrl }) {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const action = String(args.action ?? "go_to").trim().toLowerCase();
    try {
      if (action === "search") {
        const query = String(args.query ?? "").trim();
        if (!query) return failure("MISSING_QUERY", "Provide query for browser search.");
        const engine = String(args.engine ?? "google").toLowerCase();
        const url = `${searchEngines[engine] ?? searchEngines.google}${encodeURIComponent(query)}`;
        await deps.open(url);
        return success({ action, query, engine, url, opened: true });
      }
      if (action === "get_url") {
        return failure("DOM_UNSUPPORTED", "Current browser URL requires DOM/session automation and was intentionally not ported.");
      }
      const url = normalizeUrl(String(args.url ?? args.query ?? ""));
      await deps.open(url);
      return success({ action: "go_to", url, opened: true });
    } catch (error) {
      return failure("OPEN_URL_FAILED", "Could not open browser URL.", errorMessage(error));
    }
  };
}
