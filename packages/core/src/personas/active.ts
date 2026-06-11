import { personaRegistry, type PersonaId, type PersonaRegistry } from "./registry.js";

export type ActivePersonaState = {
  current: () => PersonaId;
  switch: (id: PersonaId) => PersonaId;
};

export function createActivePersonaState(registry: PersonaRegistry = personaRegistry): ActivePersonaState {
  let active: PersonaId = "jarvis";

  return {
    current() {
      return active;
    },

    switch(id) {
      registry.get(id);
      active = id;
      return active;
    },
  };
}

export const activePersona = createActivePersonaState();
