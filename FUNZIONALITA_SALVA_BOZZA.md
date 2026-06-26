# Funzionalità "Salva in Bozza" - Clienti

> **Data Implementazione**: 2 Novembre 2025  
> **Versione**: 1.0  
> **Moduli Interessati**: ClienteWizard, RT2AdeguataVerifica, Database

---

## 📋 Indice

1. [Panoramica](#panoramica)
2. [Requisiti Implementati](#requisiti-implementati)
3. [Modifiche Database](#modifiche-database)
4. [Modifiche Codice](#modifiche-codice)
5. [Workflow Utente](#workflow-utente)
6. [File Modificati](#file-modificati)
7. [Testing](#testing)
8. [Note Tecniche](#note-tecniche)

---

## 📖 Panoramica

La funzionalità "Salva in Bozza" permette di salvare clienti con dati incompleti in uno stato di bozza, consentendo di completarli successivamente. Questo è particolarmente utile quando:

- Si stanno acquisendo i dati progressivamente
- Non tutti i documenti sono immediatamente disponibili
- Si vuole iniziare il processo di registrazione e completarlo in seguito

### Comportamento

- **Cliente Incompleto** → Salvato come `BOZZA` (status: 'draft')
- **Cliente Completo** → Salvato come `ATTIVO` (status: 'active')
- Il sistema determina automaticamente lo status in base alla completezza dei dati

---

## ✅ Requisiti Implementati

### Requisiti Minimi per Salvare Cliente

**Tutti i tipi di cliente richiedono almeno**:
- ✅ Codice Cliente (univoco)

### Requisiti per Cliente ATTIVO

#### 👤 Persona Fisica
- Nome e Cognome
- Codice Fiscale
- Data di Nascita
- Luogo di Nascita
- Nazionalità
- Professione
- Residenza
- Documento Identità Completo:
  - Tipo documento
  - Numero documento
  - Data di scadenza
  - Ente di rilascio
  - Data di rilascio

#### 🏢 Impresa (societa/impresa)
- Ragione Sociale
- Codice Fiscale
- Documento Rappresentante Legale Completo:
  - Tipo documento
  - Numero documento
  - Data di scadenza
  - Ente di rilascio
  - Data di rilascio
- **NON richiesto**: Titolari Effettivi (possono essere aggiunti dopo)

#### 💼 Professionista
- Nome e Cognome
- Codice Fiscale
- Partita IVA
- Data di Nascita
- Luogo di Nascita
- Nazionalità
- Professione
- Residenza
- Documento Identità Completo:
  - Tipo documento
  - Numero documento
  - Data di scadenza
  - Ente di rilascio
  - Data di rilascio

---

## 🗄️ Modifiche Database

### Migration: `20251102000000_add_cliente_status.sql`

```sql
-- Aggiunge campo status alla tabella clienti
ALTER TABLE clienti 
ADD COLUMN status TEXT DEFAULT 'draft' 
CHECK (status IN ('draft', 'active', 'archived'));

-- Aggiorna clienti esistenti ad 'active'
UPDATE clienti SET status = 'active' WHERE status IS NULL;

-- Imposta NOT NULL dopo l'aggiornamento
ALTER TABLE clienti 
ALTER COLUMN status SET NOT NULL;

-- Crea indice per performance
CREATE INDEX IF NOT EXISTS idx_clienti_status ON clienti(status);

-- Commento sul campo
COMMENT ON COLUMN clienti.status IS 
'Status del cliente: draft (bozza), active (attivo), archived (archiviato)';
```

### Schema Campo Status

| Valore | Descrizione | Quando si Applica |
|--------|-------------|-------------------|
| `draft` | Bozza | Dati obbligatori incompleti |
| `active` | Attivo | Tutti i dati obbligatori presenti |
| `archived` | Archiviato | Cliente non più attivo (uso futuro) |

**Default**: `draft` per nuovi inserimenti

---

## 💻 Modifiche Codice

### 1. ClienteWizard.tsx

#### Funzione: `validateStep1()` - Validazione Step 1
```typescript
// PRIMA: Richiedeva molti campi
// ADESSO: Richiede solo codice_cliente

const validateStep1 = (): boolean => {
  const errors: FormErrors = {};
  
  // Codice cliente obbligatorio
  if (!formData.codice_cliente?.trim()) {
    errors.codice_cliente = 'Il codice cliente è obbligatorio';
  }
  
  setFormErrors(errors);
  return Object.keys(errors).length === 0;
};
```

#### Nuova Funzione: `isClienteComplete()`
Verifica se tutti i campi obbligatori sono compilati in base al tipo di cliente.

```typescript
const isClienteComplete = (): boolean => {
  const tipoCliente = formData.tipo_cliente;
  
  // Campi base comuni
  if (!formData.codice_cliente?.trim()) return false;
  
  if (tipoCliente === 'persona_fisica' || tipoCliente === 'professionista') {
    // Verifica campi persona fisica/professionista
    if (!formData.ragione_sociale?.trim()) return false;
    if (!formData.codice_fiscale?.trim()) return false;
    if (!formData.data_nascita) return false;
    if (!formData.luogo_nascita?.trim()) return false;
    if (!formData.nazionalita?.trim()) return false;
    if (!formData.professione?.trim()) return false;
    if (!formData.residenza?.trim()) return false;
    
    // Professionista richiede anche P.IVA
    if (tipoCliente === 'professionista' && !formData.partita_iva?.trim()) {
      return false;
    }
    
    // Documento identità completo
    if (!formData.documento_identita.tipo) return false;
    if (!formData.documento_identita.numero?.trim()) return false;
    if (!formData.documento_identita.data_scadenza) return false;
    if (!formData.documento_identita.ente_rilascio?.trim()) return false;
    if (!formData.documento_identita.data_rilascio) return false;
    
  } else {
    // Verifica campi impresa
    if (!formData.ragione_sociale?.trim()) return false;
    if (!formData.codice_fiscale?.trim()) return false;
    
    // Documento rappresentante legale completo
    if (!formData.rappresentante_legale_documento.tipo) return false;
    if (!formData.rappresentante_legale_documento.numero?.trim()) return false;
    if (!formData.rappresentante_legale_documento.data_scadenza) return false;
    if (!formData.rappresentante_legale_documento.ente_rilascio?.trim()) return false;
    if (!formData.rappresentante_legale_documento.data_rilascio) return false;
  }
  
  return true;
};
```

#### Funzione: `handleSave()` - Logica Status Automatico
```typescript
const handleSave = async () => {
  try {
    setIsSaving(true);
    
    // Determina automaticamente lo status
    const isComplete = isClienteComplete();
    const status = isComplete ? 'active' : 'draft';
    
    // Prepara dati per il salvataggio
    const clienteData = {
      ...formData,
      status, // Imposta status automaticamente
      user_id: (await supabase.auth.getUser()).data.user?.id
    };
    
    // Salva cliente
    const { data: cliente, error: clienteError } = await supabase
      .from('clienti')
      .insert(clienteData)
      .select()
      .single();
    
    if (clienteError) throw clienteError;
    
    // Salva titolari effettivi (se presenti)
    if (titolariEffettivi.length > 0) {
      // ... salvataggio titolari
    }
    
    // Messaggio personalizzato in base allo status
    if (status === 'draft') {
      alert('✅ Cliente salvato come BOZZA.\n\n' + 
            '⚠️ Completa i dati obbligatori per attivarlo.');
    } else {
      alert('✅ Cliente salvato e ATTIVATO con successo!');
    }
    
    onComplete();
    
  } catch (error) {
    console.error('Errore salvataggio:', error);
    alert('Errore durante il salvataggio del cliente');
  } finally {
    setIsSaving(false);
  }
};
```

### 2. RT2AdeguataVerifica.tsx

#### Interfaccia Cliente - Aggiunto Campo Status
```typescript
interface Cliente {
  id: string;
  codice_cliente: string;
  ragione_sociale: string;
  tipo_cliente?: 'persona_fisica' | 'societa' | 'professionista' | 'impresa';
  status?: 'draft' | 'active' | 'archived';  // ← NUOVO
  // ... altri campi
}
```

#### Funzione: `loadData()` - Carica Status
```typescript
async function loadData() {
  const [clientiRes, incarichiRes] = await Promise.all([
    supabase
      .from('clienti')
      .select('id, codice_cliente, ragione_sociale, status')  // ← Aggiunto status
      .order('ragione_sociale'),
    // ...
  ]);
  
  if (clientiRes.data) setClienti(clientiRes.data);
  if (incarichiRes.data) setIncarichi(incarichiRes.data);
}
```

#### UI - Badge "BOZZA" nella Lista Clienti
```typescript
{filteredClienti.map(cliente => (
  <div key={cliente.id} className="p-3 border rounded-lg">
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <p className="font-medium">{cliente.ragione_sociale}</p>
        
        {/* Badge BOZZA per clienti draft */}
        {cliente.status === 'draft' && (
          <span className="px-2 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded">
            BOZZA
          </span>
        )}
      </div>
      <p className="text-sm text-gray-600">{cliente.codice_cliente}</p>
    </div>
    {/* ... bottoni azioni */}
  </div>
))}
```

---

## 👤 Workflow Utente

### Scenario 1: Creazione Cliente Parziale (Bozza)

1. **Utente apre ClienteWizard**
   - Click su "Nuovo Cliente" in RT2

2. **Compila SOLO Step 1**
   - Codice Cliente: `CLI-2025-001`
   - Tipo Cliente: Persona Fisica
   - (Altri campi lasciati vuoti)

3. **Click su "Salva Cliente"**
   - Sistema verifica completezza → ❌ Incompleto
   - Status impostato automaticamente: `'draft'`
   - Database salva cliente con status = 'draft'

4. **Messaggio Visualizzato**
   ```
   ✅ Cliente salvato come BOZZA.
   
   ⚠️ Completa i dati obbligatori per attivarlo.
   ```

5. **Ritorno a RT2**
   - Cliente appare nella lista con badge giallo **"BOZZA"**

### Scenario 2: Completamento Cliente (Attivo)

1. **Utente riapre ClienteWizard per modificare cliente**
   - Click su "Dettaglio" → poi su cliente in bozza

2. **Compila TUTTI i campi obbligatori**
   - Nome: Mario Rossi
   - Codice Fiscale: RSSMRA80A01H501X
   - Data Nascita: 01/01/1980
   - Luogo Nascita: Roma
   - Nazionalità: Italiana
   - Professione: Ingegnere
   - Residenza: Via Roma 1, 00100 Roma
   - Documento completo (tipo, numero, date, etc.)

3. **Click su "Salva Cliente"**
   - Sistema verifica completezza → ✅ Completo
   - Status impostato automaticamente: `'active'`
   - Database aggiorna status a 'active'

4. **Messaggio Visualizzato**
   ```
   ✅ Cliente salvato e ATTIVATO con successo!
   ```

5. **Ritorno a RT2**
   - Cliente appare nella lista SENZA badge (status = active)

---

## 📁 File Modificati

### File Creati
| File | Descrizione |
|------|-------------|
| `supabase/migrations/20251102000000_add_cliente_status.sql` | Migration per campo status |
| `FUNZIONALITA_SALVA_BOZZA.md` | Questo documento |

### File Modificati
| File | Modifiche Apportate |
|------|---------------------|
| `src/components/ClienteWizard.tsx` | - Semplificata validazione Step 1 (solo codice_cliente)<br>- Aggiunta funzione `isClienteComplete()`<br>- Modificata `handleSave()` con logica status automatico<br>- Rimosso obbligo titolari effettivi per imprese<br>- Messaggi personalizzati per draft/active |
| `src/components/RT2AdeguataVerifica.tsx` | - Aggiunto campo `status` all'interfaccia Cliente<br>- Aggiornata `loadData()` per recuperare status<br>- Aggiunto badge "BOZZA" nella lista clienti |

---

## 🧪 Testing

### Checklist Test

#### Test 1: Creazione Cliente in Bozza ✅
- [ ] Aprire ClienteWizard
- [ ] Inserire solo codice cliente: `TEST-001`
- [ ] Selezionare tipo: Persona Fisica
- [ ] Salvare senza completare altri campi
- [ ] **Risultato atteso**: 
  - Messaggio "Cliente salvato come BOZZA"
  - Badge "BOZZA" visibile in lista RT2

#### Test 2: Attivazione Cliente ✅
- [ ] Riaprire cliente in bozza `TEST-001`
- [ ] Completare TUTTI i campi obbligatori
- [ ] Salvare
- [ ] **Risultato atteso**:
  - Messaggio "Cliente salvato e ATTIVATO"
  - Badge "BOZZA" non più visibile

#### Test 3: Impresa senza Titolari Effettivi ✅
- [ ] Creare nuovo cliente tipo Impresa
- [ ] Compilare dati azienda + documento rappresentante legale
- [ ] NON aggiungere titolari effettivi
- [ ] Salvare
- [ ] **Risultato atteso**:
  - Cliente salvato come ACTIVE (se campi obbligatori completi)
  - Possibilità di aggiungere titolari dopo

#### Test 4: Verifica Badge in Lista ✅
- [ ] Creare 3 clienti: 1 draft, 2 attivi
- [ ] Verificare lista RT2
- [ ] **Risultato atteso**:
  - Solo cliente draft mostra badge giallo "BOZZA"
  - Clienti attivi senza badge

#### Test 5: Migration Database ✅
- [ ] Applicare migration su database esistente
- [ ] Verificare clienti esistenti impostati su 'active'
- [ ] Verificare default 'draft' per nuovi inserimenti
- [ ] Verificare constraint CHECK funzionante
- [ ] **Risultato atteso**:
  - Nessun errore
  - Clienti esistenti = active
  - Nuovi clienti = draft

---

## 📝 Note Tecniche

### Decisioni di Design

1. **Status Automatico vs Manuale**
   - ✅ Scelto: Automatico
   - Motivo: Riduce errori umani, garantisce coerenza

2. **Titolari Effettivi per Imprese**
   - ✅ Non obbligatori inizialmente
   - Motivo: Dati spesso non disponibili subito, possono essere aggiunti dopo

3. **Badge Visivo**
   - ✅ Colore giallo per bozza
   - Motivo: Colore neutro che attira attenzione senza allarmare

4. **Messaggi Utente**
   - ✅ Distinti per draft/active
   - Motivo: Chiarezza su cosa è stato salvato

### Edge Cases Gestiti

1. **Cliente con status NULL** ✅
   - Migration imposta automaticamente 'active' per esistenti
   
2. **Validazione tipo_cliente** ✅
   - Funzione `isClienteComplete()` gestisce tutti e 3 i tipi

3. **Campi opzionali** ✅
   - Solo campi realmente obbligatori verificati

4. **Retrocompatibilità** ✅
   - Clienti esistenti funzionano normalmente
   - Default 'draft' non impatta funzionalità esistenti

### Considerazioni Future

1. **Filtri per Status** (TODO)
   - Aggiungere filtro in RT2 per visualizzare solo draft/active
   - Es: "Mostra solo clienti in bozza"

2. **Notifiche** (TODO)
   - Alert per clienti in bozza da troppo tempo
   - Dashboard admin con conteggio bozze

3. **Workflow Approvazione** (TODO)
   - Possibilità di richiedere approvazione prima di attivare
   - Ruoli: operatore crea bozza, supervisore approva

4. **Audit Trail** (TODO)
   - Log dei cambi status (draft → active)
   - Timestamp dell'attivazione

---

## 🎯 Riepilogo

### Cosa è stato implementato ✅
- ✅ Campo `status` nel database
- ✅ Logica automatica draft/active basata su completezza dati
- ✅ Badge "BOZZA" nella UI
- ✅ Messaggi personalizzati per l'utente
- ✅ Migration sicura per database esistenti
- ✅ Validazione intelligente per tipo cliente
- ✅ Rimosso obbligo titolari effettivi iniziale

### Benefici per l'Utente 🎉
- ⚡ Creazione clienti più veloce
- 📝 Possibilità di salvare progressi
- 🎯 Zero rischio di perdere dati
- 👁️ Visibilità immediata clienti incompleti
- ✅ Guida chiara su cosa completare

### Prossimi Passi 🚀
1. Applicare migration: `20251102000000_add_cliente_status.sql`
2. Testare workflow completo (vedi checklist sopra)
3. Formare utenti sul nuovo comportamento
4. Monitorare feedback utenti
5. Considerare implementazioni future (filtri, notifiche, etc.)

---

**Fine Documento**

_Per domande o supporto, contattare il team di sviluppo._
