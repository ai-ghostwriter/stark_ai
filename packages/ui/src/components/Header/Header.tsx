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
const PERSONA_MAX_ATTEMPTS = 4;
const PERSONA_BACKOFF_MS = 750;
const PERSONA_POLL_MS = 5000;

type PersonaState =
  | { persona: Persona; status: "ready"; error: null }
  | { persona: Persona; status: "error"; error: string };

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function usePersona(): PersonaState {
  const [state, setState] = useState<PersonaState>({
    persona: "friday",
    status: "ready",
    error: null,
  });

  useEffect(() => {
    let stopped = false;
    let retryTimeout: number | undefined;
    let controller: AbortController | undefined;

    const poll = async (attempt = 1) => {
      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch("/persona", { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Persona request failed with HTTP ${response.status}`);
        }

        const data = (await response.json()) as { persona?: Persona };
        if (stopped) return;

        setState((previous) => ({
          persona: data.persona === "jarvis" || data.persona === "friday" ? data.persona : previous.persona,
          status: "ready",
          error: null,
        }));
        retryTimeout = window.setTimeout(() => void poll(1), PERSONA_POLL_MS);
      } catch (error: unknown) {
        if (stopped || (error instanceof DOMException && error.name === "AbortError")) return;

        if (attempt >= PERSONA_MAX_ATTEMPTS) {
          setState((previous) => ({
            persona: previous.persona,
            status: "error",
            error: "Core offline: persona non disponibile.",
          }));
          return;
        }

        retryTimeout = window.setTimeout(
          () => void poll(attempt + 1),
          PERSONA_BACKOFF_MS * 2 ** (attempt - 1),
        );
      }
    };

    void poll();

    return () => {
      stopped = true;
      controller?.abort();
      if (retryTimeout !== undefined) window.clearTimeout(retryTimeout);
    };
  }, []);

  return state;
}

const personas: Persona[] = ["friday", "jarvis"];
const operatorName = import.meta.env.VITE_USER_NAME || "OPERATOR";

export function Header({ onModeChange }: HeaderProps) {
  const now = useClock();
  const personaState = usePersona();
  const { state } = useVoiceAssistant();
  const [currentMode, setCurrentMode] = useState<AgentMode>("gemini");
  const [currentPersona, setCurrentPersona] = useState<Persona>(personaState.persona);
  const [isChangingMode, setIsChangingMode] = useState(false);
  const [isChangingPersona, setIsChangingPersona] = useState(false);

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

  useEffect(() => {
    if (personaState.status === "ready") setCurrentPersona(personaState.persona);
  }, [personaState.persona, personaState.status]);

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

  const changePersona = async (persona: Persona) => {
    setIsChangingPersona(true);
    try {
      const response = await fetch("/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona }),
      });
      if (!response.ok) throw new Error(`Persona change failed: HTTP ${response.status}`);
      setCurrentPersona(persona);
      onModeChange();
    } catch (err: unknown) {
      console.error("Could not change persona.", err);
    } finally {
      setIsChangingPersona(false);
    }
  };

  const date = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(now);

  const personaLabel = currentPersona === "jarvis" ? "J.A.R.V.I.S." : "F.R.I.D.A.Y.";
  const statusLabel =
    personaState.status === "error" ? personaState.error : `VOICE AGENT // ${state.toUpperCase()}`;

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.title}>{personaLabel}</div>
        <div className={styles.subtitle}>{statusLabel}</div>
      </div>
      <div className={styles.modeSelector} aria-label="Persona">
        {personas.map((p) => (
          <button
            type="button"
            key={p}
            className={p === currentPersona ? styles.modeButtonActive : styles.modeButton}
            onClick={() => void changePersona(p)}
            disabled={isChangingPersona}
            aria-pressed={p === currentPersona}
          >
            {p.toUpperCase()}
          </button>
        ))}
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
        <span>{operatorName}</span>
      </div>
    </header>
  );
}
