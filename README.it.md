# STARK-AI

STARK-AI è una piattaforma agentica voice-first per coordinare assistenti AI, tool locali e workflow di sviluppo controllati. Lo stato attuale del progetto ruota attorno a **FRIDAY** come planner/orchestratore vocale: dalla UI e dalla voce può generare run operativi, passare da un gate di approvazione umano ed eseguire una catena locale `Claude Architect -> Codex Implementer -> Claude Reviewer`.

Il repository è un monorepo modulare con pacchetti Node/TypeScript, un layer voce Python, una dashboard React e una suite di server MCP locali. Il file `FRIDAY_MASTER_SPEC.md` resta il contratto architetturale di lungo periodo; il codice attuale implementa già una prima versione reale del planner FRIDAY, non ancora l'intero sistema operativo multi-agent descritto nella visione.

## Architettura ad alto livello

```text
Browser / Dashboard React
  -> Token server Python
  -> LiveKit room / Voice agent Python
  -> Core Node HTTP + WebSocket hub
  -> Registry tool in-process + server MCP
  -> Workflow FRIDAY
       -> Claude Architect
       -> approval gate umano
       -> Codex Implementer
       -> git diff
       -> Claude Reviewer
```

### Ruoli agentici

**FRIDAY** è il ruolo più concreto nel codice attuale. Esiste come persona (`packages/core/personas/profiles/friday.json`) e come workflow executor (`packages/core/src/workflows/*`). Il suo compito operativo è generare piani, avviare run, attendere approvazione, delegare implementazione e pubblicare stato/log verso UI e bus eventi.

**JARVIS** esiste come persona tecnica (`packages/core/personas/profiles/jarvis.json` e profili Python collegati). Nel prodotto attuale è usato come profilo di analisi tecnica e interazione, non come executor separato.

**VERONICA** esiste come profilo persona (`packages/core/personas/profiles/veronica.json` e `packages/voice/personas/veronica.py`) per task lunghi e massivi. Nel codice attuale non ha ancora una pipeline executor dedicata: è una direzione coerente con la roadmap, ma l'orchestrazione reale implementata oggi è FRIDAY.

Sono presenti anche profili come **WAR-MACHINE** per workflow KDP, ma il README documenta il runtime generale del progetto.

## Componenti principali

### `packages/core`

Core Node/TypeScript. Contiene:

- server HTTP su porta `8787`;
- WebSocket event hub su porta `7710`;
- routing LLM locale/API;
- registry tool in-process e caricamento MCP;
- policy di workspace e command execution;
- logging JSONL FRIDAY;
- workflow FRIDAY con stato run, approval gate, runner Claude/Codex/Git;
- endpoint `/workflow`, `/workflow/run`, `/workflow/run/:id`, `/workflow/run/:id/approve|reject`;
- tool vocali `friday_run`, `friday_run_status`, `friday_approve`.

Script dichiarati:

- `npm run serve`: server HTTP core;
- `npm run dev:hub`: event hub WebSocket;
- `npm test`: test Vitest;
- `npm run typecheck`: controllo TypeScript.

Questi script sono documentati per manutenzione e test. Per avviare il progetto completo usare solo `./start.sh`.

### `packages/ui`

Dashboard React/Vite con LiveKit. Contiene l'AppShell HUD, pannelli di stato, transcript/event log e `WorkflowPanel`, che oggi può:

- creare run FRIDAY `analysis`, `implementation` o `review`;
- indicare un workspace sotto `workspaces/`;
- fare polling dello stato run;
- approvare o rifiutare un run in attesa.

### `packages/voice`

Layer Python per interazione vocale:

- `agent.py`: voice agent LiveKit;
- `token_server.py`: token server e stato mode/persona;
- `hub_bridge.py`: ponte verso il bus core;
- `offline_voice/`: client voce offline;
- `personas/`: profili voce/persona;
- `contracts_gen/`: modelli Pydantic generati dai contratti TypeScript.

Il virtualenv `packages/voice/.venv` viene creato automaticamente da `start.sh` se manca.

### `packages/contracts`

Pacchetto TypeScript condiviso per contratti e schema:

- definizioni Zod;
- generazione JSON Schema;
- test di compatibilità;
- sorgente per i modelli Python generati in `packages/voice/contracts_gen`.

### `tools`

Suite di server MCP locali caricati dal core tramite `tools/mcp.config.json`:

