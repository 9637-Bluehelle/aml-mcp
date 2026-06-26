# Integrazione Dati Completi nelle Dichiarazioni AV3 e AV4

## 📋 Panoramica

Implementazione completa per includere **tutti i dati anagrafici** del rappresentante legale e dei titolari effettivi nelle dichiarazioni AV.3 e AV.4 esportate in formato Word (DOCX).

**Data Implementazione:** 22 Novembre 2025  
**Motivazione:** I dati raccolti durante l'inserimento del cliente non venivano completamente inclusi nelle dichiarazioni esportate.

---

## 🎯 Obiettivo

Assicurare che le dichiarazioni AV.3 (Istruttoria Cliente) e AV.4 (Dichiarazione del Cliente) contengano:

### Per il Rappresentante Legale:
- ✅ Nome e cognome
- ✅ Codice fiscale
- ✅ **Data di nascita** (NUOVO)
- ✅ **Luogo di nascita (comune e provincia)** (NUOVO)
- ✅ **Nazionalità** (NUOVO)
- ✅ **Residenza completa** (MIGLIORATO)
- ✅ **Documento d'identità completo** (NUOVO)
  - Tipo, numero, data rilascio, data scadenza, ente rilascio

### Per i Titolari Effettivi:
- ✅ Nome e cognome
- ✅ Codice fiscale
- ✅ **Data di nascita** (NUOVO)
- ✅ **Luogo di nascita (comune e provincia)** (NUOVO)
- ✅ **Nazionalità** (NUOVO)
- ✅ **Residenza** (MIGLIORATO)
- ✅ Professione/Ruolo
- ✅ **Documento d'identità completo** (NUOVO)
  - Tipo, numero, data rilascio, data scadenza, ente rilascio
- ✅ **Status PEP con dettagli** (MIGLIORATO)

---

## 🔧 Modifiche Implementate

### 1. Database (Migration)

**File:** `supabase/migrations/20251122000000_add_complete_rappresentante_titolari_data.sql`

Aggiunti i seguenti campi:

#### Tabella `clienti` (Rappresentante Legale):
```sql
- data_nascita_rappresentante DATE
- luogo_nascita_rappresentante TEXT
- provincia_nascita_rappresentante TEXT
- nazionalita_rappresentante TEXT (default: 'Italiana')
```

#### Tabella `titolari_effettivi`:
```sql
- nazionalita TEXT (default: 'Italiana')
```

Creati anche indici per ottimizzare le query.

---

### 2. Frontend - Types e Interfacce

**File:** `src/components/cliente-wizard/types.ts`

Aggiornate le interfacce TypeScript:

```typescript
interface WizardData {
  // Nuovi campi rappresentante legale
  data_nascita_rappresentante?: string;
  luogo_nascita_rappresentante?: string;
  provincia_nascita_rappresentante?: string;
  nazionalita_rappresentante?: string;
  // ... altri campi esistenti
}

interface TitolareEffettivo {
  nazionalita: string; // Campo aggiunto
  // ... altri campi esistenti
}
```

---

### 3. Frontend - Forms

#### **ImpresaForm.tsx**
Aggiunti campi input per:
- Data di nascita rappresentante (con validazione formato gg/mm/aaaa)
- Comune di nascita
- Provincia di nascita
- Nazionalità (default: "Italiana")

#### **TitolareEffettivoForm.tsx**
Aggiunto campo input per:
- Nazionalità (default: "Italiana")

#### **ClienteWizard.tsx**
Aggiornata la funzione `addTitolareDaRappresentante()` per copiare automaticamente i nuovi dati anagrafici del rappresentante legale quando viene aggiunto come titolare effettivo.

#### **constants.ts**
Aggiornato `emptyTitolare` con il campo `nazionalita: 'Italiana'`.

---

### 4. Backend - Types

**File:** `supabase/functions/generate-aml-pdf/types.ts`

Aggiornate le interfacce del backend:

```typescript
interface ClienteData {
  // Nuovi campi rappresentante
  codice_fiscale_rappresentante?: string;
  data_nascita_rappresentante?: string;
  luogo_nascita_rappresentante?: string;
  provincia_nascita_rappresentante?: string;
  nazionalita_rappresentante?: string;
  residenza_rappresentante?: string;
  documento_rappresentante_tipo?: string;
  documento_rappresentante_numero?: string;
  documento_rappresentante_data_rilascio?: string;
  documento_rappresentante_data_scadenza?: string;
  documento_rappresentante_ente_rilascio?: string;
  // ... altri campi
}

interface TitolareEffettivo {
  nazionalita?: string; // Campo aggiunto
  residenza?: string;    // Ora supportato
  // ... altri campi
}
```

---

### 5. Backend - Generatore DOCX

**File:** `supabase/functions/generate-aml-pdf/docx-generator.ts`

#### **AV.3 - Istruttoria Cliente**

**Sezione Rappresentante Legale:**
- Aggiunta data di nascita (formattata gg/mm/aaaa)
- Aggiunto luogo di nascita (comune + provincia)
- Aggiunta nazionalità
- Aggiunta residenza
- Aggiunto documento completo con tutti i dettagli

