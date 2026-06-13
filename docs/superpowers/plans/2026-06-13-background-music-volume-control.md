# Musica di sottofondo + controllo volume — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far suonare una traccia mp3 in loop nel frontend e dare all'agente vocale il controllo a voce di tre volumi indipendenti — output di sistema, microfono e musica di sottofondo.

**Architecture:** Nuovo evento di contratto `ui.control` viaggia sull'hub WebSocket esistente (`ws://127.0.0.1:7710`) verso la UI. Volume output/microfono via mcp-os (`osascript`), path canonico che l'agente carica dal core registry. Volume musica via un tool MCP `music_control` che pubblica `ui.control` sull'hub. Tool Python equivalenti come fallback/standalone. La UI suona la traccia con un hook `useBackgroundMusic` e la espone con un controllo nell'Header.

**Tech Stack:** TypeScript (Zod, Vitest, MCP SDK, WebSocket globale Node 22), React/Vite (Testing Library), Python 3.12 (LiveKit `function_tool`, `websockets`, `osascript`), datamodel-codegen.

---

## File Structure

| File | Responsabilità | Azione |
|------|----------------|--------|
| `packages/contracts/src/events.ts` | Definizione `UiControl` + union `Event` | Modify |
| `packages/contracts/scripts/gen-jsonschema.ts` | Registrare `UiControl` nelle definitions | Modify |
| `packages/contracts/fixtures/events/valid/ui.control.json` | Fixture valida | Create |
| `packages/contracts/fixtures/events/invalid/ui.control-bad-action.json` | Fixture invalida | Create |
| `packages/contracts/test/events.test.ts` | Lista tipi attesi | Modify |
| `packages/voice/contracts_gen/events.py` | Pydantic generato | Generated |
| `tools/mcp-os/src/computerControl.ts` | Azioni `mic_set`/`mic_mute` | Modify |
| `tools/mcp-os/src/musicControl.ts` | Tool `music_control` → hub | Create |
| `tools/mcp-os/src/server.ts` | Registrare `music_control` | Modify |
| `tools/mcp-os/test/systemTools.test.ts` | Test mic | Modify |
| `tools/mcp-os/test/musicControl.test.ts` | Test music_control | Create |
| `packages/ui/public/soundtrack.mp3` | Traccia audio | Create (move) |
| `packages/ui/src/hooks/useBackgroundMusic.ts` | Player + ascolto `ui.control` | Create |
| `packages/ui/src/hooks/useBackgroundMusic.test.tsx` | Test hook | Create |
| `packages/ui/src/components/Header/Header.tsx` | Controllo musica visibile | Modify |
| `packages/ui/src/components/Header/Header.module.scss` | Stile controllo | Modify |
| `packages/voice/volume.py` | Funzioni volume Python | Create |
| `packages/voice/tests/test_volume.py` | Test funzioni Python | Create |
| `packages/voice/tools.py` | Wrapper `@function_tool` | Modify |
| `packages/voice/agent.py` | Aggiunta a `LEGACY_TOOLS` | Modify |

---

## Task 1: Contratto `ui.control`

**Files:**
- Modify: `packages/contracts/src/events.ts`
- Modify: `packages/contracts/scripts/gen-jsonschema.ts`
- Create: `packages/contracts/fixtures/events/valid/ui.control.json`
- Create: `packages/contracts/fixtures/events/invalid/ui.control-bad-action.json`
- Modify: `packages/contracts/test/events.test.ts`

- [ ] **Step 1: Aggiungi le fixtures**

Create `packages/contracts/fixtures/events/valid/ui.control.json`:

```json
{ "v": 1, "type": "ui.control", "target": "music", "action": "set", "value": 30 }
```

Create `packages/contracts/fixtures/events/invalid/ui.control-bad-action.json`:

```json
{ "v": 1, "type": "ui.control", "target": "music", "action": "explode" }
```

- [ ] **Step 2: Aggiorna la lista dei tipi attesi nel test**

In `packages/contracts/test/events.test.ts`, nell'array dentro `expect([...types].sort()).toEqual([...])`, aggiungi `"ui.control"` mantenendo l'ordine alfabetico (va dopo `"tts.speak"`):

