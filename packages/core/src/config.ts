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

export const DEFAULT_CONFIG: Config = {
  ollamaUrl: "http://localhost:11434",
  modelLocal: "qwen3:8b",
  modelApi: "claude-sonnet-4-6",
  modelApiHaiku: "claude-haiku-4-5-20251001",
  modelApiOpus: "claude-opus-4-8",
  embedModel: "bge-m3",
  anthropicApiKey: undefined,
  heavyInputChars: 4000,
  heavyPatterns: DEFAULT_HEAVY_PATTERNS,
  opusPatterns: DEFAULT_OPUS_PATTERNS,
  cerebroScript: "/Users/abstract/Documents/Claude/SKILLS/kdp-research-analyzer/scripts/parse_cerebro.py",
  sessionFile: join(process.cwd(), ".jarvis", "session.json"),
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    ...DEFAULT_CONFIG,
    ollamaUrl: env.OLLAMA_URL ?? DEFAULT_CONFIG.ollamaUrl,
    modelLocal: env.JARVIS_MODEL_LOCAL ?? DEFAULT_CONFIG.modelLocal,
    modelApi: env.JARVIS_MODEL_API ?? DEFAULT_CONFIG.modelApi,
    modelApiHaiku: env.JARVIS_MODEL_API_HAIKU ?? DEFAULT_CONFIG.modelApiHaiku,
    modelApiOpus: env.JARVIS_MODEL_API_OPUS ?? DEFAULT_CONFIG.modelApiOpus,
    embedModel: env.JARVIS_EMBED_MODEL ?? DEFAULT_CONFIG.embedModel,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    heavyInputChars: env.JARVIS_HEAVY_CHARS ? Number(env.JARVIS_HEAVY_CHARS) : DEFAULT_CONFIG.heavyInputChars,
    cerebroScript:
      env.JARVIS_CEREBRO_SCRIPT ??
      DEFAULT_CONFIG.cerebroScript,
    sessionFile: env.JARVIS_SESSION_FILE ?? DEFAULT_CONFIG.sessionFile,
  };
}
