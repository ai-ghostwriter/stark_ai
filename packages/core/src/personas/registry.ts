import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PersonaProfile, type PersonaProfile as PersonaProfileType } from "@stark-ai/contracts";

const here = dirname(fileURLToPath(import.meta.url));
const defaultProfilesDir = resolve(here, "../../personas/profiles");

export type PersonaRegistry = {
  get: (id: PersonaId) => PersonaProfileType;
  has: (id: string) => id is PersonaId;
  list: () => PersonaProfileType[];
};

export type PersonaId = PersonaProfileType["id"];

function loadProfile(path: string, fileName: string): PersonaProfileType {
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return PersonaProfile.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid persona profile ${fileName}: ${message}`);
  }
}

export function createPersonaRegistry(profilesDir = defaultProfilesDir): PersonaRegistry {
  const profiles = new Map<PersonaId, PersonaProfile>();
  const files = readdirSync(profilesDir).filter((fileName) => fileName.endsWith(".json")).sort();

  for (const fileName of files) {
    const profile = loadProfile(join(profilesDir, fileName), fileName);
    profiles.set(profile.id, profile);
  }

  return {
    get(id) {
      const profile = profiles.get(id);
      if (!profile) throw new Error(`Unknown persona profile: ${id}`);
      return profile;
    },

    has(id): id is PersonaId {
      return profiles.has(id as PersonaId);
    },

    list() {
      return [...profiles.values()];
    },
  };
}

export const personaRegistry = createPersonaRegistry();