```ts
    expect([...types].sort()).toEqual([
      "agent.done", "agent.token", "barge_in", "hello",
      "render.event", "route.info", "stt.final", "stt.partial", "sys.error",
      "tool.call", "tool.result", "tts.cancel", "tts.speak", "ui.control",
    ]);
```

- [ ] **Step 3: Esegui i test per vederli fallire**

Run: `cd packages/contracts && npm test`
Expected: FAIL — manca una fixture valida per `ui.control` e lo schema non conosce il tipo.

- [ ] **Step 4: Definisci `UiControl` nel contratto**

In `packages/contracts/src/events.ts`, dopo il blocco `RenderEvent` (prima di `export const Event = z.discriminatedUnion(...)`), aggiungi:

```ts
// — agent-core → hud (controllo UI) —
export const UiControl = z.object({ ...base, type: z.literal("ui.control"),
  target: z.literal("music"),
  action: z.enum(["set", "mute", "unmute", "play", "pause"]),
  value: z.number().min(0).max(100).optional() });
export type UiControl = z.infer<typeof UiControl>;
```

Poi aggiungi `UiControl` all'union discriminata:

```ts
export const Event = z.discriminatedUnion("type", [
  Hello, SttPartial, SttFinal, BargeIn,
  TtsSpeak, TtsCancel,
  AgentToken, AgentDone, RouteInfo, ToolCall, ToolResult, SysError,
  RenderEvent, UiControl,
]);
```

- [ ] **Step 5: Registra `UiControl` nel codegen**

In `packages/contracts/scripts/gen-jsonschema.ts`, aggiungi `UiControl` all'import da `../src/events.js` e all'oggetto `definitions` del primo `zodToJsonSchema`:

```ts
import {
  AgentDone, AgentToken, BargeIn, Event, Hello, RenderEvent, RouteInfo,
  SttFinal, SttPartial, SysError, ToolCall, ToolResult, TtsCancel, TtsSpeak, UiControl,
} from "../src/events.js";
```

```ts
  definitions: {
    Hello, SttPartial, SttFinal, BargeIn, TtsSpeak, TtsCancel,
    AgentToken, AgentDone, RouteInfo, ToolCall, ToolResult, SysError, RenderEvent, UiControl,
  },
```

- [ ] **Step 6: Esegui i test TS per verificare che passino**

Run: `cd packages/contracts && npm test`
Expected: PASS — la fixture valida parsa, quella invalida è rigettata, la lista tipi combacia.

- [ ] **Step 7: Rigenera i modelli Pydantic e verifica il lato Python**

Run (dalla root): `make codegen`
Expected: rigenera `packages/voice/contracts_gen/events.py` includendo `UiControl`.

Run: `cd packages/voice && ./.venv/bin/pytest tests/test_contracts.py -v`
Expected: PASS — la nuova fixture valida/invalida è coperta automaticamente.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/events.ts packages/contracts/scripts/gen-jsonschema.ts \
  packages/contracts/fixtures/events packages/contracts/test/events.test.ts \
  packages/voice/contracts_gen/events.py
git commit -m "feat(contracts): aggiunge evento ui.control per controllo musica UI"
```

---

## Task 2: mcp-os — volume microfono

**Files:**
- Modify: `tools/mcp-os/src/computerControl.ts`
- Modify: `tools/mcp-os/test/systemTools.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

In `tools/mcp-os/test/systemTools.test.ts`, dentro `describe("computer_control", ...)`, aggiungi:

```ts
  it("imposta il volume del microfono su macOS", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const control = createComputerControl({ platform: "darwin", execFile });

    await expect(control({ action: "mic_set", value: 70 })).resolves.toMatchObject({ ok: true });
    expect(execFile).toHaveBeenCalledWith(
      "osascript",
      ["-e", "set volume input volume 70"],
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it("muta il microfono portando l'input a 0", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const control = createComputerControl({ platform: "darwin", execFile });

    await expect(control({ action: "mic_mute" })).resolves.toMatchObject({ ok: true });
    expect(execFile).toHaveBeenCalledWith(
      "osascript",
      ["-e", "set volume input volume 0"],
      expect.objectContaining({ timeout: 5000 }),
    );
  });
```

