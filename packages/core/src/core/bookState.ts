import type { Phase } from "./kdpPhases.js";

export interface PhaseStatus {
  id: string;
  name: string;
  skill: string;
  done: boolean;
  actionable: boolean;
  missing: string[];
}

export interface BookStatus {
  phases: PhaseStatus[];
  currentPhaseId: string | null;
  nextAction: string;
}

export function computeStatus(existing: string[], phases: Phase[]): BookStatus {
  const has = (p: string) => existing.includes(p);
  const outputById = new Map(phases.map((p) => [p.id, p.output]));

  const statuses: PhaseStatus[] = phases.map((ph) => {
    const done = has(ph.output);
    const missing = ph.requires
      .map((rid) => outputById.get(rid))
      .filter((o): o is string => o !== undefined && !has(o));
    const actionable = !done && missing.length === 0;
    return { id: ph.id, name: ph.name, skill: ph.skill, done, actionable, missing };
  });

  const current = statuses.find((s) => !s.done) ?? null;
  const nextAction = current
    ? `Prossima fase: ${current.id} (${current.name}) → skill ${current.skill}.`
    : "Tutte le fasi completate.";

  return { phases: statuses, currentPhaseId: current ? current.id : null, nextAction };
}
