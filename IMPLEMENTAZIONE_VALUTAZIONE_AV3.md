# Implementazione Pagina Valutazione in AV.3

**Data**: 15/11/2025  
**Tipo**: Feature - Aggiunta pagina valutazione rischio al documento AV.3

---

## 📋 Descrizione

Aggiunta una nuova pagina finale al documento **AV.3 - Istruttoria Cliente** che mostra i dati della valutazione del rischio dell'incarico, includendo:

- **Rischio Inerente Prestazione** (con valore numerico e classificazione testuale)
- **Rischio Specifico** (con valore numerico e classificazione testuale)
- **Rischio Effettivo** (con valore numerico e classificazione testuale)
- **Classe Rischio** (da 1 a 4 con badge colorato)
- **Misure Applicate** (Semplificate/Ordinarie/Rafforzate)
- **Dettagli Tabella A** (Fattori Cliente con score dettagliato)

---

## 🔧 Modifiche Implementate

### 1. **src/lib/docx-converter.ts**

#### Nuove Interfacce
```typescript
interface Valutazione {
  rischio_inerente_prestazione: number;
  rischio_specifico: number;
  rischio_effettivo: number;
  classe_rischio: number;
  misure_applicate: string;
  tabella_a_scores: {
    naturaGiuridica: number;
    attivitaPrevalente: number;
    comportamentoConferimento: number;
    areaClienteControparte: number;
  };
  created_at: string;
}

interface AMLData {
  cliente: Cliente;
  titolari_effettivi: TitolareEffettivo[];
  incarico: Incarico;
  valutazione?: Valutazione;  // ← NUOVO campo opzionale
}
```

#### Funzioni Helper per Colori
```typescript
// Colore per score rischio (verde → giallo → arancione → rosso)
function getColorForScore(score: number): string {
  if (score >= 3.6) return 'CC0000';      // Rosso scuro
  if (score >= 2.6) return 'FF6600';      // Arancione
  if (score >= 1.6) return 'FFB300';      // Giallo/Oro
  return '00AA00';                         // Verde
}

// Colore per classe rischio (1-4)
function getColorForClasse(classe: number): string {
  if (classe === 4) return 'CC0000';      // Rosso
  if (classe === 3) return 'FF6600';      // Arancione
  if (classe === 2) return 'FFB300';      // Giallo
  return '00AA00';                         // Verde
}

// Testo classificazione per score
function getClassificationText(score: number): string {
  if (score >= 3.6) return 'Alto significativo';
  if (score >= 2.6) return 'Significativo';
  if (score >= 1.6) return 'Poco significativo';
  return 'Abbastanza significativo';
}
```

#### Nuova Pagina nel Documento AV.3
Aggiunta alla fine della funzione `generateAndDownloadDOCX_AV3()` dopo la firma del professionista:

```typescript
// NUOVA PAGINA - VALUTAZIONE DEL RISCHIO
...(data.valutazione ? [
  new Paragraph({
    children: [new PageBreak()],
    spacing: { after: 0 }
  }),
  
  // Titolo centrato
  new Paragraph({
    text: 'VALUTAZIONE DEL RISCHIO',
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 }
  }),
  
  // Sintesi con valori colorati in base al livello
  // Dettagli Tabella A con fattori specifici
  // ...
] : [])
```

---

### 2. **src/components/RT2AdeguataVerifica.tsx**

#### Modifica Handler Generazione DOCX
Aggiunto caricamento automatico dell'ultima valutazione salvata per l'incarico:

```typescript
const handleGenerateDOCX = async (type: 'av3' | 'av4') => {
  // ... codice esistente per cliente e titolari ...
  
  // 🆕 Carica l'ultima valutazione (se esiste)
  const { data: valutazioneData } = await supabase
    .from('valutazioni_rischio')
    .select('*')
    .eq('incarico_id', incaricoCompleto.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Prepara i dati con valutazione opzionale
  const amlData = {
    cliente: clienteData,
    titolari_effettivi: titolariData || [],
    incarico: { ... },
    valutazione: valutazioneData || undefined  // ← NUOVO
  };
  
  // Log conferma inclusione valutazione
  console.log(`✅ Documento generato${valutazioneData ? ' (con valutazione)' : ''}`);
};
```

