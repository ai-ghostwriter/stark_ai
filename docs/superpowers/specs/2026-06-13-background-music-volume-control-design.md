# Musica di sottofondo + controllo volume (sistema / microfono / musica)

**Data:** 2026-06-13
**Stato:** design approvato (in attesa review spec)

## Obiettivo

1. Una traccia mp3 suona in **loop continuo** nel frontend mentre si usa l'app.
2. L'agente vocale può, **a voce**, regolare tre volumi **indipendenti**:
   - volume **output di sistema** del Mac (100% / 50% / mute / percentuale arbitraria);
   - volume **microfono** (input) del Mac (stessa gamma);
   - volume della **musica di sottofondo** nella UI.

## Contesto architetturale (esistente)

- **Frontend** `packages/ui` (React/Vite): riceve eventi dall'hub via WebSocket
  `ws://127.0.0.1:7710`. `useRenderEvents` parsa solo `RenderEvent`.
- **Hub** `packages/core/src/bus/hub.ts`: valida **ogni** messaggio contro l'union
  `Event` (Zod). Fa `hudBroadcast` di ogni evento valido verso i client `role:"hud"`.
  Un tipo non nel contratto viene rigettato con `sys.error`.
- **Voice agent** `packages/voice/agent.py`: i tool vengono caricati dal **core
  registry** via HTTP (`resolve_session_tools` → `load_core_tools`), che aggrega i
  server MCP in `tools/mcp.config.json`. I `@function_tool` Python in
  `tools.py` (`LEGACY_TOOLS`) sono usati **solo come fallback** quando il core è giù.
- **mcp-os** `tools/mcp-os`: server MCP stdio. `computer_control` gestisce già
  `volume_set` / `volume_up` / `volume_down` / `mute` sul **solo output** (macOS via
  `osascript`, con rami linux/win). Nessun controllo microfono.

**Conseguenza chiave:** perché un tool sia disponibile all'agente a voce deve stare
nel registry/MCP. Quindi sia volume sistema/mic sia il controllo musica passano da
mcp-os (path canonico). I tool Python restano come fallback/standalone.

## Componenti

### 1. Contratto — nuovo evento `UiControl`

File: `packages/contracts/src/events.ts` (+ rigenerazione Python).

```ts
export const UiControl = z.object({ ...base, type: z.literal("ui.control"),
  target: z.literal("music"),
  action: z.enum(["set", "mute", "unmute", "play", "pause"]),
  value: z.number().min(0).max(100).optional(),
});
```

- Aggiunto all'`Event` discriminated union e all'export `Event`.
- Aggiunto alle `definitions` di `packages/contracts/scripts/gen-jsonschema.ts`.
- Rigenerazione Pydantic: `make codegen` (Zod → JSON Schema → `contracts_gen/events.py`).
- Nessuna modifica all'hub: `hudBroadcast` inoltra già ogni evento valido agli hud.

**Interfaccia:** un produttore (mcp-os music tool) invia `UiControl`; la UI lo consuma.
**Dipendenze:** Zod; codegen Pydantic.

### 2. Musica di sottofondo nella UI

File mp3: spostato da root a `packages/ui/public/soundtrack.mp3` (rinominato, senza spazi).
La root resta pulita (Regola 3 di progetto).

- **Hook** `packages/ui/src/hooks/useBackgroundMusic.ts`:
  - crea un `HTMLAudioElement` con `loop = true`, `src = "/soundtrack.mp3"`;
  - stato interno: `volume` (0–1), `muted`, `playing`;
  - **autostart** al primo gesto utente (listener one-shot `pointerdown`/`keydown`
    su `window`) per rispettare la policy autoplay del browser → soddisfa "parte al
    primo click";
  - apre la stessa WS dell'hub (`ws://127.0.0.1:7710`, hello `role:"hud"`) e applica
    gli eventi `ui.control` con `target:"music"`:
    `set`→`volume=value/100`, `mute`/`unmute`, `play`/`pause`;
  - espone `{ volume, muted, playing, setVolume, toggleMute, togglePlay }`.
- **Controllo UI** nell'`Header` (`packages/ui/src/components/Header/Header.tsx` +
  `Header.module.scss`): blocco compatto con play/pausa, mute, slider volume —
  soddisfa "controllo visibile" della scelta "Entrambi".

**Interfaccia:** hook → componente Header. **Dipendenze:** WebSocket browser, contratto
`UiControl`.

Nota: l'hook apre una **seconda** connessione hub dedicata alla musica, separata da
`useRenderEvents`, per isolare le responsabilità (un hook = uno scopo).

