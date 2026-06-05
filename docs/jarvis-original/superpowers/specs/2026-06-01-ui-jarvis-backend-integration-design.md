# ui_jarvis — Backend Integration Design

**Data:** 2026-06-01  
**Branch:** feat/jarvis-ui-voice  
**Scope:** Collegare il frontend `ui_jarvis/` al backend `jarvis/` (server F1), migrando tutta la logica viva da `web/` e introducendo Redux come unico layer di stato.

---

## Contesto

`ui_jarvis/` è il nuovo frontend holografico "Stark" che sostituisce `web/`. Tutti i pannelli sono attualmente statici (mock data). `web/` contiene logica viva funzionante: polling `/stats`, chat `/ask`, voce wake-word + STT/TTS, boot sequence. Questa spec descrive come migrare e integrare quella logica in `ui_jarvis/`.

**Regola assoluta:** nessuna Context API. Stato globale solo tramite Redux store.

---

## Backend — Endpoint disponibili

| Endpoint | Metodo | Descrizione |
|---|---|---|
| `/ask` | POST | `{ text }` → `{ reply, route, model, tool }` |
| `/stats` | GET | `JarvisStats` (cpu, memory, uptime, models, tools) |
| `/health` | GET | health check per boot |
| `/translate` | POST | traduzione testo |

CORS già configurato nel server. `VITE_JARVIS_URL` (default `http://localhost:8787`).

---

## Dipendenze da aggiungere a `ui_jarvis/`

```json
"@reduxjs/toolkit": "^2.x",
"react-redux": "^9.x"
```

---

## Struttura Store Redux

```
ui_jarvis/src/store/
  index.ts              ← configureStore: combina statsApi + chatApi + slices
  statsApi.ts           ← RTK Query: GET /stats, GET /health
  chatApi.ts            ← RTK Query: POST /ask (mutation)
  slices/
    chatSlice.ts        ← messages[], events[], memorySeries[], isSending
    uiSlice.ts          ← activeView, isBooting
```

### `statsApi.ts`

```ts
// RTK Query — polling automatico, deduplication, zero fetch duplicati
endpoints:
  getStats: query → GET /stats, pollingInterval: 2000
  getHealth: query → GET /health (usata dal boot)
```

### `chatApi.ts`

```ts
endpoints:
  ask: mutation → POST /ask { text } → AskResponse
```

### `chatSlice.ts`

```ts
state:
  messages: ChatMessage[]     // storia chat completa
  events: DatastreamEvent[]   // log eventi (max 32, LIFO)
  memorySeries: number[]      // % memoria usata nel tempo (max 42 punti)
  isSending: boolean

actions:
  addMessage(msg: ChatMessage)
  addEvent(text: string)       // crea DatastreamEvent e prepend
  appendMemoryStat(pct: number)
  setIsSending(bool)
  clearMessages()
```

### `uiSlice.ts`

```ts
type ActiveView = 'home' | 'voce' | 'diagnostica' | 'sicurezza' | 'reti' | 'database' | 'hologram' | 'aggiornamenti' | 'impostazioni'

state:
  activeView: ActiveView   // default 'home'
  isBooting: boolean       // default true

actions:
  setActiveView(view: ActiveView)
  setBootComplete()
```

---

## Logica migrata da `web/`

### `lib/jarvis.ts` → `ui_jarvis/src/lib/jarvis.ts`

Copia diretta. Tipi e utility condivise:
- `JARVIS_URL`, `Speaker`, `ChatMessage`, `AskResponse`, `JarvisStats`, `DatastreamEvent`, `ResponseMeta`
- `makeMessageId()`, `formatUptime()`, `formatPercent()`, `metaItems()`, `makeDatastreamEvent()`

### `hooks/useVoice.ts` → `ui_jarvis/src/hooks/useVoice.ts`

Copia diretta da `web/`. Nessuna modifica alla logica interna.  
Inizializzato **una sola volta** in `App.tsx`.  
`onTranscript` → dispatcha `sendMessage` thunk.  
`onEvent` → dispatcha `addEvent`.