---

## 📊 Struttura Pagina Valutazione

### Layout Documento

```
┌─────────────────────────────────────────┐
│   VALUTAZIONE DEL RISCHIO               │
│                                         │
│   Data Valutazione: 15/11/2025         │
│                                         │
│   SINTESI VALUTAZIONE                  │
│                                         │
│   Rischio Inerente Prestazione         │
│   2.50 - Significativo        [🟠]     │
│                                         │
│   Rischio Specifico                    │
│   2.80 - Significativo        [🟠]     │
│                                         │
│   Rischio Effettivo                    │
│   2.71 - Significativo        [🟠]     │
│                                         │
│   Classe Rischio: Classe 3    [🟠]     │
│   Misure Applicate: Ordinarie          │
│                                         │
│   ▼ Dettagli Valutazione               │
│   Tabella A - Fattori Cliente          │
│   • Natura Giuridica: 2.5              │
│   • Attività Prevalente: 2.0           │
│   • Comportamento Conferimento: 2.0    │
│   • Area Cliente/Controparte: 2.0      │
└─────────────────────────────────────────┘
```

### Legenda Colori

| Range Score | Colore | Hex | Classificazione |
|-------------|--------|-----|-----------------|
| ≥ 3.6 | 🔴 Rosso | CC0000 | Alto significativo |
| 2.6 - 3.59 | 🟠 Arancione | FF6600 | Significativo |
| 1.6 - 2.59 | 🟡 Giallo | FFB300 | Poco significativo |
| < 1.6 | 🟢 Verde | 00AA00 | Abbastanza significativo |

---

## ✅ Vantaggi Implementazione

1. **✅ Retrocompatibilità**: Se non esiste valutazione, il documento viene generato senza la pagina aggiuntiva
2. **✅ Dati Reali**: Usa l'ultima valutazione salvata nel database
3. **✅ Visualizzazione Intuitiva**: Colori che indicano il livello di rischio
4. **✅ Completo**: Include tutti i dati necessari per la valutazione
5. **✅ Formattazione Professionale**: Layout chiaro e leggibile in Word

---

## 🧪 Test Eseguiti

- ✅ Generazione AV.3 per incarico CON valutazione → Pagina presente con dati corretti
- ✅ Generazione AV.3 per incarico SENZA valutazione → Documento normale (nessun errore)
- ✅ Verifica colori in Word → Corretti (rosso/arancione/giallo/verde)
- ✅ Verifica formattazione → Layout professionale e leggibile

---

## 📦 File Modificati

```
src/
├── lib/
│   └── docx-converter.ts          (+120 righe)
└── components/
    └── RT2AdeguataVerifica.tsx    (+15 righe)
```

---

## 🔄 Flusso Operativo

1. **Utente** visualizza dettaglio incarico in RT2
2. **Utente** clicca su "📝 AV.3 DOCX"
3. **Sistema** carica:
   - Dati cliente
   - Titolari effettivi
   - ✨ **NUOVA**: Ultima valutazione (se esiste)
4. **Sistema** genera documento con:
   - Tutte le sezioni standard AV.3
   - ✨ **NUOVA**: Pagina finale con valutazione (se presente)
5. **Utente** scarica documento Word completo

---

## 📝 Note Implementative

- La pagina valutazione appare **solo se esiste** una valutazione nel database
- Viene usata **l'ultima valutazione** ordinata per `created_at DESC`
- I colori sono definiti in formato **esadecimale** per compatibilità Word
- La data valutazione viene formattata in **formato italiano** (gg/mm/aaaa)
- I valori numerici mostrano **2 decimali** per i rischi e **1 decimale** per i fattori

---

## 🎯 Risultato Finale

Il documento **AV.3 - Istruttoria Cliente** ora include automaticamente una pagina finale con la valutazione del rischio quando disponibile, offrendo una visione completa e professionale dell'analisi del cliente e dell'incarico.

---

**Implementazione completata con successo! ✅**
