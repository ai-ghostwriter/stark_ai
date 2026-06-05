import { VoiceAssistantControlBar, useConnectionState, useVoiceAssistant } from "@livekit/components-react";
import styles from "./EventLog.module.scss";

type EventLogProps = {
  onReconnect: () => void;
};

export function EventLog({ onReconnect }: EventLogProps) {
  const connectionState = useConnectionState();
  const { state } = useVoiceAssistant();
  const events = [
    `ROOM STATE :: ${String(connectionState).toUpperCase()}`,
    `AGENT STATE :: ${state.toUpperCase()}`,
    "AUDIO RENDERER :: ARMED",
    "CONTROL BAR :: READY"
  ];

  return (
    <div className={styles.log}>
      <div className={styles.events}>
        {events.map((event) => (
          <div key={event}>{event}</div>
        ))}
      </div>
      <div className={styles.controls}>
        <VoiceAssistantControlBar controls={{ leave: true }} />
        <button type="button" onClick={onReconnect}>TOKEN REFRESH</button>
      </div>
    </div>
  );
}
