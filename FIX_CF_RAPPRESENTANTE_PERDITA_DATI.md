# Fix Perdita CF Rappresentante Legale in Edit Mode

**Data**: 15 Novembre 2025  
**Tipo**: Bug Fix  
**Gravità**: Alta  
**Modulo**: Cliente Wizard - Impresa

---

## 📋 Problema Riportato

**Scenario**:
1. Utente carica dati impresa da API
2. Salva cliente in bozza (CF Rappresentante Legale presente)
3. Riapre cliente per modificare anagrafica
4. Campo "CF Rappresentante Legale" risulta **vuoto**
5. Salvando nuovamente, il campo viene sovrascritto con valore vuoto

**Impatto**: 
- ❌ Perdita dati utente
- ❌ Obbligo di reinserire manualmente il CF
- ❌ Possibile perdita dati anche per "Residenza Rappresentante Legale"

---

## 🔍 Causa del Bug

### Root Cause

Nel file `src/components/cliente-wizard/hooks/useClienteForm.ts`, la funzione `loadClienteData()` **non mappava** due campi durante il caricamento dei dati impresa dal database:

```typescript
// CODICE ERRATO (PRIMA):
if (clienteData.tipo_cliente === 'impresa') {
  Object.assign(baseData, {
    ragione_sociale: clienteData.ragione_sociale || '',
    // ... altri campi ...
    rappresentante_legale: clienteData.rappresentante_legale || '',
    // ❌ MANCAVANO QUESTI 2 CAMPI:
    // codice_fiscale_rappresentante: ...
    // residenza_rappresentante: ...
    documento_rappresentante: convertDocumento(...),
    // ...
  });
}
```

### Flusso del Bug

```
┌────────────────────────────────────────────────┐
│ 1. Caricamento API → CF presente               │
│ 2. Salvataggio bozza → CF salvato in DB ✅     │
└────────────────────┬───────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────┐
│ 3. Modifica cliente (loadClienteData)         │
│    → useClienteForm.ts NON carica CF dal DB ❌ │
└────────────────────┬───────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────┐
│ 4. formData.codice_fiscale_rappresentante = '' │
│    (campo vuoto nell'UI)                       │
└────────────────────┬───────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────┐
│ 5. Salvataggio → UPDATE con valore vuoto ❌    │
│    CF sovrascritto nel database               │
└────────────────────────────────────────────────┘
```

---

## ✅ Soluzione Implementata

### Modifica Applicata

**File**: `src/components/cliente-wizard/hooks/useClienteForm.ts`  
**Funzione**: `loadClienteData()` → Sezione IMPRESA (circa riga 114-120)

```typescript
// CODICE CORRETTO (DOPO):
if (clienteData.tipo_cliente === 'impresa') {
  Object.assign(baseData, {
    ragione_sociale: clienteData.ragione_sociale || '',
    natura_giuridica: clienteData.natura_giuridica || '',
    partita_iva_impresa: clienteData.partita_iva || '',
    codice_fiscale_impresa: clienteData.codice_fiscale || '',
    paese: clienteData.paese || '',
    indirizzo: clienteData.indirizzo || '',
    rappresentante_legale: clienteData.rappresentante_legale || '',
    codice_fiscale_rappresentante: clienteData.codice_fiscale_rappresentante || '', // ✅ AGGIUNTO
    residenza_rappresentante: clienteData.residenza_rappresentante || '',          // ✅ AGGIUNTO
    documento_rappresentante: convertDocumento(clienteData.rappresentante_legale_documento),
    pep_impresa: clienteData.pep || false,
    sanzioni_impresa: clienteData.sanzioni || false,
    note_verifica_impresa: clienteData.note_verifica || '',
    // ... resto del codice
  });
}
```

### Campi Aggiunti

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `codice_fiscale_rappresentante` | string | Codice Fiscale del Rappresentante Legale (16 caratteri) |
| `residenza_rappresentante` | string | Indirizzo di residenza del Rappresentante Legale |

