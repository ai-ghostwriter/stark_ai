import { useEffect, useState } from "react";
import { useVoiceAssistant } from "@livekit/components-react";
import styles from "./Header.module.scss";

type AgentMode = "gemini" | "jarvis" | "anthropic" | "openai";

type HeaderProps = {
  onModeChange: () => void;
};

const modes: AgentMode[] = ["gemini", "jarvis", "anthropic", "openai"];

function useClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

export function Header({ onModeChange }: HeaderProps) {
  const now = useClock();
  const { state } = useVoiceAssistant();
  const [currentMode, setCurrentMode] = useState<AgentMode>("gemini");
  const [isChangingMode, setIsChangingMode] = useState(false);

  useEffect(() => {
    let isMounted = true;

    fetch("/mode")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Mode request failed with HTTP ${response.status}`);
        }
        return response.json() as Promise<{ mode?: AgentMode }>;
      })
      .then((payload) => {
        if (isMounted && payload.mode && modes.includes(payload.mode)) {
          setCurrentMode(payload.mode);
        }
      })
      .catch((error: unknown) => {
        console.error("Could not fetch FRIDAY mode.", error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const changeMode = async (mode: AgentMode) => {
    setIsChangingMode(true);

    try {
      const response = await fetch("/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Mode change failed with HTTP ${response.status}`);
      }

      setCurrentMode(mode);
      onModeChange();
    } catch (error: unknown) {
      console.error("Could not change FRIDAY mode.", error);
    } finally {
      setIsChangingMode(false);
    }
  };

  const date = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(now);
  const time = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(now);

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.title}>F.R.I.D.A.Y.</div>
        <div className={styles.subtitle}>VOICE AGENT // {state.toUpperCase()}</div>
      </div>
      <div className={styles.modeSelector} aria-label="Agent mode">
        {modes.map((mode) => (
          <button
            type="button"
            key={mode}
            className={mode === currentMode ? styles.modeButtonActive : styles.modeButton}
            onClick={() => void changeMode(mode)}
            disabled={isChangingMode}
            aria-pressed={mode === currentMode}
          >
            {mode.toUpperCase()}
          </button>
        ))}
      </div>
      <div className={styles.statusItems}>
        <span>{date}</span>
        <span>{time}</span>
        <span>RICKY STARK</span>
      </div>
    </header>
  );
}
