# STARK-AI — Design Spec

> Data: 2026-06-05 · Stato: approvato per implementazione  
> Architettura: Monorepo unificato (Approccio A)

---

## 1. Visione

STARK-AI è un assistente AI personale con due personalità vocali distinte — **JARVIS** (maschile) e **FRIDAY** (femminile) — ispirate ai film Iron Man/Marvel.

Il sistema integra:
- Il **Core Brain** Node/TypeScript (routing ibrido Ollama↔API, già sviluppato in `JARVIS/`)
- Il **Voice Layer** Python + LiveKit (voce bidirezionale, già sviluppato in `friday_jarvis-main/`)
- La **UI React/Vite** HUD-style Stark (già sviluppata in `friday_jarvis-main/ui/`)

L'utente attiva la persona con la voce (prima parola della sessione) e cambia modello LLM via UI.

---

## 2. Struttura del repository

```
STARK-AI/
  packages/
    core/              ← Node/TypeScript — cervello ibrido (migrato da JARVIS/jarvis/)
    voice/             ← Python — LiveKit agent + token server (da friday_jarvis-main/)
    ui/                ← React/Vite — HUD frontend (da friday_jarvis-main/ui/)
  docker/
    docker-compose.yml
    kokoro/            ← config Kokoro TTS container
    livekit/           ← config LiveKit server container
  docs/
    superpowers/
      specs/           ← questo file
  .env.example
  README.md
```

I sorgenti originali (`Projects/JARVIS/` e `Projects/friday_jarvis-main/`) restano come reference fino a stabilizzazione del nuovo progetto.

---

## 3. Sistema Persona

### Attivazione
Il voice agent (`packages/voice/agent.py`) analizza la prima parola della trascrizione all'apertura di ogni sessione LiveKit:

| Prima parola | Persona attivata |
|---|---|
| `JARVIS` (case-insensitive) | JARVIS — voce maschile Kokoro, prompt formale-ironico |
| `FRIDAY` (case-insensitive) | FRIDAY — voce femminile Kokoro, prompt sarcastico-efficiente |
| *(nessun match)* | FRIDAY (default) |

La persona è **fissa per tutta la sessione**. Reset via pulsante "New Session" nell'UI o chiusura/riapertura connessione LiveKit.

### File prompt
```
packages/voice/
  personas/
    jarvis.py    ← AGENT_INSTRUCTION + SESSION_INSTRUCTION JARVIS
    friday.py    ← AGENT_INSTRUCTION + SESSION_INSTRUCTION FRIDAY (dall'attuale prompts.py)
```

### Caratteristiche JARVIS (prompt)
- Tono: formale, riflessivo, leggermente sarcastico
- Si rivolge all'utente come "Signore" o per nome
- Risposte concise e precise, mai verbose
- Voce Kokoro: modello maschile (`af_adam` o equivalente)

### Caratteristiche FRIDAY (prompt)
- Tono: sarcastico, efficiente, diretto
- Risposte in una sola frase quando possibile
- Conferma azioni con "Lo farò, signore" / "Ricevuto"
- Voce Kokoro: modello femminile (`af_sky` o equivalente)

---

## 4. Model Switcher

4 modalità selezionabili dalla UI, gestite via endpoint `/mode` del token server:

| Modalità | Provider LLM | Percorso |
|---|---|---|
| `gemini` | Google Gemini API | Plugin LiveKit Google (diretto) |
| `ollama` | Ollama locale (M3) | → HTTP Core Node `localhost:8787` via `JarvisLLM` |
| `claude` | Anthropic API | → HTTP Core Node `localhost:8787` via `JarvisLLM` |
| `gpt` | OpenAI API | Plugin LiveKit OpenAI (diretto) |

Il Core Node gestisce il routing Ollama↔Anthropic internamente (router già implementato).  
Gemini e GPT bypassano il Core e usano direttamente i plugin LiveKit esistenti.

---

## 5. Data Flow

```
[Microfono utente]
  ↓
[LiveKit Server — Docker]
  Silero VAD → attivazione microfono
  STT plugin (configurabile via .env: Google o OpenAI)
  ↓
[Voice Agent Python — packages/voice/agent.py]
  ① Sessione nuova? → controlla prima parola → imposta persona (JARVIS/FRIDAY)
  ② Legge modalità attiva: GET /mode
  ③ Instrada LLM:
     - gemini/gpt → plugin LiveKit diretto
     - ollama/claude → JarvisLLM → HTTP POST core:8787/ask
  ④ Applica prompt di sistema della persona attiva
  ↓
[Core Node — packages/core/ — porta 8787]  (solo per ollama/claude)
  Router decide Ollama locale vs Anthropic API
  ↓
[Kokoro TTS — Docker — porta 8880]
  Testo risposta → audio stream (voce maschile/femminile per persona)
  ↓
[LiveKit Server]
  Audio stream → client
  ↓
[UI React — packages/ui/]
  Aggiornamento real-time: trascrizione · persona attiva · modello · waveform
```

---

## 6. Infrastruttura Docker

`docker/docker-compose.yml` — due soli servizi:

