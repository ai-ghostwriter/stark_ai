import { MetricsPayload } from "@stark-ai/contracts";
import styles from "./panels.module.scss";

const W = 560;
const H = 220;
const PAD = 18;

export function MetricsChart({ payload }: { payload: Record<string, unknown> }) {
  const parsed = MetricsPayload.safeParse(payload);
  if (!parsed.success) {
    return <pre className={styles.fallback}>{JSON.stringify(payload, null, 2)}</pre>;
  }
  const { metric, unit, series } = parsed.data;

  const min = Math.min(...series.map((point) => point.value));
  const max = Math.max(...series.map((point) => point.value));
  const span = Math.max(1, max - min);
  const x = (index: number) => PAD + (index * (W - 2 * PAD)) / (series.length - 1);
  const y = (value: number) => H - PAD - ((value - min) / span) * (H - 2 * PAD);
  const d = series
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(" ");

  return (
    <div className={styles.panel}>
      <div className={styles.metricName}>
        {metric} ({unit}) · min {min} · max {max}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} role="img" aria-label={metric}>
        {/* pathLength=1 normalizza la lunghezza: dash 1→0 disegna la linea senza misurare il path */}
        <path d={d} pathLength={1} className={styles.chartLine} />
      </svg>
      <div className={styles.axis}>
        {series.map((point) => (
          <span key={point.date}>{point.date}</span>
        ))}
      </div>
    </div>
  );
}