### `hooks/useAppReady.ts` → `ui_jarvis/src/hooks/useAppReady.ts`

Adattato: aggiunge un `minDelay` di 5500ms in parallelo agli altri check (logo, font, health). Il componente non è pronto finché tutti i check E il delay minimo non completano.

### `BootScreen` → `ui_jarvis/src/components/BootScreen/`

Portato da `web/src/components/BootScreen.tsx`. Stilizzato per il tema holografico di `ui_jarvis`. Mostrato finché `uiSlice.isBooting === true`.

---

## Thunk: `sendMessage`

```ts
// store/thunks/sendMessage.ts
export const sendMessage = (text: string) => async (dispatch) => {
  const userMsg = makeUserMessage(text)
  dispatch(addMessage(userMsg))
  dispatch(addEvent(`RICKY STARK > ${text}`))
  dispatch(setIsSending(true))

  try {
    const result = await dispatch(chatApi.endpoints.ask.initiate({ text }))
    const reply = result.data.reply
    dispatch(addMessage(makeJarvisMessage(reply, result.data)))
    dispatch(addEvent(`JARVIS < ${reply}`))
    // speak viene chiamato da App.tsx tramite voiceRef
  } catch (err) {
    dispatch(addMessage(makeErrorMessage(err)))
  } finally {
    dispatch(setIsSending(false))
  }
}
```

Il TTS (`voice.speak`) non entra nello store — viene chiamato in `App.tsx` tramite un ref che osserva i nuovi messaggi JARVIS.

---

## Wiring Pannelli → Store

### Pannelli read-only da `statsApi`

| Componente | Hook RTK Query | Dati usati |
|---|---|---|
| `StatoSistema` | `useGetStatsQuery()` | `cpu.loadAvg1m`, `memory`, `status` |
| `ModuloAI` | `useGetStatsQuery()` | `status`, `models.local`, `models.api` — badge ATTIVO/OFFLINE |
| `UptimeClock` | `useGetStatsQuery()` | `uptimeSeconds` — uptime reale del server |
| `Header` | `useGetStatsQuery()` | `status` → `SISTEMA ONLINE / OFFLINE` |

`AnalisiSistema` legge `memorySeries` da `chatSlice` (aggiornata ad ogni poll di `/stats` tramite un `useEffect` in `App.tsx` che osserva il risultato di `useGetStatsQuery`).

### Pannelli read-only da `chatSlice`

| Componente | Dati |
|---|---|
| `AssistenteAI` | `messages[]` — sempre visibile, read-only |
| `LogSistema` | `events[]` — log eventi reali |

### View host (pannello centrale)

```tsx
// App.tsx o CenterPanel component
const activeView = useSelector(state => state.ui.activeView)

switch (activeView) {
  case 'voce': return <VoiceView voice={voice} />
  case 'diagnostica': return <DiagnosticaView />
  // ... future views
  default: return null  // pannello centrale vuoto
}
```

### `ComandoRapido`

Ogni button dispatcha `setActiveView(item.toLowerCase())`. Il button attivo viene evidenziato se `activeView === item.toLowerCase()`.

### `VoiceView` (nuovo componente da creare)

View del pannello centrale quando `activeView === 'voce'`.

```
ui_jarvis/src/components/VoiceView/
  VoiceView.tsx
  VoiceView.module.scss
```

Contiene:
- Lista messaggi (legge `messages[]` da store)
- Input testuale + submit (dispatcha `sendMessage` thunk)
- Pulsante mic (stato listening/speaking da `voice` prop)
- Pulsante mute
- Indicatore stato voce (`modeLabel`)

---

## Boot Sequence

1. `App.tsx` monta → `isBooting: true` → renderizza solo `<BootScreen />`
2. `useAppReady` in parallelo: carica logo, font, GET `/health`, delay 5500ms
3. Tutto completo → `dispatch(setBootComplete())` → `isBooting: false`
4. Dashboard appare, `useVoice({ autoStart: true })` parte

