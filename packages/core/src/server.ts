import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import { publishRenderEvent } from "./bus/hubPublisher.js";
import { loadConfig } from "./config.js";
import { Registry } from "./tools/registry.js";
import { registerBuiltInTools } from "./tools/runtime.js";
import { registerMcpTools, type McpRuntime } from "./tools/mcp/registry.js";
import { Session } from "./core/session.js";
import { JsonSessionStore, type SessionStore } from "./core/sessionStore.js";
import { collectStats } from "./core/systemStats.js";
import { translate } from "./core/translate.js";
import { Orchestrator } from "./core/orchestrator.js";
import { chatLocal } from "./llm/ollama.js";
import { chatApi } from "./llm/anthropic.js";
import { isRenderResult } from "./tools/render.js";
import type { Result, RouteCtx } from "./llm/types.js";

interface AskOrchestrator {
  handle(input: string, session: Session, ctx: RouteCtx): Promise<Result>;
}

interface HttpJsonResult {
  status: number;
  json: object;
}

type SaveSession = (history: ReturnType<Session["messages"]>) => Promise<void>;
type TranslateText = (text: string, to: "en") => Promise<string>;
type SpeakText = (text: string) => Promise<void>;
let activeSpeech: ChildProcess | null = null;

export function normalizeSpeechText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/([0-9]+(?:[.,][0-9]+)?)\s*°\s*C/gi, "$1 gradi")
    .replace(/([0-9]+(?:[.,][0-9]+)?)\s*km\/h/gi, "$1 chilometri orari")
    .replace(/([0-9]+(?:[.,][0-9]+)?)\s*%/g, "$1 percento")
    .replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitSpeechTextForSystem(text: string, maxLength = 140): string[] {
  const normalized = normalizeSpeechText(text);
  if (!normalized) return [];

  const chunks: string[] = [];
  let current = "";

  for (const sentence of normalized.split(/(?<=[.!?])\s+/)) {
    const candidate = `${current} ${sentence}`.trim();
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);

  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxLength) return [chunk];

    const forced: string[] = [];
    for (let index = 0; index < chunk.length; index += maxLength) {
      forced.push(chunk.slice(index, index + maxLength).trim());
    }
    return forced.filter(Boolean);
  });
}

function createRuntime(): {
  cfg: ReturnType<typeof loadConfig>;
  registry: Registry;
  orchestrator: Orchestrator;
  session: Session;
  sessionStore: SessionStore;
  ready: Promise<void>;
  close: () => Promise<void>;
} {
  const cfg = loadConfig();
  const registry = new Registry();
  registerBuiltInTools(registry, cfg);
  const orchestrator = new Orchestrator({ cfg, registry, chatLocal, chatApi });
  const session = new Session();
  const sessionStore = new JsonSessionStore(cfg.sessionFile);
  let mcp: McpRuntime | null = null;
  const ready = Promise.all([
    sessionStore.loadSession().then((history) => {
      session.setHistory(history);
    }),
    registerMcpTools(registry).then((runtime) => {
      mcp = runtime;
    }),
  ]).then(() => undefined);
  return {
    cfg,
    registry,
    orchestrator,
    session,
    sessionStore,
    ready,
    close: async () => {
      await mcp?.close();
    },
  };
}

export async function handleAsk(
  orchestrator: AskOrchestrator,
  session: Session,
  body: string,
  saveSession?: SaveSession,
): Promise<HttpJsonResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, json: { error: "Body JSON non valido." } };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("text" in parsed) ||
    typeof parsed.text !== "string" ||
    parsed.text.trim().length === 0
  ) {
    return { status: 400, json: { error: "Campo 'text' mancante." } };
  }

  try {
    const { route, model, tool, reply } = await orchestrator.handle(parsed.text, session, {});
    if (saveSession) await saveSession(session.messages());
    return { status: 200, json: { route, model, tool, reply } };
  } catch (e) {
    return { status: 500, json: { error: (e as Error).message } };
  }
}

export function handleToolsList(registry: Registry): HttpJsonResult {
  const tools = registry.schemas().map((schema) => ({
    name: schema.function.name,
    description: schema.function.description,
    parameters: schema.function.parameters,
  }));
  return { status: 200, json: { tools } };
}

function isToolResultShape(value: unknown): value is { ok: boolean } {
  return typeof value === "object" && value !== null && "ok" in value && typeof (value as { ok: unknown }).ok === "boolean";
}