- `mcp-os`: azioni OS locali;
- `mcp-files`: operazioni su file;
- `mcp-web`: browser/search/web helper;
- `mcp-screen`: cattura e analisi schermo in Python;
- `mcp-productivity`: produttività, reminder, meteo, messaggi;
- `mcp-dev`: helper di sviluppo.

Il `Makefile` espone `test-mcp-tools` e `setup-mcp-screen` per test/setup di questi server.

### `prompts`

Prompt operativi per i ruoli FRIDAY:

- `architect.md`;
- `implementer.md`;
- `reviewer.md`.

Il codice usa anche versioni TypeScript in `packages/core/src/workflows/fridayPrompts.ts`.

### `docker`

Contiene la configurazione locale per servizi esterni:

- `docker/docker-compose.yml`: avvia Kokoro TTS su porta `8880`;
- `docker/livekit/livekit.yaml`: configurazione LiveKit locale, non avviata dal compose attuale.

### `seed`

Dati demo e fixture operative per pannelli AIOS/KDP:

- `actions.json`;
- `daily_brief.json`;
- `intel.json`;
- `metrics.json`;
- `pipeline.json`;
- `DEMO_RUNBOOK.md`.

## Entrypoint unico

Per avviare STARK-AI usare solo:

```bash
./start.sh
```

`start.sh` non espone flag. Esegue in sequenza:

1. verifica che `.env` esista;
2. carica le variabili ambiente da `.env`;
3. imposta default runtime (`JARVIS_PORT`, `JARVIS_MODEL_LOCAL`, `JARVIS_URL`, `KOKORO_URL`, `TOKEN_SERVER_URL`, `STARK_DEMO_MODE`);
4. crea `packages/voice/.venv` se assente;
5. installa `packages/voice/requirements.txt` nel virtualenv appena creato;
6. avvia Docker Compose per Kokoro TTS;
7. avvia il Core Node su `http://localhost:8787`;
8. avvia l'Event Hub WebSocket su `ws://127.0.0.1:7710` con `STARK_BRAIN=real` di default;
9. avvia il Token Server Python su `http://localhost:8788`;
10. avvia il Voice Agent LiveKit;
11. avvia la UI Vite su `http://localhost:5173`.

Quando riceve `CTRL+C`, lo script termina i processi figli, pulisce eventuali subprocess LiveKit rimasti vivi e ferma il compose Docker.

## Requisiti

### Runtime

- macOS o ambiente Unix-like con Bash;
- Node.js compatibile con le dipendenze attuali. La dipendenza root `concurrently@9.2.1` richiede Node `>=18`;
- npm installato;
- Python 3 con supporto `venv`;
- Docker attivo per Kokoro TTS;
- accesso ai CLI `claude` e `codex` se si vuole usare l'esecuzione reale FRIDAY;
- LiveKit raggiungibile tramite `LIVEKIT_URL`;
- Ollama disponibile se si usa routing locale;
- chiavi API coerenti con le modalità abilitate.

### Variabili ambiente

Creare `.env` a partire da `.env.example`. Le variabili presenti nel template sono:

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

`start.sh` deriva `JARVIS_MODEL_LOCAL` da `OLLAMA_MODEL` se non è già definito. Il core ha anche default interni per `OLLAMA_URL`, modelli Anthropic e modello embedding.

Nota operativa: `docker/docker-compose.yml` avvia Kokoro, non LiveKit. Se `LIVEKIT_URL` punta a un server locale, quel server deve essere disponibile con configurazione coerente. Se punta a LiveKit Cloud, servono chiave e secret cloud.

## Stato attuale

Completato o presente nel codice:

- dashboard React con AppShell/HUD e pannello workflow;
- token server e voice agent Python;
- bridge eventi voce verso il core;
- core HTTP e WebSocket hub;
- contratti condivisi TypeScript/Python;
- profili persona FRIDAY, JARVIS, VERONICA e WAR-MACHINE;
- tool registry in-process e MCP;
- policy di workspace sotto `workspaces/`;
- logger JSONL per esecuzioni FRIDAY;
- runner CLI per Claude, Codex e Git;
- planner FRIDAY con ruoli `architect`, `implementer`, `reviewer`;
- run FRIDAY reali con approval gate;
- implementazione Codex confinata in sandbox `workspace-write`;
- reviewer basato su `git diff`;
- endpoint HTTP e tool vocali per avviare, approvare e leggere lo stato dei run;
- test core, contratti e MCP collegati al `Makefile`.

