# Fix Score Constraint per Salvataggio Bozze

**Data:** 06/11/2025  
**Problema:** Errore "new row violates check constraint autovalutazioni_inerente_score_check"  
**Causa:** Score constraint impedisce salvataggio bozze parziali

---

## 🔴 Problema Originale

### Errore
```
new row for relation "autovalutazioni" violates check constraint "autovalutazioni_inerente_score_check"
```

### Causa Tecnica

**1. Schema Database:**
```sql
inerente_score numeric(3,2) CHECK (inerente_score >= 1 AND inerente_score <= 4) NOT NULL
vulnerabilita_score numeric(3,2) CHECK (vulnerabilita_score >= 1 AND vulnerabilita_score <= 4) NOT NULL
residuo_score numeric(3,2) CHECK (residuo_score >= 1 AND residuo_score <= 4) NOT NULL
```
- Colonne score **NOT NULL** obbligatorie
- CHECK constraint richiede valori tra 1.0 e 4.0

**2. Comportamento Codice:**
- `saveDraft()` calcola sempre score anche se i dati sono parziali
- `calculateRT1Scores()` con dati mancanti può restituire 0 o valori < 1
- Score invalidi violano il CHECK constraint → errore

**3. Scenario Fallimento:**
```typescript
// Utente salva bozza dopo Step 1 (dati studio)
// Nessun slider compilato → tutte le scelte_valore = null
calculateRT1Scores() → { inerente: 0, vulnerabilita: 0, residuo: 0 }
INSERT con score=0 → ERRORE (CHECK constraint >= 1)
```

---

## ✅ Soluzione Implementata

### Migration: `20251106210000_make_scores_nullable.sql`

**Modifiche al database:**
```sql
-- Rimuove NOT NULL constraint
ALTER TABLE autovalutazioni 
ALTER COLUMN inerente_score DROP NOT NULL;

ALTER TABLE autovalutazioni 
ALTER COLUMN vulnerabilita_score DROP NOT NULL;

ALTER TABLE autovalutazioni 
ALTER COLUMN residuo_score DROP NOT NULL;
```

**Semantica:**
- `NULL` = Score non ancora calcolato (bozza parziale)
- `numero` = Score valido (bozza completa o CURRENT)

**Vantaggi:**
- ✅ Permette salvataggio bozze in qualsiasi momento
- ✅ CHECK constraint rimane attivo (quando presente, deve essere 1-4)
- ✅ Backward compatible (autovalutazioni esistenti non cambiano)
- ✅ CURRENT richiede sempre score validi (gestito da codice)

### Codice: `useRT1Save.ts`

**Miglioramento `saveDraft()`:**
```typescript
// Calcola score
const scores = calculateRT1Scores(formData.risposte_dettagliate);

// Valida score prima del salvataggio
const hasValidScores = scores.inerente >= 1 && 
                       scores.vulnerabilita >= 1 && 
                       scores.residuo >= 1;

// Usa NULL per bozze parziali
inerente_score: hasValidScores ? scores.inerente : null,
vulnerabilita_score: hasValidScores ? scores.vulnerabilita : null,
residuo_score: hasValidScores ? scores.residuo : null,
```

**Comportamento aggiornato:**
1. Calcola score dai dati inseriti
2. Se score < 1 → salva come `NULL` (bozza parziale)
3. Se score >= 1 → salva score valido
4. Nessun errore constraint

---

## 🧪 Test da Eseguire

### 1. Applicare la migration
```bash
supabase db push
```

### 2. Test bozza parziale
1. Apri RT1 → Nuovo wizard
2. Compila solo Step 1 (dati studio)
3. Click "Salva Bozza"
4. ✅ Deve salvare con successo (score = NULL)

### 3. Test bozza con dati
1. Compila alcuni slider (Step 2-6)
2. Click "Salva Bozza"
3. ✅ Se score >= 1 → salva score
4. ✅ Se score < 1 → salva NULL

### 4. Test completamento
1. Compila tutti gli step
2. Click "Completa Autovalutazione"
3. ✅ Deve salvare come CURRENT con score validi

### 5. Verifica database
```sql
-- Controlla bozze con score NULL
SELECT id, version, status, inerente_score, vulnerabilita_score, residuo_score
FROM autovalutazioni
WHERE status = 'draft';

-- Controlla che CURRENT abbiano sempre score
SELECT id, version, status, inerente_score, vulnerabilita_score, residuo_score
FROM autovalutazioni
WHERE status = 'current';
```

---

## 📊 Flussi Utente Corretti

### Scenario 1: Bozza Parziale
```
1. Utente compila Step 1-2
2. Click "Salva Bozza"
3. Score < 1 → salvati come NULL ✅
4. Bozza salvata con successo
5. Utente esce

6. Utente rientra
7. LoadDraftModal appare
8. Continua bozza da Step 3
9. Compila Step 3-8
10. Click "Completa"
11. Score calcolati correttamente
12. Salvata come CURRENT con score validi ✅
```

### Scenario 2: Bozza Completa
```
1. Utente compila tutti gli step
2. Click "Salva Bozza" (invece di Completa)
3. Score >= 1 → salvati normalmente ✅
4. Bozza salvata con score
5. Può essere completata in seguito
```

### Scenario 3: Completamento Diretto
```
1. Utente compila tutti gli step
2. Click "Completa Autovalutazione"
3. Validazione passa ✅
4. Score calcolati
5. Precedente CURRENT archiviata
6. Salvata come CURRENT ✅
```

---

## ✅ Checklist

- [x] Problema identificato (constraint NOT NULL + CHECK)
- [x] Migration creata (DROP NOT NULL)
- [x] Codice aggiornato (salva NULL per bozze parziali)
- [x] Documentazione completata
- [ ] Migration applicata al database
- [ ] Test salvataggio bozza parziale
- [ ] Test completamento autovalutazione
- [ ] Verifica score NULL/validi nel database

---

## 📝 Note Tecniche

### Perché DROP NOT NULL invece di DEFAULT?

**Opzione 1 - DEFAULT (scartata):**
```sql
ALTER COLUMN inerente_score SET DEFAULT 1.0;
```
❌ Problema: Score 1.0 di default è semanticamente sbagliato (rischio basso non reale)

**Opzione 2 - NULL (scelta):**
```sql
ALTER COLUMN inerente_score DROP NOT NULL;
```
✅ NULL = "dato non disponibile" è semanticamente corretto

### Check Constraint Rimane Attivo

```sql
-- Rimane:
CHECK (inerente_score >= 1 AND inerente_score <= 4)

-- Comportamento:
NULL → OK (non valutato dal CHECK)
0.5 → ERRORE (< 1)
1.5 → OK (tra 1 e 4)
5.0 → ERRORE (> 4)
```

### Backward Compatibility

- ✅ Autovalutazioni CURRENT esistenti hanno score validi
- ✅ Migration non modifica dati esistenti
- ✅ Vecchio formato fattori_inerenti/fattori_vulnerabilita mantenuto
- ✅ Nuovo formato risposte_dettagliate supportato

---

## 🚀 Deploy

**Comandi:**
```bash
# 1. Applica migration
supabase db push

# 2. Riavvia app (se necessario)
npm run dev

# 3. Test wizard RT1
# Naviga a RT1 → Salva bozza parziale → Verifica successo
```

---

**Fix completato da:** AI Assistant  
**Status:** ✅ Pronto per test  
**Impatto:** Zero su funzionalità esistenti  
**Breaking changes:** Nessuno
