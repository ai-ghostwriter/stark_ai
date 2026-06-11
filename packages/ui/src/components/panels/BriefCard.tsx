import { BriefPayload } from "@stark-ai/contracts";
import { useTypeIn } from "./useTypeIn";
import styles from "./panels.module.scss";

export function BriefCard({ payload }: { payload: Record<string, unknown> }) {
  const parsed = BriefPayload.safeParse(payload);
  if (!parsed.success) {
    return <pre className={styles.fallback}>{JSON.stringify(payload, null, 2)}</pre>;
  }
  return <BriefBody data={parsed.data} />;
}

function BriefBody({ data }: { data: BriefPayload }) {
  const { shown, done } = useTypeIn(data.summary);
  return (
    <div className={styles.panel}>
      <p className={styles.summary}>
        {shown}
        {!done && <span className={styles.cursor}>▌</span>}
      </p>
      <div className={styles.chips}>
        {data.signals.map((signal, index) => (
          <span
            key={signal.label}
            className={`${styles.chip} ${done ? styles.chipIn : ""}`}
            style={{ animationDelay: `${index * 120}ms` }}
          >
            <span className={styles.chipLabel}>{signal.label}</span>
            <span className={styles.chipValue}>
              {signal.value} {signal.trend === "up" ? "▲" : signal.trend === "down" ? "▼" : "◆"}
            </span>
          </span>
        ))}
      </div>
      <ul className={styles.sections}>
        {data.sections.map((section, index) => (
          <li
            key={section.title}
            className={done ? styles.lineIn : styles.lineHidden}
            style={{ animationDelay: `${300 + index * 160}ms` }}
          >
            <span className={styles.sectionTitle}>{section.title}</span> {section.line}
          </li>
        ))}
      </ul>
    </div>
  );
}
