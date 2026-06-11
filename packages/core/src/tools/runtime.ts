import type { Config } from "../config.js";
import { embed as embedRaw, type Embedder } from "../llm/embeddings.js";
import { getTime } from "./builtins/time.js";
import { getWeather } from "./builtins/weather.js";
import { readFileTool } from "./builtins/readFile.js";
import { makeIngestCerebro } from "./builtins/ingestCerebro.js";
import { makeBookStatus } from "./builtins/bookStatus.js";
import { makeRunPhase } from "./builtins/runPhase.js";
import { makeNewBook } from "./builtins/newBook.js";
import { makeKbIndex } from "./builtins/kbIndex.js";
import { makeKbSearch } from "./builtins/kbSearch.js";
import { aiosTools } from "./builtins/aios/index.js";
import { registerMcpTools, type McpRuntime } from "./mcp/registry.js";
import { Registry } from "./registry.js";

export type ToolRuntime = {
  registry: Registry;
  mcp: McpRuntime;
};

export function registerBuiltInTools(registry: Registry, cfg: Config): void {
  const ingestCerebro = makeIngestCerebro({ cerebroScript: cfg.cerebroScript });
  const bookStatus = makeBookStatus();
  const runPhase = makeRunPhase();
  const newBook = makeNewBook();
  const embedder: Embedder = (input) => embedRaw({ url: cfg.ollamaUrl, model: cfg.embedModel, input });
  const kbIndex = makeKbIndex({ embed: embedder, model: cfg.embedModel });
  const kbSearch = makeKbSearch({ embed: embedder });

  for (const tool of [getTime, getWeather, readFileTool, ingestCerebro, bookStatus, runPhase, newBook, kbIndex, kbSearch, ...aiosTools]) {
    registry.register(tool);
  }
}

export async function createToolRuntime(cfg: Config): Promise<ToolRuntime> {
  const registry = new Registry();
  registerBuiltInTools(registry, cfg);
  const mcp = await registerMcpTools(registry);
  return { registry, mcp };
}
