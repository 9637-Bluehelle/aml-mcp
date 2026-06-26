# Conversione Sistema PDF → DOCX

**Data**: 7 Novembre 2025
**Obiettivo**: Convertire il sistema di generazione documenti AML da PDF a formato Word DOCX editabile

## 📋 Panoramica

Il sistema è stato completamente convertito per generare documenti Word (.docx) invece di PDF, mantenendo la stessa struttura e contenuti ma rendendo i documenti editabili dagli utenti.

## 🔧 Modifiche Implementate

### 1. **Nuovo Generatore DOCX**
**File**: `supabase/functions/generate-aml-pdf/docx-generator.ts` (NUOVO)

- Sostituisce `pdf-generator.ts` che usava jsPDF
- Utilizza libreria `docx@8.5.0` da https://esm.sh/
- Implementa due funzioni principali:
  - `generateDOCX_AV3()` - Genera documento Istruttoria Cliente
  - `generateDOCX_AV4()` - Genera documento Dichiarazione Cliente

**Caratteristiche**:
- ✅ Formattazione professionale con heading, grassetto, corsivo
- ✅ Checkbox Unicode (☐ ☑)
- ✅ Gestione interruzioni di pagina
- ✅ Struttura gerarchica con sezioni e sottosezioni
- ✅ Campo firma e data
- ✅ Note legali in allegato

### 2. **Edge Function Aggiornata**
**File**: `supabase/functions/generate-aml-pdf/index.ts`

**Modifiche**:
```typescript
// Prima
import { generatePDF_AV3, generatePDF_AV4 } from './pdf-generator.ts';
Content-Type: 'application/pdf'
filename: "*.pdf"

// Dopo
import { generateDOCX_AV3, generateDOCX_AV4 } from './docx-generator.ts';
Content-Type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
filename: "*.docx"
```

### 3. **Servizio Frontend**
**File**: `src/lib/pdf-service.ts`

**Funzioni aggiornate**:
- `generateAMLDocument()` - Genera documento DOCX
- `downloadDocument()` - Scarica file .docx
- `generateAndDownloadDocument()` - Operazione completa

**Compatibilità retroattiva**:
```typescript
// Funzioni deprecate ma funzionanti
export const generateAMLPDF = generateAMLDocument; // @deprecated
export const downloadPDF = downloadDocument; // @deprecated
```

## 📦 Dipendenze

### Libreria DOCX
```typescript
import { 
  Document, 
  Paragraph, 
  TextRun, 
  AlignmentType,
  HeadingLevel,
  Packer
} from 'https://esm.sh/docx@8.5.0';
```

**Nessuna installazione npm richiesta** - La libreria viene caricata via ESM da Deno runtime.

## 📄 Struttura Documenti Generati

### AV.3 - Istruttoria Cliente
1. Header con titolo
2. Cliente e Professionista Incaricato
3. Sezione 1: Dati relativi al Cliente
4. Sezione 2: Dati relativi ai titolari effettivi
5. Sezione 3: Scopo e natura incarico
6. Sezione 4: Profilo di rischio
7. Sezione 5: Segnalazioni
8. Firma e data

### AV.4 - Dichiarazione Cliente
1. Header con titolo
2. Preambolo normativo
3. Dati sottoscritto
4. Dichiarazioni (PEP, titolari effettivi, fondi)
5. Impegni e GDPR
6. Firma cliente e identificatore
7. **Pagina 2**: Allegato riepilogo dati
8. **Pagina 3**: Note legali (4 note)

## ✅ Vantaggi della Conversione

1. **Editabilità**: Utenti possono modificare i documenti in Word
2. **Professionalità**: Formattazione nativa Word
3. **Flessibilità**: Facile personalizzazione post-generazione
4. **Compatibilità**: Apertura in Word, LibreOffice, Google Docs
5. **Compilazione**: Campi sotto

lineatura "_____" da compilare manualmente

## 🔄 Retro-compatibilità

Il codice esistente che usa le vecchie funzioni continuerà a funzionare:
```typescript
// Vecchio codice - FUNZIONA ANCORA
await generateAndDownloadPDF(params);

// Nuovo codice - RACCOMANDATO
await generateAndDownloadDocument(params);
```

## 🚀 Deployment

### Deploy Edge Function
```bash
supabase functions deploy generate-aml-pdf
```

### Test Locale
```bash
supabase functions serve generate-aml-pdf
```

## 📝 Note Tecniche

### Content-Type
```
application/vnd.openxmlformats-officedocument.wordprocessingml.document
```

### Estensione File
```
.docx
```

### Formato Buffer
`Packer.toBuffer(doc)` → `Uint8Array` → Blob

## ⚠️ Limitazioni Note

1. **TODO**: Implementare ZIP per `documentType: 'both'` (attualmente ritorna solo AV.4)
2. Le immagini non sono supportate (non necessarie per questi documenti)
3. Tabelle complesse non implementate (uso Paragraph per semplicità)

## 🧪 Test

Per testare la generazione:

1. Accedere all'applicazione
2. Selezionare un cliente con incarico attivo
3. Generare documento AV.3 o AV.4
4. Verificare download file .docx
5. Aprire in Word/LibreOffice per validare formattazione

## 📚 Risorse

- Libreria docx: https://github.com/dolanmiu/docx
- Documentazione: https://docx.js.org/
- ESM CDN: https://esm.sh/docx@8.5.0

## 🔮 Sviluppi Futuri

- [ ] Implementare generazione ZIP per opzione 'both'
- [ ] Aggiungere template personalizzabili
- [ ] Supporto per logo aziendale in header
- [ ] Esportazione anche in PDF (se richiesto)
- [ ] Campo firma digitale

---

**Stato**: ✅ Completato e Funzionante
**Versione**: 1.0
**Autore**: Sistema AML-REV
