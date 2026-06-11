# INTEGRATION-JARVIS-FRIDAY.md — Inglobare il sistema persona esistente in MARK-R

> Come migrare i persona file Python esistenti (JARVIS, FRIDAY — e in prospettiva
> VERONICA/WAR-MACHINE) dentro l'architettura MARK-R senza snaturarli e senza
> reintrodurre accoppiamenti.

## 1. Cosa esiste oggi

Persona file Python con questa forma (semplificata):
- **JARVIS** — voce `am_adam` — analista tecnico profondo.
- **FRIDAY** — voce `af_sky` — valutatrice critica senza filtri.
- Ogni file contiene due blocchi: `AGENT_INSTRUCTION` (identità/comportamento permanente)
  e `SESSION_INSTRUCTION` (innesco di sessione).
- Oggi identità, voce e logica convivono nello stesso file Python → stesso accoppiamento
  che MARK-R esiste per eliminare.

## 2. Principio di integrazione

Una persona NON è un processo, NON è un agente separato. **Una persona è una
configurazione** che attraversa i layer secondo le rispettive responsabilità:

| Aspetto della persona | Dove vive in MARK-R | Forma |
|---|---|---|
| Identità/carattere (`AGENT_INSTRUCTION`) | agent-core | system prompt nel PersonaProfile |
| Innesco sessione (`SESSION_INSTRUCTION`) | agent-core | primo messaggio/priming della FSM |
| Voce (`am_adam`, `af_sky`) | voice-core | mappa `voiceId` per engine TTS |
| Preferenze di routing (es. FRIDAY→cloud per critica profonda) | agent-core (router) | `routingHints` nel profilo |
| Indicazione attiva nel turno | contratto | campo `persona` su `tts.speak` (già presente da Slice 0) |

Conseguenza: i file Python attuali si **decompongono**, non si copiano. Il testo dei
blocchi si conserva al 100%; cambia solo dove abita.

## 3. Formato target — `packages/agent-core/personas/*.json`

Un file per persona, dati puri (niente codice):

```json
{
  "id": "jarvis",
  "displayName": "JARVIS",
  "voice": { "kokoro": "am_adam", "edgetts": "en-US-GuyNeural" },
  "agentInstruction": "<<< incollare il blocco AGENT_INSTRUCTION esistente, verbatim >>>",
  "sessionInstruction": "<<< incollare il blocco SESSION_INSTRUCTION esistente, verbatim >>>",
  "routingHints": { "preferred": "local", "escalateOn": ["deep_analysis"] },
  "language": "auto"
}
```

```json
{
  "id": "friday",
  "displayName": "FRIDAY",
  "voice": { "kokoro": "af_sky", "edgetts": "en-IE-EmilyNeural" },
  "agentInstruction": "<<< AGENT_INSTRUCTION di FRIDAY, verbatim >>>",
  "sessionInstruction": "<<< SESSION_INSTRUCTION di FRIDAY, verbatim >>>",
  "routingHints": { "preferred": "cloud", "escalateOn": ["critical_review"] },
  "language": "auto"
}
```

Schema Zod `PersonaProfile` in `@contracts` (aggiunta concordata al contratto — vedi §6),
validato al load. `veronica.json` e `warmachine.json` seguono lo stesso schema quando
verranno portati.

## 4. Runtime in agent-core

```
src/personas/
├─ registry.ts     # carica e valida i JSON, espone get(id) e list()
├─ active.ts       # persona attiva (default: jarvis), switch a runtime
└─ profiles/*.json
```

Comportamento:
1. La FSM costruisce il contesto LLM con `agentInstruction` come system prompt e
   `sessionInstruction` come priming all'avvio sessione.
2. Il router riceve `routingHints` come input addizionale di `route()` — gli hint NON
   scavalcano i vincoli forti (offline/sensitive restano prioritari).
3. Ogni `tts.speak` esce con `persona: <id attivo>`; voice-core risolve la voce con la
   sua mappa locale (`persona → voiceId per engine TTS attivo`).
4. **Switch vocale**: "passa a FRIDAY" / "switch to FRIDAY" → la FSM cambia persona
   attiva, emette un `route.info` informativo e un breve `tts.speak` di conferma con la
   nuova voce. (Lo switch è un intent gestito dalla FSM, non un tool.)

## 5. Cosa resta in voice-core

Solo la mappa voce, niente identità:
```python
PERSONA_VOICES = {
  "jarvis":  {"kokoro": "am_adam", "edgetts": "en-US-GuyNeural"},
  "friday":  {"kokoro": "af_sky",  "edgetts": "en-IE-EmilyNeural"},
  "default": {"kokoro": "am_adam", "edgetts": "en-US-GuyNeural"},
}
```
Se in `tts.speak` arriva `voice` esplicito, vince su `persona`. Se arriva una persona
sconosciuta → fallback `default` + warning (mai crash).

## 6. Piano di migrazione (task per gli agenti)

1. **[concordata]** Aggiungere a `@contracts`: schema `PersonaProfile` + (già fatto in
   Slice 0) campo `persona` su `tts.speak`. Rigenerare Pydantic, aggiornare fixtures.
2. Estrarre `AGENT_INSTRUCTION`/`SESSION_INSTRUCTION` dai file Python esistenti →
   `profiles/jarvis.json`, `profiles/friday.json` (testo verbatim, nessuna riscrittura).
3. Implementare `personas/registry.ts` + `active.ts` + test (load, validazione, switch).
4. Aggiungere `PERSONA_VOICES` e la risoluzione voce in voice-core + test.
5. Slice 3+ (quando c'è la voce reale): verificare lo switch end-to-end con TTS reale.
6. Deprecare i persona file Python originali (spostarli in `legacy/` con nota, non cancellarli).

Owner suggeriti: 1–3 Claude Code, 4 Codex, 5 congiunto, 6 Codex. Negoziabile via stark-forge.

## 7. Invarianti da non violare

- L'identità non vive MAI in voice-core; la voce non vive MAI in agent-core.
- I testi originali di AGENT/SESSION_INSTRUCTION si migrano verbatim (sono asset
  consolidati dell'utente, non materiale da "migliorare" senza richiesta).
- Lo switch persona non resetta la conversazione: cambia system prompt e voce, la
  history resta (la FSM annota il cambio nel contesto).
