import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./ToolsPanel.module.scss";

type AgentTool = {
  name: string;
  description?: string;
  parameters?: unknown;
};

type ToolCategory = "workflow" | "book" | "knowledge" | "file" | "time" | "weather" | "ingest" | "plug";

type ToolsState =
  | { status: "loading"; tools: AgentTool[]; error: null }
  | { status: "ready"; tools: AgentTool[]; error: null }
  | { status: "error"; tools: AgentTool[]; error: string };

const initialState: ToolsState = { status: "loading", tools: [], error: null };

function formatToolName(name: string) {
  return name.replace(/_/g, " ").toUpperCase();
}

function getToolCategory(name: string): ToolCategory {
  if (name.startsWith("friday_") || name.startsWith("run_") || name.includes("workflow")) return "workflow";
  if (name.startsWith("book_") || name === "new_book") return "book";
  if (name.startsWith("kb_")) return "knowledge";
  if (name === "read_file" || name.includes("file")) return "file";
  if (name === "get_time" || name.includes("time")) return "time";
  if (name === "get_weather" || name.includes("weather")) return "weather";
  if (name.startsWith("ingest_") || name.includes("index")) return "ingest";
  return "plug";
}

function ToolIcon({ category }: { category: ToolCategory }) {
  const icon = useMemo(() => {
    switch (category) {
      case "workflow":
        return (
          <>
            <path d="M8 5v18l14-9-14-9Z" />
            <path d="M24 7h6v14h-6" />
          </>
        );
      case "book":
        return (
          <>
            <path d="M7 6h9a5 5 0 0 1 5 5v15H11a4 4 0 0 0-4 4V6Z" />
            <path d="M21 6h4a4 4 0 0 1 4 4v16h-8" />
          </>
        );
      case "knowledge":
        return (
          <>
            <ellipse cx="18" cy="8" rx="10" ry="4" />
            <path d="M8 8v14c0 2.2 4.5 4 10 4s10-1.8 10-4V8" />
            <path d="M8 15c0 2.2 4.5 4 10 4s10-1.8 10-4" />
          </>
        );
      case "file":
        return (
          <>
            <path d="M10 4h11l5 5v19H10V4Z" />
            <path d="M21 4v6h6" />
            <path d="M14 17h9M14 22h7" />
          </>
        );
      case "time":
        return (
          <>
            <circle cx="18" cy="18" r="12" />
            <path d="M18 10v9l6 3" />
          </>
        );
      case "weather":
        return (
          <>
            <path d="M12 24h14a6 6 0 0 0 .4-12 9 9 0 0 0-17.1 3A4.8 4.8 0 0 0 12 24Z" />
            <path d="M9 8 6 5M30 8l3-3M6 32l3-3M30 29l3 3" />
          </>
        );
      case "ingest":
        return (
          <>
            <path d="M18 5v16" />
            <path d="m11 14 7 7 7-7" />
            <path d="M8 28h20" />
          </>
        );
      case "plug":
      default:
        return (
          <>
            <path d="M13 5v8M23 5v8" />
            <path d="M10 13h16v5a8 8 0 0 1-16 0v-5Z" />
            <path d="M18 26v5" />
          </>
        );
    }
  }, [category]);

  return (
    <svg className={styles.icon} viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      {icon}
    </svg>
  );
}

export function ToolsPanel() {
  const [state, setState] = useState<ToolsState>(initialState);

  const loadTools = useCallback((signal?: AbortSignal) => {
    setState((previous) => ({ status: "loading", tools: previous.tools, error: null }));

    return fetch("/tools", { signal })
      .then(async (response) => {
        const payload = (await response.json()) as { tools?: AgentTool[]; error?: string };
        if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
        setState({ status: "ready", tools: Array.isArray(payload.tools) ? payload.tools : [], error: null });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState((previous) => ({
          status: "error",
          tools: previous.tools,
          error: error instanceof Error ? error.message : "Tools registry unavailable.",
        }));
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadTools(controller.signal);
    return () => controller.abort();
  }, [loadTools]);

  return (
    <section className={styles.panel} aria-label="Agent tools">
      <header className={styles.header}>
        <div>
          <span>SYSTEM CORE</span>
          <strong>READY</strong>
        </div>
        <span className={styles.count}>
          {state.status === "loading" && state.tools.length === 0 ? "SCANNING" : `${state.tools.length} TOOLS`}
        </span>
      </header>

      {state.status === "error" ? (
        <div className={styles.error} role="alert">
          <span>{state.error}</span>
          <button type="button" onClick={() => void loadTools()}>
            RETRY
          </button>
        </div>
      ) : null}

      {state.status === "loading" && state.tools.length === 0 ? (
        <div className={styles.loading}>LOADING TOOL REGISTRY...</div>
      ) : (
        <div className={styles.grid}>
          {state.tools.map((tool) => {
            const category = getToolCategory(tool.name);
            return (
              <article className={styles.card} key={tool.name}>
                <div className={styles.iconFrame}>
                  <ToolIcon category={category} />
                </div>
                <div className={styles.cardBody}>
                  <h3>{formatToolName(tool.name)}</h3>
                  <p>{tool.description || "No registry description available."}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
