import { join } from "node:path";

export interface Config {
  ollamaUrl: string;
  modelLocal: string;
  modelApi: string;
  modelApiHaiku: string;
  modelApiOpus: string;
  embedModel: string;
  anthropicApiKey: string | undefined;
  heavyInputChars: number;
  heavyPatterns: string[];
  opusPatterns: string[];
  cerebroScript: string;
  sessionFile: string;
}

const DEFAULT_HEAVY_PATTERNS = [
  "scrivi il capitolo",
  "scrivi un capitolo",
  "scrivi il libro",
  "manoscritto",
  "brief strategico",
  "outline completo",
];

const DEFAULT_OPUS_PATTERNS = [
  "scrivi il capitolo",
  "scrivi il libro",
  "manoscritto",
  "brief strategico",
  "outline completo",
];

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    ollamaUrl: env.OLLAMA_URL ?? "http://localhost:11434",
    modelLocal: env.JARVIS_MODEL_LOCAL ?? "qwen3:8b",
    modelApi: env.JARVIS_MODEL_API ?? "claude-sonnet-4-6",
    modelApiHaiku: env.JARVIS_MODEL_API_HAIKU ?? "claude-haiku-4-5-20251001",
    modelApiOpus: env.JARVIS_MODEL_API_OPUS ?? "claude-opus-4-8",
    embedModel: env.JARVIS_EMBED_MODEL ?? "bge-m3",
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    heavyInputChars: env.JARVIS_HEAVY_CHARS ? Number(env.JARVIS_HEAVY_CHARS) : 4000,
    heavyPatterns: DEFAULT_HEAVY_PATTERNS,
    opusPatterns: DEFAULT_OPUS_PATTERNS,
    cerebroScript:
      env.JARVIS_CEREBRO_SCRIPT ??
      "/Users/abstract/Documents/Claude/SKILLS/kdp-research-analyzer/scripts/parse_cerebro.py",
    sessionFile: env.JARVIS_SESSION_FILE ?? join(process.cwd(), ".jarvis", "session.json"),
  };
}
