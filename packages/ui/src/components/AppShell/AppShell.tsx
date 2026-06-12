import { Header } from "../Header/Header";
import { HudPanel } from "../HudPanel/HudPanel";
import { ConnectionStatus } from "../ConnectionStatus/ConnectionStatus";
import { EventLog } from "../EventLog/EventLog";
import { HudStage } from "../HudStage/HudStage";
import { SystemInfo } from "../SystemInfo/SystemInfo";
import { ToolsPanel } from "../ToolsPanel/ToolsPanel";
import { TranscriptPanel } from "../TranscriptPanel/TranscriptPanel";
import { WorkflowPanel } from "../WorkflowPanel/WorkflowPanel";
import { VoicePanel } from "../VoicePanel/VoicePanel";
import styles from "./AppShell.module.scss";

type AppShellProps = {
  onReconnect: () => void;
};

export function AppShell({ onReconnect }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <Header onModeChange={onReconnect} />
      <aside className={styles.left}>
        <HudPanel title="Stato Connessione" glowIntensity="dim">
          <ConnectionStatus />
        </HudPanel>
        <HudPanel title="Agente AI" glowIntensity="strong">
          <VoicePanel />
        </HudPanel>
      </aside>
      <main className={styles.center}>
        <HudPanel glowIntensity="strong" className={styles.voicePanel}>
          <HudStage idle={<ToolsPanel />} />
        </HudPanel>
      </main>
      <aside className={styles.right}>
        <HudPanel title="Trascrizione" glowIntensity="normal">
          <TranscriptPanel />
        </HudPanel>
        <HudPanel title="Info Sistema" glowIntensity="dim">
          <SystemInfo />
        </HudPanel>
      </aside>
      <footer className={styles.footer}>
        <HudPanel title="Log" glowIntensity="dim" className={styles.footerPanel}>
          <EventLog onReconnect={onReconnect} />
        </HudPanel>
        <HudPanel title="FRIDAY / JARVIS Workflow" glowIntensity="normal">
          <WorkflowPanel />
        </HudPanel>
      </footer>
    </div>
  );
}
