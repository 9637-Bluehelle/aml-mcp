# Codici ATECO 2025 - Rischio Riciclaggio

## Descrizione del file

Il file `codici_ateco_2025_rischio.json` contiene tutti i **1.290 codici ATECO 2025** (sottocategorie, livello gerarchico 6) con un indice indicativo del rischio di riciclaggio e uso eccessivo di contante. I valori sono allineati al file Excel di riferimento `codici_ateco_2025_rischio_v4.xlsx` (frutto delle ricerche aggiornate), che è il source-of-truth del dato.

---

## Processo di creazione

### 1. Fonte dei codici ATECO 2025

I codici e le descrizioni delle attivita economiche sono stati estratti dal file ufficiale ISTAT:

- **File**: `StrutturaATECO-2025-IT-EN-1.xlsx`
- **Fonte**: https://www.istat.it/wp-content/uploads/2024/12/StrutturaATECO-2025-IT-EN-1.xlsx
- **Pagina ufficiale**: https://www.istat.it/classificazione/ateco-2025/
- **Foglio utilizzato**: `ATECO 2025 Struttura`
- **Filtro applicato**: solo record con `GERARCHIA_ATECO_2025 = 6` (sottocategorie, il livello piu dettagliato)
- **Risultato**: 1.290 sottocategorie estratte

### 2. Mappatura dei livelli di rischio

I livelli di rischio sono stati inizialmente trasferiti dal file `codici_ateco_rischio.json` (ATECO 2007 agg. 2022, 1.241 codici — *file intermedio non più presente nel repo*) al nuovo file ATECO 2025 tramite la tabella di corrispondenza bidirezionale ufficiale ISTAT:

- **File**: `Corrispondenza-bidirezionale-2025-vs-2022-IT.xlsx`
- **Fonte**: https://www.istat.it/wp-content/uploads/2025/02/Corrispondenza-bidirezionale-2025-vs-2022-IT.xlsx
- **Foglio utilizzato**: `ATECO 2025 vs ATECO 2022`
- **Filtro applicato**: solo record con `GERARCHIA = 6` (corrispondenze a livello di sottocategoria)

#### Algoritmo di mappatura

Per ciascun codice ATECO 2025, il rischio e stato determinato con la seguente logica a cascata:

1. **Corrispondenza diretta**: tramite la tabella bidirezionale ISTAT, si identificano tutti i codici ATECO 2022 corrispondenti. Se uno o piu codici corrispondenti hanno un valore di rischio nel file esistente, si prende il **valore massimo** (criterio di prudenza). Questo approccio e stato scelto perche, in caso di fusione di piu codici 2022 in un unico codice 2025, il rischio piu alto e il piu conservativo ai fini AML.

2. **Ereditarieta di gruppo**: se nessuna corrispondenza diretta e disponibile, si cerca un codice nello stesso gruppo ATECO (stesse prime 4 cifre, es. 47.83.xx) nel file 2007 e si eredita il rischio.

3. **Fallback a livello di divisione**: come ultima risorsa, il rischio viene stimato a livello di divisione ATECO (prime 2 cifre) basandosi sui dati Transcrime/IARM e sulla direttiva Banca d'Italia 30/07/2019.

#### Risultato della mappatura

| Metodo | Codici |
|--------|--------|
| Corrispondenza diretta (tabella ISTAT) | **1.289** |
| Fallback a livello di divisione | **1** (46.89.00, corretto manualmente) |
| **Totale** | **1.290** |

### 3. Campi trasferiti per ogni codice

Per ciascun codice ATECO 2025, dal corrispondente codice ATECO 2007 sono stati trasferiti:

| Campo | Descrizione | Criterio |
|-------|-------------|----------|
| `rischio_indicativo` | Livello di rischio 1-4 | Valore massimo tra i codici corrispondenti |
| `rischio_indicativo_label` | Etichetta testuale del rischio | Derivata dal valore numerico |
| `alto_rischio_banca_italia` | Flag settore ad alto rischio BdI | `true` se almeno uno dei codici corrispondenti ha il flag |
| `fonte_rischio` | Motivazione del livello di rischio | Dal codice corrispondente con rischio piu alto |

### 4. Correzioni manuali

Un solo codice ha richiesto correzione manuale:

- **46.89.00** - Commercio all'ingrosso specializzato di altri prodotti n.c.a.
  - Nessuna corrispondenza trovata nella tabella bidirezionale a livello 6
  - Rischio assegnato: **3** (abbastanza significativo), coerente con il gruppo 46.89 del file ATECO 2007
  - `alto_rischio_banca_italia`: false

### 5. Revisione e allineamento all'Excel di riferimento (v4 - giugno 2026)

La mappatura meccanica 2007→2025 descritta sopra costituisce la **genesi** del file. I valori attuali sono stati successivamente allineati al file Excel di riferimento `codici_ateco_2025_rischio_v4.xlsx`, che ha introdotto una revisione rispetto alla prima versione:

