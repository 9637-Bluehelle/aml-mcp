# Ripristino PDF Generator

**Data**: 7 Novembre 2025
**Motivo**: File DOCX generati dalla libreria `docx@8.5.0` risultavano corrotti

## 🔄 Azioni Eseguite

### 1. **Ripristinato PDF Generator Originale**
- `supabase/functions/generate-aml-pdf/index.ts` → Usa `pdf-generator.ts`
- Content-Type: `application/pdf`
- Funzionante e testato ✅

### 2. **Ripristinato Servizio Frontend**
- `src/lib/pdf-service.ts` → Chiamate PDF
- Interfacce e function names ripristinati
- Compatibile con codice esistente ✅

## ❌ Problema Riscontrato

Il file DOCX generato con libreria `docx@8.5.0` su Deno produceva errore:
```
Errore durante l'apertura del file.
* Verificare le autorizzazioni del file
* Verificare la memoria e lo spazio su disco
* Aprire il file con il convertitore per il ripristino di testo
```

**Causa probabile**: 
- Problema con `Packer.toBuffer()` in ambiente Deno
- Incompatibilità tra ESM module e Supabase Edge Function
- Buffer corrotto durante il passaggio Response → Blob

## 🎯 Stato Attuale

✅ **Sistema PDF funzionante**
- Edge Function genera PDF correttamente
- Download PDF funziona
- Documenti AV.3 e AV.4 aperti senza problemi

## 📝 Prossimi Passi (Opzionali)

Se si vuole aggiungere supporto DOCX in futuro:

### Opzione A: Fix Libreria docx Lato Server
- Debug approfondito di `Packer.toBuffer()`
- Testare altre versioni della libreria
- Verificare compatibilità Deno/Supabase

### Opzione B: Conversione Lato Client (RACCOMANDATO)
```bash
npm install docx file-saver
```

Creare `src/lib/docx-converter.ts`:
```typescript
import { Document, Paragraph, Packer } from 'docx';
import { saveAs } from 'file-saver';

export async function convertPDFDataToDOCX(amlData: AMLData) {
  const doc = new Document({
    sections: [/* struttura documento */]
  });
  
  const blob = await Packer.toBlob(doc);
  saveAs(blob, "documento.docx");
}
```

**Vantaggi**:
- Libreria `docx` più stabile nel browser
- Nessun problema server
- Utente sceglie il formato da scaricare

### Opzione C: Servizio Esterno
- Usare API esterna per conversione PDF→DOCX
- CloudConvert, Zamzar, etc.
- Costo aggiuntivo ma affidabile

## 🚀 Deploy

Edge Function ripristinata, per deployare:
```bash
supabase functions deploy generate-aml-pdf
```

## 📊 Riepilogo File Modificati

1. ✅ `supabase/functions/generate-aml-pdf/index.ts` - Ripristinato PDF
2. ✅ `src/lib/pdf-service.ts` - Ripristinato servizio PDF
3. ⏸️ `supabase/functions/generate-aml-pdf/docx-generator.ts` - Non in uso (può essere rimosso)
4. ⏸️ `CONVERSIONE_PDF_TO_DOCX.md` - Documentazione tentativo DOCX (archiviare)

## ⚠️ Note NPM

Durante il tentativo di installare librerie client-side, npm ha manifestato errori:
```
npm warn tar TAR_ENTRY_ERROR ENOENT
npm warn tar TAR_ENTRY_ERROR UNKNOWN
```

Possibile corruzione cache npm. Risolvere con:
```bash
npm cache clean --force
npm install
```

---

**Conclusione**: Sistema PDF ripristinato e funzionante. Conversione DOCX rimandata a fase successiva quando npm sarà stabile.
