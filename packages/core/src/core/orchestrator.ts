import type { Message, Result, RouteCtx } from "../llm/types.js";
import type { Config } from "../config.js";
import type { Registry } from "../tools/registry.js";
import type { Session } from "./session.js";
import { decide } from "./router.js";

const SYSTEM_LOCAL =
  "Sei JARVIS, un assistente operativo conciso e diretto. Rispondi in italiano. " +
  "Quando l'utente chiede un'azione concreta usa gli strumenti disponibili. " +
  "Per le chiacchiere rispondi normalmente, senza inventare strumenti.";
const SYSTEM_API = "Sei JARVIS, un assistente esperto. Rispondi in italiano, con rigore e concretezza.";

interface Deps {
  cfg: Config;
  registry: Registry;
  chatLocal: (a: { url: string; model: string; messages: Message[]; tools?: unknown[] }) => Promise<Message>;
  chatApi: (a: { apiKey: string | undefined; model: string; messages: Message[] }) => Promise<string>;
}

export class Orchestrator {
  constructor(private deps: Deps) {}

  async handle(input: string, session: Session, ctx: RouteCtx): Promise<Result> {
    const { cfg, registry, chatLocal, chatApi } = this.deps;
    const route = decide(input, ctx, cfg);
    session.append({ role: "user", content: input });

    if (route.target === "api") {
      const reply = await chatApi({
        apiKey: cfg.anthropicApiKey,
        model: route.model,
        messages: [{ role: "system", content: SYSTEM_API }, ...session.messages()],
      });
      session.append({ role: "assistant", content: reply });
      return { route: "api", model: route.model, tool: null, reply };
    }

    const msg = await chatLocal({
      url: cfg.ollamaUrl,
      model: route.model,
      messages: [{ role: "system", content: SYSTEM_LOCAL }, ...session.messages()],
      tools: registry.schemas(),
    });

    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      session.append({ role: "assistant", content: msg.content });
      return { route: "local", model: route.model, tool: null, reply: msg.content };
    }

    const call = calls[0]!.function;
    const tool = registry.get(call.name);
    if (!tool) {
      const reply = `Strumento '${call.name}' sconosciuto.`;
      session.append({ role: "assistant", content: reply });
      return { route: "local", model: route.model, tool: call.name, reply };
    }

    let toolResult: string;
    try {
      toolResult = String(await tool.handler(call.arguments ?? {}));
    } catch (e) {
      toolResult = `Errore nell'esecuzione di ${call.name}: ${(e as Error).message}`;
    }

    const final = await chatLocal({
      url: cfg.ollamaUrl,
      model: route.model,
      messages: [
        { role: "system", content: SYSTEM_LOCAL },
        ...session.messages(),
        { role: "assistant", content: "", tool_calls: calls },
        { role: "tool", content: toolResult, tool_name: call.name },
      ],
    });
    const reply = final.content || toolResult;
    session.append({ role: "assistant", content: reply });
    return { route: "local", model: route.model, tool: call.name, reply };
  }
}