- **13** livelli `rischio_indicativo` rivisti;
- **11** flag `alto_rischio_banca_italia` rivisti (totale settori a `true`: **185**);
- **tutte le 1.290** motivazioni `fonte_rischio` riscritte, con citazioni puntuali e datate (ANR MEF 2024, Provv. Banca d'Italia 30/07/2019 agg. 2023 e 2025, Transcrime IARM);
- metadati `fonti` e `note` aggiornati di conseguenza.

Da questa versione l'**Excel di riferimento è il source-of-truth**: lo script di generazione è stato rimosso e il JSON va mantenuto allineato all'Excel.

---

## Confronto ATECO 2007 vs ATECO 2025

### Dimensioni

| | ATECO 2007 (agg. 2022) | ATECO 2025 |
|---|---|---|
| Sezioni | 21 (A-U) | 22 (A-V) |
| Divisioni | 88 | 87 |
| Sottocategorie | 1.241 | 1.290 |

### Distribuzione del rischio

| Livello di rischio | ATECO 2007 | ATECO 2025 |
|---|---|---|
| 1 - Non significativo | 410 (33,0%) | 395 (30,6%) |
| 2 - Poco significativo | 496 (40,0%) | 487 (37,8%) |
| 3 - Abbastanza significativo | 117 (9,4%) | 84 (6,5%) |
| 4 - Molto significativo | 218 (17,6%) | 324 (25,1%) |

| Flag | ATECO 2007 | ATECO 2025 |
|---|---|---|
| Alto rischio Banca d'Italia | 136 | 185 |

> **Nota**: L'aumento dei codici a rischio 4 e dei flag `alto_rischio_banca_italia` nell'ATECO 2025 e dovuto principalmente allo split di codici 2007 in sottocategorie piu specifiche. Ad esempio, un codice 2007 con rischio 4 che viene suddiviso in 3 codici 2025 produce 3 codici a rischio 4. Non rappresenta un aumento reale del rischio complessivo del sistema economico.

### Principali differenze strutturali ATECO 2025

- La **divisione 45** (commercio autoveicoli e motocicli) e stata eliminata: il commercio al dettaglio di motocicli e ora in **47.83**, il commercio all'ingrosso in **46.49**
- Nuova **sezione K**: Telecomunicazioni, programmazione e consulenza informatica (scorporata dalla vecchia sezione J)
- Nuove classi per: produzione additiva (28.97), energie rinnovabili (35.12), economia circolare, intermediazione digitale

---

## Fonti del rischio

Le motivazioni nel campo `fonte_rischio` e i livelli di rischio si basano sulle seguenti fonti (allineate ai metadati del JSON, edizione v4):

1. **Transcrime/IARM (2017)** - Università Cattolica del Sacro Cuore: "Il rischio riciclaggio in Italia" (progetto IARM, dati ~2014-2015) - indice composito di rischio per divisione ATECO. Fonte fondativa ma datata: il rischio settoriale corrente è ancorato all'**ANR MEF 2024**
2. **Banca d'Italia** - Provvedimento 30 luglio 2019 "Disposizioni in materia di adeguata verifica della clientela", modificato dal Provv. 13 giugno 2023 e successive modifiche (gennaio 2025); estensione Provv. 23 luglio 2025 - fattori di alto rischio per adeguata verifica rafforzata (Allegato 2)
3. **UIF** (Unità di Informazione Finanziaria, Banca d'Italia) - Indicatori di anomalia (provvedimento 12 maggio 2023) e Rapporto Annuale
4. **D.Lgs. 231/2007** - Normativa antiriciclaggio italiana, fattori di rischio
5. **EU Supranational Risk Assessment (SNRA)** - Valutazione rischio sovranazionale
6. **NKM Consulting** - Classificazione settori ad alto rischio basata su normativa Banca d'Italia

---

## Avvertenze

- Il valore `rischio_indicativo` **NON e una classificazione ufficiale**. E un valore orientativo elaborato incrociando piu fonti istituzionali.
- La valutazione definitiva del rischio deve considerare tutti i fattori previsti dal **D.Lgs. 231/2007** e dalle **Regole Tecniche CNDCEC**: attivita, area geografica, natura giuridica, comportamento, tipo di operazione, importo, durata.
- I valori di rischio sono stati **mappati meccanicamente** dalla classificazione ATECO 2007 tramite la tabella di corrispondenza ufficiale ISTAT. In caso di attivita economiche nuove o significativamente ristrutturate nell'ATECO 2025, il rischio ereditato potrebbe non riflettere pienamente le caratteristiche della nuova classificazione.
- Il campo `alto_rischio_banca_italia` si basa sulla direttiva Banca d'Italia del 30/07/2019, che fa riferimento alla classificazione ATECO 2007. L'aggiornamento della direttiva alla nuova classificazione ATECO 2025 potrebbe comportare variazioni.

---

## Struttura del file JSON

```json
{
  "metadata": {
    "descrizione": "...",
    "versione_ateco": "ATECO 2025 (in vigore dal 1 aprile 2025)",
    "data_generazione": "2026-06-08",
    "totale_codici": 1290,
    "livelli_rischio": ["1 - Non significativo", "2 - Poco significativo", "3 - Abbastanza significativo", "4 - Molto significativo"],
    "fonti": ["..."],
    "note": "..."
  },
  "codici": [
    {
      "codice": "XX.XX.XX",
      "attivita": "Descrizione attivita economica",
      "rischio_indicativo": 1-4,
      "rischio_indicativo_label": "non significativo | poco significativo | abbastanza significativo | molto significativo",
      "alto_rischio_banca_italia": true | false,
      "fonte_rischio": "Motivazione del livello di rischio assegnato"
    }
  ]
}
```

---

*File creato il 26 marzo 2026; valori allineati al file di riferimento `codici_ateco_2025_rischio_v4.xlsx` l'8 giugno 2026.*
*Nota: lo script Node.js di generazione è stato rimosso; il JSON è ora mantenuto in sincronia con l'Excel di riferimento.*
