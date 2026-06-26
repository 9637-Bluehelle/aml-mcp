# Fix RT1 Bozze e Funzionalità Admin

**Data**: 15 Novembre 2025  
**Sviluppatore**: Assistente AI

## Sommario

Questo documento descrive le correzioni implementate per risolvere diversi bug e miglioramenti del sistema AML:

1. ✅ Fix SQL Migration - Colonne inesistenti
2. ✅ Fix "Invalid Date" in Gestione Utenti
3. ✅ Controllo Admin per Export JSON API
4. ✅ Fix Salvataggio Bozze RT1 (bug critico)

---

## 1. Fix SQL Migration - Colonne Inesistenti

### Problema

**Errore SQL**: `ERROR: 42703: column up.registered_at does not exist`  
**File**: `supabase/migrations/20251114040000_add_approved_to_admin_stats.sql`

La view `admin_user_stats` faceva riferimento a colonne che non esistevano nella tabella `user_profiles`:
- ❌ `up.registered_at` (non esiste)
- ❌ `FROM adeguata_verifica` (tabella non esistente)

### Causa Root

La tabella `user_profiles` usa `created_at` invece di `registered_at`.  
La tabella per le valutazioni si chiama `valutazioni_rischio`, non `adeguata_verifica`.

### Soluzione Implementata

**File modificato**: `supabase/migrations/20251114040000_add_approved_to_admin_stats.sql`

```sql
-- PRIMA (ERRATO):
SELECT 
    up.registered_at,
    ...
FROM user_profiles up;

-- E anche:
FROM adeguata_verifica av

-- DOPO (CORRETTO):
SELECT 
    up.created_at,
    ...
FROM user_profiles up;

-- E anche:
FROM valutazioni_rischio av
```

### Risultato

✅ La migration ora si esegue senza errori  
✅ View `admin_user_stats` creata correttamente con tutti i campi

---

## 2. Fix "Invalid Date" in Gestione Utenti

### Problema

Nel pannello admin, la data di registrazione degli utenti mostrava **"Registrato il Invalid Date"**.

### Causa Root

Il componente `UsersManagement.tsx` cercava di leggere `user.registered_at`, ma la view SQL restituisce `created_at`. Questo causava `new Date(undefined)` → `Invalid Date`.

### Soluzione Implementata

**File modificato**: `src/components/admin/UsersManagement.tsx`

#### Modifica 1: Interfaccia TypeScript

```typescript
// PRIMA:
interface UserStat {
  registered_at: string;
  // ...
}

// DOPO:
interface UserStat {
  created_at: string;
  // ...
}
```

#### Modifica 2: Rendering Data

```typescript
// PRIMA (linea 235):
<span>Registrato il {new Date(user.registered_at).toLocaleDateString('it-IT')}</span>

// DOPO:
<span>Registrato il {new Date(user.created_at).toLocaleDateString('it-IT')}</span>
```

### Risultato

✅ La data di registrazione viene visualizzata correttamente  
✅ Nessun più "Invalid Date"

---

## 3. Controllo Admin per Export JSON API

### Problema

Quando si caricavano dati dalle API AML, il file JSON completo veniva esportato per **tutti gli utenti**, senza restrizioni.

### Requisito

L'esportazione JSON deve essere disponibile **solo per gli amministratori**.

### Soluzione Implementata

**File modificato**: `src/components/cliente-wizard/ClienteWizard.tsx`

```typescript
// PRIMA (linea 252-256):
const companyName = company.companyName || 'Impresa';
const exportedFileName = exportAPIDataToJSON(data, companyName);
if (exportedFileName) {
  addDebugLog(`📥 Dati API esportati in: ${exportedFileName}`);
}

// DOPO:
const companyName = company.companyName || 'Impresa';
// Esporta JSON solo se l'utente è admin
if (isAdmin) {
  const exportedFileName = exportAPIDataToJSON(data, companyName);
  if (exportedFileName) {
    addDebugLog(`📥 Dati API esportati in: ${exportedFileName}`);
  }
}
```

