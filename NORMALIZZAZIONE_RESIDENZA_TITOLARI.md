# 🏠 Normalizzazione Campo Residenza Titolari Effettivi

**Data Implementazione**: 06/11/2025  
**Stato**: ✅ COMPLETATO  
**Richiesta Utente**: Unificare residenza titolari da 3 campi a 1 campo come altri soggetti

---

## 🎯 Obiettivo

Normalizzare il campo residenza dei **titolari effettivi** per uniformità con gli altri tipi di soggetto (persona fisica, professionista, impresa).

### Inconsistenza Iniziale

**Titolari Effettivi** ❌ (3 campi separati):
- `via_residenza`: "Via Roma"
- `numero_civico`: "1"
- `comune_residenza`: "00100 Roma"

**Altri Soggetti** ✅ (1 campo unico):
- Persona Fisica: `residenza_pf` → "Via Roma 1, 00100 Roma"
- Professionista: `residenza_prof` → "Via Roma 1, 00100 Roma"
- Impresa: `indirizzo` → "Via Roma 1, 00100 Roma"

---

## 📋 Modifiche Implementate

### 1. Type Definition
**File**: `src/components/cliente-wizard/types.ts`

```typescript
export interface TitolareEffettivo {
  // ...altri campi
  
  // VECCHIO ❌
  // via_residenza: string;
  // numero_civico: string;
  // comune_residenza: string;
  
  // NUOVO ✅
  residenza: string;
  
  // ...altri campi
}
```

### 2. Form UI
**File**: `TitolareEffettivoForm.tsx`

**PRIMA** (3 input separati):
```tsx
<div className="grid grid-cols-3 gap-2 mb-2">
  <input placeholder="Via *" value={titolare.via_residenza} />
  <input placeholder="N° *" value={titolare.numero_civico} />
</div>
<input placeholder="Comune Residenza *" value={titolare.comune_residenza} />
```

**DOPO** (1 input unico):
```tsx
<input
  type="text"
  placeholder="Residenza * (es. Via Roma 1, 00100 Roma)"
  value={titolare.residenza}
  onChange={(e) => onUpdate({ residenza: e.target.value })}
  className="w-full px-3 py-2 border rounded-lg"
/>
```

### 3. Constants
**File**: `constants.ts`

```typescript
export const emptyTitolare: TitolareEffettivo = {
  // ...
  residenza: '', // ✅ NUOVO campo unico
  // via_residenza: '', ❌ RIMOSSO
  // numero_civico: '', ❌ RIMOSSO  
  // comune_residenza: '', ❌ RIMOSSO
  // ...
};
```

### 4. ClienteWizard
**File**: `ClienteWizard.tsx`

Aggiornate funzioni che creano titolari:

```typescript
// getBeneficialOwners() - da API
owners.push({
  // ...
  residenza: '', // ✅ Nuovo campo
  // ...
});

// addTitolareDaRappresentante() - Quick add RL
const nuovoTitolare: TitolareEffettivo = {
  // ...
  residenza: '', // ✅ Nuovo campo
  // ...
};
```

### 5. Migration Database
**File**: `supabase/migrations/20251106130000_normalize_titolari_residenza.sql`

#### Strategia Conservativa ✅

```sql
-- Step 1: Aggiungi nuovo campo
ALTER TABLE titolari_effettivi 
ADD COLUMN IF NOT EXISTS residenza TEXT;

-- Step 2: Migra dati esistenti (concatena 3 campi)
UPDATE titolari_effettivi
SET residenza = TRIM(
  CONCAT_WS(', ',
    NULLIF(TRIM(CONCAT_WS(' ', via_residenza, numero_civico)), ''),
    NULLIF(TRIM(comune_residenza), '')
  )
)
WHERE residenza IS NULL OR residenza = '';

-- Step 3: Documentazione
COMMENT ON COLUMN titolari_effettivi.residenza 
IS 'Residenza completa del titolare effettivo (formato unificato)';

-- Step 4: Log risultati
-- Conta record migrati vs totali

-- Step 5: MANTIENI vecchi campi per sicurezza
-- (DROP commentato - da fare in migration futura)
```

**Caratteristiche**:
- ✅ Idempotente (`IF NOT EXISTS`)
- ✅ Migrazione automatica dati
- ✅ Gestione edge cases (campi parzialmente vuoti)
- ✅ Logging automatico risultati
- ✅ Vecchi campi conservati per rollback

---

## 🔄 Migrazione Dati Esistenti

### Esempi Conversione

**Caso 1 - Tutti i campi compilati**:
```
PRIMA:
via_residenza: "Via Roma"
numero_civico: "1"
comune_residenza: "00100 Roma"

DOPO:
residenza: "Via Roma 1, 00100 Roma"
```

**Caso 2 - Numero civico mancante**:
```
PRIMA:
via_residenza: "Via Milano"
numero_civico: ""
comune_residenza: "Milano MI"

DOPO:
residenza: "Via Milano, Milano MI"
```

**Caso 3 - Solo comune**:
```
PRIMA:
via_residenza: ""
numero_civico: ""
comune_residenza: "Roma"

DOPO:
residenza: "Roma"
```

### Query Verifica Post-Migration

```sql
SELECT 
  id,
  nome_cognome,
  via_residenza,
  numero_civico,
  comune_residenza,
  residenza,
  CASE 
    WHEN residenza IS NULL OR residenza = '' THEN '⚠️ EMPTY'
    ELSE '✓ OK'
  END as status
FROM titolari_effettivi
ORDER BY id;
```

---

## ✅ Vantaggi Normalizzazione

