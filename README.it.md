[🇬🇧 English](README.md) | 🇮🇹 Italiano

# STARK-AI

STARK-AI è un assistente vocale AI locale/cloud in stile Iron Man. Il progetto combina una UI React con LiveKit, un voice agent Python e un core Node/TypeScript che funge da "brain" operativo per routing LLM, memoria di sessione e tool.

Le due personas principali sono:

- **JARVIS**: formale, tecnico, preciso, orientato ad analisi ingegneristica, debugging, architetture e decisioni strutturate.
- **FRIDAY**: concisa, critica, diretta, con giudizio senza filtri e tono da assistente personale.

Il sistema permette di selezionare runtime mode dalla UI tra `gemini`, `ollama`, `claude` e `gpt`. La modalità selezionata viene salvata nel token server in memoria e letta dal voice agent quando viene dispatchato nella stanza LiveKit.

## Cosa fa realmente STARK-AI

In pratica, STARK-AI è un **assistente vocale personale con cui parli dal browser**, costruito attorno a tre idee: economia local-first, esecuzione di task reali e un cervello di produzione per un business di self-publishing.

**Parli, risponde — con una personalità.** Apri la dashboard in stile HUD, parli al microfono e l'assistente ascolta, ragiona e risponde con voce sintetizzata. Se la prima parola è `JARVIS` ottieni l'ingegnere formale; in tutti gli altri casi risponde FRIDAY, l'assistente personale diretta e senza filtri. Persona e backend LLM si cambiano anche al volo dalla UI, senza riavviare nulla.

**Local-first, cloud solo quando serve.** Il core Node instrada ogni richiesta in base al peso: le domande quotidiane vanno a un modello Ollama locale (gratis, privato, funziona offline), mentre il lavoro pesante — input lunghi, scrittura manoscritti, brief strategici — viene scalato automaticamente all'API Anthropic, scegliendo il tier più economico adeguato (Haiku per classificazione/estrazione, Sonnet per scrittura/analisi, Opus per task di livello manoscritto e strategia). La sintesi vocale gira su un container Kokoro locale, quindi in modalità locale la tua voce non esce mai dalla macchina. Risultato: un assistente sempre acceso con costo marginale quasi zero, che spende in API solo dove la qualità lo richiede.

**Esegue, non si limita a chattare.** Tramite tool calling l'assistente controlla il meteo, cerca sul web, invia e-mail via Gmail, legge file e dice l'ora — a voce, end to end.

**Gestisce una vera operazione editoriale.** Il core incorpora il cervello operativo di una pipeline di produzione libri Amazon KDP: crea lo scaffold di un nuovo progetto libro (`newBook`), ingerisce le ricerche keyword Helium10 Cerebro (`ingestCerebro`), riporta lo stato di produzione (`bookStatus`) ed esegue le fasi del workflow (`runPhase`). Una knowledge base semantica locale (`kbIndex`/`kbSearch`, embeddings `bge-m3`) fa da brand memory cross-libro. In concreto: puoi chiedere a voce *"a che punto è il libro?"* e ottenere una risposta calcolata dallo stato reale di produzione su disco.

Un giro completo tipico: il browser cattura la voce → LiveKit la trasmette all'agent Python → lo STT la trascrive → il core Node la instrada (Ollama o Anthropic), invocando eventuali tool → la risposta torna come testo → Kokoro la pronuncia con la voce della persona — tutto orchestrato in locale, in pochi secondi.

## Architettura del monorepo

Il repository non ha un `package.json` root: i pacchetti Node sono gestiti dentro `packages/core` e `packages/ui`, mentre il componente voce è Python.

```text
STARK-AI/
├── .env.example
├── start.sh
├── docker/
│   ├── docker-compose.yml
│   └── livekit/
│       └── livekit.yaml
├── docs/
│   ├── superpowers/
│   └── jarvis-original/
└── packages/
    ├── core/
    ├── ui/
    └── voice/
```

### Flusso runtime

```text
Browser React UI
  └─ GET /token, GET/POST /mode, GET/POST /persona
     via proxy Vite verso Token Server FastAPI :8788
        ├─ genera token LiveKit
        ├─ dispatcha il voice agent nella room
        └─ mantiene mode/persona correnti in memoria

LiveKit Room
  └─ Voice Agent Python
     ├─ Gemini realtime se mode=gemini
     ├─ pipeline STT/LLM/TTS se mode=gpt
     └─ bridge HTTP verso Core Node se mode=ollama o mode=claude

Core Node :8787
  ├─ POST /ask
  ├─ POST /translate
  ├─ POST /speak
  ├─ GET /health
  └─ GET /stats
```

