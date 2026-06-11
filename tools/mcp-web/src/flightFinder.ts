import type { OpenUrl, ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";

export const flightFinderSchema = {
  type: "object",
  properties: {
    origin: { type: "string" },
    destination: { type: "string" },
    date: { type: "string" },
    return_date: { type: "string" },
    passengers: { type: "number" },
    cabin: { type: "string", enum: ["economy", "premium", "business", "first"] },
    open: { type: "boolean" },
  },
  required: ["origin", "destination", "date"],
};

const cabinCodes: Record<string, string> = { economy: "1", premium: "2", business: "3", first: "4" };

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseFlightDate(raw: string, now = new Date()): string {
  const value = raw.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (["today", "oggi"].some((word) => value.includes(word))) return iso(now);
  if (["tomorrow", "domani"].some((word) => value.includes(word))) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 1);
    return iso(d);
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return iso(parsed);
  return iso(now);
}

export function buildGoogleFlightsUrl(args: { origin: string; destination: string; date: string; returnDate?: string; passengers: number; cabin: string }): string {
  const trip = args.returnDate
    ? `Flights from ${args.origin} to ${args.destination} on ${args.date} returning ${args.returnDate}`
    : `Flights from ${args.origin} to ${args.destination} on ${args.date}`;
  const params = new URLSearchParams({
    q: trip,
    curr: "EUR",
    cabin: cabinCodes[args.cabin] ?? "1",
    adults: String(args.passengers),
  });
  return `https://www.google.com/travel/flights?${params.toString()}`;
}

export function createFlightFinder(deps: { open: OpenUrl; now?: () => Date }) {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const origin = String(args.origin ?? "").trim();
    const destination = String(args.destination ?? "").trim();
    const dateRaw = String(args.date ?? "").trim();
    if (!origin || !destination) return failure("MISSING_ROUTE", "Provide both origin and destination.");
    if (!dateRaw) return failure("MISSING_DATE", "Provide a departure date.");
    const now = deps.now?.() ?? new Date();
    const date = parseFlightDate(dateRaw, now);
    const returnDate = args.return_date ? parseFlightDate(String(args.return_date), now) : undefined;
    const passengers = Math.max(1, Math.floor(Number(args.passengers ?? 1)));
    const cabin = cabinCodes[String(args.cabin ?? "economy").toLowerCase()] ? String(args.cabin ?? "economy").toLowerCase() : "economy";
    const url = buildGoogleFlightsUrl({ origin, destination, date, returnDate, passengers, cabin });
    try {
      if (args.open !== false) await deps.open(url);
      return success({ origin, destination, date, returnDate, passengers, cabin, url, opened: args.open !== false, note: "Best-effort Google Flights deep link; scraping was intentionally not ported." });
    } catch (error) {
      return failure("FLIGHT_LINK_OPEN_FAILED", "Could not open flight search URL.", errorMessage(error));
    }
  };
}
