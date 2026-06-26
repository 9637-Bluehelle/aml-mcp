# Implementazione Badge Numerici Alert

## 📋 Descrizione

Implementazione di **badge numerici** sui pulsanti delle tre categorie di alert nel pannello Alert e Notifiche. I badge mostrano il numero di alert presenti per ciascuna categoria e sono visibili solo quando il conteggio è maggiore di zero.

**Data Implementazione**: 15 Novembre 2025

---

## 🎯 Obiettivo

Migliorare la UX del pannello alert mostrando immediatamente all'utente:
- Quanti **clienti senza incarichi** esistono (RT4)
- Quanti **incarichi senza valutazioni** esistono (RT2)
- Quanti **clienti in bozza** esistono (RT2-DRAFT)

**Prima:**
```
[ Clienti senza Incarichi ]  [ Incarichi senza Valutazioni ]  [ Clienti in Bozza ]
```

**Dopo:**
```
[ Clienti senza Incarichi (5) ]  [ Incarichi senza Valutazioni (12) ]  [ Clienti in Bozza ]
```
↑ Nota: Il terzo pulsante non ha badge perché count = 0

---

## 🛠️ Modifiche Tecniche

### File Modificato
- `src/components/AlertPanel.tsx`

### 1. Nuovo State per i Conteggi

```typescript
const [alertCounts, setAlertCounts] = useState({
  no_incarichi: 0,    // Alert RT4 (clienti senza incarichi)
  no_valutazioni: 0,  // Alert RT2 (incarichi senza valutazioni)
  draft: 0            // Alert RT2-DRAFT (clienti in bozza)
});
```

### 2. Funzione loadAlertCounts()

Nuova funzione che esegue query ottimizzate per contare gli alert per categoria:

```typescript
async function loadAlertCounts() {
  // Count RT4 (Clienti senza incarichi)
  const { count: countRT4 } = await supabase
    .from('alert')
    .select('*', { count: 'exact', head: true })
    .eq('tipo_rt', 'RT4');

  // Count RT2 (Incarichi senza valutazioni)
  const { count: countRT2 } = await supabase
    .from('alert')
    .select('*', { count: 'exact', head: true })
    .eq('tipo_rt', 'RT2');

  // Count RT2-DRAFT (Clienti in bozza)
  const { count: countDraft } = await supabase
    .from('alert')
    .select('*', { count: 'exact', head: true })
    .eq('tipo_rt', 'RT2-DRAFT');

  setAlertCounts({
    no_incarichi: countRT4 || 0,
    no_valutazioni: countRT2 || 0,
    draft: countDraft || 0
  });
}
```

**Nota Tecnica**: 
- Usa `{ count: 'exact', head: true }` per ottenere solo il conteggio senza dati
- Query ottimizzate (head=true restituisce solo il count, non i record)
- Più efficiente rispetto a caricare tutti i record

### 3. Aggiornamento useEffect

```typescript
useEffect(() => {
  loadAlerts();       // Carica gli alert filtrati
  loadAlertCounts();  // ← NUOVO: Carica i conteggi
}, [filter]);
```

### 4. Aggiornamento checkSystemAlerts()

```typescript
async function checkSystemAlerts() {
  // ... codice esistente ...
  
  await loadAlerts();
  await loadAlertCounts();  // ← NUOVO: Aggiorna conteggi dopo check
}
```

### 5. Aggiornamento JSX dei Pulsanti

Badge aggiunti inline con rendering condizionale:

```tsx
<button
  onClick={() => setFilter('no_incarichi')}
  className={/* ... */}
>
  Clienti senza Incarichi{alertCounts.no_incarichi > 0 && ` (${alertCounts.no_incarichi})`}
</button>

<button
  onClick={() => setFilter('no_valutazioni')}
  className={/* ... */}
>
  Incarichi senza Valutazioni{alertCounts.no_valutazioni > 0 && ` (${alertCounts.no_valutazioni})`}
</button>

<button
  onClick={() => setFilter('draft')}
  className={/* ... */}
>
  Clienti in Bozza{alertCounts.draft > 0 && ` (${alertCounts.draft})`}
</button>
```

**Logica:**
- `{alertCounts.no_incarichi > 0 && ` (${alertCounts.no_incarichi})`}`
- Badge visualizzato SOLO se count > 0
- Formato: `(numero)` tra parentesi tonde
- Stesso colore del testo del pulsante

---

