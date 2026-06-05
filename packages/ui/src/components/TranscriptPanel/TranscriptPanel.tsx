import { useVoiceAssistant } from "@livekit/components-react";
import styles from "./TranscriptPanel.module.scss";

export function TranscriptPanel() {
  const { agentTranscriptions } = useVoiceAssistant();
  const transcripts = agentTranscriptions ?? [];

  if (transcripts.length === 0) {
    return <div className={styles.empty}>WAITING FOR AGENT TRANSCRIPTION STREAM</div>;
  }

  return (
    <div className={styles.list}>
      {transcripts.map((item, index) => (
        <article key={`${item.id ?? "transcript"}-${index}`} className={styles.item}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <p>{item.text}</p>
        </article>
      ))}
    </div>
  );
}