---

## 📊 Verifica della Soluzione

### Componenti Coinvolti

| File | Status | Note |
|------|--------|------|
| `ImpresaForm.tsx` | ✅ Era già OK | Campo presente nel form, funzionante |
| `useClienteSave.ts` | ✅ Era già OK | Salvataggio include i campi correttamente |
| `useClienteForm.ts` | ✅ **FIXATO** | Ora carica correttamente i 2 campi dal DB |
| Database | ✅ OK | Campi esistenti (migration 20251106000000) |

### Test di Verifica

✅ **Test 1 - Nuovo Cliente con API**
```
1. Crea nuovo cliente impresa da API
2. Verifica CF Rappresentante presente
3. Salva in bozza
4. Riapri → CF deve essere presente ✅
5. Modifica altri campi → CF rimane
6. Salva → CF mantenuto ✅
```

✅ **Test 2 - Cliente Esistente**
```
1. Apri cliente impresa esistente con CF già salvato
2. Verifica CF caricato correttamente ✅
3. Modifica anagrafica
4. Salva → CF non viene perso ✅
```

✅ **Test 3 - Campo Residenza Rappresentante**
```
1. Inserisci residenza rappresentante
2. Salva
3. Riapri → Residenza presente ✅
4. Modifica → Residenza mantenuta ✅
```

---

## 🎯 Risultato Finale

### Prima del Fix ❌
```
API Load → CF presente
    ↓
Salva bozza → CF salvato DB ✅
    ↓
Riapri modifica → CF PERSO ❌
    ↓
Salva → DB sovrascritto con valore vuoto ❌
```

### Dopo il Fix ✅
```
API Load → CF presente
    ↓
Salva bozza → CF salvato DB ✅
    ↓
Riapri modifica → CF CARICATO ✅
    ↓
Modifica altri campi → CF MANTENUTO ✅
    ↓
Salva → CF PRESERVATO ✅
```

---

## 📁 File Modificati

```
src/components/cliente-wizard/hooks/
└── useClienteForm.ts (+2 righe nella sezione IMPRESA)
```

---

## 🔄 Rollback (se necessario)

Per tornare alla versione precedente, rimuovere le 2 righe aggiunte:

```typescript
// Rimuovere queste righe:
codice_fiscale_rappresentante: clienteData.codice_fiscale_rappresentante || '',
residenza_rappresentante: clienteData.residenza_rappresentante || '',
```

**NOTA**: Non è consigliato il rollback in quanto il bug causava perdita dati.

---

## 📝 Note Tecniche

### Dettagli Implementazione

1. **Compatibilità**: Fix retrocompatibile (usa `|| ''` per valori NULL/undefined)
2. **Performance**: Nessun impatto (solo aggiunta mapping campi esistenti)
3. **Side Effects**: Nessuno (fix isolato, non modifica logica esistente)
4. **Database**: Nessuna migration necessaria (campi già presenti dal 06/11/2025)

### Campi Correlati

Entrambi i campi fanno parte del gruppo "Rappresentante Legale":
- `rappresentante_legale` (nome) → Era già mappato ✅
- `codice_fiscale_rappresentante` → **Era mancante** ❌ → Ora fixato ✅
- `residenza_rappresentante` → **Era mancante** ❌ → Ora fixato ✅
- `documento_rappresentante` (oggetto) → Era già mappato ✅

---

## 🎉 Conclusione

**Bug risolto con successo!** 

Il campo "CF Rappresentante Legale" (e "Residenza Rappresentante") ora viene:
- ✅ Caricato correttamente dalla API
- ✅ Salvato correttamente nel database
- ✅ **Ricaricato correttamente in edit mode**
- ✅ Preservato durante le modifiche successive

**Nessuna perdita dati ulteriore per gli utenti.**

---

**Fix testato e validato il 15/11/2025**
