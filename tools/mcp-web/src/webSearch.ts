import type { FetchText, ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";

export const webSearchSchema = {
  type: "object",
  properties: {
    query: { type: "string" },
    mode: { type: "string", enum: ["search", "compare"] },
    items: { type: "array", items: { type: "string" } },
    aspect: { type: "string" },
    maxResults: { type: "number" },
  },
};

export type SearchResult = { title: string; snippet: string; url: string };

function decodeHtml(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseDdg(html: string, maxResults: number): SearchResult[] {
  const links = [...html.matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const snippets = [...html.matchAll(/<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)];
  return links.slice(0, maxResults).map((match, index) => ({
    title: decodeHtml(match[2] ?? ""),
    url: decodeHtml(match[1] ?? ""),
    snippet: decodeHtml(snippets[index]?.[1] ?? ""),
  })).filter((r) => r.title || r.url);
}

export function formatSearchSummary(query: string, results: SearchResult[]): string {
  if (results.length === 0) return `No search results for ${query}.`;
  return results.slice(0, 3).map((r, i) => `${i + 1}. ${r.title}${r.snippet ? `: ${r.snippet}` : ""}`).join(" ");
}

export function createWebSearch(deps: { fetchText: FetchText }) {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const items = Array.isArray(args.items) ? args.items.map(String).filter(Boolean) : [];
    const mode = items.length > 0 ? "compare" : String(args.mode ?? "search").toLowerCase();
    const query = String(args.query ?? "").trim();
    const maxResults = Math.max(1, Math.min(10, Number(args.maxResults ?? 6)));
    if (!query && items.length === 0) return failure("MISSING_QUERY", "Provide query or items.");
    try {
      const effectiveQuery = mode === "compare" ? `${items.join(" vs ")} ${String(args.aspect ?? "general")}` : query;
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(effectiveQuery)}`;
      const html = await deps.fetchText(url);
      const results = parseDdg(html, maxResults);
      return success({ query: effectiveQuery, mode, url, results, summary: formatSearchSummary(effectiveQuery, results) });
    } catch (error) {
      return failure("SEARCH_FAILED", "Web search failed.", errorMessage(error));
    }
  };
}
