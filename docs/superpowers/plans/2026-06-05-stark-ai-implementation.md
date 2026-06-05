# STARK-AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificare JARVIS (Core Node/TS) e friday_jarvis-main (Python voice + React UI) in un unico monorepo `STARK-AI/` con due persone vocali (JARVIS maschile, FRIDAY femminile), model switcher a 4 opzioni (Gemini · Ollama · Claude · GPT) e TTS locale Kokoro su Docker.

**Architecture:** Monorepo con tre package — `core/` (Node/TS, cervello ibrido Ollama↔API), `voice/` (Python, LiveKit agent + token server) e `ui/` (React/Vite, HUD). La persona viene rilevata dalla prima parola della sessione vocale e determina il system prompt + voce Kokoro. Il model switcher è gestito via endpoint `/mode` del token server; Ollama e Claude passano per il Core Node, Gemini e GPT usano i plugin LiveKit diretti.

**Tech Stack:** Node 20+/TypeScript (core), Python 3.11+ / livekit-agents / FastAPI (voice), React 18/Vite/TypeScript (ui), Docker Compose (LiveKit server + Kokoro TTS FastAPI), Kokoro TTS (OpenAI-compatible API su porta 8880).

---

## File map

| File | Azione | Responsabilità |
|---|---|---|
| `packages/core/` | Copia da `JARVIS/jarvis/` | Brain ibrido Node/TS (invariato) |
| `packages/ui/` | Copia da `friday_jarvis-main/ui/` | React HUD frontend |
| `packages/voice/agent.py` | Copia + modifica | LiveKit agent — routing + persona detection |
| `packages/voice/token_server.py` | Copia + modifica | FastAPI — `/mode`, `/persona`, `/token` |
| `packages/voice/prompts.py` | Elimina dopo migrazione | Sostituito da `personas/` |
| `packages/voice/personas/__init__.py` | Crea | Export pubblico |
| `packages/voice/personas/friday.py` | Crea | System prompt + config FRIDAY |
| `packages/voice/personas/jarvis.py` | Crea | System prompt + config JARVIS |
| `packages/voice/personas/detect.py` | Crea | Logica rilevamento persona da testo |
| `packages/voice/tts_kokoro.py` | Crea | TTS wrapper persona-aware (Kokoro) |
| `packages/voice/tests/test_detect.py` | Crea | Unit test rilevamento persona |
| `packages/voice/tests/test_tts_kokoro.py` | Crea | Unit test voice selection |
| `docker/docker-compose.yml` | Crea | LiveKit + Kokoro services |
| `docker/livekit/livekit.yaml` | Crea | Config LiveKit server |
| `packages/ui/src/components/Header/Header.tsx` | Modifica | Rinomina modalità + indicatore persona |
| `.env.example` | Crea | Template variabili d'ambiente |
| `start.sh` | Crea | Script avvio tutti i servizi |

---

## Task 1: Crea struttura monorepo e migra i file

**Files:**
- Crea: `STARK-AI/` (struttura completa)

- [ ] **Step 1.1: Crea directory monorepo**

```bash
cd /Users/abstract/Documents/Claude/Projects
mkdir -p STARK-AI/packages
mkdir -p STARK-AI/docker/livekit
mkdir -p STARK-AI/docker/kokoro
mkdir -p STARK-AI/docs/superpowers/specs
mkdir -p STARK-AI/docs/superpowers/plans
```

- [ ] **Step 1.2: Migra Core Node/TS**

```bash
cp -r /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/core
cp -r /Users/abstract/Documents/Claude/Projects/JARVIS/docs /Users/abstract/Documents/Claude/Projects/STARK-AI/docs/jarvis-original
```

- [ ] **Step 1.3: Migra UI React**

```bash
cp -r /Users/abstract/Documents/Claude/Projects/friday_jarvis-main/ui /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/ui
```

- [ ] **Step 1.4: Migra Voice Agent Python**

```bash
cd /Users/abstract/Documents/Claude/Projects/friday_jarvis-main
cp agent.py token_server.py tools.py requirements.txt /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/voice/
# Crea cartelle necessarie
mkdir -p /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/voice/personas
mkdir -p /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/voice/tests
```

- [ ] **Step 1.5: Verifica struttura**

```bash
find /Users/abstract/Documents/Claude/Projects/STARK-AI -type f | head -40
```

