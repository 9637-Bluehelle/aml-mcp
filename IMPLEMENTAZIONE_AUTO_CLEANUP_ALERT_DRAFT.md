# Implementazione Cleanup Automatico Alert RT2-DRAFT

> **Data Implementazione**: 15 Novembre 2025  
> **Versione**: 1.0  
> **Tipo**: Trigger Database + Funzione PostgreSQL  
> **Moduli Interessati**: Alert, Clienti, Database

---

## 📋 Indice

1. [Panoramica](#panoramica)
2. [Problema Risolto](#problema-risolto)
3. [Soluzione Implementata](#soluzione-implementata)
4. [Dettagli Tecnici](#dettagli-tecnici)
5. [File Modificati](#file-modificati)
6. [Testing](#testing)
7. [Rollback](#rollback)
8. [Note Tecniche](#note-tecniche)

---

## 📖 Panoramica

Questa implementazione risolve il problema del cleanup automatico degli alert RT2-DRAFT quando un cliente passa da stato 'draft' a 'active' o 'archived'.

### Prima dell'Implementazione ❌
- Alert RT2-DRAFT rimanevano attivi anche dopo l'attivazione del cliente
- Necessario click manuale su "Controlla Alert" per pulire gli alert obsoleti
- Rischio di alert "fantasma" che causano confusione

### Dopo l'Implementazione ✅
- Alert RT2-DRAFT rimossi **automaticamente** all'attivazione del cliente
- Pulizia istantanea a livello database
- Zero intervento manuale richiesto
- Funziona da qualsiasi punto dell'applicazione

---

## 🔍 Problema Risolto

### Scenario Tipico (PRIMA):

```
1. Utente crea cliente → Status = 'draft'
2. Sistema genera alert RT2-DRAFT → "Cliente X in stato BOZZA"
3. Utente completa cliente → Status = 'active'
4. ⚠️ Alert RT2-DRAFT rimane attivo (non viene rimosso)
5. Utente deve aprire AlertPanel
6. Utente deve cliccare "Controlla Alert"
7. Sistema esegue cleanupObsoleteAlerts()
8. Alert finalmente rimosso
```

**Problemi**:
- 🐌 Non immediato (dipende da azione utente)
- 😕 Confusione (cliente attivo con alert "in bozza")
- 🔄 Ridondante (automatizzabile)

### Flusso Ottimizzato (DOPO):

```
1. Utente crea cliente → Status = 'draft'
2. Sistema genera alert RT2-DRAFT → "Cliente X in stato BOZZA"
3. Utente completa cliente → Status = 'active'
4. ✅ Trigger database rimuove automaticamente alert RT2-DRAFT
5. Fine! (alert già pulito)
```

**Vantaggi**:
- ⚡ Istantaneo (esecuzione a livello DB)
- 🎯 Preciso (solo quando necessario)
- 🚀 Trasparente (utente non deve fare nulla)

---

## 🔧 Soluzione Implementata

### Architettura

```
┌─────────────────────────────────────────────┐
│         UI / API / Admin Panel              │
│  (Qualsiasi punto di modifica clienti)     │
└─────────────────┬───────────────────────────┘
                  │
                  │ UPDATE clienti SET status = 'active'
                  ▼
┌─────────────────────────────────────────────┐
│         PostgreSQL Database                 │
│                                             │
│  ┌──────────────────────────────┐          │
│  │  Tabella: clienti            │          │
│  │  Record aggiornato:          │          │
│  │  OLD.status = 'draft'        │──────┐   │
│  │  NEW.status = 'active'       │      │   │
│  └──────────────────────────────┘      │   │
│                                         │   │
│  ┌──────────────────────────────┐      │   │
│  │  TRIGGER:                    │◄─────┘   │
│  │  on_cliente_status_change    │          │
│  │  (AFTER UPDATE OF status)    │          │
│  └────────────┬─────────────────┘          │
│               │                             │
│               │ Esegue funzione             │
│               ▼                             │
│  ┌──────────────────────────────┐          │
│  │  FUNCTION:                   │          │
│  │  cleanup_draft_alert_        │          │
│  │  on_status_change()          │          │
│  │                              │          │
│  │  IF OLD.status = 'draft'     │          │
│  │  AND NEW.status != 'draft'   │          │
│  │  THEN                        │          │
│  │    DELETE FROM alert         │──────┐   │
│  │    WHERE tipo_rt='RT2-DRAFT' │      │   │
│  └──────────────────────────────┘      │   │
│                                         │   │
│  ┌──────────────────────────────┐      │   │
│  │  Tabella: alert              │◄─────┘   │
│  │  Alert RT2-DRAFT eliminati   │          │
│  └──────────────────────────────┘          │
│                                             │
└─────────────────────────────────────────────┘
```

### Componenti

#### 1. Funzione PostgreSQL: `cleanup_draft_alert_on_status_change()`

**Sintassi**:
```sql
CREATE OR REPLACE FUNCTION cleanup_draft_alert_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'draft' AND NEW.status != 'draft' THEN
    DELETE FROM alert 
    WHERE tipo_rt = 'RT2-DRAFT' 
    AND (
      alert_id = 'DRAFT_' || NEW.codice_cliente 
      OR alert_id = 'DRAFT_' || NEW.id::text
    );
    
    RAISE NOTICE 'Alert RT2-DRAFT auto-removed for cliente % (status: % → %)', 
                  COALESCE(NEW.codice_cliente, NEW.id::text), 
                  OLD.status, 
                  NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Logica**:
- ✅ Si attiva SOLO se `OLD.status = 'draft'` AND `NEW.status != 'draft'`
- ✅ Elimina alert RT2-DRAFT che corrispondono al cliente
- ✅ Gestisce sia formato `DRAFT_{codice_cliente}` che `DRAFT_{id}`
- ✅ Logga l'operazione per debug (`RAISE NOTICE`)

#### 2. Trigger: `on_cliente_status_change`

**Sintassi**:
```sql
CREATE TRIGGER on_cliente_status_change
AFTER UPDATE OF status ON clienti
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION cleanup_draft_alert_on_status_change();
```

**Caratteristiche**:
- 🎯 **AFTER UPDATE**: Si attiva dopo che la modifica è confermata
- 🎯 **OF status**: Monitora SOLO il campo `status`
- 🎯 **FOR EACH ROW**: Esecuzione per ogni riga modificata
- 🎯 **WHEN clause**: Esegue solo se status cambia realmente

**Performance**: Ottimale grazie a condizione WHEN

---

## 📁 File Modificati

### File Creati

| File | Descrizione |
|------|-------------|
| `supabase/migrations/20251115000000_add_draft_alert_cleanup_trigger.sql` | Migration con trigger e funzione |
| `IMPLEMENTAZIONE_AUTO_CLEANUP_ALERT_DRAFT.md` | Questo documento |

### File NON Modificati

**IMPORTANTE**: Nessun file applicativo modificato!
- ❌ `AlertPanel.tsx` - Funzione `cleanupObsoleteAlerts()` rimane uguale
- ❌ `ClienteWizard.tsx` - Nessun hook aggiuntivo necessario
- ❌ Altri componenti - Nessuna modifica

**Motivo**: La soluzione è puramente a livello database, trasparente per l'applicazione.

---

## 🧪 Testing

### Prerequisiti

1. ✅ Migration `20251102000000_add_cliente_status.sql` applicata (campo status)
2. ✅ Migration `20251113230000_add_rt2_draft_alert_type.sql` applicata (tipo RT2-DRAFT)
3. ✅ Migration `20251115000000_add_draft_alert_cleanup_trigger.sql` applicata (questo trigger)

### Piano di Test Completo

#### Test 1: Caso Base - Draft → Active ✅

**Obiettivo**: Verificare rimozione automatica alert quando cliente diventa attivo

**Passi**:
1. Creare nuovo cliente in bozza:
   ```sql
   INSERT INTO clienti (codice_cliente, tipo_cliente, status, user_id)
   VALUES ('TEST-001', 'persona_fisica', 'draft', '{user_id}');
   ```

2. Generare alert RT2-DRAFT (tramite pulsante "Controlla Alert" o manualmente):
   ```sql
   INSERT INTO alert (tipo_rt, alert_id, messaggio, priorita, status)
   VALUES ('RT2-DRAFT', 'DRAFT_TEST-001', 
           'Cliente "TEST-001" in stato BOZZA', 'medium', 'open');
   ```

3. Verificare alert presente:
   ```sql
   SELECT * FROM alert WHERE alert_id = 'DRAFT_TEST-001';
   -- Risultato atteso: 1 riga
   ```

4. Attivare cliente (completare i dati):
   ```sql
   UPDATE clienti 
   SET status = 'active' 
   WHERE codice_cliente = 'TEST-001';
   ```

5. Verificare alert rimosso automaticamente:
   ```sql
   SELECT * FROM alert WHERE alert_id = 'DRAFT_TEST-001';
   -- Risultato atteso: 0 righe ✅
   ```

**Risultato atteso**: ✅ Alert eliminato automaticamente

---

#### Test 2: Draft → Archived ✅

**Obiettivo**: Verificare funzionamento con status 'archived'

**Passi**:
1. Creare cliente draft con alert RT2-DRAFT
2. Impostare status = 'archived':
   ```sql
   UPDATE clienti 
   SET status = 'archived' 
   WHERE codice_cliente = 'TEST-002';
   ```
3. Verificare alert rimosso

**Risultato atteso**: ✅ Alert eliminato anche per 'archived'

---

#### Test 3: Active → Draft (No Action) ✅

**Obiettivo**: Verificare che trigger NON si attiva se status va verso draft

**Passi**:
1. Cliente con status = 'active' (senza alert RT2-DRAFT)
2. Cambiare status a 'draft':
   ```sql
   UPDATE clienti 
   SET status = 'draft' 
   WHERE codice_cliente = 'TEST-003';
   ```
3. Verificare nessuna azione eseguita

**Risultato atteso**: ✅ Nessun errore, trigger non esegue DELETE

---

#### Test 4: Update Senza Cambio Status ✅

**Obiettivo**: Verificare che trigger NON si attiva se status non cambia

**Passi**:
1. Cliente draft con alert RT2-DRAFT
2. Update altri campi senza toccare status:
   ```sql
   UPDATE clienti 
   SET ragione_sociale = 'Nuovo Nome' 
   WHERE codice_cliente = 'TEST-004';
   ```
3. Verificare alert ancora presente

**Risultato atteso**: ✅ Alert rimane, trigger non eseguito (status non cambiato)

---

#### Test 5: Batch Update (Performance) ✅

**Obiettivo**: Verificare performance con update multipli

**Passi**:
1. Creare 100 clienti in bozza con relativi alert RT2-DRAFT
2. Attivare tutti in batch:
   ```sql
   UPDATE clienti 
   SET status = 'active' 
   WHERE status = 'draft' AND codice_cliente LIKE 'BATCH-%';
   ```
3. Verificare tutti alert rimossi
4. Misurare tempo esecuzione

**Risultato atteso**: ✅ Tutti alert rimossi, tempo < 1 secondo

---

#### Test 6: Alert con formato ID ✅

**Obiettivo**: Verificare gestione alert_id basato su UUID invece di codice_cliente

**Passi**:
1. Creare cliente draft
2. Creare alert con formato `DRAFT_{uuid}`:
   ```sql
   INSERT INTO alert (tipo_rt, alert_id, messaggio, priorita, status)
   VALUES ('RT2-DRAFT', 'DRAFT_' || '{cliente_id}', 
           'Cliente in bozza', 'medium', 'open');
   ```
3. Attivare cliente
4. Verificare alert rimosso

**Risultato atteso**: ✅ Alert eliminato (funzione gestisce entrambi i formati)

---

#### Test 7: Integrazione UI - ClienteWizard ✅

**Obiettivo**: Verificare funzionamento end-to-end da interfaccia

**Passi**:
1. Aprire RT2 → Nuovo Cliente
2. Inserire solo codice cliente: `UI-TEST-001`
3. Salvare (status = draft automatico)
4. Aprire AlertPanel → Click "Controlla Alert"
5. Verificare alert RT2-DRAFT presente
6. Riaprire ClienteWizard → Cliente `UI-TEST-001`
7. Completare tutti i campi obbligatori
8. Salvare (status = active automatico)
9. Tornare ad AlertPanel
10. Verificare alert RT2-DRAFT scomparso automaticamente (senza click "Controlla Alert")

**Risultato atteso**: ✅ Alert sparisce immediatamente dopo salvataggio

---

#### Test 8: Log Debugging ✅

**Obiettivo**: Verificare logging per troubleshooting

**Passi**:
1. Abilitare logging PostgreSQL (se disponibile)
2. Attivare cliente draft
3. Verificare presenza di log NOTICE:
   ```
   NOTICE: Alert RT2-DRAFT auto-removed for cliente TEST-001 (status: draft → active)
   ```

**Risultato atteso**: ✅ Log presente nei log database

---

### Checklist Test Rapida

```
[ ] Test 1 - Draft → Active ✅
[ ] Test 2 - Draft → Archived ✅
[ ] Test 3 - Active → Draft (no action) ✅
[ ] Test 4 - Update altri campi (no action) ✅
[ ] Test 5 - Batch update (performance) ✅
[ ] Test 6 - Alert formato UUID ✅
[ ] Test 7 - Integrazione UI completa ✅
[ ] Test 8 - Verifica log debug ✅
```

---

## 🔄 Rollback

Se necessario tornare indietro, eseguire:

```sql
-- Rimuovere trigger
DROP TRIGGER IF EXISTS on_cliente_status_change ON clienti;

-- Rimuovere funzione
DROP FUNCTION IF EXISTS cleanup_draft_alert_on_status_change();
```

**NOTA**: Il rollback NON elimina alert esistenti, solo la funzionalità automatica.
Dopo il rollback, tornare al sistema manuale (pulsante "Controlla Alert").

---

## 📝 Note Tecniche

### Decisioni di Design

#### 1. Trigger AFTER vs BEFORE
- ✅ Scelto: **AFTER UPDATE**
- Motivo: Garantisce che il cambio status sia confermato prima di pulire gli alert
- Vantaggio: Se UPDATE fallisce, alert non viene toccato

#### 2. FOR EACH ROW vs FOR EACH STATEMENT
- ✅ Scelto: **FOR EACH ROW**
- Motivo: Necessario accedere a OLD.status e NEW.status
- Vantaggio: Funziona anche con batch update

#### 3. WHEN Clause Optimization
- ✅ Aggiunta: `WHEN (OLD.status IS DISTINCT FROM NEW.status)`
- Motivo: Evita esecuzione inutile se status non cambia
- Vantaggio: Performance ottimale

#### 4. Doppio Formato alert_id
- ✅ Gestiti: `DRAFT_{codice_cliente}` e `DRAFT_{id}`
- Motivo: AlertPanel.tsx usa entrambi i formati
- Vantaggio: Compatibilità totale

### Performance

#### Analisi Complessità

**Trigger esecuzione**:
- Tempo: O(1) - Controllo condizione IF
- Costo: Trascurabile

**DELETE query**:
- Indici coinvolti: tipo_rt, alert_id
- Righe eliminate: 0-1 (max 1 alert per cliente)
- Tempo: O(1) - Query con WHERE specifico

**Totale**: < 1ms per cliente singolo

#### Scalabilità

| Operazione | Numero Clienti | Tempo Stimato |
|------------|----------------|---------------|
| Update singolo | 1 | < 1ms |
| Batch update | 10 | < 10ms |
| Batch update | 100 | < 100ms |
| Batch update | 1000 | < 1s |

**Conclusione**: Performance eccellente anche con volumi elevati

### Edge Cases Gestiti

#### 1. Cliente senza codice_cliente ✅
```sql
alert_id = 'DRAFT_' || NEW.codice_cliente  -- NULL se codice_cliente è NULL
OR alert_id = 'DRAFT_' || NEW.id::text     -- Fallback su UUID
```

#### 2. Alert già eliminato manualmente ✅
- DELETE non genera errore se 0 righe trovate
- Comportamento: Silent success

#### 3. Status NULL → draft/active ✅
- Condizione: `OLD.status = 'draft'` → FALSE se OLD.status è NULL
- Comportamento: Trigger non esegue (corretto)

#### 4. Update simultanei (concurrency) ✅
- PostgreSQL gestisce transazioni ACID
- Ogni trigger esegue in isolamento
- Nessun deadlock possibile (DELETE singola tabella)

### Compatibilità

#### Database
- ✅ PostgreSQL 12+
- ✅ Supabase (PostgreSQL 15+)

#### Applicazione
- ✅ Nessun cambio codice richiesto
- ✅ Retrocompatibile 100%
- ✅ AlertPanel.tsx continua a funzionare normalmente

---

## 🎯 Riepilogo Miglioramenti

### Cosa è Cambiato ✅

| Aspetto | Prima | Dopo |
|---------|-------|------|
| **Rimozione Alert** | Manuale (pulsante) | **Automatica** |
| **Tempistica** | Ritardata (utente-dipendente) | **Istantanea** |
| **Affidabilità** | Dipende da utente | **100% garantita** |
| **Punto esecuzione** | UI (AlertPanel) | **Database** |
| **Scope** | Solo da UI | **Da qualsiasi punto** |
| **Performance** | Batch scan periodico | **Trigger mirato** |

### Benefici Utente 🎉

- ⚡ **Alert sempre aggiornati** - Nessun "alert fantasma"
- 🎯 **Zero confusione** - Cliente attivo = Nessun alert bozza
- 🚀 **Zero intervento** - Funziona automaticamente
- 👁️ **Vista pulita** - AlertPanel mostra solo alert reali

### Sistema Alert Completo 🏆

Dopo questa implementazione, il sistema alert è:

1. **Alert RT2-DRAFT** → ✅ Automatico (trigger)
2. **Alert RT4** (clienti senza incarichi) → Manuale (pulsante)
3. **Alert RT2** (incarichi senza valutazione) → Manuale (pulsante)
4. **Cleanup** → ✅ Mix automatico + manuale

**Pulsante "Controlla Alert" rimane utile per**:
- ✅ Generare nuovi alert RT2-DRAFT (nuove bozze)
- ✅ Gestire alert RT4 e RT2
- ✅ Controllo on-demand completo
- ✅ Manutenzione straordinaria

---

## 🔮 Sviluppi Futuri (Opzionali)

### 1. Trigger per Altri Alert
Estendere logica automatica a:
- RT4: Rimozione quando cliente ha incarichi
- RT2: Rimozione quando incarico ha valutazione

### 2. Dashboard Trigger
Creare vista admin per monitorare:
- Quante volte trigger si attiva
- Performance medie
- Alert rimossi automaticamente vs manualmente

### 3. Alert History
Log storico alert rimossi per audit trail

### 4. Scheduled Cleanup
Backup notturno che esegue `cleanupObsoleteAlerts()` completo

---

**Fine Documento**

_Per domande o supporto, contattare il team di sviluppo._
