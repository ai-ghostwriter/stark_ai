import { PipelinePayload } from "@stark-ai/contracts";
import styles from "./panels.module.scss";

export function PipelineFunnel({ payload }: { payload: Record<string, unknown> }) {
  const parsed = PipelinePayload.safeParse(payload);
  if (!parsed.success) {
    return <pre className={styles.fallback}>{JSON.stringify(payload, null, 2)}</pre>;
  }
  const { stages, deals } = parsed.data;
  const maxCount = Math.max(1, ...stages.map((stage) => stage.count));

  return (
    <div className={styles.panel}>
      <div>
        {stages.map((stage, index) => (
          <div className={styles.stageRow} key={stage.name}>
            <span>{stage.name}</span>
            <div className={styles.stageBarTrack}>
              <div
                className={styles.stageBar}
                style={{ width: `${(stage.count / maxCount) * 100}%`, animationDelay: `${index * 110}ms` }}
              />
            </div>
            <span>{stage.count}</span>
          </div>
        ))}
      </div>
      <div>
        {deals.map((deal) => (
          <div className={styles.dealRow} key={deal.name}>
            <span className={deal.atRisk ? styles.dealAtRisk : undefined}>
              {deal.atRisk ? "⚠ " : ""}{deal.name}
            </span>
            <span>{deal.stage} · {deal.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
