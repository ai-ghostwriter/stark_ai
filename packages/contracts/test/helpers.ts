import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Fixture {
  name: string;
  raw: string;
}

export const loadFixtures = (group: string, sub: "valid" | "invalid"): Fixture[] => {
  const dir = join(process.cwd(), "fixtures", group, sub);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, raw: readFileSync(join(dir, f), "utf8") }));
};
