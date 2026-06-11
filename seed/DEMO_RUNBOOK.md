# Demo Runbook — pannelli HUD

Avvio: `./start.sh` → http://localhost:5173 → Engage → consenti il microfono.
`STARK_DEMO_MODE=1` (default): i pannelli leggono i seed di questa cartella, dati fittizi, demo a prova di fumble.

Domande, in ordine:

1. "FRIDAY, fammi il brief." — la brief card si scrive da sola, chips e sezioni in cascata.
2. "Come vanno le vendite?" — la linea del grafico si disegna sull'asse date.
3. "Cosa c'è in pipeline? Qualcosa a rischio?" — il funnel cresce, Hashimoto FR pulsa in rosso.
4. "Cosa è stato detto sulle tabelle?" — timeline delle note QA.
5. "Su cosa lavoro oggi?" — la action list si rivela riga per riga.

Se la voce risponde ma il pannello non cambia: il hub :7710 non è raggiungibile dalla
UI (controlla la console browser) o il modello non ha scelto il tool — riformula citando
"brief" / "pipeline" / "vendite".
