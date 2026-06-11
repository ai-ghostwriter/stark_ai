import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ToolResult } from "./types.js";
import { failure, success } from "./types.js";

export const gameUpdaterSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["resolve", "list", "download_status"] },
    game_name: { type: "string" },
    steam_path: { type: "string" },
  },
};

const knownAppIds: Record<string, [string, string]> = {
  pubg: ["578080", "PUBG: Battlegrounds"],
  "pubg battlegrounds": ["578080", "PUBG: Battlegrounds"],
  gta5: ["271590", "Grand Theft Auto V"],
  "gta v": ["271590", "Grand Theft Auto V"],
  cs2: ["730", "Counter-Strike 2"],
  csgo: ["730", "Counter-Strike 2"],
  "counter-strike 2": ["730", "Counter-Strike 2"],
  dota2: ["570", "Dota 2"],
  "dota 2": ["570", "Dota 2"],
  rust: ["252490", "Rust"],
  valheim: ["892970", "Valheim"],
  cyberpunk: ["1091500", "Cyberpunk 2077"],
  "elden ring": ["1245620", "ELDEN RING"],
  minecraft: ["1672970", "Minecraft Launcher"],
  "apex legends": ["1172470", "Apex Legends"],
  fortnite: ["1517990", "Fortnite"],
};

function resolveKnown(name: string): { appId: string; name: string } | null {
  const key = name.toLowerCase().trim();
  const exact = knownAppIds[key];
  if (exact) return { appId: exact[0], name: exact[1] };
  const partial = Object.entries(knownAppIds).find(([candidate]) => candidate.includes(key) || key.includes(candidate));
  return partial ? { appId: partial[1][0], name: partial[1][1] } : null;
}

function readSteamGames(steamPath: string): Array<{ appId: string; name: string; state: number }> {
  const apps = join(steamPath, "steamapps");
  if (!existsSync(apps)) return [];
  return readdirSync(apps)
    .filter((file) => /^appmanifest_\d+\.acf$/.test(file))
    .map((file) => {
      const text = readFileSync(join(apps, file), "utf8");
      return {
        appId: /"appid"\s+"(\d+)"/.exec(text)?.[1] ?? "",
        name: /"name"\s+"([^"]+)"/.exec(text)?.[1] ?? "",
        state: Number(/"StateFlags"\s+"(\d+)"/.exec(text)?.[1] ?? 0),
      };
    }).filter((game) => game.appId && game.name);
}

export function createGameUpdater() {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const action = String(args.action ?? "resolve").toLowerCase();
    const gameName = String(args.game_name ?? "").trim();
    const steamPath = String(args.steam_path ?? "").trim();
    if (action === "resolve") {
      if (!gameName) return failure("MISSING_GAME_NAME", "Provide game_name.");
      const found = resolveKnown(gameName);
      return found ? success(found) : failure("GAME_NOT_FOUND", `No deterministic app id for ${gameName}.`);
    }
    if (action === "list") {
      if (!steamPath) return failure("MISSING_STEAM_PATH", "Provide steam_path for deterministic local listing.");
      const games = readSteamGames(steamPath);
      return success({ count: games.length, games });
    }
    if (action === "download_status") {
      if (!steamPath) return failure("MISSING_STEAM_PATH", "Provide steam_path for deterministic status.");
      const games = readSteamGames(steamPath);
      return success({ active: games.filter((g) => g.state === 1026), pending: games.filter((g) => [6, 516].includes(g.state)) });
    }
    return failure("UNSUPPORTED_ACTION", `${action} mutates external launchers and was not ported.`);
  };
}
