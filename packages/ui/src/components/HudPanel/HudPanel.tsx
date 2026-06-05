import type { PropsWithChildren } from "react";
import styles from "./HudPanel.module.scss";

type HudPanelProps = PropsWithChildren<{
  title?: string;
  glowIntensity?: "dim" | "normal" | "strong";
  className?: string;
}>;

export function HudPanel({
  title,
  glowIntensity = "normal",
  className = "",
  children
}: HudPanelProps) {
  const classes = [styles.panel, styles[glowIntensity], className].filter(Boolean).join(" ");

  return (
    <section className={classes}>
      {title ? <div className={styles.title}>{title}</div> : null}
      <div className={styles.content}>{children}</div>
    </section>
  );
}
