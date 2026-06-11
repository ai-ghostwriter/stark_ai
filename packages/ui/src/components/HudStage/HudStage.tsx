import type { ReactNode } from "react";
import { useRenderEvents, type RenderEvent } from "../../hooks/useRenderEvents";
import { ActionList } from "../panels/ActionList";
import { BriefCard } from "../panels/BriefCard";
import { IntelTimeline } from "../panels/IntelTimeline";
import { MetricsChart } from "../panels/MetricsChart";
import { PipelineFunnel } from "../panels/PipelineFunnel";
import styles from "./HudStage.module.scss";

export function HudStage({ idle }: { idle: ReactNode }) {
  const { event, clear } = useRenderEvents();
  if (!event) return <>{idle}</>;
  return (
    // key sull'event id: il pannello rimonta e le animazioni ripartono a ogni risposta
    <div className={styles.stage} key={event.id}>
      <header className={styles.stageHeader}>
        <span className={styles.stageTitle}>{event.title}</span>
        <button type="button" className={styles.stageClose} onClick={clear}>
          CHIUDI
        </button>
      </header>
      <div className={styles.stageBody}>
        <PanelRouter event={event} />
      </div>
    </div>
  );
}

function PanelRouter({ event }: { event: RenderEvent }) {
  switch (event.render) {
    case "stark.brief":
      return <BriefCard payload={event.payload} />;
    case "stark.metrics":
      return <MetricsChart payload={event.payload} />;
    case "stark.pipeline":
      return <PipelineFunnel payload={event.payload} />;
    case "stark.intel":
      return <IntelTimeline payload={event.payload} />;
    case "stark.actions":
      return <ActionList payload={event.payload} />;
    default:
      return <pre className={styles.fallback}>{JSON.stringify(event.payload, null, 2)}</pre>;
  }
}
