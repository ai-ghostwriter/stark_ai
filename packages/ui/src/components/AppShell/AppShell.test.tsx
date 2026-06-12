import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("@livekit/components-react", () => ({
  BarVisualizer: () => <div data-testid="bar-visualizer" />,
  VoiceAssistantControlBar: () => <div data-testid="voice-controls" />,
  useConnectionState: () => "connected",
  useLocalParticipant: () => ({
    localParticipant: { identity: "ricky-stark", isMicrophoneEnabled: true },
  }),
  useVoiceAssistant: () => ({ state: "listening", audioTrack: undefined }),
}));

function mockJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  } as Response);
}

describe("AppShell", () => {
  it("renders the main HUD panels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/persona") return mockJson({ persona: "friday" });
        if (url === "/mode") return mockJson({ mode: "gemini" });
        return mockJson({});
      }),
    );

    render(<AppShell onReconnect={vi.fn()} />);

    expect(await screen.findByText("F.R.I.D.A.Y.")).toBeInTheDocument();
    expect(screen.getByText("Stato Connessione")).toBeInTheDocument();
    expect(screen.getByText("FRIDAY / JARVIS Workflow")).toBeInTheDocument();
    expect(screen.getByTestId("bar-visualizer")).toBeInTheDocument();
  });
});