In corso o da consolidare:

- collegare in modo più completo i comandi vocali ai workflow reali;
- rafforzare approval gate, logging e recovery per run lunghi;
- rendere persistente lo stato run oltre la memoria del processo;
- completare il percorso fully local della roadmap;
- trasformare VERONICA da persona a executor dedicato per task massivi;
- chiarire deployment LiveKit locale/cloud come profilo runtime stabile.

## Comandi di manutenzione

Il progetto mantiene comandi di test e generazione nel `Makefile`:

- `make codegen`: rigenera JSON Schema dai contratti Zod e modelli Pydantic per il layer voce;
- `make test-contracts`: verifica contratti TypeScript e Python;
- `make test-mcp-tools`: esegue i test dei server MCP;
- `make setup-mcp-screen`: prepara il virtualenv del server MCP screen;
- `make dev-offline` e `make dev-voice`: target di sviluppo legacy/offline.

Per il runtime completo resta valido un solo entrypoint: `./start.sh`.

## For Dummies / Guida rapida

### Come usare l'app

Usare lo script root come unico entrypoint:

```bash
./start.sh
```

Poi aprire la dashboard nel browser:

```text
http://localhost:5173
```

La UI si connette alla room voce LiveKit tramite il token server e il voice agent Python. Quando la dashboard è aperta, usare i controlli di connessione voce e microfono nella UI per iniziare a parlare con l'assistente attivo.

La persona attiva, di solito **FRIDAY** o **JARVIS**, risponde a voce. I render event come piani, metriche, stato workflow e altri output strutturati appaiono nell'HUD centrale.

### Esempi di prompt vocali per Claude Code e Codex tramite FRIDAY

FRIDAY può orchestrare Claude e Codex tramite i tool di workflow:

- `friday_workflow`: pianifica una run senza eseguirla;
- `friday_run`: esegue la catena reale `Claude Architect -> approval gate -> Codex Implementer -> Claude Reviewer` usando `git diff`;
- `friday_run_status`: riporta lo stato della run corrente o più recente;
- `friday_approve`: approva o rifiuta una run in attesa all'approval gate.

`Claude Architect` e `Claude Reviewer` usano la CLI `claude`. `Codex Implementer` usa la CLI `codex`. Entrambe le CLI sono indicate nei requisiti sopra perché l'esecuzione reale FRIDAY dipende da loro.

Esempi concreti vocali o testuali:

- "FRIDAY, pianifica una analisi di questo repository." -> `friday_workflow`, kind `analysis`.
- "FRIDAY, esegui il workflow per implementare [funzionalità X] nel workspace [nome]." -> `friday_run`, kind `implementation`.
- "FRIDAY, qual è lo stato dell'ultimo run?" -> `friday_run_status`.
- "FRIDAY, approvo il run." -> `friday_approve`, decision `approve`.
- "FRIDAY, rifiuto il run." -> `friday_approve`, decision `reject`.
- "FRIDAY, fai una review del codice nel workspace [nome]." -> `friday_run`, kind `review`.

### Dove si trovano prompt e istruzioni delle personas

Ogni persona ha un profilo JSON in `packages/core/personas/profiles/<nome>.json`. I profili attuali sono **FRIDAY**, **JARVIS**, **VERONICA** e **WAR-MACHINE**.

I campi principali sono:

- `agentInstruction`: prompt di sistema/personalità;
- `sessionInstruction`: istruzioni operative per la sessione, inclusi i tool che la persona deve usare;
- `voice`: impostazioni voce Kokoro/EdgeTTS;
- `routingHints`: preferenze di routing per modelli locali o cloud.

Il layer vocale Python in `packages/voice/personas/<nome>.py` carica questi profili JSON tramite `packages/voice/personas/_profiles.py`.

Per modificare cosa dice o come si comporta una persona, editare il relativo file JSON sotto `packages/core/personas/profiles/`.

## Note di repository

- Il `package.json` root contiene solo dipendenze helper (`concurrently`) e non dichiara workspaces npm.
- I pacchetti Node vivono in `packages/core`, `packages/ui`, `packages/contracts` e nei vari `tools/mcp-*`.
- `workspaces/` è ignorata da Git ed è il perimetro autorizzato per i lavori agentici FRIDAY.
- `logs/` contiene log runtime, incluso `friday.jsonl`.
- `.env`, `node_modules`, virtualenv, build output e cache locali sono esclusi dal versionamento.
