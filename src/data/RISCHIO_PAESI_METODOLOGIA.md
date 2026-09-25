# Metodologia di costruzione del file `rischio_paesi.json`

**Data generazione:** 5 giugno 2026
**Totale paesi:** 193
**Base anagrafica:** Codici Belfiore (Agenzia delle Entrate) — stati esteri con provincia "EE"

---

## 1. Fonti utilizzate

### Fonte 1: FATF — Black List e Grey List (febbraio 2026)
Il GAFI (Gruppo d'Azione Finanziaria Internazionale) pubblica due liste aggiornate a ogni plenaria (febbraio, giugno, ottobre):

- **Black List** ("High-Risk Jurisdictions subject to a Call for Action"): giurisdizioni ad alto rischio soggette a contromisure. Al febbraio 2026: **Corea del Nord, Iran, Myanmar**.
- **Grey List** ("Jurisdictions under Increased Monitoring"): giurisdizioni sotto sorveglianza rafforzata. Al febbraio 2026: **22 giurisdizioni** tra cui Algeria, Angola, Bolivia, Bulgaria, Camerun, Costa d'Avorio, RD Congo, Haiti, Kenya, Kuwait, Laos, Libano, Monaco, Namibia, Nepal, Papua Nuova Guinea, Sud Sudan, Siria, Venezuela, Vietnam, Isole Vergini Britanniche, Yemen.

Riferimenti:
- [FATF — Black and Grey Lists](https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html)
- [ComplyAdvantage — FATF Guide 2026](https://complyadvantage.com/insights/fatf-blacklists-greylists/)
- [Enderley Consulting — February 2026 Update](https://enderleyconsulting.co.uk/changes-to-the-fatf-black-list-and-grey-list-february-2026-update/)

### Fonte 2: UE — Lista Paesi terzi ad alto rischio (dicembre 2025)
La Commissione Europea pubblica un elenco di paesi terzi con carenze strategiche nei sistemi AML/CFT, ai sensi dell'art. 9 della Direttiva (UE) 2015/849. Aggiornamento dicembre 2025 (Reg. Delegati (UE) 2026/46 e 2026/83): **26 giurisdizioni**.

Paesi in lista: Afghanistan, Algeria, Angola, Bolivia, Isole Vergini Britanniche, Camerun, Costa d'Avorio, Corea del Nord, RD Congo, Haiti, Iran, Kenya, Laos, Libano, Monaco, Myanmar, Namibia, Nepal, Federazione Russa, Sud Sudan, Siria, Trinidad e Tobago, Vanuatu, Venezuela, Vietnam, Yemen.

Riferimenti:
- [European Commission — High-risk countries update December 2025](https://finance.ec.europa.eu/news/european-commission-updates-list-high-risk-countries-strengthen-international-fight-against-2025-12-04_en)
- [Anti-Money-Laundering.eu — EU List December 2025](https://anti-money-laundering.eu/eu-list-of-high-risk-third-countries-december-2025/)

### Fonte 3: Basel AML Index 2025
Il Basel Institute on Governance pubblica annualmente un indice composito di rischio riciclaggio per 177 giurisdizioni (scala 0-10, dove 10 = rischio massimo), basato su 18 indicatori inclusi: qualità del framework AML/CFT, corruzione, trasparenza finanziaria, accountability pubblica, rischi politici e legali.

Riferimenti:
- [Basel AML Index 2025](https://baselgovernance.org/publications/basel-aml-index-2025)
- [Basel AML Index — Public Ranking](https://index.baselgovernance.org/ranking)

### Fonte 4: CPI 2025 — Transparency International
L'Indice di Percezione della Corruzione (Corruption Perceptions Index) classifica 182 paesi su scala 0-100 (dove 100 = assenza di corruzione). Edizione 2025 pubblicata il 10 febbraio 2026. È la fonte standard citata nella prassi professionale per il fattore di rischio "paesi con elevata corruzione" delle Regole Tecniche CNDCEC.

Riferimenti:
- [CPI 2025 — Transparency International](https://www.transparency.org/en/cpi/2025)
- [CPI 2025 — Report completo (PDF)](https://files.transparencycdn.org/images/CPI-2025-Report-EN.pdf)
- [World Population Review — CPI by Country](https://worldpopulationreview.com/country-rankings/corruption-perceptions-index-by-country)

### Riferimenti normativi italiani
- **D.Lgs. 231/2007, art. 24**: Obblighi di adeguata verifica rafforzata per paesi terzi ad alto rischio
- **Regole Tecniche CNDCEC 2025**: Criterio A.4 (paesi terzi ad alto rischio / non collaborativi GAFI) e B.6 (area geografica di destinazione dell'operazione)

---

## 2. Metodologia di calcolo del rischio (scala 1-4)

### Passaggio 2.1 — Conversione Basel AML Index → scala 1-4

| Basel AML Score | Rischio assegnato | Etichetta |
|-----------------|-------------------|-----------|
| < 4.0 | 1 | Non significativo |
| 4.0 – 4.99 | 1 | Non significativo |
| 5.0 – 5.99 | 2 | Poco significativo |
| 6.0 – 6.99 | 3 | Abbastanza significativo |
| ≥ 7.0 | 4 | Molto significativo |

### Passaggio 2.2 — Conversione CPI → scala 1-4 (inversa)

| CPI Score | Rischio assegnato | Etichetta |
|-----------|-------------------|-----------|
| > 50 | 1 | Non significativo |
| 36 – 50 | 2 | Poco significativo |
| 21 – 35 | 3 | Abbastanza significativo |
| ≤ 20 | 4 | Molto significativo |

### Passaggio 2.3 — Media pesata

Il rischio base è calcolato come media pesata arrotondata:

```
rischio_base = round(rischio_Basel × 0.6 + rischio_CPI × 0.4)
```

Il Basel AML Index ha peso maggiore (60%) perché è specifico per il rischio riciclaggio, mentre il CPI misura la corruzione percepita in senso più ampio.

Se solo una delle due fonti è disponibile, si usa quella singola fonte.

### Passaggio 2.4 — Override istituzionali

Dopo il calcolo della media pesata, si applicano i seguenti override:

| Condizione | Override |
|------------|----------|
| Paese in FATF Black List | rischio = 4 (automatico) |
| Paese in FATF Grey List | rischio = max(rischio_base, 3) |
| Paese in Lista UE alto rischio | rischio = max(rischio_base, 3) |

Questi override riflettono gli obblighi di adeguata verifica rafforzata previsti dal D.Lgs. 231/2007, art. 24.

---

## 3. Struttura del file JSON

```json
{
  "codice_belfiore": "Z224",
  "nome_it": "Iran",
  "nome_en": "Iran",
  "rischio_calcolato": 4,
  "rischio_label": "molto significativo",
  "fatf_status": "black_list",
  "eu_alto_rischio": true,
  "basel_aml_score": null,
  "cpi_score": 23,
  "fonte_rischio": "FATF Black List (Call for Action) — feb 2026 | Lista UE Paesi terzi ad alto rischio (Reg. Delegato dic. 2025) | CPI 2025 (Transparency International): 23/100"
}
```

### Descrizione dei campi

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `codice_belfiore` | string | Codice catastale Agenzia delle Entrate (Zxxx) |
| `nome_it` | string | Nome del paese in italiano |
| `nome_en` | string | Nome del paese in inglese (per matching con fonti) |
| `rischio_calcolato` | integer (1-4) | Valore orientativo del rischio AML |
| `rischio_label` | string | Etichetta testuale del livello di rischio |
| `fatf_status` | string/null | `"black_list"`, `"grey_list"` o `null` |
| `eu_alto_rischio` | boolean | `true` se nella lista UE paesi terzi ad alto rischio |
| `basel_aml_score` | number/null | Score Basel AML Index (0-10) |
| `cpi_score` | number/null | Score CPI Transparency International (0-100) |
| `fonte_rischio` | string | Riepilogo sintetico delle fonti considerate |

---

## 4. Distribuzione finale dei livelli di rischio

| Livello | Etichetta | N. paesi | % |
|---------|-----------|----------|---|
| 1 | Non significativo | 68 | 35,2% |
| 2 | Poco significativo | 63 | 32,6% |
| 3 | Abbastanza significativo | 40 | 20,7% |
| 4 | Molto significativo | 22 | 11,4% |

---

## 5. Limitazioni e avvertenze

1. **Il campo `rischio_calcolato` non è una classificazione ufficiale.** Nessuna autorità italiana pubblica una mappatura paese → rischio 1-4 completa. La valutazione del rischio geografico ai sensi del D.Lgs. 231/2007 è multifattoriale e caso per caso.

2. **Le liste FATF e UE cambiano periodicamente.** La Black/Grey List viene aggiornata 3 volte l'anno (febbraio, giugno, ottobre). La lista UE viene aggiornata con Regolamenti delegati.

3. **Il Basel AML Index non copre tutti i paesi.** Alcune giurisdizioni (es. Russia, Somalia, Libia) non hanno score disponibile per mancanza di dati o esclusione dall'indice.

4. **Il CPI misura la corruzione percepita, non il rischio riciclaggio specifico.** È un proxy utile ma non diretto.

5. **I paesi con `rischio_calcolato` = 1 non sono necessariamente privi di rischi AML.** Il livello 1 indica che le fonti istituzionali considerate non evidenziano fattori di rischio elevato a livello paese, ma la valutazione caso per caso può portare a conclusioni diverse.

6. **L'Italia non è inclusa** perché il file è pensato per la valutazione del rischio geografico del cliente/operazione rispetto a giurisdizioni estere.

---

## 6. Riepilogo fonti

| # | Fonte | Tipo | URL |
|---|-------|------|-----|
| 1 | FATF — Black and Grey Lists | Liste giurisdizioni ad alto rischio | [fatf-gafi.org](https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html) |
| 2 | UE — Reg. Delegati 2026/46 e 2026/83 | Lista paesi terzi ad alto rischio | [finance.ec.europa.eu](https://finance.ec.europa.eu/financial-crime/anti-money-laundering-and-countering-financing-terrorism-international-level_en) |
| 3 | Basel AML Index 2025 | Indice composito rischio ML per paese | [baselgovernance.org](https://baselgovernance.org/publications/basel-aml-index-2025) |
| 4 | CPI 2025 — Transparency International | Indice percezione corruzione | [transparency.org/en/cpi/2025](https://www.transparency.org/en/cpi/2025) |
| 5 | D.Lgs. 231/2007 | Normativa antiriciclaggio italiana | [gazzettaufficiale.it](https://www.gazzettaufficiale.it/eli/id/2007/12/14/007G0260/sg) |
| 6 | Regole Tecniche CNDCEC 2025 | Scala 1-4, criteri A.4 e B.6 | [commercialisti.it](https://commercialisti.it/wp-content/uploads/2024/07/Linee_Guida_20052019DEFINITIVO.pdf) |
