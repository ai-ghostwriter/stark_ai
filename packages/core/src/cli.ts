#!/usr/bin/env node
import * as readline from "node:readline/promises";
import { stdin, stdout, argv } from "node:process";
import { loadConfig } from "./config.js";
import { Registry } from "./tools/registry.js";
import { getTime } from "./tools/builtins/time.js";
import { getWeather } from "./tools/builtins/weather.js";
import { readFileTool } from "./tools/builtins/readFile.js";
import { makeIngestCerebro } from "./tools/builtins/ingestCerebro.js";
import { makeBookStatus } from "./tools/builtins/bookStatus.js";
import { makeRunPhase } from "./tools/builtins/runPhase.js";
import { makeNewBook } from "./tools/builtins/newBook.js";
import { makeKbIndex } from "./tools/builtins/kbIndex.js";
import { makeKbSearch } from "./tools/builtins/kbSearch.js";
import { Session } from "./core/session.js";
import { Orchestrator } from "./core/orchestrator.js";
import { chatLocal } from "./llm/ollama.js";
import { chatApi } from "./llm/anthropic.js";
import { embed as embedRaw, type Embedder } from "./llm/embeddings.js";
import type { RouteCtx } from "./llm/types.js";

const BANNER = `\n   J A R V I S  ·  hybrid local/API assistant\n   (--api / --local per forzare la rotta · 'esci' per uscire)\n`;

function parseOverride(args: string[]): RouteCtx {
  const ctx: RouteCtx = {};
  if (args.includes("--api")) ctx.override = "api";
  if (args.includes("--local")) ctx.override = "local";
  if (args.includes("--haiku")) ctx.apiTier = "haiku";
  if (args.includes("--sonnet")) ctx.apiTier = "sonnet";
  if (args.includes("--opus")) ctx.apiTier = "opus";
  return ctx;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const registry = new Registry();
  const ingestCerebro = makeIngestCerebro({ cerebroScript: cfg.cerebroScript });
  const bookStatus = makeBookStatus();
  const runPhase = makeRunPhase();
  const newBook = makeNewBook();
  const embedder: Embedder = (input) => embedRaw({ url: cfg.ollamaUrl, model: cfg.embedModel, input });
  const kbIndex = makeKbIndex({ embed: embedder, model: cfg.embedModel });
  const kbSearch = makeKbSearch({ embed: embedder });
  for (const t of [getTime, getWeather, readFileTool, ingestCerebro, bookStatus, runPhase, newBook, kbIndex, kbSearch])
    registry.register(t);
  const orch = new Orchestrator({ cfg, registry, chatLocal, chatApi });
  const session = new Session();
  const globalOverride = parseOverride(argv.slice(2));

  stdout.write(BANNER);
  const rl = readline.createInterface({ input: stdin, output: stdout });
  while (true) {
    const text = (await rl.question("tu > ")).trim();
    if (["quit", "exit", "esci"].includes(text.toLowerCase())) break;
    if (!text) continue;
    try {
      const res = await orch.handle(text, session, globalOverride);
      const tag = `[${res.route}${res.tool ? ` · ${res.tool}` : ""}]`;
      stdout.write(`jarvis ${tag} > ${res.reply}\n\n`);
    } catch (e) {
      stdout.write(`jarvis [errore] > ${(e as Error).message}\n\n`);
    }
  }
  rl.close();
}

main();
