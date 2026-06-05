import { useVoiceAssistant } from "@livekit/components-react";
import styles from "./SystemInfo.module.scss";

export function SystemInfo() {
  const { state } = useVoiceAssistant();

  return (
    <div className={styles.info}>
      <div><span>CORE</span><strong>FRIDAY</strong></div>
      <div><span>BRIDGE</span><strong>JARVIS HTTP</strong></div>
      <div><span>ROOM</span><strong>friday-room</strong></div>
      <div><span>STATE</span><strong>{state.toUpperCase()}</strong></div>
    </div>
  );
}