Output atteso: lista di file nei tre package + docker + docs.

- [ ] **Step 1.7: Init git**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI
git init
echo "node_modules/\n__pycache__/\n*.pyc\n.env\ndist/\n.venv/" > .gitignore
git add .
git commit -m "feat: initial monorepo structure — migrate JARVIS core + friday_jarvis voice+ui"
```

---

## Task 2: Docker Compose — LiveKit + Kokoro

**Files:**
- Crea: `docker/docker-compose.yml`
- Crea: `docker/livekit/livekit.yaml`

- [ ] **Step 2.1: Crea `docker/livekit/livekit.yaml`**

```yaml
# docker/livekit/livekit.yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: false
keys:
  devkey: devsecret
logging:
  level: info
```

- [ ] **Step 2.2: Crea `docker/docker-compose.yml`**

```yaml
# docker/docker-compose.yml
services:
  livekit:
    image: livekit/livekit-server:latest
    ports:
      - "7880:7880"
      - "7881:7881/tcp"
      - "50000-50200:50000-50200/udp"
    volumes:
      - ./livekit/livekit.yaml:/etc/livekit.yaml
    command: --config /etc/livekit.yaml
    restart: unless-stopped

  kokoro:
    image: ghcr.io/remsky/kokoro-fastapi-cpu:latest
    platform: linux/arm64
    ports:
      - "8880:8880"
    restart: unless-stopped
```

- [ ] **Step 2.3: Avvia e verifica**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI/docker
docker compose up -d
docker compose ps
```

Output atteso:
```
NAME            STATUS
stark-ai-livekit-1   running
stark-ai-kokoro-1    running
```

- [ ] **Step 2.4: Verifica Kokoro API**

```bash
curl http://localhost:8880/v1/audio/speech \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"model":"kokoro","voice":"af_sky","input":"Hello"}' \
  --output /tmp/test_tts.wav && echo "OK"
```

Output atteso: `OK` + file `/tmp/test_tts.wav` creato.

- [ ] **Step 2.5: Commit**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI
git add docker/
git commit -m "feat: docker-compose with LiveKit + Kokoro TTS (ARM64)"
```

---

## Task 3: Modulo Persona — file e unit test

**Files:**
- Crea: `packages/voice/personas/__init__.py`
- Crea: `packages/voice/personas/friday.py`
- Crea: `packages/voice/personas/jarvis.py`
- Crea: `packages/voice/personas/detect.py`
- Crea: `packages/voice/tests/__init__.py`
- Crea: `packages/voice/tests/test_detect.py`

- [ ] **Step 3.1: Scrivi i test per `detect_persona` (red)**

```python
# packages/voice/tests/test_detect.py
import pytest
from personas.detect import detect_persona


def test_jarvis_first_word():
    assert detect_persona("JARVIS cosa c'è in agenda oggi?") == "jarvis"


def test_jarvis_case_insensitive():
    assert detect_persona("jarvis dimmi il meteo") == "jarvis"


def test_friday_first_word():
    assert detect_persona("FRIDAY inviami un promemoria") == "friday"


def test_friday_default_when_no_match():
    assert detect_persona("ciao come stai?") == "friday"


def test_friday_default_on_empty():
    assert detect_persona("") == "friday"


def test_friday_default_on_whitespace():
    assert detect_persona("   ") == "friday"
```

- [ ] **Step 3.2: Esegui test — verifica che falliscano**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/voice
python -m pytest tests/test_detect.py -v
```

Output atteso: `ModuleNotFoundError: No module named 'personas'` (o simile — i test DEVONO fallire)

- [ ] **Step 3.3: Crea `packages/voice/personas/detect.py`**

```python
# packages/voice/personas/detect.py
def detect_persona(text: str) -> str:
    """Return 'jarvis' or 'friday' based on the first word of text."""
    first_word = text.strip().split()[0].upper() if text.strip() else ""
    return "jarvis" if first_word == "JARVIS" else "friday"
```

- [ ] **Step 3.4: Crea `packages/voice/personas/friday.py`**