### 3. mcp-os — volume sistema + microfono (path canonico agente)

File: `tools/mcp-os/src/computerControl.ts` (+ test).

- Estendere `safeActions` con: `mic_set` (usa `value` %), `mic_mute`.
- macOS: `osascript -e "set volume input volume N"`, mute input via
  `set volume input volume 0` (AppleScript non ha un "input muted" affidabile → mute = 0).
- Rami `linux` (`pactl set-source-volume/@DEFAULT_SOURCE@`) e `win32`: best-effort,
  coerenti con lo stile esistente.
- L'output con percentuale c'è già (`volume_set` + `value`). Aggiornare la description
  del tool per citare il microfono.

### 4. mcp-os — controllo musica (`music_control`)

File: `tools/mcp-os/src/musicControl.ts` (nuovo) + registrazione in `server.ts` (+ test).

- Tool MCP separato da `computer_control` perché usa un **transport diverso**
  (WebSocket verso l'hub, non `execFile`).
- Schema input: `action: "set"|"mute"|"unmute"|"play"|"pause"`, `value?: 0..100`.
- Handler: si connette a `ws://127.0.0.1:7710` (override via `STARK_HUB_URL`), invia
  `hello {role:"voice"}` poi l'evento `UiControl`, chiude. Timeout breve; in assenza di
  hub ritorna `failure("HUB_UNAVAILABLE", …)` senza crashare.
- Disponibile all'agente vocale via registry → soddisfa "regolare a voce il volume
  della musica".

### 5. Tool Python (fallback + standalone)

File: `packages/voice/volume.py` (nuovo), agganciato in `tools.py` / `LEGACY_TOOLS`.

- Funzioni pure: `set_system_volume(level)`, `set_microphone_volume(level)`,
  `set_music_volume(level)` — `level` accetta numero %, `"mute"`, `"max"`.
  Le prime due via `osascript`; la terza pubblica `UiControl` sull'hub (riuso del
  pattern `hub_bridge.py`).
- Wrapper `@function_tool` aggiunti a `LEGACY_TOOLS` in `agent.py`, così il controllo
  volume funziona anche se il core registry è giù.
- Onora la richiesta esplicita di "funzioni Python" senza creare tool duplicati nel
  registry quando il core è su (i wrapper sono fallback, non si sovrappongono a mcp-os).

## Flusso dati

Voce → "abbassa la musica al 30%":
`agent.py` → core registry `tools/call music_control {action:"set", value:30}`
→ mcp-os `musicControl` → WS hub `UiControl` → hub `hudBroadcast`
→ UI `useBackgroundMusic` → `audio.volume = 0.3`.

Voce → "metti il microfono al 50%":
`agent.py` → registry `computer_control {action:"mic_set", value:50}`
→ mcp-os → `osascript set volume input volume 50`.

UI → slider musica: `Header` → `useBackgroundMusic.setVolume` → `audio.volume`
(locale, nessun round-trip hub).

## Gestione errori

- Hub irraggiungibile dal `music_control`: `failure("HUB_UNAVAILABLE")`, l'agente
  risponde che la UI non è connessa. Nessun crash.
- `osascript` fallisce: `failure("CONTROL_FAILED")` come l'attuale `computer_control`.
- Browser blocca autoplay: la musica parte al primo gesto utente (listener one-shot);
  il controllo Header resta sempre usabile.
- Valori fuori range: clamp 0–100 (riuso `clampPercent` in mcp-os; clamp equivalente in
  `volume.py` e nello slider UI).

## Test

- **Contratto:** `UiControl` valido/invalid (Zod) lato TS; round-trip Pydantic lato
  Python (`tests/test_contracts.py`).
- **mcp-os:** `mic_set`/`mic_mute` con `execFile` mockato (come i test esistenti);
  `music_control` con connessione hub mockata (successo + `HUB_UNAVAILABLE`).
- **UI:** `useBackgroundMusic` — autostart al gesto, applicazione `ui.control`
  (set/mute/play), toggle locali (mock `HTMLAudioElement` + WS).
- **Python:** `volume.py` — parsing `level` (`%`/`mute`/`max`), chiamate `osascript`
  mockate, pubblicazione `UiControl` mockata.

## Fuori scope (YAGNI)

- Playlist / più tracce / crossfade: una sola traccia in loop.
- Persistenza del volume tra sessioni.
- Controllo volume per-app diverso da output/input/musica.
- Equalizzatore o effetti audio.