## Packages principali

### `packages/ui`

Frontend React/Vite per la dashboard vocale. Usa:

- `react` e `react-dom`
- `@livekit/components-react`
- `livekit-client`
- `sass`
- Vite con proxy locale verso `http://localhost:8788`

File rilevanti:

- `src/App.tsx`: richiede il token LiveKit a `/token`, apre `LiveKitRoom`, mostra boot/error screen e shell principale.
- `src/components/Header/Header.tsx`: mostra persona corrente, stato voice agent, orologio e selettori `FRIDAY/JARVIS` e `GEMINI/OLLAMA/CLAUDE/GPT`.
- `vite.config.ts`: espone la UI su porta `5173` e proxya `/token`, `/mode`, `/persona` al token server.

### `packages/voice`

Layer Python per LiveKit Agents, token server e personas.

File rilevanti:

- `agent.py`: entrypoint LiveKit agent. Legge mode/persona dal token server, avvia Gemini realtime oppure una pipeline STT/LLM/TTS.
- `token_server.py`: FastAPI server su porta `8788`; genera token LiveKit, dispatcha l'agent e gestisce `mode`/`persona`.
- `tts_kokoro.py`: adapter TTS compatibile OpenAI verso Kokoro locale (`KOKORO_URL`).
- `tools.py`: tool vocali `get_weather`, `search_web`, `send_email`.
- `personas/jarvis.py`: prompt, istruzione sessione e voce Kokoro per JARVIS.
- `personas/friday.py`: prompt, istruzione sessione e voce Kokoro per FRIDAY.
- `personas/detect.py`: detection minimale: se la prima parola dell'utente è `JARVIS`, sceglie JARVIS; altrimenti FRIDAY.

### `packages/core`

Core Node/TypeScript del brain JARVIS.

Responsabilità principali:

- server HTTP su porta `8787`;
- orchestrazione conversazione/sessione;
- routing locale/API;
- registry tool;
- integrazione Ollama locale;
- integrazione Anthropic API;
- endpoint utility per traduzione, speak di sistema macOS, health e stats.

File rilevanti:

- `src/server.ts`: crea server HTTP e registra endpoint `/ask`, `/translate`, `/speak`, `/health`, `/stats`.
- `src/config.ts`: carica modelli, URL Ollama, soglie di routing e path sessione.
- `src/core/router.ts`: decide `local` vs `api`.
- `src/core/tier.ts`: sceglie tier API `haiku`, `sonnet`, `opus`.
- `src/core/orchestrator.ts`: costruisce messaggi, chiama Ollama o Anthropic, gestisce tool calls locali.
- `src/llm/ollama.ts`: client `/api/chat` per Ollama.
- `src/llm/anthropic.ts`: client Anthropic Messages API.
- `src/tools/builtins/*`: tool locali registrati nel core, inclusi tempo, meteo, file read, KDP/book workflow e knowledge base.

## Stack tecnologico

### Frontend

- React 18
- TypeScript
- Vite
- Sass modules
- LiveKit React Components

### Backend/Core

- Node.js
- TypeScript
- HTTP server nativo Node
- Anthropic SDK
- Vitest per i test del core

### Voice/AI

- Python
- FastAPI + Uvicorn
- LiveKit Agents
- LiveKit API
- Plugin LiveKit: OpenAI, Google, Anthropic, Silero, noise cancellation
- OpenAI STT nella pipeline non-Gemini
- Google Gemini Realtime nella modalità `gemini`
- Kokoro FastAPI come TTS locale compatibile OpenAI
- Ollama come LLM locale del core
- Anthropic come API LLM per task pesanti nel core

### Infra locale

- Docker Compose per Kokoro TTS
- Config LiveKit locale in `docker/livekit/livekit.yaml`
- Script orchestratore `start.sh`
- File `.env` caricato da Python e Bash

## Configurazione

1. Copia il file env:

```bash
cp .env.example .env
```

2. Compila le variabili necessarie in `.env`.

Variabili presenti in `.env.example`:

