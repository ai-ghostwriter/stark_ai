import { ActionsPayload } from "@stark-ai/contracts";
import styles from "./panels.module.scss";

export function ActionList({ payload }: { payload: Record<string, unknown> }) {
  const parsed = ActionsPayload.safeParse(payload);
  if (!parsed.success) {
    return <pre className={styles.fallback}>{JSON.stringify(payload, null, 2)}</pre>;
  }
  const { focus, actions } = parsed.data;
  return (
    <div className={styles.panel}>
      <p className={styles.focus}>{focus}</p>
      <div>
        {actions.map((action, index) => (
          <div className={styles.actionRow} key={action.rank} style={{ animationDelay: `${index * 150}ms` }}>
            <span className={styles.actionRank}>{String(action.rank).padStart(2, "0")}</span>
            <span>
              {action.title}
              <div className={styles.actionWhy}>{action.why}</div>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