```python
# packages/voice/personas/friday.py
AGENT_INSTRUCTION = """
# Persona
Sei un assistente personale di nome FRIDAY, simile all'intelligenza artificiale del film Iron Man.

# Comportamento
- Parla come un maggiordomo di classe, con un tocco di sarcasmo.
- Rispondi con una sola frase quando possibile.
- Conferma le azioni con frasi come "Lo farò, signore", "Ricevuto, signore", "Controllo!".
- Dopo la conferma, descrivi l'azione compiuta in una sola breve frase.
- Non essere mai verboso.
"""

SESSION_INSTRUCTION = """
Offri assistenza usando gli strumenti a tua disposizione quando necessario.
Inizia la conversazione dicendo: "Online, signore. Come posso assisterla?"
"""

VOICE = "af_sky"
```

- [ ] **Step 3.5: Crea `packages/voice/personas/jarvis.py`**

```python
# packages/voice/personas/jarvis.py
AGENT_INSTRUCTION = """
# Persona
Sei JARVIS, il sistema di intelligenza artificiale di Tony Stark.

# Comportamento
- Tono formale, riflessivo, preciso. Lieve sarcasmo quando appropriato.
- Rivolgiti all'utente come "Signore" o per nome.
- Risposte concise e accurate. Mai verbose.
- Anticipa le necessità quando hai informazioni sufficienti.
- Conferma le azioni con frasi come "Elaborazione in corso, Signore.", "Completato.", "Come desidera.".
"""

SESSION_INSTRUCTION = """
Offri assistenza usando gli strumenti a tua disposizione quando necessario.
Inizia la conversazione dicendo: "Sistemi operativi al 100%, Signore. In attesa dei suoi ordini."
"""

VOICE = "am_adam"
```

- [ ] **Step 3.6: Crea `packages/voice/personas/__init__.py`**

```python
# packages/voice/personas/__init__.py
from .detect import detect_persona
from . import friday, jarvis

_PERSONAS = {
    "friday": friday,
    "jarvis": jarvis,
}


def get_persona(name: str):
    """Return persona module for 'jarvis' or 'friday'. Defaults to friday."""
    return _PERSONAS.get(name, friday)
```

- [ ] **Step 3.7: Crea `packages/voice/tests/__init__.py`**

```python
# packages/voice/tests/__init__.py
```

- [ ] **Step 3.8: Esegui test — verifica che passino**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/voice
python -m pytest tests/test_detect.py -v
```

Output atteso:
```
PASSED tests/test_detect.py::test_jarvis_first_word
PASSED tests/test_detect.py::test_jarvis_case_insensitive
PASSED tests/test_detect.py::test_friday_first_word
PASSED tests/test_detect.py::test_friday_default_when_no_match
PASSED tests/test_detect.py::test_friday_default_on_empty
PASSED tests/test_detect.py::test_friday_default_on_whitespace
6 passed
```

- [ ] **Step 3.9: Commit**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI
git add packages/voice/personas/ packages/voice/tests/
git commit -m "feat: persona module with detect_persona + JARVIS/FRIDAY prompts and voices"
```

---

## Task 4: TTS Persona-Aware (Kokoro)

**Files:**
- Crea: `packages/voice/tts_kokoro.py`
- Crea: `packages/voice/tests/test_tts_kokoro.py`

- [ ] **Step 4.1: Scrivi test per `PersonaAwareTTS` (red)**

```python
# packages/voice/tests/test_tts_kokoro.py
import os
import pytest
from unittest.mock import patch, MagicMock
from tts_kokoro import get_voice_for_persona, KOKORO_DEFAULT_URL


def test_jarvis_voice():
    assert get_voice_for_persona("jarvis") == "am_adam"


def test_friday_voice():
    assert get_voice_for_persona("friday") == "af_sky"


def test_unknown_persona_defaults_to_friday_voice():
    assert get_voice_for_persona("unknown") == "af_sky"


def test_kokoro_default_url():
    assert KOKORO_DEFAULT_URL == "http://localhost:8880/v1"
```

- [ ] **Step 4.2: Esegui test — verifica che falliscano**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/voice
python -m pytest tests/test_tts_kokoro.py -v
```

Output atteso: `ModuleNotFoundError: No module named 'tts_kokoro'`

- [ ] **Step 4.3: Crea `packages/voice/tts_kokoro.py`**

```python
# packages/voice/tts_kokoro.py
import os
from livekit.plugins import openai as openai_plugin

KOKORO_DEFAULT_URL = "http://localhost:8880/v1"

_VOICE_MAP = {
    "jarvis": "am_adam",
    "friday": "af_sky",
}