### Hook Utilizzato

L'hook `useIsAdmin` era già importato e disponibile nel componente:
```typescript
const { isAdmin } = useIsAdmin();
```

### Risultato

✅ **Admin**: Il file JSON viene scaricato automaticamente  
✅ **Utenti normali**: Nessuna esportazione, funzionamento trasparente  
✅ **Sicurezza**: Dati sensibili API protetti

---

## 4. Fix Salvataggio Bozze RT1 (Bug Critico)

### Problema

**Bug critico**: Ogni volta che si salvava una bozza RT1, veniva creato un **nuovo record** invece di aggiornare quello esistente.

**Comportamento errato**:
- Primo salvataggio → INSERT (crea ID=123)
- Secondo salvataggio → INSERT (crea ID=456) ❌
- Terzo salvataggio → INSERT (crea ID=789) ❌

**Conseguenza**: Database pieno di bozze duplicate per la stessa autovalutazione.

### Causa Root

Nel file `RT1Wizard.tsx`:

1. **Hook inizializzato con ID fisso**:
```typescript
// ❌ ERRATO: Usa autovalutazioneId che non cambia mai
const { isSaving, saveError, saveDraft, saveComplete } = useRT1Save(formData, autovalutazioneId);
```

2. **State locale non sincronizzato**:
```typescript
// ❌ ERRATO: Aggiorna solo se draftId è undefined
if (savedId && !draftId) {
  setDraftId(savedId);
}
```

L'hook `useRT1Save` riceveva sempre lo stesso `autovalutazioneId` iniziale, quindi non riusciva mai a fare UPDATE delle bozze successive.

### Soluzione Implementata

**File modificato**: `src/components/rt1-wizard/RT1Wizard.tsx`

#### Modifica 1: Passare `draftId` dinamico all'hook

```typescript
// PRIMA (linea 27-31 circa):
const { isSaving, saveError, saveDraft, saveComplete } = useRT1Save(formData, autovalutazioneId);
const [currentStep, setCurrentStep] = useState(initialStep);
const [showDraftModal, setShowDraftModal] = useState(false);
const [draftId, setDraftId] = useState<string | undefined>(autovalutazioneId);

// DOPO:
const [currentStep, setCurrentStep] = useState(initialStep);
const [showDraftModal, setShowDraftModal] = useState(false);
const [draftId, setDraftId] = useState<string | undefined>(autovalutazioneId);
const { isSaving, saveError, saveDraft, saveComplete } = useRT1Save(formData, draftId);
```

**Spiegazione**: Ora l'hook riceve `draftId` che viene aggiornato dopo ogni salvataggio, permettendo gli UPDATE.

#### Modifica 2: Aggiornare sempre `draftId` dopo salvataggio

```typescript
// PRIMA (handleSaveDraft):
const savedId = await saveDraft(() => {
  alert('✓ Bozza salvata con successo!');
});
if (savedId && !draftId) {  // ❌ Aggiorna solo la prima volta
  setDraftId(savedId);
}

// DOPO:
const savedId = await saveDraft(() => {
  alert('✓ Bozza salvata con successo!');
});
if (savedId) {  // ✅ Aggiorna sempre
  setDraftId(savedId);
}
```

### Flusso Corretto Dopo il Fix

1. **Primo salvataggio bozza** → `saveDraft()` fa INSERT (crea ID=123)
   - Hook riceve `draftId=undefined`
   - Esegue INSERT nuovo record
   - Restituisce `savedId=123`
   - `setDraftId(123)` aggiorna lo state

2. **Secondo salvataggio bozza** → `saveDraft()` fa UPDATE
   - Hook riceve `draftId=123` (aggiornato!)
   - Esegue UPDATE su record esistente (ID=123)
   - Restituisce `savedId=123`
   - `setDraftId(123)` conferma lo state

3. **Terzo salvataggio bozza** → `saveDraft()` fa UPDATE
   - Hook riceve `draftId=123`
   - Esegue UPDATE su record esistente (ID=123)
   - Nessun nuovo record creato ✅