```bash
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

GOOGLE_APPLICATION_CREDENTIALS=
OPENAI_API_KEY=

ANTHROPIC_API_KEY=
GOOGLE_GENAI_API_KEY=

JARVIS_URL=http://localhost:8787
KOKORO_URL=http://localhost:8880/v1
TOKEN_SERVER_URL=http://localhost:8788

OLLAMA_MODEL=qwen3:8b
```

Note importanti:

- `start.sh` esporta `JARVIS_MODEL_LOCAL` usando `OLLAMA_MODEL` se `JARVIS_MODEL_LOCAL` non è già impostata.
- Il core usa anche default non presenti in `.env.example`: `OLLAMA_URL=http://localhost:11434`, `JARVIS_MODEL_API=claude-sonnet-4-6`, `JARVIS_MODEL_API_HAIKU=claude-haiku-4-5-20251001`, `JARVIS_MODEL_API_OPUS=claude-opus-4-8`, `JARVIS_EMBED_MODEL=bge-m3`.
- Per `mode=claude` nel voice agent, la richiesta passa comunque dal core Node; nel core il routing API usa Anthropic quando la richiesta viene classificata come pesante o forzata via context interno.
- Per `mode=gpt`, il voice agent usa direttamente `openai.LLM(model="gpt-4o-mini")`.
- Per `mode=gemini`, il voice agent usa `google.beta.realtime.RealtimeModel`.
- `docker/docker-compose.yml` avvia solo Kokoro TTS. Non avvia LiveKit.
- `docker/livekit/livekit.yaml` contiene una configurazione LiveKit locale con porta `7880`, chiave `devkey` e secret `devsecret`, ma non è collegata al compose attuale.

## Setup dipendenze

Installa le dipendenze Node dei due package:

```bash
cd packages/core
npm install

cd ../ui
npm install
```

Il virtualenv Python di `packages/voice` viene creato automaticamente da `start.sh` se manca:

```bash
python3 -m venv packages/voice/.venv
packages/voice/.venv/bin/python -m pip install -r packages/voice/requirements.txt
```

Normalmente non serve eseguire questi due comandi a mano, salvo setup manuale o debug.

Assicurati inoltre che Docker sia attivo e, se usi Ollama:

```bash
ollama serve
ollama pull qwen3:8b
```

Se usi anche embeddings/KD knowledge base del core, prepara il modello configurato in `JARVIS_EMBED_MODEL` (default `bge-m3`).

## Avvio locale step by step

### Avvio completo con script

Dalla root del progetto:

```bash
./start.sh
```

Lo script esegue queste operazioni:

1. verifica che `.env` esista;
2. carica le variabili ambiente;
3. crea `packages/voice/.venv` se assente;
4. installa `packages/voice/requirements.txt` se il venv viene creato;
5. avvia Docker Compose per Kokoro TTS;
6. avvia il core Node su `http://localhost:8787`;
7. avvia il token server su `http://localhost:8788`;
8. avvia il voice agent LiveKit;
9. avvia la UI Vite su `http://localhost:5173`.

Endpoint/servizi attesi:

```text
UI:            http://localhost:5173
Token server:  http://localhost:8788
Core Node:     http://localhost:8787
Kokoro TTS:    http://localhost:8880
LiveKit:       configurato da LIVEKIT_URL
```

Per fermare tutto:

```text
CTRL+C
```

La trap di `start.sh` termina i processi figli e ferma il compose Kokoro con:

```bash
docker compose -f docker/docker-compose.yml down
```

### Avvio manuale

Utile per debug dei singoli layer.

Terminale 1, Kokoro:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Terminale 2, core Node:

```bash
cd packages/core
npm run serve
```

Terminale 3, token server:

```bash
cd packages/voice
.venv/bin/python token_server.py
```

Terminale 4, voice agent:

```bash
cd packages/voice
.venv/bin/python agent.py dev
```

Terminale 5, UI:

```bash
cd packages/ui
npm run dev -- --port 5173
```

## Modalità e routing AI

### Modalità voice agent

Il token server mantiene `_current_mode`, inizialmente `gemini`. La UI legge e modifica questa modalità tramite:

- `GET /mode`
- `POST /mode` con `{ "mode": "gemini" | "ollama" | "claude" | "gpt" }`

Il voice agent legge la modalità con `GET {TOKEN_SERVER_URL}/mode` e normalizza i valori ammessi:

```text
gemini | ollama | claude | gpt
```

Comportamento reale in `packages/voice/agent.py`:

