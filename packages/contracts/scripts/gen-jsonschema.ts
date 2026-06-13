import { mkdirSync, writeFileSync } from "node:fs";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AgentDone, AgentToken, BargeIn, Event, Hello, RenderEvent, RouteInfo,
  SttFinal, SttPartial, SysError, ToolCall, ToolResult, TtsCancel, TtsSpeak, UiControl,
} from "../src/events.js";
import { PersonaProfile, RoutingHints } from "../src/persona.js";

mkdirSync("dist-schema", { recursive: true });

// Named definitions give the Python codegen stable, readable class names.
const eventSchema = zodToJsonSchema(Event, {
  name: "Event",
  definitions: {
    Hello, SttPartial, SttFinal, BargeIn, TtsSpeak, TtsCancel,
    AgentToken, AgentDone, RouteInfo, ToolCall, ToolResult, SysError, RenderEvent, UiControl,
  },
});
writeFileSync("dist-schema/events.schema.json", JSON.stringify(eventSchema, null, 2) + "\n");

const personaSchema = zodToJsonSchema(PersonaProfile, {
  name: "PersonaProfile",
  definitions: { RoutingHints },
});
writeFileSync("dist-schema/persona.schema.json", JSON.stringify(personaSchema, null, 2) + "\n");

console.log("dist-schema written: events.schema.json, persona.schema.json");
