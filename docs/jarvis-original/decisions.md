# JARVIS — Decision Log (ADR)

Registro delle decisioni di progetto. Ogni voce: contesto → decisione → razionale → alternative scartate.
Fonte: sessione di brainstorming 2026-05-31.

---

## ADR-001 — JARVIS è un assistente generale, non una pipeline KDP

**Decisione:** Il Core è un assistente AI personale generale. KDP è *un dominio* di tool, non il fine.

**Razionale:** L'intento è "fare ciò che non posso fare in locale" integrando LLM locale + API.
Il valore sta nel brain ibrido riusabile su qualsiasi dominio; legarlo a KDP lo renderebbe rigido.

**Scartato:** Costruire direttamente l'orchestratore KDP (accoppia il Core al dominio fin dall'inizio).

---

## ADR-002 — Architettura ibrida locale (Ollama) + API (Anthropic)

**Decisione:** Local-first; l'API si accende solo sui task pesanti.

**Razionale:** Le tre valute sono binari separati. Spostare il "lavoro sporco" sul locale azzera
il consumo di token API e finestre Pro. Il Pro non è usabile in runtime dentro un software.

---

## ADR-003 — Stack: Core in Node/TypeScript

**Decisione:** Core in Node/TS. Sidecar Python opzionale solo per embedding locali / Whisper, fuori MVP.

**Razionale:**
1. È il linguaggio forte del manutentore (Node/TS/React/Redux/RTK-Query) → manutenibilità di un
   progetto personale di lungo periodo.
2. JARVIS a runtime è quasi tutto I/O-bound (HTTP a Ollama e Anthropic, file, streaming) → terreno di Node.
3. Il "lavoro AI pesante" non è in-process: lo fanno Ollama (processo separato) e l'API (HTTP).
   JARVIS è un orchestratore di chiamate.
4. Ecosistema AI maturo su TS (SDK Anthropic, Ollama JS, Pinecone TS, LlamaIndex.TS).
5. Stack unificato col futuro frontend React (type condivisi).

**Scartato:**
- *Tutto Python* — path di minor resistenza sulle librerie, ma linguaggio più debole per il manutentore.
- *Node core + Python worker pesante* — complica le operazioni senza beneficio nell'MVP.
- Il prototipo Python esistente resta come *reference spec*, non codice vivo.

---

## ADR-004 — Routing locale/API: regole + override, non classificatore LLM

**Decisione:** MVP con routing deterministico a 3 tier:
- Tier 0: override esplicito (`--api`/`--local`) → vince sempre.
- Tier 1: regole certe (lunghezza input oltre soglia, pattern di task generativo lungo, flag heavy) → API.
- Tier 2: default locale con tool-calling nativo.

**Razionale:** Il routing sono **due** decisioni distinte:
1. *Serve un tool?* → la risolve il tool-calling nativo del modello locale.
2. *Serve la qualità dell'API?* → è la decisione che costa soldi, ed è **enumerabile** con regole.

Un classificatore LLM locale (8B) è inaffidabile proprio sulla decisione #2: un modellino è pessimo
nel giudicare i propri limiti (proverà a scrivere male un capitolo da 23k parole) e aggiunge latenza
a ogni richiesta. Le regole sono deterministiche, debuggabili, misurabili.

**Scartato (rimandato, non MVP):**
- Classificatore LLM locale come triage primario.
- Tier 3 "escalation-on-doubt" (il locale risponde, un check di qualità ritenta su API).
Si aggiungono solo se le regole si rivelano insufficienti, misurando sull'uso reale.

---

## ADR-005 — Interfaccia: CLI ibrida ora, NL/voce/React dopo

**Decisione:** MVP = CLI ibrida (REPL chat + flag override). Il router in linguaggio naturale, la
voce (Whisper/TTS) e il frontend React sono il sotto-progetto F.

**Razionale:** YAGNI. I comandi/flag espliciti sono solidi e misurabili subito; l'intelligenza NL
si aggiunge quando il Core è tarato.

---

## ADR-006 — Modelli reali allineati all'ambiente

**Decisione:** Locale `qwen3:8b` (presente sul Mac), API `claude-sonnet-4-6`.

**Razionale:** Il brief originale assumeva `qwen2.5:14b`/`llama3.1:8b`, non presenti. Si parte da ciò
che esiste davvero. Il tiering Haiku/Sonnet/Opus + prompt caching è il sotto-progetto B.

---

## ADR-007 — Piano confezionato come skill condivisa Claude ↔ Codex

**Decisione:** Il piano di implementazione vive nella skill `jarvis-build` (in `SKILLS/`), symlinkata
a `~/.claude/skills/` e `~/.codex/skills/`.

**Razionale:** La costruzione del Core è un lavoro multi-task adatto a esecuzione agentica (anche
multi-agente Claude/Codex). Avere il piano come skill accessibile a entrambi gli agenti ne abilita
l'esecuzione coordinata, in linea con la Regola 2 del progetto (skill in `SKILLS/` + symlink).