## 📊 Query Database

### Query di Conteggio per RT4
```sql
SELECT COUNT(*) FROM alert WHERE tipo_rt = 'RT4';
```

### Query di Conteggio per RT2
```sql
SELECT COUNT(*) FROM alert WHERE tipo_rt = 'RT2';
```

### Query di Conteggio per RT2-DRAFT
```sql
SELECT COUNT(*) FROM alert WHERE tipo_rt = 'RT2-DRAFT';
```

---

## ⚡ Performance

### Ottimizzazioni Applicate

1. **Head Request**: 
   - `{ count: 'exact', head: true }`
   - Supabase restituisce solo il conteggio nell'header
   - Non trasferisce dati dei record

2. **Query Parallele Potenziali**:
   - Le tre query sono indipendenti
   - Possibile ottimizzazione futura con `Promise.all()`

3. **Aggiornamento Strategico**:
   - Conteggi caricati solo quando necessario:
     - Al mount del componente
     - Al cambio filtro
     - Dopo il controllo manuale alert

### Esempio Ottimizzazione Futura

```typescript
async function loadAlertCounts() {
  const [
    { count: countRT4 },
    { count: countRT2 },
    { count: countDraft }
  ] = await Promise.all([
    supabase.from('alert').select('*', { count: 'exact', head: true }).eq('tipo_rt', 'RT4'),
    supabase.from('alert').select('*', { count: 'exact', head: true }).eq('tipo_rt', 'RT2'),
    supabase.from('alert').select('*', { count: 'exact', head: true }).eq('tipo_rt', 'RT2-DRAFT')
  ]);
  
  // ... resto del codice
}
```

---

## 🎨 Stile Badge

### Caratteristiche Visive

- **Formato**: `(numero)` tra parentesi tonde
- **Colore**: Eredita dal pulsante
  - Bianco quando pulsante attivo (blu)
  - Grigio quando pulsante inattivo (bianco)
- **Visibilità**: Solo se count > 0
- **Posizione**: Inline dopo il testo del pulsante
- **Transizioni**: Stesso comportamento del pulsante

### Esempi Stati

**Pulsante Attivo con Alert:**
```
[ Clienti senza Incarichi (5) ]  ← Blu con testo bianco
```

**Pulsante Inattivo con Alert:**
```
[ Incarichi senza Valutazioni (12) ]  ← Bianco con testo grigio
```

**Pulsante con Zero Alert:**
```
[ Clienti in Bozza ]  ← Nessun badge visualizzato
```

---

## 🔄 Flusso di Aggiornamento

### 1. Caricamento Iniziale
```
Component Mount
    ↓
useEffect()
    ↓
loadAlerts() + loadAlertCounts()
    ↓
UI Aggiornata con badge
```

### 2. Cambio Filtro
```
User Clicks Button
    ↓
setFilter(newFilter)
    ↓
useEffect() triggered
    ↓
loadAlerts() + loadAlertCounts()
    ↓
UI Aggiornata
```

### 3. Controllo Manuale Alert
```
User Clicks "Controlla Alert"
    ↓
checkSystemAlerts()
    ↓
cleanupObsoleteAlerts()
checkClientiSenzaIncarichi()
checkIncarichiSenzaValutazione()
checkClientiInBozza()
    ↓
loadAlerts() + loadAlertCounts()
    ↓
UI Aggiornata con nuovi conteggi
```

---

## ✅ Test Suggeriti

### Test Funzionali

1. **Badge Visibilità**
   - ✓ Badge visualizzato quando count > 0
   - ✓ Badge nascosto quando count = 0
   - ✓ Badge aggiornato dopo "Controlla Alert"

2. **Badge Valori**
   - ✓ Numero corretto per RT4
   - ✓ Numero corretto per RT2
   - ✓ Numero corretto per RT2-DRAFT

3. **Badge Styling**
   - ✓ Colore bianco su pulsante attivo
   - ✓ Colore grigio su pulsante inattivo
   - ✓ Formato `(numero)` corretto

### Test Scenario

**Scenario 1: Nessun Alert**
```
Stato: Nessun alert nel database
Risultato: Nessun badge visibile
```

**Scenario 2: Alert Misti**
```
Stato: 
- 5 alert RT4
- 12 alert RT2
- 0 alert RT2-DRAFT

Risultato:
- Clienti senza Incarichi (5)
- Incarichi senza Valutazioni (12)
- Clienti in Bozza (no badge)
```

