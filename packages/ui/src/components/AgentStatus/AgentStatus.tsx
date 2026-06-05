import { useVoiceAssistant } from "@livekit/components-react";
import styles from "./AgentStatus.module.scss";

export function AgentStatus() {
  const { state } = useVoiceAssistant();

  return (
    <div className={styles.agent}>
      <div className={`${styles.dot} ${styles[state] || styles.disconnected}`} />
      <div className={styles.state}>{state.toUpperCase()}</div>
      <div className={styles.label}>FRIDAY v2.0 // JARVIS BRIDGE</div>
      <div className={styles.metrics}>
        <span>STT</span>
        <strong>ONLINE</strong>
        <span>LLM</span>
        <strong>JARVIS</strong>
        <span>TTS</span>
        <strong>ASH</strong>
      </div>
    </div>
  );
}
