# Fix DOCX Generator - Correzioni Applicate

**Data**: 8 Novembre 2025
**Obiettivo**: Correggere errori generazione DOCX per compatibilità Word/LibreOffice

## 🔧 Correzioni Applicate

### 1. **Import PageBreak Corretto**
```typescript
// ✅ CORRETTO
import { 
  Document, 
  Paragraph, 
  TextRun, 
  AlignmentType,
  HeadingLevel,
  Packer,
  PageBreak  // ← Import esplicito
} from 'docx';
```

### 2. **Utilizzo PageBreak con Paragraph**
```typescript
// ❌ ERRATO (precedente)
new Paragraph({ children: [new PageBreak()] })

// ✅ CORRETTO
new Paragraph({
  children: [new PageBreak()],
  spacing: { after: 0 }
})
```

### 3. **Gestione Apostrofi con Virgolette Doppie**
```typescript
// ❌ ERRATO - Escape manuale
text: 'Attività d\'impresa'

// ✅ CORRETTO - Virgolette doppie
text: "Attività d'impresa"
text: "Servizi professionali nell'ambito dell'attività d'impresa"
```

### 4. **Margini Pagina**
```typescript
const doc = new Document({
  sections: [{
    properties: {
      page: {
        margin: {
          top: 1440,     // 1 pollice = 1440 twips
          right: 1440,
          bottom: 1440,
          left: 1440
        }
      }
    },
    children: [/* ... */]
  }]
});
```

### 5. **Try-Catch per Gestione Errori**
```typescript
try {
  const blob = await Packer.toBlob(doc);
  const filename = `AV3_Istruttoria_${incarico.codice_incarico || today.replace(/\//g, '-')}.docx`;
  saveAs(blob, filename);
  console.log('✅ Documento AV.3 generato con successo');
} catch (error) {
  console.error('❌ Errore nella generazione AV.3:', error);
  throw error;
}
```

### 6. **Filename Sicuro**
```typescript
// Sostituisce / con - nelle date per evitare errori filesystem
const filename = `AV4_Dichiarazione_${incarico.codice_incarico || today.replace(/\//g, '-')}.docx`;
```

### 7. **Formattazione TextRun in Paragraph**
```typescript
// ✅ CORRETTO - TextRun per testo con formattazione
new Paragraph({
  children: [
    new TextRun({ text: 'Testo normale ' }),
    new TextRun({ text: 'Testo grassetto', bold: true }),
    new TextRun({ text: 'Testo corsivo', italics: true })
  ]
})

// ✅ CORRETTO - text diretto per paragrafi semplici
new Paragraph({
  text: 'Testo semplice senza formattazione'
})
```

## 📦 Dipendenze Verificate

```json
{
  "dependencies": {
    "docx": "^9.5.1",           // ✅ Versione aggiornata
    "file-saver": "^2.0.5"       // ✅ OK
  },
  "devDependencies": {
    "@types/file-saver": "^2.0.7" // ✅ OK
  }
}
```

## 🎯 Risultati Attesi

Dopo queste correzioni, i documenti DOCX generati:

1. ✅ Si aprono correttamente in Microsoft Word
2. ✅ Si aprono correttamente in LibreOffice Writer
3. ✅ Hanno margini corretti (1 pollice su tutti i lati)
4. ✅ Hanno interruzioni di pagina funzionanti
5. ✅ Non hanno errori di encoding con apostrofi
6. ✅ Console logs per debug
7. ✅ Gestione errori appropriata

## 🔍 Differenze Rispetto a Versione Precedente

| Aspetto | Prima | Dopo |
|---------|-------|------|
| **PageBreak** | Sintassi errata | ✅ Corretto con Paragraph wrapper |
| **Apostrofi** | Escape `\'` | ✅ Virgolette doppie |
| **Margini** | Non specificati | ✅ 1440 twips (1 pollice) |
| **Error handling** | Assente | ✅ Try-catch + console.log |
| **Filename** | Date con `/` | ✅ Sostituite con `-` |
| **Import** | Implicito | ✅ PageBreak esplicito |

## 📝 Struttura Documenti

### AV.3 - Istruttoria Cliente
- Pagina unica
- Sezioni: Cliente, Titolari Effettivi, Scopo, Rischio, Segnalazioni
- Firma finale

### AV.4 - Dichiarazione Cliente
- **Pagina 1**: Dichiarazione principale
- **Pagina 2**: Allegato - Riepilogo dati estratti (PageBreak)
- **Pagina 3**: Note legali (4 note normative) (PageBreak)

## 🚀 Prossimi Passi

1. ✅ Correzioni applicate a `src/lib/docx-converter.ts`
2. ✅ Dipendenze verificate in `package.json`
3. ⏳ **Test con dati reali** - Da eseguire
4. ⏳ **Integrazione UI** - Aggiungere pulsanti in `RT2AdeguataVerifica.tsx`

## 🎨 Esempio Integrazione UI

```typescript
import { generateAndDownloadDOCX_AV3, generateAndDownloadDOCX_AV4 } from '@/lib/docx-converter';

// In RT2AdeguataVerifica.tsx
<div className="flex gap-2">
  {/* PDF esistenti */}
  <button onClick={() => generatePDF_AV3(data)}>
    📄 Scarica AV.3 (PDF)
  </button>
  <button onClick={() => generatePDF_AV4(data)}>
    📄 Scarica AV.4 (PDF)
  </button>
  
  {/* NUOVI pulsanti DOCX */}
  <button onClick={() => generateAndDownloadDOCX_AV3(data)}>
    📝 Scarica AV.3 (DOCX)
  </button>
  <button onClick={() => generateAndDownloadDOCX_AV4(data)}>
    📝 Scarica AV.4 (DOCX)
  </button>
</div>
```

## ✅ Checklist Completamento

- [x] Import PageBreak corretto
- [x] Sintassi PageBreak corretta
- [x] Apostrofi con virgolette doppie
- [x] Margini pagina aggiunti
- [x] Try-catch implementato
- [x] Console.log per debug
- [x] Filename sicuro (replace `/`)
- [x] Dipendenze verificate
- [x] Documentazione creata
- [ ] Test generazione con dati reali
- [ ] Integrazione UI (pulsanti)
- [ ] Verifica apertura in Word
- [ ] Verifica apertura in LibreOffice

---

**Status**: ✅ Codice corretto e pronto per test
**File Modificati**: 
- `src/lib/docx-converter.ts` (completamente riscritto con fixes)
- `FIX_DOCX_GENERATOR_CORREZIONI.md` (questa documentazione)

**Libreria DOCX**: v9.5.1 (più recente di v8.5.0 richiesta)
