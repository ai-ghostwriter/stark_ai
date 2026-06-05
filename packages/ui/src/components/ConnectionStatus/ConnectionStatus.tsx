import { useConnectionState, useLocalParticipant } from "@livekit/components-react";
import styles from "./ConnectionStatus.module.scss";

export function ConnectionStatus() {
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const micEnabled = localParticipant?.isMicrophoneEnabled ?? false;

  return (
    <div className={styles.status}>
      <div className={styles.row}>
        <span>ROOM</span>
        <strong>{String(connectionState).toUpperCase()}</strong>
      </div>
      <div className={styles.row}>
        <span>MIC</span>
        <strong>{micEnabled ? "UNMUTED" : "MUTED"}</strong>
      </div>
      <div className={styles.row}>
        <span>IDENTITY</span>
        <strong>{localParticipant?.identity || "PENDING"}</strong>
      </div>
    </div>
  );
}
