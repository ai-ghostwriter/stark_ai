import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./WorkflowPanel.module.scss";

type WorkflowKind = "analysis" | "implementation" | "review";

type RunStatus =
  | "planned"
  | "architect_running"
  | "awaiting_approval"
  | "implementer_running"
  | "reviewer_running"
  | "completed"
  | "failed"
  | "rejected";

type FridayRun = {
  id: string;
  status: RunStatus;
  error?: string | null;
  plan: {
    workspace: string;
    request: string;
    kind: WorkflowKind;
    steps: Array<{ id: string; role: string; title: string; requiresApproval: boolean }>;
  };
  steps: Array<{ step: string; ok: boolean; output: string; finishedAt: string }>;
};

const kindLabels: Record<WorkflowKind, string> = {
  analysis: "ANALYSIS",
  implementation: "IMPLEMENTATION",
  review: "REVIEW",
};

const ACTIVE_STATUSES: RunStatus[] = ["planned", "architect_running", "implementer_running", "reviewer_running"];

const statusLabels: Record<RunStatus, string> = {
  planned: "IN CODA",
  architect_running: "ARCHITECT...",
  awaiting_approval: "ATTESA APPROVAZIONE",
  implementer_running: "CODEX...",
  reviewer_running: "REVIEW...",
  completed: "COMPLETATO",
  failed: "FALLITO",
  rejected: "RIFIUTATO",
};

export function WorkflowPanel() {
  const [request, setRequest] = useState("analyze this repository");
  const [workspace, setWorkspace] = useState("");
  const [kind, setKind] = useState<WorkflowKind>("analysis");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<FridayRun | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshRun = useCallback(async (runId: string) => {
    const res = await fetch(`/workflow/run/${runId}`);
    if (!res.ok) return;
    const payload = (await res.json()) as { run: FridayRun };
    setRun(payload.run);
  }, []);

  useEffect(() => {
    if (!run) return stopPolling;
    if (ACTIVE_STATUSES.includes(run.status)) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => void refreshRun(run.id), 2000);
      }
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [run, refreshRun, stopPolling]);

  const startRun = async () => {
    const trimmed = request.trim();
    if (!trimmed) {
      setError("Scrivi una richiesta prima di eseguire.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/workflow/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: trimmed,
          kind,
          ...(workspace.trim() ? { workspace: workspace.trim() } : {}),
        }),
      });
      const payload = (await res.json()) as { run: FridayRun; error?: string };
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      setRun(payload.run);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Workflow request failed.");
      setRun(null);
    } finally {
      setLoading(false);
    }
  };

  const decide = async (decision: "approve" | "reject") => {
    if (!run) return;
    setError(null);
    try {
      const res = await fetch(`/workflow/run/${run.id}/${decision}`, { method: "POST" });
      const payload = (await res.json()) as { run: FridayRun; error?: string };
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      setRun(payload.run);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Decisione fallita.");
    }
  };

  const stepOutputs = useMemo(() => run?.steps ?? [], [run]);
  const isActive = run ? ACTIVE_STATUSES.includes(run.status) : false;

  return (
    <div className={styles.workflow}>
      <div className={styles.toolbar}>
        <div className={styles.kindSection}>
          <span className={styles.kindLabel}>Workflow type</span>
          <div className={styles.kindGroup} role="tablist" aria-label="Workflow kind">
            {(Object.keys(kindLabels) as WorkflowKind[]).map((value) => (
              <button
                key={value}
                type="button"
                className={value === kind ? styles.kindActive : styles.kind}
                onClick={() => setKind(value)}
                aria-pressed={value === kind}
              >
                {kindLabels[value]}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className={styles.runButton} onClick={() => void startRun()} disabled={loading || isActive}>
          {loading || isActive ? "RUNNING..." : "EXECUTE WORKFLOW"}
        </button>
      </div>

      <label className={styles.label}>
        <span>Request</span>
        <textarea
          className={styles.textarea}
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          rows={3}
          spellCheck={false}
        />
      </label>

      <label className={styles.label}>
        <span>Workspace (sottocartella di workspaces/, opzionale)</span>
        <input
          className={styles.input}
          value={workspace}
          onChange={(event) => setWorkspace(event.target.value)}
          placeholder="workspaces/<progetto>"
          spellCheck={false}
        />
      </label>

      {error ? <div className={styles.error}>{error}</div> : null}

      {run ? (
        <div className={styles.result}>
          <div className={styles.resultHeader}>
            <span>{statusLabels[run.status]}</span>
            <strong>{run.plan.workspace}</strong>
          </div>
          {run.error ? <div className={styles.error}>{run.error}</div> : null}

          {run.status === "awaiting_approval" ? (
            <div className={styles.approvalBar}>
              <button type="button" className={styles.approveButton} onClick={() => void decide("approve")}>
                APPROVE
              </button>
              <button type="button" className={styles.rejectButton} onClick={() => void decide("reject")}>
                REJECT
              </button>
            </div>
          ) : null}

          <div className={styles.steps}>
            {run.plan.steps.map((step, index) => (
              <div className={styles.step} key={step.id}>
                <span className={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</span>
                <div className={styles.stepBody}>
                  <strong>{step.title}</strong>
                  <span>
                    {step.role.toUpperCase()} {step.requiresApproval ? "• APPROVAL REQUIRED" : "• NO APPROVAL"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {stepOutputs.map((step) => (
            <details className={styles.output} key={`${step.step}-${step.finishedAt}`}>
              <summary>
                {step.step.toUpperCase()} {step.ok ? "✓" : "✗"}
              </summary>
              <pre>{step.output}</pre>
            </details>
          ))}
        </div>
      ) : null}
    </div>
  );
}