4. **Completamento autovalutazione** → `saveComplete()`
   - Hook riceve `draftId=123`
   - Esegue UPDATE cambiando `status='current'` e impostando `valid_until`
   - La bozza viene "promossa" ad autovalutazione valida
   - Non rimangono bozze inutilizzate ✅

### Logica in `useRT1Save.ts`

La logica era già corretta nell'hook:

```typescript
async function saveDraft(onSuccess?: () => void): Promise<string | null> {
  // ...
  if (autovalutazioneId) {
    // UPDATE bozza esistente
    const { data, error } = await supabase
      .from('autovalutazioni')
      .update(dataToSave)
      .eq('id', autovalutazioneId)
      .select('id')
      .single();
    // ...
  } else {
    // INSERT nuova bozza
    const { data, error } = await supabase
      .from('autovalutazioni')
      .insert(dataToSave)
      .select('id')
      .single();
    // ...
  }
}
```

Il problema era che `autovalutazioneId` rimaneva sempre `undefined` perché il wizard non passava mai il valore aggiornato.

### Risultato

✅ **Nessun record duplicato**: Una sola bozza per autovalutazione  
✅ **UPDATE corretto**: Salvataggi multipli aggiornano lo stesso record  
✅ **Promozione clean**: La bozza diventa "current" senza lasciare residui  
✅ **Database pulito**: Niente più bozze orfane

---

## Test e Verifica

### Test RT1 Bozze

1. ✅ Creare nuova autovalutazione RT1
2. ✅ Salvare bozza (1° salvataggio) → Verifica INSERT
3. ✅ Modificare dati e salvare bozza (2° salvataggio) → Verifica UPDATE
4. ✅ Modificare dati e salvare bozza (3° salvataggio) → Verifica UPDATE
5. ✅ Completare autovalutazione → Verifica status='current'
6. ✅ Verificare database: Solo 1 record per autovalutazione

### Test Export JSON Admin

1. ✅ Login come utente normale → Nessun file scaricato
2. ✅ Login come admin → File JSON scaricato correttamente
3. ✅ Verificare log debug (solo admin lo vede)

### Test Gestione Utenti

1. ✅ Accedere al pannello admin
2. ✅ Verificare data registrazione formattata correttamente
3. ✅ Nessun "Invalid Date" presente

---

## File Modificati - Riepilogo

| File | Tipo | Modifiche |
|------|------|-----------|
| `supabase/migrations/20251114040000_add_approved_to_admin_stats.sql` | SQL | Fix nomi colonne/tabelle |
| `src/components/admin/UsersManagement.tsx` | TypeScript | Fix interfaccia e rendering data |
| `src/components/cliente-wizard/ClienteWizard.tsx` | TypeScript | Aggiunto controllo admin export |
| `src/components/rt1-wizard/RT1Wizard.tsx` | TypeScript | Fix gestione draftId dinamico |

---

## Note Tecniche

### Architettura RT1

L'autovalutazione RT1 usa uno schema a 3 stati:
- `status='draft'` → Bozze in compilazione (nessuna validità normativa)
- `status='current'` → Autovalutazione corrente valida (3 anni)
- `status='archived'` → Autovalutazioni precedenti archiviate

Quando una nuova autovalutazione viene completata:
1. Le vecchie `status='current'` diventano `status='archived'`
2. La bozza completata diventa `status='current'`
3. Non ci sono bozze residue grazie al fix implementato

### Sicurezza

Il controllo admin per l'export JSON è implementato lato client tramite hook `useIsAdmin`. Per una sicurezza completa, si raccomanda di implementare anche controlli lato server se i dati API dovessero essere esposti tramite API REST.

---

## Conclusioni

Tutti i bug identificati sono stati risolti con successo:

✅ **Migration SQL**: Nomi colonne/tabelle corretti  
✅ **Invalid Date**: Visualizzazione data corretta  
✅ **Export JSON**: Limitato solo ad admin  
✅ **Bozze RT1**: UPDATE invece di INSERT multipli

Il sistema è ora più stabile, sicuro e performante.