- [ ] **Step 2: Esegui i test per vederli fallire**

Run: `cd tools/mcp-os && npm test`
Expected: FAIL — `mic_set`/`mic_mute` non sono azioni supportate (`UNSUPPORTED_ACTION`).

- [ ] **Step 3: Aggiungi le azioni microfono**

In `tools/mcp-os/src/computerControl.ts`, estendi `safeActions`:

```ts
const safeActions = [
  "volume_set",
  "volume_up",
  "volume_down",
  "mute",
  "mic_set",
  "mic_mute",
  "sleep_display",
  "lock_screen",
] as const;
```

In `runMac`, prima del ramo `sleep_display`/`lock_screen`, aggiungi:

```ts
  if (action === "mic_set") {
    await execFile("osascript", ["-e", `set volume input volume ${clampPercent(value, 50)}`], { timeout: 5000 });
    return;
  }
  if (action === "mic_mute") {
    await execFile("osascript", ["-e", "set volume input volume 0"], { timeout: 5000 });
    return;
  }
```

In `runLinux`, prima del ramo `lock_screen`, aggiungi:

```ts
  else if (action === "mic_set") await execFile("pactl", ["set-source-volume", "@DEFAULT_SOURCE@", `${clampPercent(value, 50)}%`], { timeout: 5000 });
  else if (action === "mic_mute") await execFile("pactl", ["set-source-mute", "@DEFAULT_SOURCE@", "1"], { timeout: 5000 });
```

(Il ramo Windows resta best-effort tramite il suo `else` esistente — nessuna modifica.)

Aggiorna la description del tool in `tools/mcp-os/src/server.ts`:

```ts
    description: "Safe OS controls: output volume, microphone volume, display sleep, lock screen. Shutdown/restart are excluded by design.",
```

- [ ] **Step 4: Esegui i test per verificare che passino**

Run: `cd tools/mcp-os && npm test`
Expected: PASS — entrambi i nuovi test verdi, gli esistenti invariati.

- [ ] **Step 5: Commit**

```bash
git add tools/mcp-os/src/computerControl.ts tools/mcp-os/src/server.ts tools/mcp-os/test/systemTools.test.ts
git commit -m "feat(mcp-os): controllo volume microfono in computer_control"
```

---

## Task 3: mcp-os — tool `music_control`

**Files:**
- Create: `tools/mcp-os/src/musicControl.ts`
- Modify: `tools/mcp-os/src/server.ts`
- Create: `tools/mcp-os/test/musicControl.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

Create `tools/mcp-os/test/musicControl.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createMusicControl } from "../src/musicControl.js";

describe("music_control", () => {
  it("pubblica un evento ui.control sull'hub", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const control = createMusicControl({ hubUrl: "ws://test:1234", publish });

    const result = await control({ action: "set", value: 30 });

    expect(result).toMatchObject({ ok: true });
    expect(publish).toHaveBeenCalledTimes(1);
    const [url, messages] = publish.mock.calls[0];
    expect(url).toBe("ws://test:1234");
    const event = JSON.parse(messages[messages.length - 1]);
    expect(event).toMatchObject({ v: 1, type: "ui.control", target: "music", action: "set", value: 30 });
  });

  it("clampa value fuori range", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const control = createMusicControl({ hubUrl: "ws://test:1234", publish });

    await control({ action: "set", value: 250 });
    const event = JSON.parse(publish.mock.calls[0][1].at(-1));
    expect(event.value).toBe(100);
  });

  it("ritorna HUB_UNAVAILABLE se l'hub non risponde", async () => {
    const publish = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const control = createMusicControl({ hubUrl: "ws://test:1234", publish });

    await expect(control({ action: "pause" })).resolves.toMatchObject({
      ok: false,
      error: { code: "HUB_UNAVAILABLE" },
    });
  });

  it("rifiuta azioni non supportate", async () => {
    const control = createMusicControl({ hubUrl: "ws://test:1234", publish: vi.fn() });
    await expect(control({ action: "explode" })).resolves.toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_ACTION" },
    });
  });
});
```

- [ ] **Step 2: Esegui il test per vederlo fallire**

Run: `cd tools/mcp-os && npm test musicControl`
Expected: FAIL — `../src/musicControl.js` non esiste.

- [ ] **Step 3: Implementa `musicControl.ts`**

Create `tools/mcp-os/src/musicControl.ts`:

```ts
import type { ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";

const musicActions = ["set", "mute", "unmute", "play", "pause"] as const;
type MusicAction = typeof musicActions[number];

const DEFAULT_HUB_URL = "ws://127.0.0.1:7710";
const HELLO = { v: 1, type: "hello", role: "voice", client: "mcp-os-music" } as const;

export type Publisher = (url: string, messages: string[]) => Promise<void>;

export type MusicControlDeps = {
  hubUrl?: string;
  publish?: Publisher;
};

export const musicControlSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: musicActions },
    value: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["action"],
  additionalProperties: false,
};

