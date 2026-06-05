import { useMemo } from "react";
import { useVoiceAssistant } from "@livekit/components-react";
import { Waveform } from "../Waveform/Waveform";
import styles from "./VoicePanel.module.scss";

const stateLabels: Record<string, string> = {
  disconnected: "STANDBY",
  connecting: "SINCRONIZZAZIONE",
  initializing: "INIZIALIZZAZIONE",
  listening: "IN ASCOLTO",
  thinking: "ELABORAZIONE...",
  speaking: "IN RISPOSTA"
};

export function VoicePanel() {
  const { state, agentTranscriptions } = useVoiceAssistant();
  const label = stateLabels[state] || "STANDBY";
  const activeWaveform = state === "speaking" || state === "listening";
  const transcripts = useMemo(() => agentTranscriptions ?? [], [agentTranscriptions]);

  return (
    <div className={styles.voice}>
      <div className={styles.statusRow}>
        <span className={`${styles.badge} ${styles[state] || ""}`}>{state.toUpperCase()}</span>
        <span className={styles.label}>{label}</span>
      </div>
      <div className={styles.core}>
        <div className={styles.ring}>
          <div className={styles.innerRing}>
            <Waveform active={activeWaveform} />
          </div>
        </div>
      </div>
      <div className={styles.transcript}>
        {transcripts.length === 0 ? (
          <p className={styles.empty}>NESSUNA TRASCRIZIONE AGENTE DISPONIBILE</p>
        ) : (
          transcripts.slice(-6).map((item, index) => (
            <article key={`${item.id ?? "agent"}-${index}`} className={styles.message}>
              <span>FRIDAY</span>
              <p>{item.text}</p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