```yaml
services:
  livekit:
    image: livekit/livekit-server:latest
    ports:
      - "7880:7880"   # HTTP API
      - "7881:7881"   # WebRTC
    volumes:
      - ./livekit/livekit.yaml:/etc/livekit.yaml

  kokoro:
    image: ghcr.io/remsky/kokoro-fastapi-cpu:latest   # ARM64-compatible, M3 ok
    ports:
      - "8880:8880"
    environment:
      - KOKORO_MODEL_PATH=/models
```

**Tutto il resto gira nativo su macOS M3:**

| Servizio | Comando | Porta |
|---|---|---|
| Core Node | `npm run dev` in `packages/core/` | 8787 |
| Token server | `python token_server.py` in `packages/voice/` | 8788 |
| Voice agent | `python agent.py` in `packages/voice/` | — |
| UI | `npm run dev` in `packages/ui/` | 5173 |
| Ollama | nativo macOS (già installato) | 11434 |

---

## 7. Variabili d'ambiente

`.env.example` nella root:

```env
# LiveKit
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

# STT (scegli uno: Google o OpenAI)
GOOGLE_APPLICATION_CREDENTIALS=

# LLM API
ANTHROPIC_API_KEY=
OPENAI_API_KEY=        # usato anche per STT se non si usa Google
GOOGLE_GENAI_API_KEY=

# Core Node
JARVIS_URL=http://localhost:8787

# Kokoro TTS
KOKORO_URL=http://localhost:8880
```

---

## 8. Migrazione sorgenti

| Da | A | Note |
|---|---|---|
| `JARVIS/jarvis/` | `packages/core/` | Copia diretta, nessuna modifica |
| `friday_jarvis-main/` (escluso `ui/`) | `packages/voice/` | `prompts.py` → `personas/friday.py`, aggiungere `personas/jarvis.py` |
| `friday_jarvis-main/ui/` | `packages/ui/` | Copia diretta |
| `JARVIS/docs/` | `docs/` | Copia spec esistenti |

---

## 9. Modifiche al codice esistente

Cambiamenti minimi rispetto ai sorgenti attuali:

1. **`packages/voice/agent.py`** — aggiungere rilevamento persona (prima parola) + import da `personas/`
2. **`packages/voice/token_server.py`** — aggiungere `"ollama"` e `"claude"` ai `VALID_MODES` (oggi ci sono già `gemini`, `jarvis`, `anthropic`, `openai` — rinominarli per coerenza)
3. **`packages/ui/`** — aggiungere 4 pulsanti model switcher (Gemini · Ollama · Claude · GPT) e indicatore persona attiva (JARVIS/FRIDAY)
4. **`packages/voice/personas/jarvis.py`** — nuovo file con prompt JARVIS
5. **`docker/docker-compose.yml`** — nuovo file

---

## 10. Roadmap / Checklist implementazione

### Fase 0 — Setup struttura
- [ ] Creare cartella `STARK-AI/` con struttura monorepo
- [ ] Migrare `JARVIS/jarvis/` → `packages/core/`
- [ ] Migrare `friday_jarvis-main/` → `packages/voice/`
- [ ] Migrare `friday_jarvis-main/ui/` → `packages/ui/`
- [ ] Creare `docker/docker-compose.yml`
- [ ] Creare `.env.example`

### Fase 1 — Sistema Persona
- [ ] Creare `packages/voice/personas/friday.py` (da `prompts.py` esistente)
- [ ] Creare `packages/voice/personas/jarvis.py` (nuovo prompt maschile)
- [ ] Aggiornare `agent.py` con rilevamento prima parola → persona
- [ ] Testare switch vocale JARVIS/FRIDAY

### Fase 2 — Model Switcher 4 opzioni
- [ ] Aggiornare `token_server.py` con modalità `gemini · ollama · claude · gpt`
- [ ] Aggiornare `agent.py` per instradare `ollama` e `claude` via `JarvisLLM` → Core Node
- [ ] Testare tutti e 4 i modelli

### Fase 3 — TTS Kokoro
- [ ] Configurare container Kokoro in `docker-compose.yml`
- [ ] Aggiungere Kokoro come TTS provider nel voice agent
- [ ] Mappare voce maschile a JARVIS, femminile a FRIDAY
- [ ] Testare audio end-to-end

### Fase 4 — UI aggiornamenti
- [ ] Aggiungere model switcher 4 opzioni (Gemini · Ollama · Claude · GPT)
- [ ] Aggiungere indicatore persona attiva (JARVIS / FRIDAY) con stile visivo distinto
- [ ] Aggiungere pulsante "New Session" per reset persona

### Fase 5 — Docker & avvio unificato
- [ ] Testare `docker compose up` (LiveKit + Kokoro)
- [ ] Creare script `start.sh` per avviare tutti i servizi con un comando
- [ ] Documentare setup completo in `README.md`

---

## 11. Dipendenze da aggiungere

**`packages/voice/requirements.txt`** (aggiunte rispetto all'attuale):
```
httpx           # già presente — usato per chiamate HTTP a Kokoro container e Core Node
```

**Nessuna dipendenza nuova** per `packages/core/` e `packages/ui/`.
