# MARK-R — Pacchetto documenti di avvio

Pacchetto completo per inizializzare il repo e mettere al lavoro Claude Code + Codex CLI.

## Contenuto e ordine di lettura (per gli agenti)

1. `docs/ARCHITECTURE.md` — design completo: requisiti, ADR di stack, contratto, router
   ibrido, MCP tools, strategia di test, roadmap a slice.
2. `docs/SLICE-0-SPEC.md` — spec operativa vincolante dello slice corrente (con codice
   di riferimento e criteri di accettazione).
3. `docs/INTEGRATION-JARVIS-FRIDAY.md` — come inglobare i persona file esistenti
   (decomposizione identità/voce/routing, schema PersonaProfile, piano di migrazione).
4. `docs/STARK-FORGE-BRIEF.md` — seme di negoziazione ruoli per l'arbitro stark-forge.
5. `CLAUDE.md` — regole operative per Claude Code (in root del repo).
6. `AGENTS.md` — regole operative per Codex CLI (in root del repo).

## Setup del repo (umano, una volta sola)

```bash
mkdir mark-r && cd mark-r && git init -b main
# copia: CLAUDE.md, AGENTS.md in root; docs/ come cartella
git checkout -b development
git add . && git commit -m "docs: bootstrap MARK-R architecture and slice-0 spec"
```

## Prompt di avvio — Claude Code

> Leggi CLAUDE.md, poi docs/ARCHITECTURE.md, docs/SLICE-0-SPEC.md e
> docs/INTEGRATION-JARVIS-FRIDAY.md. Prima di scrivere codice, esegui la negoziazione
> ruoli stark-forge usando docs/STARK-FORGE-BRIEF.md come seme. Poi implementa SOLO le
> aree a te assegnate dello Slice 0, rispettando i criteri di accettazione della spec §7.
> Annota decisioni e open point in .session/notes/.

## Prompt di avvio — Codex CLI

> Leggi AGENTS.md, poi docs/ARCHITECTURE.md, docs/SLICE-0-SPEC.md e
> docs/INTEGRATION-JARVIS-FRIDAY.md. Partecipa alla negoziazione stark-forge
> (docs/STARK-FORGE-BRIEF.md). Implementa SOLO le aree a te assegnate dello Slice 0.
> Il contratto in packages/contracts e' a modifica concordata: se serve cambiarlo,
> proponi in .session/notes/, non applicare unilateralmente.

## Dopo lo Slice 0

La roadmap (ARCHITECTURE.md §9) prosegue con: Slice 1 (loop testo + Ollama + primo tool
MCP), Slice 2 (hybrid routing OpenRouter), Slice 3 (voce reale + integrazione voci
persona), Slice 4 (HUD Tauri), Slice 5 (tool fleet), Slice 6 (hardening).
La migrazione completa JARVIS/FRIDAY si chiude allo Slice 3 (switch vocale end-to-end).