def get_voice_for_persona(persona: str) -> str:
    """Return Kokoro voice name for the given persona."""
    return _VOICE_MAP.get(persona, "af_sky")


def make_tts(persona_state: dict) -> openai_plugin.TTS:
    """Create an OpenAI-compatible TTS instance pointing at local Kokoro.

    persona_state is a mutable dict {"persona": "friday"} read at call time,
    so the voice reflects the current persona at synthesis time.
    """
    voice = get_voice_for_persona(persona_state.get("persona", "friday"))
    base_url = os.getenv("KOKORO_URL", KOKORO_DEFAULT_URL)
    return openai_plugin.TTS(
        base_url=base_url,
        api_key="not-needed",
        voice=voice,
        model="kokoro",
    )
```

- [ ] **Step 4.4: Esegui test**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/voice
python -m pytest tests/test_tts_kokoro.py -v
```

Output atteso: 4 test PASSED.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI
git add packages/voice/tts_kokoro.py packages/voice/tests/test_tts_kokoro.py
git commit -m "feat: PersonaAwareTTS wrapper — selects Kokoro voice (am_adam/af_sky) by persona"
```

---

## Task 5: Aggiorna token_server.py — nuove modalità + endpoint /persona

**Files:**
- Modifica: `packages/voice/token_server.py`

Il token server attuale ha `VALID_MODES = {"gemini", "jarvis", "anthropic", "openai"}`. Rinominiamo in `{"gemini", "ollama", "claude", "gpt"}` e aggiungiamo `/persona` endpoint per esporre la persona attiva alla UI.

- [ ] **Step 5.1: Sostituisci `packages/voice/token_server.py`**

```python
# packages/voice/token_server.py
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="STARK-AI Token Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_current_mode: str = "gemini"
_current_persona: str = "friday"

VALID_MODES = {"gemini", "ollama", "claude", "gpt"}
VALID_PERSONAS = {"jarvis", "friday"}


class ModePayload(BaseModel):
    mode: str


class PersonaPayload(BaseModel):
    persona: str


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise HTTPException(status_code=500, detail=f"Missing environment variable: {name}")
    return value


@app.get("/mode")
def get_mode_endpoint():
    return {"mode": _current_mode}


@app.post("/mode")
def set_mode_endpoint(payload: ModePayload):
    global _current_mode
    if payload.mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode. Valid: {sorted(VALID_MODES)}")
    _current_mode = payload.mode
    return {"mode": _current_mode}


@app.get("/persona")
def get_persona_endpoint():
    return {"persona": _current_persona}


@app.post("/persona")
def set_persona_endpoint(payload: PersonaPayload):
    global _current_persona
    if payload.persona not in VALID_PERSONAS:
        raise HTTPException(status_code=400, detail=f"Invalid persona. Valid: {sorted(VALID_PERSONAS)}")
    _current_persona = payload.persona
    return {"persona": _current_persona}


@app.get("/token")
def get_token(room: str = "stark-room", identity: str = "user") -> dict[str, str]:
    livekit_url = require_env("LIVEKIT_URL")
    api_key = require_env("LIVEKIT_API_KEY")
    api_secret = require_env("LIVEKIT_API_SECRET")

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_name(identity)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )

    return {"token": token, "url": livekit_url}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("token_server:app", host="0.0.0.0", port=8788, reload=True)
```

- [ ] **Step 5.2: Verifica avvio**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/voice
python token_server.py &
sleep 2
curl http://localhost:8788/mode   # atteso: {"mode":"gemini"}
curl http://localhost:8788/persona  # atteso: {"persona":"friday"}
curl -X POST http://localhost:8788/mode -H "Content-Type: application/json" -d '{"mode":"ollama"}'
# atteso: {"mode":"ollama"}
curl -X POST http://localhost:8788/mode -H "Content-Type: application/json" -d '{"mode":"invalid"}'
# atteso: 400 error
kill %1
```

- [ ] **Step 5.3: Commit**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI
git add packages/voice/token_server.py
git commit -m "feat: token_server — rename modes (ollama/claude/gpt), add /persona endpoint"
```

---

## Task 6: Aggiorna agent.py — persona detection + routing + Kokoro TTS

**Files:**
- Modifica: `packages/voice/agent.py`

Tre cambiamenti rispetto all'originale:
1. Routing modalità: `ollama` e `claude` → `JarvisLLM` (Core Node), `gpt` → plugin OpenAI
2. Persona detection: prima parola della sessione → imposta prompt sistema + notifica token server
3. TTS: sostituisce `openai.TTS(voice="ash")` con `make_tts(persona_state)` da Kokoro

- [ ] **Step 6.1: Sostituisci `packages/voice/agent.py`**

```python
# packages/voice/agent.py
import os
import uuid
from typing import Any

