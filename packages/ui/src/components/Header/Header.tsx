// packages/ui/src/components/Header/Header.tsx
import { useEffect, useState } from "react";
import { useVoiceAssistant } from "@livekit/components-react";
import styles from "./Header.module.scss";

type AgentMode = "gemini" | "ollama" | "claude" | "gpt";
type Persona = "jarvis" | "friday";

type HeaderProps = {
  onModeChange: () => void;
};

const modes: AgentMode[] = ["gemini", "ollama", "claude", "gpt"];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function usePersona(): Persona {
  const [persona, setPersona] = useState<Persona>("friday");
  useEffect(() => {
    let isMounted = true;
    const poll = () => {
      fetch("/persona")
        .then((r) => r.json() as Promise<{ persona?: Persona }>)
        .then((data) => {
          if (isMounted && (data.persona === "jarvis" || data.persona === "friday")) {
            setPersona(data.persona);
          }
        })
        .catch(() => {});
    };
    poll();
    const interval = window.setInterval(poll, 2000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);
  return persona;
}

export function Header({ onModeChange }: HeaderProps) {
  const now = useClock();
  const persona = usePersona();
  const { state } = useVoiceAssistant();
  const [currentMode, setCurrentMode] = useState<AgentMode>("gemini");
  const [isChangingMode, setIsChangingMode] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch("/mode")
      .then((r) => r.json() as Promise<{ mode?: AgentMode }>)
      .then((payload) => {
        if (isMounted && payload.mode && modes.includes(payload.mode)) {
          setCurrentMode(payload.mode);
        }
      })
      .catch((err: unknown) => console.error("Could not fetch mode.", err));
    return () => { isMounted = false; };
  }, []);

  const changeMode = async (mode: AgentMode) => {
    setIsChangingMode(true);
    try {
      const response = await fetch("/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) throw new Error(`Mode change failed: HTTP ${response.status}`);
      setCurrentMode(mode);
      onModeChange();
    } catch (err: unknown) {
      console.error("Could not change mode.", err);
    } finally {
      setIsChangingMode(false);
    }
  };

  const date = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(now);

  const personaLabel = persona === "jarvis" ? "J.A.R.V.I.S." : "F.R.I.D.A.Y.";

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.title}>{personaLabel}</div>
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
