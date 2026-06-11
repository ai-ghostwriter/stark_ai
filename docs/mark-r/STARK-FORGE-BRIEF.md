# STARK-FORGE-BRIEF.md — Seme di negoziazione ruoli per MARK-R Slice 0

> Input per l'arbitro stark-forge. Contiene il contesto del task e la proposta iniziale
> di ruoli. La convergenza segue le regole standard: accordo solo quando entrambi gli
> agenti confermano E i ruoli coincidono.

## Task oggetto della negoziazione

Implementare lo **Slice 0** di MARK-R come da `docs/SLICE-0-SPEC.md`:
monorepo, `@contracts` (Zod + fixtures + gen JSON Schema), WS hub + FakeBrain (TS),
voice-core stub + codegen Pydantic + pytest (Python), hud minimale (React), Makefile + CI.
Criteri di accettazione: SLICE-0-SPEC §7.

## Proposta iniziale (seme)

```json
{
  "ruoli_proposti": {
    "claude_code": [
      "packages/contracts: schemi Zod, golden fixtures, script gen-jsonschema, test Vitest",
      "packages/agent-core: WS hub, FakeBrain, unit test",
      "packages/hud: client React minimale di debug",
      "Makefile e workflow CI GitHub Actions",
      "review incrociata del lavoro Python di Codex"
    ],
    "codex_cli": [
      "services/voice-core: stub WS asyncio (stdin -> stt.final, log tts.speak), unit pytest",
      "pipeline codegen Pydantic (datamodel-code-generator) e check di sincronizzazione in CI",
      "contract test pytest sulle golden fixtures (valide e invalide)",
      "review incrociata del lavoro TypeScript di Claude Code"
    ]
  },
  "motivazione": "Split per linguaggio e per competenza dichiarata nei doc di progetto: TS/React/orchestrazione a Claude Code, Python/codegen/validazione a Codex. Il contratto resta zona condivisa a modifica concordata; la review incrociata bilaterale garantisce che nessun confine venga violato unilateralmente. Il carico stimato e' bilanciato: Claude Code ha piu' superfici ma piu' semplici, Codex ha meno file ma possiede il lucchetto anti-deriva (codegen+contract test), che e' il pezzo piu' critico dello slice.",
  "accordo_raggiunto": false
}
```

## Vincoli non negoziabili (fuori dal perimetro di negoziazione)

1. `packages/contracts/src/**`: modifiche solo concordate per iscritto, da chiunque.
2. I criteri di accettazione di SLICE-0-SPEC §7 non si negoziano, si soddisfano.
3. Nessuna installazione a runtime; lockfile obbligatori.
4. La review incrociata è bidirezionale e obbligatoria prima del merge su `development`.

## Punti legittimamente negoziabili

- Chi possiede il Makefile/CI (proposto Claude Code; argomentabile per Codex se prende
  anche il check di sync codegen).
- Chi implementa il contract test TS (proposto Claude Code dentro contracts; Codex può
  rivendicarlo per simmetria con quello pytest).
- L'hud minimale (basso valore, può andare a chi finisce prima).