### UX
- ✅ **Coerenza**: Stesso input per tutti i tipi di soggetto
- ✅ **Semplicità**: 1 campo invece di 3
- ✅ **Flessibilità**: Utente scrive liberamente l'indirizzo completo
- ✅ **Less Errors**: Meno campi = meno errori di compilazione

### Tecnico
- ✅ **Manutenibilità**: Codice più semplice
- ✅ **Database**: Schema normalizzato
- ✅ **Type Safety**: TypeScript più pulito
- ✅ **Queries**: Query più semplici

### Migrazione
- ✅ **Sicura**: Vecchi campi preservati
- ✅ **Reversibile**: Possibile rollback
- ✅ **Automatica**: Migrazione dati automatica
- ✅ **Verificabile**: Log e query di controllo

---

## 🚀 Applicazione Migration

### Opzione 1: Supabase Dashboard (Consigliato)

1. SQL Editor
2. Copia contenuto `20251106130000_normalize_titolari_residenza.sql`
3. Run
4. Verifica output log
5. Esegui query verifica (in migration notes)

### Opzione 2: Supabase CLI

```bash
supabase db push
```

### Post-Migration Checklist

- [ ] Migration applicata senza errori
- [ ] Log mostra "X of Y records migrated"
- [ ] Query verifica mostra tutti status = '✓ OK'
- [ ] Test inserimento nuovo titolare
- [ ] Test modifica titolare esistente
- [ ] Test salvataggio cliente

---

## 🧪 Testing

### Test Manuali Necessari

1. **Nuovo Titolare**
   - [ ] Inserire titolare con residenza formato unico
   - [ ] Salvare cliente
   - [ ] Verificare dato in DB ha campo `residenza` popolato

2. **Titolare Esistente** (dopo migration)
   - [ ] Aprire cliente con titolari pre-esistenti
   - [ ] Verificare residenza visualizzata come campo unico
   - [ ] Modificare residenza
   - [ ] Salvare → verifica UPDATE corretto

3. **Quick Add RL**
   - [ ] Aggiungere rappresentante come titolare
   - [ ] Campo residenza vuoto (OK, va compilato manualmente)
   - [ ] Compilare residenza formato standard
   - [ ] Salvare → OK

4. **API Load**
   - [ ] Caricare impresa da API
   - [ ] Titolari caricati hanno residenza vuota (OK, API non fornisce)
   - [ ] Compilare manualmente
   - [ ] Salvare → OK

---

## 📊 Impatto

### Database
- ✅ +1 colonna `residenza` TEXT
- ⚠️ Vecchi campi mantenuti (per sicurezza)
- ✅ Dati esistenti migrati automaticamente
- ✅ No breaking changes

### Codice
- ✅ types.ts → 1 campo (prima 3)
- ✅ TitolareEffettivoForm → 1 input (prima 3)
- ✅ constants.ts → template aggiornato
- ✅ ClienteWizard → 2 funzioni aggiornate

### UI
- ✅ Form più pulito e compatto
- ✅ Placeholder esplicativo con esempio
- ✅ Coerente con altri form

---

## 🔮 Cleanup Futuro (Opzionale)

Dopo aver verificato che tutto funziona correttamente e non serve rollback, si può creare una migration futura per rimuovere i vecchi campi:

**File**: `202511XX000000_drop_old_residenza_fields.sql`

```sql
-- SOLO dopo aver verificato:
-- 1. App funziona con nuovo campo
-- 2. Tutti i dati migrati correttamente
-- 3. Non serve più rollback

ALTER TABLE titolari_effettivi 
DROP COLUMN IF EXISTS via_residenza,
DROP COLUMN IF EXISTS numero_civico,
DROP COLUMN IF EXISTS comune_residenza;
```

**Timeline consigliata**: 1-2 settimane dopo deploy in produzione.

---

## 📚 File Modificati

1. ✅ `src/components/cliente-wizard/types.ts`
2. ✅ `src/components/cliente-wizard/components/titolari/TitolareEffettivoForm.tsx`
3. ✅ `src/components/cliente-wizard/constants.ts`
4. ✅ `src/components/cliente-wizard/ClienteWizard.tsx`
5. ✅ `supabase/migrations/20251106130000_normalize_titolari_residenza.sql`

---

## ⚠️ Note Importanti

### Compatibilità Backward

La migration è **backward compatible** perché:
- Vecchi campi mantenuti nel DB
- Se rollback necessario, vecchi campi ancora disponibili
- Migration può essere ri-eseguita (idempotente)

### Dati Parziali

Se titolari esistenti hanno solo alcuni campi compilati:
```sql
via_residenza: "Via Roma"
numero_civico: NULL
comune_residenza: NULL

→ residenza: "Via Roma" ✅
```

La migration gestisce correttamente NULL e stringhe vuote.

### API AML

L'API AML **non fornisce** indirizzo per i titolari, quindi:
- Campo residenza sarà vuoto per titolari da API
- Utente deve compilare manualmente (come prima)
- Nessun cambio nel comportamento

---

## ✨ Conclusioni

La normalizzazione del campo residenza per i titolari effettivi:

✅ **Uniformità**: Stesso formato per tutti i soggetti  
✅ **Semplicità**: UX migliorata (1 campo vs 3)  
✅ **Sicurezza**: Migration conservativa con rollback  
✅ **Manutenibilità**: Codice più pulito e gestibile  
✅ **Retrocompatibilità**: Zero breaking changes  

Il sistema ora ha un'interfaccia coerente per l'inserimento degli indirizzi! 🎉