export async function handleToolsCall(registry: Registry, body: string): Promise<HttpJsonResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, json: { ok: false, error: { code: "BAD_REQUEST", message: "Invalid JSON body." } } };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("name" in parsed) ||
    typeof parsed.name !== "string" ||
    ("args" in parsed && parsed.args !== undefined && (typeof parsed.args !== "object" || parsed.args === null || Array.isArray(parsed.args)))
  ) {
    return { status: 400, json: { ok: false, error: { code: "BAD_REQUEST", message: "Expected { name: string, args?: object }." } } };
  }

  const tool = registry.get(parsed.name);
  if (!tool) {
    return { status: 404, json: { ok: false, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${parsed.name}` } } };
  }

  const args = "args" in parsed && parsed.args !== undefined ? parsed.args : {};
  try {
    const result = await tool.handler(args as Record<string, unknown>);
    if (isRenderResult(result)) {
      await publishRenderEvent({
        v: 1,
        type: "render.event",
        id: randomUUID(),
        ts: Date.now(),
        tool: parsed.name,
        render: result.render.type,
        title: result.render.title,
        spoken: result.spoken,
        payload: result.render.payload,
      });
      return { status: 200, json: { ok: true, data: result.spoken } };
    }
    // MCP handles already return a structured ToolResult; plain in-process results get wrapped.
    const json = isToolResultShape(result) ? result : { ok: true, data: result };
    return { status: 200, json };
  } catch (e) {
    return { status: 200, json: { ok: false, error: { code: "TOOL_ERROR", message: (e as Error).message } } };
  }
}

export async function handleTranslate(translateText: TranslateText, body: string): Promise<HttpJsonResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, json: { error: "Body JSON non valido." } };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("text" in parsed) ||
    typeof parsed.text !== "string" ||
    parsed.text.trim().length === 0
  ) {
    return { status: 400, json: { error: "Campo 'text' mancante." } };
  }

  if ("to" in parsed && parsed.to !== undefined && parsed.to !== "en") {
    return { status: 400, json: { error: "Campo 'to' non supportato." } };
  }

  const text = parsed.text;
  try {
    const translated = await translateText(text, "en");
    return { status: 200, json: { translated } };
  } catch {
    return { status: 200, json: { translated: text } };
  }
}

export async function handleSpeak(speakText: SpeakText, body: string): Promise<HttpJsonResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, json: { error: "Body JSON non valido." } };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("text" in parsed) ||
    typeof parsed.text !== "string" ||
    parsed.text.trim().length === 0
  ) {
    return { status: 400, json: { error: "Campo 'text' mancante." } };
  }

  try {
    await speakText(parsed.text.trim());
    return { status: 200, json: { status: "speaking" } };
  } catch (e) {
    return { status: 500, json: { error: (e as Error).message } };
  }
}

export async function speakWithSystem(text: string): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("TTS di sistema disponibile solo su macOS.");
  }

  const chunks = splitSpeechTextForSystem(text);
  if (chunks.length === 0) return;

  if (activeSpeech && !activeSpeech.killed) {
    activeSpeech.kill();
    activeSpeech = null;
  }

  for (const chunk of chunks) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("say", [chunk], { stdio: "ignore" });
      activeSpeech = child;
      child.once("error", reject);
      child.once("close", (code) => {
        if (activeSpeech === child) {
          activeSpeech = null;
        }

        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`TTS di sistema terminato con codice ${code ?? "sconosciuto"}.`));
      });
    });
  }
}

function sendJson(res: ServerResponse, status: number, json: object): void {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(json));
}

function sendCorsPreflight(res: ServerResponse): void {
  res.writeHead(204, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
  });
  res.end();
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export function createJarvisServer() {
  const { cfg, registry, orchestrator, session, sessionStore, ready, close } = createRuntime();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "OPTIONS") {
      sendCorsPreflight(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { status: "online", tools: registry.schemas().length });
      return;
    }

    if (req.method === "GET" && url.pathname === "/stats") {
      const toolNames = registry.schemas().map((schema) => schema.function.name);
      sendJson(
        res,
        200,
        collectStats({
          uptime: () => process.uptime(),
          cpus: () => os.cpus(),
          loadAvg: () => os.loadavg(),
          totalmem: () => os.totalmem(),
          freemem: () => os.freemem(),
          models: { local: cfg.modelLocal, api: cfg.modelApi },
          toolNames,
        }),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/tools") {
      await ready;
      const result = handleToolsList(registry);
      sendJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && url.pathname === "/tools/call") {
      await ready;
      const body = await readBody(req);
      const result = await handleToolsCall(registry, body);
      sendJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && url.pathname === "/ask") {
      await ready;
      const body = await readBody(req);
      const result = await handleAsk(orchestrator, session, body, (history) => sessionStore.saveSession(history));
      sendJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && url.pathname === "/translate") {
      const body = await readBody(req);
      const result = await handleTranslate(
        (text, to) => translate({ chatLocal, cfg }, text, to),
        body,
      );
      sendJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && url.pathname === "/speak") {
      const body = await readBody(req);
      const result = await handleSpeak(speakWithSystem, body);
      sendJson(res, result.status, result.json);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  });
  server.on("close", () => {
    void close();
  });
  return server;
}

const currentModulePath = decodeURIComponent(new URL(import.meta.url).pathname);
if (process.argv[1] === currentModulePath) {
  const port = Number(process.env.JARVIS_PORT ?? 8787);
  createJarvisServer().listen(port, () => {
    process.stdout.write(`JARVIS HTTP server online on port ${port}\n`);
  });
}
