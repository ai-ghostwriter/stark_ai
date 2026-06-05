import styles from "./BootScreen.module.scss";

type BootScreenProps = {
  lines?: string[];
};

const defaultLines = [
  "FRIDAY CORE BOOT",
  "JARVIS BRIDGE CHECK",
  "VOICE PIPELINE ONLINE",
  "LIVEKIT ROOM ACQUISITION"
];

export function BootScreen({ lines = defaultLines }: BootScreenProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.scanline} />
      <div className={styles.card}>
        <div className={styles.logo}>J</div>
        <div className={styles.title}>F.R.I.D.A.Y.</div>
        <div className={styles.subtitle}>VOICE INTERFACE INITIALIZATION</div>
        <div className={styles.progress}>
          <span />
        </div>
        <ul className={styles.lines}>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
