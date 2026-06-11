import { IntelPayload } from "@stark-ai/contracts";
import styles from "./panels.module.scss";

export function IntelTimeline({ payload }: { payload: Record<string, unknown> }) {
  const parsed = IntelPayload.safeParse(payload);
  if (!parsed.success) {
    return <pre className={styles.fallback}>{JSON.stringify(payload, null, 2)}</pre>;
  }
  const { hits } = parsed.data;
  return (
    <div className={styles.panel}>
      <ul className={styles.timeline}>
        {hits.map((hit, index) => (
          <li
            className={styles.timelineItem}
            key={`${hit.source}-${hit.date}-${index}`}
            style={{ animationDelay: `${index * 140}ms` }}
          >
            <div className={styles.timelineMeta}>{hit.date} · {hit.source}</div>
            {hit.quote}
          </li>
        ))}
      </ul>
    </div>
  );
}
