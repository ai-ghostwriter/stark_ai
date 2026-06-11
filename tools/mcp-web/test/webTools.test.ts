import { describe, expect, it, vi } from "vitest";
import { createBrowserControl, normalizeUrl } from "../src/browserControl.js";
import { createFlightFinder } from "../src/flightFinder.js";
import { extractYoutubeVideoId, createYoutubeVideo } from "../src/youtubeVideo.js";
import { createWebSearch } from "../src/webSearch.js";

describe("mcp-web browser_control", () => {
  it("normalizes bare browser targets and opens through the injected opener", async () => {
    const open = vi.fn(async () => undefined);
    const tool = createBrowserControl({ open });

    expect(normalizeUrl("instagram")).toBe("https://instagram.com");
    await expect(tool({ action: "go_to", url: "example.org" })).resolves.toMatchObject({
      ok: true,
      data: { url: "https://example.org" },
    });
    expect(open).toHaveBeenCalledWith("https://example.org");
  });
});

describe("mcp-web web_search", () => {
  it("fetches and parses DuckDuckGo result anchors without LLM summarization", async () => {
    const fetchText = vi.fn(async () => `
      <a class="result__a" href="https://example.com/a">First result</a>
      <a class="result__snippet">Useful snippet</a>
    `);
    const tool = createWebSearch({ fetchText });

    await expect(tool({ query: "ricette diabetici", maxResults: 3 })).resolves.toMatchObject({
      ok: true,
      data: { results: [{ title: "First result", url: "https://example.com/a", snippet: "Useful snippet" }] },
    });
  });
});

describe("mcp-web youtube_video", () => {
  it("extracts video ids and falls back to a filtered search URL for play", async () => {
    const open = vi.fn(async () => undefined);
    const fetchText = vi.fn(async () => "<html></html>");
    const tool = createYoutubeVideo({ open, fetchText });

    expect(extractYoutubeVideoId("https://youtu.be/abcdefghijk")).toBe("abcdefghijk");
    await expect(tool({ action: "play", query: "lofi" })).resolves.toMatchObject({
      ok: true,
      data: { opened: true, manualSelectionRequired: true },
    });
    expect(open).toHaveBeenCalledWith(expect.stringContaining("youtube.com/results"));
  });
});

describe("mcp-web flight_finder", () => {
  it("builds a Google Flights deep link instead of scraping", async () => {
    const open = vi.fn(async () => undefined);
    const tool = createFlightFinder({ open, now: () => new Date("2026-06-11T10:00:00Z") });

    await expect(tool({ origin: "MXP", destination: "LHR", date: "tomorrow", passengers: 2, cabin: "business" })).resolves.toMatchObject({
      ok: true,
      data: { date: "2026-06-12", passengers: 2, cabin: "business", opened: true },
    });
    expect(open).toHaveBeenCalledWith(expect.stringContaining("google.com/travel/flights"));
  });
});
