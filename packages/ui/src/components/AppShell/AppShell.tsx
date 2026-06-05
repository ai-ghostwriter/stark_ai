import { BarVisualizer, useVoiceAssistant } from "@livekit/components-react";
import { Header } from "../Header/Header";
import { HudPanel } from "../HudPanel/HudPanel";
import { AgentStatus } from "../AgentStatus/AgentStatus";
import { ConnectionStatus } from "../ConnectionStatus/ConnectionStatus";
import { EventLog } from "../EventLog/EventLog";
import { SystemInfo } from "../SystemInfo/SystemInfo";
import { TranscriptPanel } from "../TranscriptPanel/TranscriptPanel";
import { VoicePanel } from "../VoicePanel/VoicePanel";
import styles from "./AppShell.module.scss";

type AppShellProps = {
  onReconnect: () => void;
};

export function AppShell({ onReconnect }: AppShellProps) {
  const { state, audioTrack } = useVoiceAssistant();

  return (
    <div className={styles.shell}>
      <Header onModeChange={onReconnect} />
      <aside className={styles.left}>
        <HudPanel title="Stato Connessione" glowIntensity="dim">
          <ConnectionStatus />
        </HudPanel>
        <HudPanel title="Agente AI" glowIntensity="strong">
          <AgentStatus />
        </HudPanel>
        <HudPanel title="Audio" glowIntensity="dim">
          <div className={styles.audioLabel}>VOICE CHANNEL // ACTIVE MONITOR</div>
          <BarVisualizer
            className={styles.audioGrid}
            state={state}
            trackRef={audioTrack}
            barCount={18}
            options={{ minHeight: 12, maxHeight: 92 }}
          />
        </HudPanel>
      </aside>
      <main className={styles.center}>
        <HudPanel glowIntensity="strong" className={styles.voicePanel}>
          <VoicePanel />
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
        <HudPanel title="Log" glowIntensity="dim">
          <EventLog onReconnect={onReconnect} />
        </HudPanel>
      </footer>
    </div>
  );
}
