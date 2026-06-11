import { useEffect, useMemo, useState } from "react";
import styles from "./OfflineDebugView.module.scss";

type HubStatus = "connecting" | "online" | "offline";

type HubEvent =
  | { v: 1; type: "hello"; role: "voice" | "hud"; client: string }
  | { v: 1; type: "stt.final"; text: string; lang?: string }
  | { v: 1; type: "agent.token"; delta: string }
  | { v: 1; type: "agent.done" }
  | { v: 1; type: "tts.speak"; text: string; voice?: string; persona?: string }
  | { v: 1; type: "route.info"; provider: string; model: string; reason: string }
  | { v: 1; type: "tts.cancel" }
  | { v: 1; type: "sys.error"; scope: string; message: string }
  | { v: 1; type: string; [key: string]: unknown };

type TranscriptLine = {
  id: number;
  type: "user" | "agent" | "tts";
  text: string;
  streaming?: boolean;
};

const hubUrl = "ws://127.0.0.1:7710";

function statusClass(status: HubStatus) {
  if (status === "online") return styles.statusOnline;
  if (status === "connecting") return styles.statusConnecting;
  return styles.statusOffline;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function appendTranscript(lines: TranscriptLine[], event: HubEvent): TranscriptLine[] {
  if (event.type === "stt.final") {
    return [...lines, { id: Date.now() + lines.length, type: "user", text: textValue(event.text) }];
  }

  if (event.type === "agent.token") {
    const delta = textValue(event.delta);
    const previous = lines[lines.length - 1];
    if (previous?.type === "agent" && previous.streaming) {
      return [...lines.slice(0, -1), { ...previous, text: `${previous.text}${delta}` }];
    }
    return [...lines, { id: Date.now() + lines.length, type: "agent", text: delta, streaming: true }];
  }

  if (event.type === "agent.done") {
    const previous = lines[lines.length - 1];
    if (previous?.type === "agent" && previous.streaming) {
      return [...lines.slice(0, -1), { ...previous, streaming: false }];
    }
    return lines;
  }

  if (event.type === "tts.speak") {
    return [...lines, { id: Date.now() + lines.length, type: "tts", text: textValue(event.text) }];
  }

  return lines;
}

export function OfflineDebugView() {
  const [status, setStatus] = useState<HubStatus>("connecting");
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);

  useEffect(() => {
    const socket = new WebSocket(hubUrl);
    let closedByComponent = false;

    socket.addEventListener("open", () => {
      setStatus("online");
      socket.send(JSON.stringify({ v: 1, type: "hello", role: "hud", client: "hud@0.1" }));
    });

    socket.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(String(message.data)) as HubEvent;
        setEvents((current) => [...current, event]);
        setTranscript((current) => appendTranscript(current, event));
      } catch (error) {
        setEvents((current) => [
          ...current,
          {
            v: 1,
            type: "sys.error",
            scope: "hud",
            message: error instanceof Error ? error.message : "Invalid hub event.",
          },
        ]);
      }
    });

    socket.addEventListener("error", () => {
      setStatus("offline");
    });

    socket.addEventListener("close", () => {
      if (!closedByComponent) setStatus("offline");
    });

    return () => {
      closedByComponent = true;
      socket.close();
    };
  }, []);

  const statusLabel = useMemo(() => {
    if (status === "online") return "hub online";
    if (status === "connecting") return "connecting";
    return "hub offline";
  }, [status]);

  return (
    <section className={styles.view} aria-label="Offline debug transcript">
      <div className={styles.header}>
        <h1 className={styles.title}>Offline Transcript Debug</h1>
        <span className={statusClass(status)}>{statusLabel}</span>
      </div>

      <div className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Conversation Transcript</div>
          {transcript.length === 0 ? (
            <div className={styles.empty}>Waiting for fake voice events.</div>
          ) : (
            <div className={styles.transcript}>
              {transcript.map((line) => (
                <div className={styles.line} key={line.id}>
                  <span className={styles.lineType}>
                    {line.type}
                    {line.streaming ? " streaming" : ""}
                  </span>
                  <span className={styles.lineText}>{line.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelTitle}>Raw Event Log</div>
          {events.length === 0 ? (
            <div className={styles.empty}>No events received.</div>
          ) : (
            <div className={styles.log}>
              {events.map((event, index) => (
                <pre className={styles.event} key={`${event.type}-${index}`}>
                  {JSON.stringify(event, null, 2)}
                </pre>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