import httpx
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.agents import (
    APIConnectOptions,
    APIConnectionError,
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
)
from livekit.agents import llm
from livekit.plugins import noise_cancellation, silero
from livekit.plugins import google, openai

from personas import detect_persona, get_persona
from tts_kokoro import make_tts
from tools import get_weather, search_web, send_email

load_dotenv()

DEFAULT_JARVIS_URL = "http://localhost:8787"
TOKEN_SERVER_URL = os.getenv("TOKEN_SERVER_URL", "http://localhost:8788")
DEFAULT_MODE = "gemini"
VALID_MODES = {"gemini", "ollama", "claude", "gpt"}


# ── JarvisLLM bridge (calls Core Node at /ask) ──────────────────────────────

class JarvisLLM(llm.LLM):
    def __init__(self, *, jarvis_url: str | None = None, system_prompt: str = "") -> None:
        super().__init__()
        self._jarvis_url = (jarvis_url or os.getenv("JARVIS_URL") or DEFAULT_JARVIS_URL).rstrip("/")
        self._system_prompt = system_prompt.strip()

    @property
    def model(self) -> str:
        return "jarvis-http"

    @property
    def provider(self) -> str:
        return "jarvis"

    @property
    def ask_url(self) -> str:
        return f"{self._jarvis_url}/ask"

    def build_jarvis_text(self, chat_ctx: llm.ChatContext) -> str:
        latest_user_text = ""
        for message in chat_ctx.messages():
            text = message.text_content
            if not text:
                continue
            if message.role == "user":
                latest_user_text = text
        return latest_user_text

    def chat(
        self,
        *,
        chat_ctx: llm.ChatContext,
        tools: list[llm.Tool] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls: Any = NOT_GIVEN,
        tool_choice: Any = NOT_GIVEN,
        extra_kwargs: Any = NOT_GIVEN,
    ) -> llm.LLMStream:
        return JarvisLLMStream(
            self,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
        )

    async def aclose(self) -> None:
        pass