**Scenario 3: Dopo Controllo Alert**
```
Azione: Click su "Controlla Alert"
Risultato: Badge aggiornati con nuovi conteggi
```

### Test Performance

1. **Query Effficienza**
```sql
EXPLAIN ANALYZE 
SELECT COUNT(*) FROM alert WHERE tipo_rt = 'RT4';
```

2. **Network Monitoring**
   - Verificare che vengano trasferiti solo conteggi (head request)
   - Nessun trasferimento di record completi

---

## 🐛 Troubleshooting

### Badge Non Visualizzato

**Problema**: Badge non appare anche se ci sono alert

**Possibili Cause**:
1. Query fallita (controlla console)
2. Permessi RLS su tabella `alert`
3. Cache browser (hard refresh)

**Soluzione**:
```typescript
// Aggiungi logging in loadAlertCounts()
console.log('Alert counts:', { countRT4, countRT2, countDraft });
```

### Conteggio Errato

**Problema**: Il numero visualizzato non corrisponde agli alert reali

**Possibili Cause**:
1. Filter RLS che nasconde alcuni alert
2. Alert con tipo_rt diverso dal previsto
3. Stato non aggiornato dopo operazioni

**Soluzione**:
```sql
-- Verifica manualmente i conteggi
SELECT tipo_rt, COUNT(*) 
FROM alert 
GROUP BY tipo_rt;
```

### Badge Non Aggiornato

**Problema**: Badge rimane uguale dopo "Controlla Alert"

**Causa**: `loadAlertCounts()` non chiamato dopo `checkSystemAlerts()`

**Fix**: Verificare che sia presente:
```typescript
await loadAlerts();
await loadAlertCounts();  // ← Deve essere presente
```

---

## 📝 Note Implementative

### Scelte di Design

1. **Parentesi Tonde vs Circolari**
   - Scelta: Parentesi tonde `(5)`
   - Motivazione: Più semplice, meno impatto visivo
   - Alternativa: Badge circolare colorato

2. **Visibilità Condizionale**
   - Scelta: Badge nascosto se count = 0
   - Motivazione: UI più pulita
   - Alternativa: Mostrare sempre `(0)`

3. **Posizione Badge**
   - Scelta: Inline dopo testo
   - Motivazione: Leggibilità immediata
   - Alternativa: Badge separato a destra

### Possibili Miglioramenti Futuri

1. **Real-time Updates**
   ```typescript
   // Subscription Supabase per aggiornamenti live
   useEffect(() => {
     const subscription = supabase
       .channel('alert-changes')
       .on('postgres_changes', 
         { event: '*', schema: 'public', table: 'alert' },
         () => loadAlertCounts()
       )
       .subscribe();
     
     return () => subscription.unsubscribe();
   }, []);
   ```

2. **Badge Colorati per Priorità**
   ```tsx
   {alertCounts.no_valutazioni > 0 && (
     <span className="ml-2 px-2 py-0.5 bg-red-600 text-white rounded-full text-xs">
       {alertCounts.no_valutazioni}
     </span>
   )}
   ```

3. **Animazione su Cambio Valore**
   ```css
   @keyframes pulse {
     0%, 100% { opacity: 1; }
     50% { opacity: 0.5; }
   }
   ```

---

## 📦 Dipendenze

- **React**: `useState`, `useEffect`
- **Supabase**: Client per query database
- **TypeScript**: Type safety per state

Nessuna dipendenza esterna aggiuntiva richiesta.

---

## ✅ Checklist Completamento

- [x] State `alertCounts` aggiunto
- [x] Funzione `loadAlertCounts()` implementata
- [x] useEffect aggiornato con chiamata a `loadAlertCounts()`
- [x] `checkSystemAlerts()` aggiornato con chiamata a `loadAlertCounts()`
- [x] Badge aggiunti ai 3 pulsanti
- [x] Rendering condizionale `> 0` implementato
- [x] Test manuale eseguito
- [x] Documentazione creata

---

## 🎯 Risultato Finale

L'implementazione fornisce:
- ✅ Feedback visivo immediato sul numero di alert
- ✅ UI più informativa e user-friendly
- ✅ Performance ottimizzate (solo conteggi, no dati completi)
- ✅ Aggiornamento automatico dopo operazioni
- ✅ Codice pulito e manutenibile

**Impatto**: Miglioramento significativo della UX senza overhead performance.
