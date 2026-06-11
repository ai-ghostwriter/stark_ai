import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Unico modulo che tocca le sorgenti dati AIOS: i tool restano puliti.
const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = process.env.STARK_SEED_DIR ?? path.resolve(here, "../../../../seed");

const SEED_FILES = {
  brief: "daily_brief.json",
  metrics: "metrics.json",
  pipeline: "pipeline.json",
  intel: "intel.json",
  actions: "actions.json",
} as const;

export type AiosDataset = keyof typeof SEED_FILES;
export type AiosSource = "seed" | "live";

const demoMode = (): boolean => process.env.STARK_DEMO_MODE !== "0";

async function readSeed(dataset: AiosDataset): Promise<Record<string, unknown>> {
  const raw = await readFile(path.join(SEED_DIR, SEED_FILES[dataset]), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

// Gli adapter live (DB workspace reali) atterrano qui; null = "usa il seed".
async function readLive(_dataset: AiosDataset): Promise<Record<string, unknown> | null> {
  return null;
}

export async function loadDataset(
  dataset: AiosDataset,
): Promise<{ source: AiosSource; data: Record<string, unknown> }> {
  if (!demoMode()) {
    try {
      const live = await readLive(dataset);
      if (live && Object.keys(live).length > 0) return { source: "live", data: live };
    } catch {
      // live fallita: si scende al seed, il pannello non resta mai vuoto
    }
  }
  return { source: "seed", data: await readSeed(dataset) };
}
