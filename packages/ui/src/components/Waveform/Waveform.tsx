import styles from "./Waveform.module.scss";

type WaveformProps = {
  active: boolean;
};

export function Waveform({ active }: WaveformProps) {
  return (
    <div className={`${styles.waveform} ${active ? styles.active : ""}`} aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => (
        <span key={index} style={{ animationDelay: `${index * 45}ms` }} />
      ))}
    </div>
  );
}