**Sezione Titolari Effettivi:**
- Ogni titolare ora mostra:
  - Intestazione "TITOLARE EFFETTIVO N.X" (sottolineata)
  - Data di nascita
  - Luogo di nascita (comune + provincia)
  - Nazionalità
  - Residenza
  - Documento completo
  - Indicatore PEP con carica (se applicabile)
- Separazione visiva migliore tra titolari

#### **AV.4 - Dichiarazione del Cliente**

La sezione dell'allegato già includeva i titolari, ma ora riceve automaticamente tutti i nuovi dati grazie all'aggiornamento delle interfacce.

---

## 📊 Impatto e Benefici

### ✅ Completezza dei Dati
- **Prima:** Solo nome, CF e ruolo dei titolari
- **Dopo:** Anagrafica completa + documento per rappresentante e titolari

### ✅ Conformità Normativa
- Migliore aderenza ai requisiti del D.Lgs. 231/2007
- Documentazione completa per adeguata verifica della clientela

### ✅ Professionalità
- Dichiarazioni più complete e dettagliate
- Riduzione delle integrazioni manuali necessarie

### ✅ Tracciabilità
- Tutti i dati raccolti nel wizard vengono ora utilizzati
- Nessuna perdita di informazioni nell'export

---

## 🔍 Testing

### Verifiche necessarie:

1. **Database:**
   ```sql
   -- Eseguire la migration
   -- Verificare che le nuove colonne esistano
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'clienti' 
   AND column_name LIKE '%rappresentante%';
   ```

2. **Frontend:**
   - Compilare un nuovo cliente (tipo Impresa)
   - Inserire tutti i dati del rappresentante legale
   - Aggiungere titolari effettivi con dati completi
   - Salvare il cliente

3. **Export DOCX:**
   - Generare dichiarazione AV.3
   - Generare dichiarazione AV.4
   - Verificare che tutti i campi siano presenti e formattati correttamente

---

## 📝 Note Implementative

### Campi Opzionali vs Obbligatori

I nuovi campi sono **opzionali** nel database per:
- Compatibilità con dati esistenti
- Flessibilità nell'inserimento
- Graduale adozione

Tuttavia, nel form frontend alcuni campi sono contrassegnati come obbligatori (*) per guidare l'utente verso la completezza dei dati.

### Gestione Sincronizzazione

La funzione `syncRappresentanteLegaleToTitolari()` in `ClienteWizard.tsx` ora sincronizza automaticamente:
- CF rappresentante
- Residenza rappresentante  
- Documento rappresentante
- **NUOVO:** Anche i dati anagrafici (data/luogo nascita, nazionalità)

quando il rappresentante legale è presente anche come titolare effettivo.

### Formato Date

Tutte le date vengono visualizzate nel formato italiano `gg/mm/aaaa` nei documenti DOCX grazie alla funzione `formatDate()`.

---

## 🚀 Prossimi Passi

1. **Eseguire migration database** sul server di produzione
2. **Deploy del codice aggiornato**
3. **Testare l'export** con un cliente di prova
4. **Formare gli utenti** sui nuovi campi disponibili
5. **Aggiornare eventuali clienti esistenti** con i dati mancanti

---

## 📌 Files Modificati

### Database
- ✅ `supabase/migrations/20251122000000_add_complete_rappresentante_titolari_data.sql`

### Frontend - Types
- ✅ `src/components/cliente-wizard/types.ts`
- ✅ `src/components/cliente-wizard/constants.ts`

### Frontend - Components
- ✅ `src/components/cliente-wizard/components/forms/ImpresaForm.tsx`
- ✅ `src/components/cliente-wizard/components/titolari/TitolareEffettivoForm.tsx`
- ✅ `src/components/cliente-wizard/ClienteWizard.tsx`

### Backend - Types e Generatore
- ✅ `supabase/functions/generate-aml-pdf/types.ts`
- ✅ `supabase/functions/generate-aml-pdf/docx-generator.ts`

### Queries
- ℹ️ `supabase/functions/generate-aml-pdf/queries.ts` (già usa `SELECT *`, nessuna modifica necessaria)

---

## ✅ Checklist Implementazione

- [x] Migration database creata e testata
- [x] Interfacce TypeScript aggiornate (frontend)
- [x] Form ImpresaForm aggiornato con nuovi campi
- [x] Form TitolareEffettivoForm aggiornato con nazionalità
- [x] Logica di sincronizzazione RL → Titolare aggiornata
- [x] Interfacce TypeScript aggiornate (backend)
- [x] Generatore DOCX AV.3 aggiornato (sezione rappresentante)
- [x] Generatore DOCX AV.3 aggiornato (sezione titolari)
- [x] Generatore DOCX AV.4 compatibile con nuovi dati
- [x] Documentazione creata

---

## 👤 Autore

Implementazione completata il 22 Novembre 2025

**Issue correlati:** Integrazione dati completi per dichiarazioni AV3/AV4