- `gemini`: avvia una sessione Gemini realtime con voce `Fenrir` per JARVIS e `Aoede` per FRIDAY; in caso di timeout o errore fa fallback alla pipeline `gpt`.
- `gpt`: usa pipeline LiveKit con OpenAI STT, Silero VAD, OpenAI LLM `gpt-4o-mini` e Kokoro TTS.
- `ollama`: usa pipeline STT/VAD/TTS, ma l'LLM è `JarvisLLM`, un bridge HTTP verso `POST {JARVIS_URL}/ask`.
- `claude`: nel voice agent usa lo stesso bridge `JarvisLLM` verso il core; la scelta effettiva tra Ollama e Anthropic avviene nel core Node.

### Routing nel core Node

Il core decide tra:

- `local`: Ollama, modello `JARVIS_MODEL_LOCAL` o default `qwen3:8b`;
- `api`: Anthropic, tier `haiku`, `sonnet` o `opus`.

Regole principali in `src/core/router.ts`:

- override esplicito `local` o `api` se passato nel context interno;
- API se `ctx.heavy` è true;
- API se input supera `JARVIS_HEAVY_CHARS` (default `4000`);
- API se l'input contiene pattern pesanti come `scrivi il capitolo`, `scrivi il libro`, `manoscritto`, `brief strategico`, `outline completo`;
- altrimenti default locale via Ollama.

Tier API in `src/core/tier.ts`:

- `haiku`: estrazione, classificazione, riassunto, traduzione;
- `sonnet`: scrittura, analisi, copy;
- `opus`: manoscritto, strategia e pattern opus-grade.

## Personas JARVIS/FRIDAY

La persona corrente è mantenuta dal token server, inizialmente `friday`.

Endpoint:

- `GET /persona`
- `POST /persona` con `{ "persona": "jarvis" | "friday" }`

La UI permette selezione manuale da Header. Il voice agent può anche rilevare la persona dal primo turno utente:

- se la prima parola è `JARVIS`, imposta `jarvis`;
- in tutti gli altri casi imposta `friday`.

Voci Kokoro configurate:

```text
JARVIS -> am_adam
FRIDAY -> af_sky
```

Nella modalità Gemini realtime, invece, le voci configurate sono:

```text
JARVIS -> Fenrir
FRIDAY -> Aoede
```

## Tool disponibili

### Tool del voice agent

Definiti in `packages/voice/tools.py`:

- `get_weather(city)`: meteo da `wttr.in`;
- `search_web(query)`: ricerca DuckDuckGo via LangChain community tool;
- `send_email(to_email, subject, message, cc_email?)`: invio via Gmail SMTP usando `GMAIL_USER` e `GMAIL_APP_PASSWORD`.

Queste variabili Gmail non sono presenti in `.env.example`, quindi vanno aggiunte manualmente se si vuole usare `send_email`.

### Tool del core Node

Registrati in `packages/core/src/server.ts`:

- `time`
- `weather`
- `readFile`
- `ingestCerebro`
- `bookStatus`
- `runPhase`
- `newBook`
- `kbIndex`
- `kbSearch`

Sono esposti al modello locale Ollama tramite tool calling nel registry del core.

## Test e controlli

Core Node:

```bash
cd packages/core
npm test
npm run typecheck
```

UI:

```bash
cd packages/ui
npm run build
```

Voice Python:

```bash
cd packages/voice
.venv/bin/python -m pytest
```

Health check core:

```bash
curl http://localhost:8787/health
```

Stats core:

```bash
curl http://localhost:8787/stats
```

Token server mode/persona:

```bash
curl http://localhost:8788/mode
curl http://localhost:8788/persona
```

## Note operative

- `.env` è ignorato da Git; usare `.env.example` come template.
- `node_modules`, `.venv`, `dist`, `__pycache__` e `.jarvis` sono ignorati.
- Il file sessione default del core è `.jarvis/session.json` dentro la working directory del processo `packages/core`.
- `POST /speak` del core usa il comando macOS `say`; su sistemi non macOS restituisce errore.
- `start.sh` presume che `npm install` sia già stato eseguito in `packages/core` e `packages/ui`.
- Se `LIVEKIT_URL` punta a un LiveKit cloud, servono chiave e secret cloud coerenti. Se punta a `ws://localhost:7880`, serve un server LiveKit locale avviato separatamente con configurazione compatibile con `docker/livekit/livekit.yaml`.