function clampPercent(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

// Usa la WebSocket globale di Node 22 (undici): nessuna dipendenza extra.
function defaultPublish(url: string, messages: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out connecting to hub at ${url}`));
    }, 1000);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      for (const message of messages) socket.send(message);
      socket.close();
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`Could not reach hub at ${url}`));
    });
  });
}

export function createMusicControl(deps: MusicControlDeps = {}) {
  const publish = deps.publish ?? defaultPublish;
  const hubUrl = deps.hubUrl ?? process.env.STARK_HUB_URL ?? DEFAULT_HUB_URL;

  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const action = String(args.action ?? "").trim().toLowerCase();
    if (!musicActions.includes(action as MusicAction)) {
      return failure("UNSUPPORTED_ACTION", `Music action '${action || "(empty)"}' is not supported.`);
    }

    const value = action === "set" ? clampPercent(args.value, 50) : undefined;
    const event = {
      v: 1,
      type: "ui.control",
      target: "music",
      action,
      ...(value !== undefined ? { value } : {}),
    };

    try {
      await publish(hubUrl, [JSON.stringify(HELLO), JSON.stringify(event)]);
      return success({ target: "music", action, value });
    } catch (error) {
      return failure("HUB_UNAVAILABLE", `Could not reach UI hub for music ${action}.`, errorMessage(error));
    }
  };
}
```

- [ ] **Step 4: Registra il tool nel server**

In `tools/mcp-os/src/server.ts`, aggiungi l'import:

```ts
import { createMusicControl, musicControlSchema } from "./musicControl.js";
```

E aggiungi la voce all'oggetto `tools`:

```ts
  music_control: {
    description: "Control the UI background music: set volume (0-100), mute, unmute, play, pause. Sent to the HUD over the event hub.",
    inputSchema: musicControlSchema,
    handler: createMusicControl(),
  },
```

- [ ] **Step 5: Esegui i test per verificare che passino**

Run: `cd tools/mcp-os && npm test`
Expected: PASS — tutti i test di `musicControl` verdi.

- [ ] **Step 6: Typecheck**

Run: `cd tools/mcp-os && npm run typecheck`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add tools/mcp-os/src/musicControl.ts tools/mcp-os/src/server.ts tools/mcp-os/test/musicControl.test.ts
git commit -m "feat(mcp-os): tool music_control che pubblica ui.control sull'hub"
```

---

## Task 4: UI — hook `useBackgroundMusic`

**Files:**
- Create: `packages/ui/public/soundtrack.mp3` (spostamento dalla root)
- Create: `packages/ui/src/hooks/useBackgroundMusic.ts`
- Create: `packages/ui/src/hooks/useBackgroundMusic.test.tsx`

- [ ] **Step 1: Sposta la traccia mp3 nella public della UI**

Run (dalla root):

```bash
git mv "Iron Man OST - Driving With The Top Down.mp3" packages/ui/public/soundtrack.mp3
```

(Se il file non è ancora tracciato da git, usa `mv` semplice al posto di `git mv`.)

- [ ] **Step 2: Scrivi il test che fallisce**

Create `packages/ui/src/hooks/useBackgroundMusic.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBackgroundMusic } from "./useBackgroundMusic";

class MockSocket {
  static instances: MockSocket[] = [];
  onmessage: ((ev: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = 1;
  constructor(public url: string) {
    MockSocket.instances.push(this);
  }
  send() {}
  close() {}
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

beforeEach(() => {
  MockSocket.instances = [];
  vi.stubGlobal("WebSocket", MockSocket as unknown as typeof WebSocket);
  // jsdom non implementa play(): stub che risolve.
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useBackgroundMusic", () => {
  it("parte in pausa con un volume di default", () => {
    const { result } = renderHook(() => useBackgroundMusic());
    expect(result.current.playing).toBe(false);
    expect(result.current.volume).toBeGreaterThan(0);
    expect(result.current.muted).toBe(false);
  });

  it("setVolume aggiorna lo stato", () => {
    const { result } = renderHook(() => useBackgroundMusic());
    act(() => result.current.setVolume(0.2));
    expect(result.current.volume).toBeCloseTo(0.2);
  });

  it("applica un evento ui.control 'set' ricevuto dall'hub", () => {
    const { result } = renderHook(() => useBackgroundMusic());
    act(() => {
      MockSocket.instances[0].onopen?.();
      MockSocket.instances[0].emit({
        v: 1, type: "ui.control", target: "music", action: "set", value: 25,
      });
    });
    expect(result.current.volume).toBeCloseTo(0.25);
  });

  it("toggleMute inverte muted", () => {
    const { result } = renderHook(() => useBackgroundMusic());
    act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(true);
  });
});
```

- [ ] **Step 3: Esegui il test per vederlo fallire**

Run: `cd packages/ui && npx vitest run src/hooks/useBackgroundMusic.test.tsx`
Expected: FAIL — il modulo `./useBackgroundMusic` non esiste.

- [ ] **Step 4: Implementa l'hook**

Create `packages/ui/src/hooks/useBackgroundMusic.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

const HUB_URL = "ws://127.0.0.1:7710";
const TRACK_SRC = "/soundtrack.mp3";
const RETRY_MS = 3000;
const DEFAULT_VOLUME = 0.4;

export type BackgroundMusic = {
  volume: number;
  muted: boolean;
  playing: boolean;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  togglePlay: () => void;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function useBackgroundMusic(): BackgroundMusic {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Crea l'elemento audio una sola volta.
  if (audioRef.current === null && typeof Audio !== "undefined") {
    const audio = new Audio(TRACK_SRC);
    audio.loop = true;
    audio.volume = DEFAULT_VOLUME;
    audioRef.current = audio;
  }

  // Riflette volume/mute sull'elemento.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  // Autostart al primo gesto utente (policy autoplay del browser).
  useEffect(() => {
    const start = () => {
      play();
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, [play]);

  // Ascolta i comandi ui.control dall'hub.
  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let socket: WebSocket | null = null;

    const connect = () => {
      socket = new WebSocket(HUB_URL);
      socket.onopen = () => {
        socket?.send(JSON.stringify({ v: 1, type: "hello", role: "hud", client: "friday-ui-music" }));
      };
      socket.onmessage = (message) => {
        try {
          const data = JSON.parse(String(message.data));
          if (data?.type !== "ui.control" || data?.target !== "music") return;
          switch (data.action) {
            case "set":
              setVolumeState(clamp01(Number(data.value) / 100));
              break;
            case "mute":
              setMuted(true);
              break;
            case "unmute":
              setMuted(false);
              break;
            case "play":
              play();
              break;
            case "pause":
              pause();
              break;
          }
        } catch {
          // frame non-JSON: ignorato
        }
      };
      socket.onclose = () => {
        if (!disposed) timer = window.setTimeout(connect, RETRY_MS);
      };
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [play, pause]);

  const setVolume = useCallback((value: number) => setVolumeState(clamp01(value)), []);
  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const togglePlay = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, play, pause]);

  return { volume, muted, playing, setVolume, toggleMute, togglePlay };
}
```

- [ ] **Step 5: Esegui il test per verificare che passi**

Run: `cd packages/ui && npx vitest run src/hooks/useBackgroundMusic.test.tsx`
Expected: PASS — tutti e quattro i test verdi.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/public/soundtrack.mp3 packages/ui/src/hooks/useBackgroundMusic.ts packages/ui/src/hooks/useBackgroundMusic.test.tsx
git commit -m "feat(ui): hook useBackgroundMusic con loop, autostart e ascolto ui.control"
```

---

## Task 5: UI — controllo musica nell'Header

**Files:**
- Modify: `packages/ui/src/components/Header/Header.tsx`
- Modify: `packages/ui/src/components/Header/Header.module.scss`

- [ ] **Step 1: Importa l'hook nell'Header**

In `packages/ui/src/components/Header/Header.tsx`, aggiungi l'import in cima (sotto gli import esistenti):

```ts
import { useBackgroundMusic } from "../../hooks/useBackgroundMusic";
```

- [ ] **Step 2: Usa l'hook dentro il componente**

Dentro `export function Header(...)`, dopo `const { state } = useVoiceAssistant();`, aggiungi:

```ts
  const music = useBackgroundMusic();
```

- [ ] **Step 3: Renderizza il controllo**

In `packages/ui/src/components/Header/Header.tsx`, dentro il `<header>`, subito prima del blocco `<div className={styles.statusItems}>`, inserisci:

```tsx
      <div className={styles.musicControl} aria-label="Musica di sottofondo">
        <button
          type="button"
          className={styles.musicButton}
          onClick={music.togglePlay}
          aria-pressed={music.playing}
          title={music.playing ? "Pausa musica" : "Riproduci musica"}
        >
          {music.playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          className={styles.musicButton}
          onClick={music.toggleMute}
          aria-pressed={music.muted}
          title={music.muted ? "Riattiva audio" : "Muta musica"}
        >
          {music.muted ? "🔇" : "🔊"}
        </button>
        <input
          type="range"
          className={styles.musicSlider}
          min={0}
          max={100}
          value={Math.round(music.volume * 100)}
          onChange={(e) => music.setVolume(Number(e.target.value) / 100)}
          aria-label="Volume musica"
        />
      </div>
```

- [ ] **Step 4: Aggiungi gli stili**

In coda a `packages/ui/src/components/Header/Header.module.scss`, aggiungi:

```scss
.musicControl {
  display: flex;
  align-items: center;
  gap: 8px;
}

.musicButton {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: inherit;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.4;
}

.musicButton:hover {
  border-color: rgba(255, 255, 255, 0.6);
}

.musicSlider {
  width: 80px;
  accent-color: currentColor;
  cursor: pointer;
}
```

- [ ] **Step 5: Verifica build e typecheck UI**

Run: `cd packages/ui && npx tsc --noEmit`
Expected: nessun errore di tipo.

Run: `cd packages/ui && npx vitest run`
Expected: PASS — i test esistenti (AppShell, ToolsPanel, WorkflowPanel) e il nuovo hook restano verdi.

- [ ] **Step 6: Verifica manuale**

Run (dalla root): `./start.sh`
Atteso: aprendo la UI, al primo click parte la musica in loop; i pulsanti play/pausa e mute funzionano; lo slider regola il volume in tempo reale.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/Header/Header.tsx packages/ui/src/components/Header/Header.module.scss
git commit -m "feat(ui): controllo musica (play/pausa, mute, volume) nell'Header"
```

---

## Task 6: Python — funzioni volume + wrapper tool

**Files:**
- Create: `packages/voice/volume.py`
- Create: `packages/voice/tests/test_volume.py`
- Modify: `packages/voice/tools.py`
- Modify: `packages/voice/agent.py`

- [ ] **Step 1: Scrivi i test che falliscono**

Create `packages/voice/tests/test_volume.py`:

```python
import json
from unittest.mock import MagicMock

import pytest

import volume


def test_parse_level_numbers_and_keywords():
    assert volume._parse_level(50) == 50
    assert volume._parse_level("70") == 70
    assert volume._parse_level("70%") == 70
    assert volume._parse_level("mute") == 0
    assert volume._parse_level("max") == 100
    assert volume._parse_level(250) == 100
    assert volume._parse_level(-5) == 0
    assert volume._parse_level("nonsense") == 50


def test_set_system_volume_calls_osascript(monkeypatch):
    calls = []
    monkeypatch.setattr(volume.subprocess, "run", lambda *a, **k: calls.append((a, k)))
    assert volume.set_system_volume("60") == 60
    args = calls[0][0][0]
    assert args == ["osascript", "-e", "set volume output volume 60"]


def test_set_microphone_volume_calls_osascript(monkeypatch):
    calls = []
    monkeypatch.setattr(volume.subprocess, "run", lambda *a, **k: calls.append((a, k)))
    assert volume.set_microphone_volume(40) == 40
    args = calls[0][0][0]
    assert args == ["osascript", "-e", "set volume input volume 40"]


@pytest.mark.asyncio
async def test_set_music_volume_publishes_ui_control():
    sent = []

    class FakeSocket:
        async def send(self, data):
            sent.append(json.loads(data))
        async def close(self):
            pass

    async def fake_connect(url):
        return FakeSocket()

    result = await volume.set_music_volume(30, connect=fake_connect)
    assert result == 30
    event = sent[-1]
    assert event == {"v": 1, "type": "ui.control", "target": "music", "action": "set", "value": 30}
```

- [ ] **Step 2: Esegui i test per vederli fallire**

Run: `cd packages/voice && ./.venv/bin/pytest tests/test_volume.py -v`
Expected: FAIL — il modulo `volume` non esiste.

- [ ] **Step 3: Implementa `volume.py`**

Create `packages/voice/volume.py`:

```python
"""Controllo volume per l'agente vocale (fallback/standalone).

Output e microfono via osascript (macOS). Musica via evento ui.control sull'hub.
Il path canonico per l'agente resta mcp-os; questi sono i wrapper Python di riserva
e utilizzabili come libreria.
"""
from __future__ import annotations

import json
import subprocess
from collections.abc import Awaitable, Callable
from typing import Any, Union

import websockets

DEFAULT_HUB_URL = "ws://127.0.0.1:7710"
ConnectFn = Callable[[str], Awaitable[Any]]

Level = Union[int, float, str]


def _parse_level(level: Level, default: int = 50) -> int:
    """Converte numero, percentuale o keyword ('mute'/'max') in 0-100."""
    if isinstance(level, str):
        s = level.strip().lower()
        if s in ("mute", "muted", "off"):
            return 0
        if s in ("max", "full"):
            return 100
        s = s.rstrip("%")
        try:
            level = float(s)
        except ValueError:
            return default
    try:
        n = int(round(float(level)))
    except (TypeError, ValueError):
        return default
    return max(0, min(100, n))


def set_system_volume(level: Level) -> int:
    """Imposta il volume output di sistema (macOS)."""
    n = _parse_level(level)
    subprocess.run(["osascript", "-e", f"set volume output volume {n}"], check=True, timeout=5)
    return n


def set_microphone_volume(level: Level) -> int:
    """Imposta il volume input del microfono (macOS). 'mute' => 0."""
    n = _parse_level(level)
    subprocess.run(["osascript", "-e", f"set volume input volume {n}"], check=True, timeout=5)
    return n


async def set_music_volume(
    level: Level,
    *,
    hub_url: str = DEFAULT_HUB_URL,
    connect: ConnectFn = websockets.connect,
) -> int:
    """Pubblica un evento ui.control sull'hub per regolare la musica della UI."""
    n = _parse_level(level)
    socket = await connect(hub_url)
    try:
        await socket.send(json.dumps({"v": 1, "type": "hello", "role": "voice", "client": "voice-volume"}))
        await socket.send(json.dumps({"v": 1, "type": "ui.control", "target": "music", "action": "set", "value": n}))
    finally:
        await socket.close()
    return n
```

- [ ] **Step 4: Esegui i test per verificare che passino**

Run: `cd packages/voice && ./.venv/bin/pytest tests/test_volume.py -v`
Expected: PASS — i cinque test verdi. (`pytest-asyncio` è già in `requirements.txt` e il marcatore `@pytest.mark.asyncio` è il pattern usato dagli altri test async del package, es. `tests/test_hub_bridge.py`.)

- [ ] **Step 5: Aggiungi i wrapper `@function_tool`**

In coda a `packages/voice/tools.py`, aggiungi:

```python
from volume import set_system_volume, set_microphone_volume, set_music_volume


@function_tool()
async def set_system_volume_tool(
    context: RunContext,  # type: ignore
    level: str) -> str:
    """
    Set the computer's output (speaker) volume.
    level: a percentage 0-100, or the words "mute"/"max".
    """
    n = await asyncio.to_thread(set_system_volume, level)
    return f"Volume di sistema impostato al {n}%."


@function_tool()
async def set_microphone_volume_tool(
    context: RunContext,  # type: ignore
    level: str) -> str:
    """
    Set the microphone (input) volume.
    level: a percentage 0-100, or the words "mute"/"max".
    """
    n = await asyncio.to_thread(set_microphone_volume, level)
    return f"Volume microfono impostato al {n}%."


@function_tool()
async def set_music_volume_tool(
    context: RunContext,  # type: ignore
    level: str) -> str:
    """
    Set the background music volume in the UI.
    level: a percentage 0-100, or the words "mute"/"max".
    """
    try:
        n = await set_music_volume(level)
        return f"Volume musica impostato al {n}%."
    except Exception as exc:  # hub non raggiungibile
        return f"Non riesco a raggiungere la UI per la musica: {exc}"
```

- [ ] **Step 6: Registra i wrapper nel fallback dell'agente**

In `packages/voice/agent.py`, aggiorna l'import dei tool (riga ~28) e `LEGACY_TOOLS` (riga ~182):

```python
from tools import (
    get_weather, search_web, send_email,
    set_system_volume_tool, set_microphone_volume_tool, set_music_volume_tool,
)
```

```python
LEGACY_TOOLS = [
    get_weather, search_web, send_email,
    set_system_volume_tool, set_microphone_volume_tool, set_music_volume_tool,
]
```

- [ ] **Step 7: Esegui l'intera suite voice per verificare nessuna regressione**

Run: `cd packages/voice && ./.venv/bin/pytest -q`
Expected: PASS — inclusi i nuovi test, nessuna regressione su contracts/fake_voice/ecc.

- [ ] **Step 8: Commit**

```bash
git add packages/voice/volume.py packages/voice/tests/test_volume.py packages/voice/tools.py packages/voice/agent.py
git commit -m "feat(voice): funzioni volume Python (output/mic/musica) come fallback tool"
```

---

## Verifica finale end-to-end

- [ ] **Step 1: Avvia lo stack**

Run (dalla root): `./start.sh`

- [ ] **Step 2: Controlli da verificare**

- La musica parte in loop al primo click sulla UI.
- Header: play/pausa, mute, slider volume musica funzionanti.
- A voce: "metti il volume di sistema al 100%" → l'output del Mac va al 100%.
- A voce: "metti il microfono al 50%" → l'input del Mac va al 50%.
- A voce: "abbassa la musica al 20%" → la musica nella UI scende (evento `ui.control` → hook).
- Con l'hub spento, il tool musica risponde con errore gestito (nessun crash).

- [ ] **Step 3: Lint generale**

Run (dalla root): `npm run lint`
Expected: nessun errore sui package toccati (core/ui/contracts, mcp-os).

---

## Note di completamento

- DRY: il clamp 0-100 è replicato dove i runtime sono separati (TS mcp-os, Python `volume.py`, UI `clamp01`) — è la duplicazione minima necessaria tra linguaggi/contesti, non condivisibile.
- YAGNI: una sola traccia, nessuna persistenza del volume, nessuna playlist (fuori scope da spec).
- Il path canonico a voce è mcp-os (`computer_control` + `music_control`); i tool Python sono il fallback quando il core registry è giù.
