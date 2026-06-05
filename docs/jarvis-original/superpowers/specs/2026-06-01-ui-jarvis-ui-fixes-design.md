# ui_jarvis — UI Fixes: ModuloAI + Chat Layout + StatoSistema

**Data:** 2026-06-01  
**Branch:** feat/jarvis-ui-voice  
**Scope:** Tre fix visivi al dashboard holografico ui_jarvis.

---

## Fix 1 — ModuloAI: Ibrido A+B+C

Il badge attuale (cerchio 80×80px) viene sostituito con un componente ibrido che combina:

- **Esagono esterno** (C): `<polygon>` SVG con bordo ciano animato `hex-glow` + esagono interno tratteggiato
- **Tre anelli concentrici** (A) al centro dell'esagono: anello esterno tratteggiato che ruota lentamente (`ring-spin 7s`), anello medio solido che pulsa (`ring-pulse 2s`), core scuro con punto verde centrale (`dot-pulse 1.6s`)
- **Status bar** (B) sotto il badge: barra scura con pallino verde pulsante + label "ATTIVO/OFFLINE" + effetto scan luminoso (`scan-bar 3s`) + nomi modelli LOCAL e API su due righe

### Struttura JSX

```
<div class="moduleWrap">           ← flex-col, align-center, gap 14px
  <div class="badgeContainer">    ← relative, 100×90px, grid place-center
    <svg class="hexSvg">          ← esagono esterno + interno, position absolute
    <div class="rings">           ← 62×62px, position relative, grid place-center
      <div class="ringOuterDash"> ← anello tratteggiato, ruota
      <div class="ringMidSolid">  ← anello solido, pulsa
      <div class="ringCore">      ← core scuro
        <div class="coreDot">     ← pallino verde
  <div class="statusBar">         ← barra 148px, overflow hidden per scan
    <div class="statusRow">       ← pallino + label ATTIVO/OFFLINE
    <div class="statusDivider">
    <div class="statusModel">     ← "LOCAL · {models.local}"
    <div class="statusModel">     ← "API · {models.api}"
```

### CSS (ModuloAI.module.scss) — animazioni chiave

| Nome | Proprietà | Durata |
|---|---|---|
| `hexGlow` | `filter: drop-shadow` ciano | 2.5s ease-in-out infinite |
| `ringSpin` | `transform: rotate` | 7s linear infinite |
| `ringPulse` | `opacity` + `transform: scale` | 2s ease-in-out infinite |
| `dotPulse` | `box-shadow` verde | 1.6s ease-in-out infinite |
| `scanBar` | `left` da -100% a 110% | 3s ease-in-out infinite |

### Colori

- Esagono bordo: `rgba(0,212,255,0.55)` + dashed `rgba(0,212,255,0.18)`
- Anello mid: `rgba(0,212,255,0.65)`
- Core dot: `#00e87a`
- Label ATTIVO: `#00e87a` | OFFLINE: `#ff5b5b`
- Scan overlay: `rgba(0,212,255,0.07)`

### Dati dal store

Rimane `useGetStatsQuery()`. Espone: `data?.models.local`, `data?.models.api`, `isError`, `isLoading`.

---

## Fix 2 — Chat Layout: TU a destra, JARVIS a sinistra

Applicato a **entrambi** i componenti: `AssistenteAI.tsx` e `VoiceView.tsx`.

### Regole layout

| Speaker | Allineamento | Bordo dominante | Colore label | Colore testo |
|---|---|---|---|---|
| `jarvis` | `align-self: flex-start` | `border-left: 2px solid rgba(0,212,255,0.8)` | `rgba(0,212,255,0.9)` | `rgba(180,220,255,0.85)` |
| `user` | `align-self: flex-end` | `border-right: 2px solid rgba(0,232,122,0.8)` | `#00e87a` | `rgba(180,255,210,0.85)` |

Gli altri tre bordi dei messaggi restano sottili e semi-trasparenti (1px, 0.08–0.15 opacity).

Per i messaggi utente: `text-align: right` sul testo, `flex-direction: row-reverse` sull'header (nome a destra, timestamp a sinistra).

### Modifiche SCSS — AssistenteAI.module.scss

```scss
.chatMsgJarvis {
  align-self: flex-start;
  border-left: 2px solid rgba(0,212,255,0.8);
  border-top: 1px solid rgba(0,212,255,0.15);
  border-bottom: 1px solid rgba(0,212,255,0.15);
  border-right: 1px solid rgba(0,212,255,0.08);
}

.chatMsgUser {
  align-self: flex-end;
  border-right: 2px solid rgba(0,232,122,0.8);
  border-top: 1px solid rgba(0,232,122,0.15);
  border-bottom: 1px solid rgba(0,232,122,0.15);
  border-left: 1px solid rgba(0,232,122,0.08);
  text-align: right;
  opacity: 1;  /* rimuove l'opacity: 0.8 precedente */
}

.chatMsgHeader {
  /* JARVIS: row normale | TU: row-reverse via classe dedicata */
}

.chatMsgHeaderUser {
  flex-direction: row-reverse;
}

.chatMsgFromUser {
  color: #00e87a;
  text-shadow: 0 0 6px rgba(0,232,122,0.6);
}
```

Gli stessi identici stili vanno applicati al SCSS di `VoiceView.module.scss` per i messaggi nella view centrale.

---

## Fix 3 — StatoSistema: bug isOffline durante loading

### Root cause

```ts
// BUGGY — undefined !== 'ok' è true → isOffline durante loading
const { data, isError } = useGetStatsQuery();
const isOffline = isError || data?.status !== 'ok';
```

Quando `data` è `undefined` (prima risposta non ancora arrivata), `data?.status !== 'ok'` restituisce `true` → `isOffline = true` → tutte le metriche mostrano `--` invece di un indicatore di caricamento.

### Fix

```ts
const { data, isError, isLoading } = useGetStatsQuery();
const isOffline = !isLoading && (isError || (data !== undefined && data.status !== 'ok'));
```

Con questo fix:
- **Loading**: `isOffline = false` → le barre mostrano `0%` con animazione (o placeholder `...`)
- **Online**: `isOffline = false` → valori reali
- **Offline**: `isOffline = true` → mostra `--`

Aggiungere anche un indicatore visivo di loading: quando `isLoading === true`, mostrare `...` al posto del valore numerico (anziché `0%`).

---

## File da modificare

| File | Modifica |
|---|---|
| `ui_jarvis/src/components/ModuloAI/ModuloAI.tsx` | Redesign completo ibrido A+B+C |
| `ui_jarvis/src/components/ModuloAI/ModuloAI.module.scss` | Nuove animazioni e stili |
| `ui_jarvis/src/components/AssistenteAI/AssistenteAI.tsx` | Aggiunge classe header per user |
| `ui_jarvis/src/components/AssistenteAI/AssistenteAI.module.scss` | Layout messaggi dx/sx + colori |
| `ui_jarvis/src/components/VoiceView/VoiceView.tsx` | Stesso fix chat (se presente lista messaggi) |
| `ui_jarvis/src/components/VoiceView/VoiceView.module.scss` | Stessi stili chat |
| `ui_jarvis/src/components/StatoSistema/StatoSistema.tsx` | Fix isOffline + gestione isLoading |

**Non modificare:** store Redux, backend, web/, jarvis/.
