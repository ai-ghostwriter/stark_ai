import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolsPanel } from "./ToolsPanel";

describe("ToolsPanel", () => {
  it("fetches /tools and renders readable tool names", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            tools: [
              { name: "friday_run", description: "Run a FRIDAY workflow", parameters: {} },
              { name: "kb_search", description: "Search the knowledge base", parameters: {} },
              { name: "get_weather", description: "Read weather data", parameters: {} },
            ],
          }),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ToolsPanel />);

    await waitFor(() => expect(screen.getByText("FRIDAY RUN")).toBeInTheDocument());
    expect(screen.getByText("KB SEARCH")).toBeInTheDocument();
    expect(screen.getByText("GET WEATHER")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/tools", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
