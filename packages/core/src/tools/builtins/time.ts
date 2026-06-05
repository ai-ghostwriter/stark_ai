import type { ToolDef } from "../../llm/types.js";

export const getTime: ToolDef = {
  name: "get_time",
  description: "Restituisce l'ora corrente in una timezone IANA.",
  parameters: {
    type: "object",
    properties: { timezone: { type: "string", description: "es. Europe/Rome" } },
  },
  handler: (args) => {
    const requested = typeof args.timezone === "string" ? args.timezone : "Europe/Rome";
    let tz = requested;
    let now: string;
    try {
      now = new Intl.DateTimeFormat("it-IT", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: tz,
      }).format(new Date());
    } catch {
      tz = "Europe/Rome";
      now = new Intl.DateTimeFormat("it-IT", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: tz,
      }).format(new Date());
    }
    return `${now} (${tz})`;
  },
};