class JarvisLLMStream(llm.LLMStream):
    def __init__(self, jarvis_llm, *, chat_ctx, tools, conn_options):
        super().__init__(jarvis_llm, chat_ctx=chat_ctx, tools=tools, conn_options=conn_options)
        self._jarvis_llm = jarvis_llm

    async def _run(self) -> None:
        request_text = self._jarvis_llm.build_jarvis_text(self._chat_ctx)
        try:
            async with httpx.AsyncClient(timeout=self._conn_options.timeout) as client:
                response = await client.post(
                    self._jarvis_llm.ask_url,
                    json={"text": request_text},
                )
        except httpx.TimeoutException as exc:
            raise APIConnectionError("JARVIS request timed out.", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise APIConnectionError(f"Could not reach JARVIS: {exc}", retryable=True) from exc

        if response.status_code != 200:
            raise APIConnectionError(
                f"JARVIS returned HTTP {response.status_code}", retryable=False
            )

        reply_text = response.json().get("reply", "")
        chunk = llm.ChatChunk(
            id=str(uuid.uuid4()),
            delta=llm.ChoiceDelta(role="assistant", content=reply_text),
        )
        self._event_ch.send_nowait(chunk)


# ── Mode + Persona helpers ───────────────────────────────────────────────────

async def get_mode() -> str:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{TOKEN_SERVER_URL}/mode")
            return resp.json().get("mode", DEFAULT_MODE)
    except Exception:
        return os.getenv("AGENT_MODE", DEFAULT_MODE)


async def notify_persona(persona: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            await client.post(
                f"{TOKEN_SERVER_URL}/persona",
                json={"persona": persona},
            )
    except Exception:
        pass


def normalize_mode(mode: str) -> str:
    return mode.lower().strip() if mode.lower().strip() in VALID_MODES else DEFAULT_MODE


# ── Persona-aware Agent ──────────────────────────────────────────────────────

class StarkAssistant(Agent):
    """Agent that detects JARVIS/FRIDAY persona from first user utterance."""

    def __init__(self, persona_state: dict, tools=None) -> None:
        self._persona_state = persona_state
        self._persona_detected = False
        persona_mod = get_persona("friday")
        super().__init__(instructions=persona_mod.AGENT_INSTRUCTION, tools=tools or [])

    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        if not self._persona_detected:
            text = new_message.text_content or ""
            persona_name = detect_persona(text)
            self._persona_detected = True
            self._persona_state["persona"] = persona_name
            persona_mod = get_persona(persona_name)
            self.instructions = persona_mod.AGENT_INSTRUCTION
            await notify_persona(persona_name)
        await super().on_user_turn_completed(turn_ctx, new_message)


# ── Session factories ────────────────────────────────────────────────────────

async def start_gemini_session(ctx: agents.JobContext, persona_state: dict) -> None:
    persona_mod = get_persona(persona_state.get("persona", "friday"))
    session = AgentSession()
    await session.start(
        room=ctx.room,
        agent=Agent(
            llm=google.beta.realtime.RealtimeModel(voice="Aoede", temperature=0.8),
            tools=[get_weather, search_web, send_email],
        ),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )
    await session.generate_reply(instructions=persona_mod.SESSION_INSTRUCTION)


async def start_pipeline_session(
    ctx: agents.JobContext, mode: str, persona_state: dict
) -> None:
    if mode in ("ollama", "claude"):
        persona_mod = get_persona(persona_state.get("persona", "friday"))
        selected_llm = JarvisLLM(system_prompt=persona_mod.AGENT_INSTRUCTION)
    elif mode == "gpt":
        selected_llm = openai.LLM(model="gpt-4o-mini")
    else:
        selected_llm = openai.LLM(model="gpt-4o-mini")

    session = AgentSession(
        stt=openai.STT(),
        vad=silero.VAD.load(),
        llm=selected_llm,
        tts=make_tts(persona_state),
    )

    persona_mod = get_persona(persona_state.get("persona", "friday"))

    await session.start(
        room=ctx.room,
        agent=StarkAssistant(persona_state, tools=[get_weather, search_web, send_email]),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )
    await session.generate_reply(instructions=persona_mod.SESSION_INSTRUCTION)


# ── Entry point ──────────────────────────────────────────────────────────────

async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()
    mode = normalize_mode(await get_mode())
    persona_state = {"persona": "friday"}

    if mode == "gemini":
        await start_gemini_session(ctx, persona_state)
    else:
        await start_pipeline_session(ctx, mode, persona_state)


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
```

- [ ] **Step 6.2: Installa dipendenze se mancanti**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/voice
pip install -r requirements.txt
```

- [ ] **Step 6.3: Verifica sintassi Python**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/voice
python -c "import agent; print('OK')"
```

Output atteso: `OK` (nessun errore di import).

- [ ] **Step 6.4: Commit**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI
git add packages/voice/agent.py
git commit -m "feat: agent — persona detection (first word), 4-mode routing, Kokoro TTS"
```

---

## Task 7: Aggiorna UI — model switcher rinominato + indicatore persona

**Files:**
- Modifica: `packages/ui/src/components/Header/Header.tsx`

Due cambiamenti rispetto all'originale:
1. Modalità rinominate: `["gemini", "ollama", "claude", "gpt"]` (erano `["gemini", "jarvis", "anthropic", "openai"]`)
2. Aggiunto indicatore persona attiva (JARVIS / FRIDAY) con polling `/persona`

- [ ] **Step 7.1: Sostituisci `packages/ui/src/components/Header/Header.tsx`**

```tsx
// packages/ui/src/components/Header/Header.tsx
import { useEffect, useState } from "react";
import { useVoiceAssistant } from "@livekit/components-react";
import styles from "./Header.module.scss";

type AgentMode = "gemini" | "ollama" | "claude" | "gpt";
type Persona = "jarvis" | "friday";

type HeaderProps = {
  onModeChange: () => void;
};

const modes: AgentMode[] = ["gemini", "ollama", "claude", "gpt"];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function usePersona(): Persona {
  const [persona, setPersona] = useState<Persona>("friday");
  useEffect(() => {
    let isMounted = true;
    const poll = () => {
      fetch("/persona")
        .then((r) => r.json() as Promise<{ persona?: Persona }>)
        .then((data) => {
          if (isMounted && (data.persona === "jarvis" || data.persona === "friday")) {
            setPersona(data.persona);
          }
        })
        .catch(() => {});
    };
    poll();
    const interval = window.setInterval(poll, 2000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);
  return persona;
}

export function Header({ onModeChange }: HeaderProps) {
  const now = useClock();
  const persona = usePersona();
  const { state } = useVoiceAssistant();
  const [currentMode, setCurrentMode] = useState<AgentMode>("gemini");
  const [isChangingMode, setIsChangingMode] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch("/mode")
      .then((r) => r.json() as Promise<{ mode?: AgentMode }>)
      .then((payload) => {
        if (isMounted && payload.mode && modes.includes(payload.mode)) {
          setCurrentMode(payload.mode);
        }
      })
      .catch((err: unknown) => console.error("Could not fetch mode.", err));
    return () => { isMounted = false; };
  }, []);

  const changeMode = async (mode: AgentMode) => {
    setIsChangingMode(true);
    try {
      const response = await fetch("/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) throw new Error(`Mode change failed: HTTP ${response.status}`);
      setCurrentMode(mode);
      onModeChange();
    } catch (err: unknown) {
      console.error("Could not change mode.", err);
    } finally {
      setIsChangingMode(false);
    }
  };

  const date = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(now);

  const personaLabel = persona === "jarvis" ? "J.A.R.V.I.S." : "F.R.I.D.A.Y.";

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.title}>{personaLabel}</div>
        <div className={styles.subtitle}>VOICE AGENT // {state.toUpperCase()}</div>
      </div>
      <div className={styles.modeSelector} aria-label="Agent mode">
        {modes.map((mode) => (
          <button
            type="button"
            key={mode}
            className={mode === currentMode ? styles.modeButtonActive : styles.modeButton}
            onClick={() => void changeMode(mode)}
            disabled={isChangingMode}
            aria-pressed={mode === currentMode}
          >
            {mode.toUpperCase()}
          </button>
        ))}
      </div>
      <div className={styles.statusItems}>
        <span>{date}</span>
        <span>{time}</span>
        <span>RICKY STARK</span>
      </div>
    </header>
  );
}
```

- [ ] **Step 7.2: Verifica build UI**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI/packages/ui
npm install
npm run build
```

Output atteso: build completata senza errori TypeScript.

- [ ] **Step 7.3: Commit**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI
git add packages/ui/src/components/Header/Header.tsx
git commit -m "feat: UI header — rename modes (ollama/claude/gpt), add live persona indicator"
```

---

## Task 8: .env.example e start.sh

**Files:**
- Crea: `.env.example`
- Crea: `start.sh`
- Modifica: `packages/voice/requirements.txt` (aggiungi pytest)

- [ ] **Step 8.1: Crea `.env.example`**

```bash
# .env.example — copia in .env e compila le chiavi

# LiveKit (Docker, usato da voice agent + token server + UI)
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

# STT — scegli uno: Google o OpenAI (OPENAI_API_KEY è anche usato per GPT)
GOOGLE_APPLICATION_CREDENTIALS=
OPENAI_API_KEY=

# LLM API
ANTHROPIC_API_KEY=
GOOGLE_GENAI_API_KEY=

# Core Node (JARVIS brain — porta 8787)
JARVIS_URL=http://localhost:8787

# Kokoro TTS (Docker — porta 8880)
KOKORO_URL=http://localhost:8880/v1

# Token server (porta 8788 — usato dal voice agent e dalla UI)
TOKEN_SERVER_URL=http://localhost:8788

# Modello Ollama locale
OLLAMA_MODEL=qwen3:8b
```

- [ ] **Step 8.2: Crea `start.sh`**

```bash
#!/usr/bin/env bash
# start.sh — avvia tutti i servizi STARK-AI

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "▶ Avvio Docker (LiveKit + Kokoro)..."
docker compose -f "$ROOT/docker/docker-compose.yml" up -d

echo "▶ Avvio Core Node (porta 8787)..."
cd "$ROOT/packages/core"
npm run dev &
CORE_PID=$!

echo "▶ Avvio Token Server (porta 8788)..."
cd "$ROOT/packages/voice"
python token_server.py &
TOKEN_PID=$!

echo "▶ Avvio Voice Agent..."
cd "$ROOT/packages/voice"
python agent.py dev &
AGENT_PID=$!

echo "▶ Avvio UI (porta 5173)..."
cd "$ROOT/packages/ui"
npm run dev &
UI_PID=$!

echo ""
echo "✓ STARK-AI online"
echo "  UI:           http://localhost:5173"
echo "  Token server: http://localhost:8788"
echo "  Core Node:    http://localhost:8787"
echo "  Kokoro TTS:   http://localhost:8880"
echo ""
echo "Premi CTRL+C per fermare tutto."

trap "kill $CORE_PID $TOKEN_PID $AGENT_PID $UI_PID 2>/dev/null; docker compose -f '$ROOT/docker/docker-compose.yml' down" INT
wait
```

- [ ] **Step 8.3: Rendi eseguibile**

```bash
chmod +x /Users/abstract/Documents/Claude/Projects/STARK-AI/start.sh
```

- [ ] **Step 8.4: Aggiungi pytest a requirements**

Apri `packages/voice/requirements.txt` e aggiungi in fondo:
```
pytest
pytest-asyncio
```

- [ ] **Step 8.5: Commit**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI
git add .env.example start.sh packages/voice/requirements.txt
git commit -m "chore: add .env.example, start.sh one-command launcher, pytest to requirements"
```

---

## Task 9: Smoke test end-to-end

Questo task è manuale — verifica che il sistema funzioni prima di dichiarare completo.

- [ ] **Step 9.1: Copia .env e compila le chiavi**

```bash
cp /Users/abstract/Documents/Claude/Projects/STARK-AI/.env.example \
   /Users/abstract/Documents/Claude/Projects/STARK-AI/.env
# Apri .env e inserisci almeno: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, OPENAI_API_KEY
```

- [ ] **Step 9.2: Avvia tutto**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI
./start.sh
```

- [ ] **Step 9.3: Verifica servizi attivi**

```bash
curl http://localhost:8788/mode     # → {"mode":"gemini"}
curl http://localhost:8788/persona  # → {"persona":"friday"}
curl http://localhost:8787/health   # → {"status":"ok"} (se implementato nel Core Node)
curl http://localhost:8880/v1/models  # → lista modelli Kokoro
```

- [ ] **Step 9.4: Testa persona switch vocale**

1. Apri `http://localhost:5173` nel browser
2. Connettiti alla sessione
3. Modalità = GEMINI selezionata nell'UI
4. Parla: **"FRIDAY, come stai?"**
   - Header mostra: `F.R.I.D.A.Y.`
   - Risposta con voce femminile Kokoro
5. Chiudi e riapri sessione
6. Parla: **"JARVIS, sistemi operativi?"**
   - Header mostra: `J.A.R.V.I.S.`
   - Risposta con voce maschile Kokoro

- [ ] **Step 9.5: Testa model switcher**

1. UI — click su `OLLAMA`
2. Parla una frase qualsiasi
3. Verifica risposta da modello locale (Ollama deve essere avviato separatamente con `ollama serve`)
4. UI — click su `CLAUDE`
5. Verifica risposta da Anthropic API
6. UI — click su `GPT`
7. Verifica risposta da OpenAI GPT-4o-mini

- [ ] **Step 9.6: Commit finale**

```bash
cd /Users/abstract/Documents/Claude/Projects/STARK-AI
git add .
git commit -m "chore: smoke test passed — STARK-AI MVP complete"
```

---

## Note implementative

**Voce Kokoro per Gemini mode:** Gemini usa `google.beta.realtime.RealtimeModel` con voce propria (`Aoede`). Non usa Kokoro. La persona (JARVIS/FRIDAY) cambia solo il system prompt, non la voce TTS in questa modalità. Accettabile per MVP.

**TTS e sessione LiveKit:** Il TTS Kokoro viene istanziato all'avvio della sessione pipeline. `make_tts(persona_state)` legge il valore corrente di `persona_state` al momento della creazione. Per sessioni che iniziano prima che la persona sia rilevata (prima parola), la voce iniziale è FRIDAY (default). Dal secondo turno in poi, se JARVIS è rilevato, la voce cambia nella sessione successiva. Questo è il trade-off MVP; voice hot-swap è out of scope.

**Ollama:** Deve girare nativo su macOS (`ollama serve`). Il Core Node lo chiama a `http://localhost:11434`. Non dockerizzato per sfruttare l'accelerazione M3 nativa.