---

## Voce Always-On

```tsx
// App.tsx (semplificato)
const isBooting = useSelector(state => state.ui.isBooting)
const messages = useSelector(state => state.chat.messages)
const lastJarvisMsg = messages.findLast(m => m.speaker === 'jarvis')
const speakRef = useRef<(text: string) => void>(() => {})

const voice = useVoice({
  autoStart: !isBooting,
  onTranscript: (text) => dispatch(sendMessage(text)),
  onEvent: (text) => dispatch(addEvent(text)),
})

// TTS: parla ogni nuovo messaggio JARVIS
useEffect(() => { speakRef.current = voice.speak }, [voice.speak])
useEffect(() => {
  if (lastJarvisMsg) speakRef.current(lastJarvisMsg.text)
}, [lastJarvisMsg?.id])

// Aggiorna memorySeries ad ogni poll stats
const { data: stats } = useGetStatsQuery(undefined, { pollingInterval: 2000 })
useEffect(() => {
  if (stats) dispatch(appendMemoryStat(
    Math.round((stats.memory.usedMB / stats.memory.totalMB) * 100)
  ))
}, [stats])
```

La voce è inizializzata una volta sola. `VoiceView` riceve `voice` come prop solo per mostrare i controlli UI.

---

## File da creare / modificare

### Nuovi file

```
ui_jarvis/src/store/index.ts
ui_jarvis/src/store/statsApi.ts
ui_jarvis/src/store/chatApi.ts
ui_jarvis/src/store/slices/chatSlice.ts
ui_jarvis/src/store/slices/uiSlice.ts
ui_jarvis/src/store/thunks/sendMessage.ts
ui_jarvis/src/lib/jarvis.ts               (portato da web/)
ui_jarvis/src/hooks/useVoice.ts           (portato da web/)
ui_jarvis/src/hooks/useAppReady.ts        (portato + adattato da web/)
ui_jarvis/src/components/BootScreen/BootScreen.tsx
ui_jarvis/src/components/BootScreen/BootScreen.module.scss
ui_jarvis/src/components/VoiceView/VoiceView.tsx
ui_jarvis/src/components/VoiceView/VoiceView.module.scss
```

### File modificati

```
ui_jarvis/src/main.tsx                    ← wrappa App con <Provider store={store}>
ui_jarvis/src/App.tsx                     ← boot logic, useVoice, view host, memorySeries
ui_jarvis/src/components/AssistenteAI/AssistenteAI.tsx    ← legge messages[] da store
ui_jarvis/src/components/StatoSistema/StatoSistema.tsx    ← legge da statsApi
ui_jarvis/src/components/ModuloAI/ModuloAI.tsx            ← legge status/models da statsApi
ui_jarvis/src/components/UptimeClock/UptimeClock.tsx      ← uptimeSeconds da statsApi
ui_jarvis/src/components/LogSistema/LogSistema.tsx        ← legge events[] da store
ui_jarvis/src/components/AnalisiSistema/AnalisiSistema.tsx ← legge memorySeries da store
ui_jarvis/src/components/ComandoRapido/ComandoRapido.tsx  ← dispatcha setActiveView
ui_jarvis/src/components/Header/Header.tsx                ← status online/offline da statsApi
ui_jarvis/package.json                    ← aggiunge @reduxjs/toolkit, react-redux
```

---

## Componenti statici (invariati per ora)

- `MeteoLocale` — nessun endpoint dedicato; da collegare a `/ask` come tool call in futuro
- `NetworkMap` — visualizzazione statica
- `Datastream` — onda SVG animata CSS, nessun dato reale necessario
- `HudPanel` — puro layout

---

## Invarianti

- `useVoice` inizializzato una sola volta in `App.tsx`
- Polling `/stats` una sola istanza RTK Query — tutti i pannelli leggono la stessa cache
- Nessuna Context API in nessun file
- `web/` non viene toccato — resta come riferimento
