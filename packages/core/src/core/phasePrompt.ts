import type { Phase } from "./kdpPhases.js";

export function buildPhasePrompt(root: string, phase: Phase, reqOutputs: string[]): string {
  const inputs = reqOutputs.length > 0 ? reqOutputs.join(", ") : "(nessun input formale)";
  return [
    `Sei un esecutore di fase KDP. Usa la skill ${phase.skill}.`,
    `Progetto: ${root}`,
    `Fase: ${phase.id} (${phase.name}).`,
    `File di input disponibili nel progetto: ${inputs}.`,
    `Esegui ESATTAMENTE la skill e scrivi il risultato in: ${root}/${phase.output}.`,
    `Esegui SOLO questa fase. Al termine conferma il file prodotto.`,
  ].join("\n");
}
