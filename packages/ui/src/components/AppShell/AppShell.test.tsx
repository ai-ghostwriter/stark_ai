import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import styles from "./AppShell.module.scss";

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
    expect(screen.getByText("OPERATOR")).toBeInTheDocument();
    expect(screen.queryByText("RICKY STARK")).not.toBeInTheDocument();

    const agentPanel = screen.getByText("Agente AI").closest("section");
    expect(agentPanel).not.toBeNull();
    expect(within(agentPanel as HTMLElement).getByText("IN ASCOLTO")).toBeInTheDocument();
    expect(within(agentPanel as HTMLElement).getByTestId("bar-visualizer")).toBeInTheDocument();
  });

  it("allows the footer Log panel to render popover controls outside the panel bounds", async () => {
    vi.stubGlobal("fetch", vi.fn(() => mockJson({})));

    render(<AppShell onReconnect={vi.fn()} />);

    const logPanel = screen.getByText("Log").closest("section");
    const transcriptPanel = screen.getByText("Trascrizione").closest("section");

    expect(logPanel).not.toBeNull();
    expect(transcriptPanel).not.toBeNull();
    expect(logPanel as HTMLElement).toHaveClass(styles.footerPanel);
    expect(transcriptPanel as HTMLElement).not.toHaveClass(styles.footerPanel);
  });
});
