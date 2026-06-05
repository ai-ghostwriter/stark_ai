# ui_jarvis — ModuloAI 2-col, Scrollbar ciano, Auto-scroll

**Data:** 2026-06-01  
**Branch:** feat/jarvis-ui-voice  
**Scope:** Tre fix visivi al dashboard: layout ModuloAI, scrollbar globale ciano, auto-scroll AssistenteAI + LogSistema.

---

## Fix 1 — ModuloAI: layout 2 colonne

### Layout target

```
┌──────────────────────────────────────┐
│  LOCAL · qwen3:8b    │  ⬡ esagono   │
│  [verde se attivo]   │    ┌─ring─┐   │
│                      │    │  ●   │   │
│  API · sonnet-4-6    │    └──────┘   │
│  [verde se attivo]   │              │
└──────────────────────────────────────┘
```

### Struttura JSX (ModuloAI.tsx)

```tsx
<div className={styles.moduleWrap}>
  {/* colonna sinistra — modelli */}
  <div className={styles.modelList}>
    <div className={`${styles.modelRow} ${localActive ? styles.modelActive : styles.modelDim}`}>
      <span className={styles.modelDot} />
      <span className={styles.modelName}>LOCAL · {data?.models.local || '--'}</span>
    </div>
    <div className={`${styles.modelRow} ${apiActive ? styles.modelActive : styles.modelDim}`}>
      <span className={styles.modelDot} />
      <span className={styles.modelName}>API · {data?.models.api || '--'}</span>
    </div>
  </div>

  {/* colonna destra — badge esagono + rings */}
  <div className={styles.badgeContainer}>
    <svg className={styles.hexSvg} viewBox="0 0 100 90" width="64" height="58">
      <polygon className={styles.hexOuter} points="50 2 92 24 92 66 50 88 8 66 8 24" />
      <polygon className={styles.hexInner} points="50 13 80 30 80 60 50 77 20 60 20 30" />
    </svg>
    <div className={styles.rings}>
      <div className={styles.ringOuterDash} />
      <div className={styles.ringMidSolid} />
      <div className={styles.ringCore}>
        <div className={styles.coreDot} />
      </div>
    </div>
  </div>
</div>
```

### Logica activeModel

```ts
// legge ultimo messaggio JARVIS dallo store
const messages = useSelector((state: RootState) => state.chat.messages)
const lastJarvis = [...messages].reverse().find(m => m.speaker === 'jarvis')
const activeModel: 'local' | 'api' | null = (() => {
  const m = lastJarvis?.meta?.model?.toLowerCase() ?? ''
  if (m.includes('local') || m.includes('ollama') || m.includes('qwen')) return 'local'
  if (m.includes('api') || m.includes('anthropic') || m.includes('claude') || m.includes('sonnet')) return 'api'
  return null
})()
const localActive = activeModel === 'local'
const apiActive  = activeModel === 'api'
```

### CSS ModuloAI.module.scss

**`.moduleWrap`**: `display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 4px 0;`

**`.modelList`**: `display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0;`

**`.modelRow`**: `display: flex; align-items: center; gap: 6px; font-size: 9px; letter-spacing: 1px; text-transform: uppercase;`

**`.modelDot`**: `width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0;`

**`.modelActive`**:
```scss
.modelActive .modelDot { background: #00e87a; box-shadow: 0 0 6px rgba(0,232,122,0.8); }
.modelActive .modelName { color: #00e87a; text-shadow: 0 0 6px rgba(0,232,122,0.5); }
```

**`.modelDim`**:
```scss
.modelDim .modelDot { background: rgba(0,212,255,0.25); }
.modelDim .modelName { color: rgba(0,212,255,0.4); }
```

**`.badgeContainer`**: `position: relative; width: 64px; height: 58px; display: grid; place-items: center; flex-shrink: 0;`

**`.rings`**: `position: relative; width: 40px; height: 40px; display: grid; place-items: center;`

Tutte le animazioni esistenti (hexGlow, ringSpin, ringPulse, dotPulse) restano invariate.

---

## Fix 2 — Scrollbar ciano globale

File: `ui_jarvis/src/index.scss`

Aggiungere in fondo al file (dopo le regole esistenti):

```scss
/* scrollbar ciano sottile — globale */
::-webkit-scrollbar {
  width: 2px;
  height: 2px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 212, 255, 0.6);
  border-radius: 1px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 212, 255, 0.9);
}

* {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 212, 255, 0.6) transparent;
}
```

Si applica automaticamente a tutti i pannelli scrollabili presenti e futuri.

---

## Fix 3 — Auto-scroll al fondo: AssistenteAI e LogSistema

### Comportamento

Smart scroll: scorre automaticamente all'ultimo elemento quando arrivano nuovi item, MA solo se l'utente è già in fondo (o non ha mai scrollato). Se l'utente ha scrollato verso l'alto per leggere la storia, non viene interrotto.

Soglia "in fondo": `scrollHeight - scrollTop - clientHeight < 40px`.

### Hook riutilizzabile: `useAutoScroll`

Creare `ui_jarvis/src/hooks/useAutoScroll.ts`:

```ts
import { useCallback, useEffect, useRef } from 'react'

export function useAutoScroll(dep: number) {
  const ref = useRef<HTMLDivElement>(null)
  const isAtBottom = useRef(true)

  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  useEffect(() => {
    if (!isAtBottom.current || !ref.current) return
    ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' })
  }, [dep])

  return { ref, onScroll }
}
```

### Uso in AssistenteAI.tsx

```tsx
const messages = useSelector(...)
const { ref, onScroll } = useAutoScroll(messages.length)

<div className={styles.messageFeed} ref={ref} onScroll={onScroll}>
  {messages.map(...)}
</div>
```

### Uso in LogSistema.tsx

```tsx
const events = useSelector(...)
const { ref, onScroll } = useAutoScroll(events.length)

<div className={styles.logFeed} ref={ref} onScroll={onScroll}>
  {entries.map(...)}
</div>
```

---

## File da modificare

| File | Modifica |
|---|---|
| `ui_jarvis/src/components/ModuloAI/ModuloAI.tsx` | Redesign 2 colonne + logica activeModel |
| `ui_jarvis/src/components/ModuloAI/ModuloAI.module.scss` | Nuovo layout flex-row + stili modelli attivi/dim |
| `ui_jarvis/src/index.scss` | Scrollbar ciano globale |
| `ui_jarvis/src/hooks/useAutoScroll.ts` | Nuovo hook (creare) |
| `ui_jarvis/src/components/AssistenteAI/AssistenteAI.tsx` | Usa useAutoScroll |
| `ui_jarvis/src/components/LogSistema/LogSistema.tsx` | Usa useAutoScroll |

**Non toccare:** store Redux, backend, web/, jarvis/, VoiceView (auto-scroll non richiesto lì).
