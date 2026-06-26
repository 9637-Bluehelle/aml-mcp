# Piano d'Azione - AdeguataVerifica.Pro
## Evoluzione della Piattaforma AML

**Data:** 3 Marzo 2026
**Versione:** 2.0
**Stato:** IMPLEMENTAZIONE COMPLETATA - Fase 1, 2, 3 (parziale)

---

## 1. CONTESTO E OBIETTIVI

La piattaforma AdeguataVerifica.Pro implementa gli obblighi antiriciclaggio previsti dal D.Lgs. 231/2007 e dalle Regole Tecniche CNDCEC 2019/2025. L'analisi della documentazione di riferimento e del codice esistente ha evidenziato tre aree prioritarie di intervento:

1. **Centralità del Fascicolo Cliente** - Rendere il fascicolo cliente il perno dell'intera piattaforma
2. **Verifica algoritmo rischio effettivo** - Validare la correttezza del calcolo R_eff = 0.30 × R_inerente + 0.70 × R_specifico
3. **Titolare Effettivo e catene di controllo** - Implementare la gestione completa delle catene partecipative

---

## 2. AUDIT DELL'ALGORITMO DI RISCHIO EFFETTIVO

### 2.1 Stato attuale del codice (`src/lib/calculations.ts`)

**Funzione `calculateRT2Scores` (righe 84-137)**

```
Formula implementata: R_effettivo = 0.30 × R_inerente_prestazione + 0.70 × R_specifico
```

#### Verifica della conformità alle Linee Guida CNDCEC (par. 2.3, pag. 29):

| Aspetto | Linee Guida | Codice | Conforme? |
|---------|-------------|--------|-----------|
| Ponderazione rischio inerente | 30% | `0.3 * inerentePrestazione` | ✅ SI |
| Ponderazione rischio specifico | 70% | `0.7 * rischioSpecifico` | ✅ SI |
| R_specifico standard | (TotA + TotB) / 10 | `(totaleA + totaleB) / 10` | ✅ SI |
| R_specifico solo Tab.A | TotA / 4 | `totaleA / 4` | ✅ SI |
| Eccezione onlyTabA | Rev.legale, contabilità | `prestazione.onlyTabA` | ✅ SI |
| PPE → rischio forzato a 4 | Verifica rafforzata obbligatoria | `rischioEffettivo = 4.0` | ✅ SI |
| Scala rischio | 1-4 (non è ammesso zero) | Score minimo = 1 | ✅ SI |

#### Matrice di rischio effettivo (dalla documentazione, par. 2.3):

```
                   R_SPECIFICO
                   1(ns)    2(ps)    3(as)    4(ms)
R_INERENTE  1(ns)  1.00     1.70     2.40     3.10
            2(ps)  1.30     2.00     2.70     3.40
            3(as)  1.60     2.30     3.00     3.70
            4(ms)  1.90     2.60     3.30     4.00
```

**Verifica formula**: R_eff = 0.3 × R_in + 0.7 × R_sp
- R_in=1, R_sp=1 → 0.3 + 0.7 = 1.00 ✅
- R_in=4, R_sp=1 → 1.2 + 0.7 = 1.90 ✅
- R_in=1, R_sp=4 → 0.3 + 2.8 = 3.10 ✅
- R_in=4, R_sp=4 → 1.2 + 2.8 = 4.00 ✅

#### Classificazione rischio effettivo:

| Range | Classificazione | Adeguata Verifica | Codice |
|-------|----------------|-------------------|--------|
| 1.00 - 1.50 | Non significativo | Semplificata | Da verificare nel componente RT2 |
| 1.60 - 2.50 | Poco significativo | Semplificata | Da verificare nel componente RT2 |
| 2.60 - 3.50 | Abbastanza significativo | Ordinaria | Da verificare nel componente RT2 |
| 3.60 - 4.00 | Molto significativo | Rafforzata | Da verificare nel componente RT2 |

### 2.2 Problemi rilevati nell'algoritmo

| # | Problema | Severità | Dettaglio |
|---|---------|----------|-----------|
| A1 | **Soglie di classificazione da verificare nel componente UI** | MEDIA | La funzione `calculateRT2Scores` restituisce il valore numerico ma la mappatura a classi di rischio (1-4) e la determinazione del tipo di adeguata verifica avviene nel componente `RT2AdeguataVerifica.tsx` (131KB). Necessaria verifica che le soglie 1.0-1.5/1.6-2.5/2.6-3.5/3.6-4.0 siano implementate correttamente |
| A2 | **Arrotondamento a 2 decimali** | BASSA | `toFixed(2)` potrebbe introdurre errori di arrotondamento ai limiti delle soglie (es. 2.549 vs 2.550). Verificare se i valori soglia sono trattati con >= o > |
| A3 | **Mancanza di validazione input** | MEDIA | La funzione non valida che gli score siano nell'intervallo 1-4. Un valore 0 o 5 produrrebbe risultati errati |
| A4 | **PPE: logica troppo semplificata** | MEDIA | Il codice forza `rischioEffettivo = 4.0` per PPE. Le Linee Guida prevedono "verifica rafforzata obbligatoria" ma il punteggio del rischio specifico dovrebbe comunque essere calcolato e documentato, anche se il risultato finale è forzato |
| A5 | **Prestazioni multiple** | ALTA | Le Linee Guida (par. 2.1, pag. 25) prevedono che "in caso di pluralità di prestazioni rese allo stesso cliente, il rischio inerente si allinea al grado più alto". Questa logica non è implementata in `calculateRT2Scores` |

### 2.3 Verifica funzione `calculateRT1Scores` (righe 14-36)

```
Formula RT1: R_residuo = 0.40 × R_inerente + 0.60 × R_vulnerabilità
```

| Aspetto | Linee Guida (par. 4, pag. 17) | Codice | Conforme? |
|---------|-------------------------------|--------|-----------|
| Ponderazione inerente | 40% | `0.4 * inerente` | ✅ SI |
| Ponderazione vulnerabilità | 60% | `0.6 * vulnerabilita` | ✅ SI |
| Media inerente | Media 4 fattori | `(sum of 4 factors) / 4` | ✅ SI |
| Media vulnerabilità | Media 4 fattori | `(sum of 4 factors) / 4` | ✅ SI |

**RT1 risulta conforme alle specifiche.**

---

## 3. TITOLARE EFFETTIVO - CATENE DI CONTROLLO

### 3.1 Stato attuale

Il sistema gestisce il titolare effettivo tramite:
- **Tabella DB**: `titolari_effettivi` (normalizzata, con FK a `clienti`)
- **Form**: `TitolareEffettivoForm.tsx` con 4 tipi di rapporto:
  - `in_proprio` - Il cliente agisce in proprio
  - `per_conto_persone` - Per conto di altre persone fisiche
  - `societa_ente` - Per conto di società/ente
  - `caso_residuale` - Caso residuale (art. 20, co. 5)

### 3.2 Gap rispetto alla documentazione CNDCEC (Documento Ottobre 2024)

| # | Gap | Riferimento normativo | Priorità |
|---|-----|----------------------|----------|
| T1 | **Nessun supporto per catene di controllo** | Art. 20 D.Lgs. 231/2007, par. 3.3.3 del documento CNDCEC | ALTA |
| T2 | **Mancanza del criterio della soglia >25%** | Art. 20, co. 1-2: proprietà diretta/indiretta >25% del capitale | ALTA |
| T3 | **Nessun calcolo automatico della percentuale di partecipazione indiretta** | La percentuale va calcolata risalendo la catena partecipativa | ALTA |
| T4 | **Mancanza del criterio del controllo (art. 2359 c.c.)** | Quando nessuno supera il 25%: chi controlla la maggioranza dei voti in assemblea ordinaria | MEDIA |
| T5 | **Nessuna gestione dei patti parasociali** | Sindacati di voto, joint venture, controllo congiunto | MEDIA |
| T6 | **Nessuna distinzione tra proprietà diretta e indiretta** | Il form attuale non differenzia i due criteri | ALTA |
| T7 | **Mancanza del criterio residuale scalare** | Art. 20, co. 5: se nessun criterio funziona → chi ha poteri di amministrazione/direzione | MEDIA |
| T8 | **Nessun supporto per società fiduciarie** | Il professionista deve risalire al fiduciante | BASSA |
| T9 | **Mancanza gestione usufrutto/pegno** | Art. 2352 c.c.: l'usufruttuario/creditore pignoratizio può essere TE | BASSA |
| T10 | **Nessuna validazione sull'obbligo di astensione** | Se non si riesce a identificare il TE → obbligo di astensione (art. 42) | MEDIA |

### 3.3 Regole di business per catene di controllo (da implementare)

Secondo il documento CNDCEC Ottobre 2024 e le FAQ MEF/BdI/UIF del 20/11/2023:

**Regola 1 - Primo livello**: La soglia >25% si applica al capitale della società cliente

**Regola 2 - Livelli successivi**: Per risalire la catena, si applica il criterio del controllo ex art. 2359 c.c.:
- Maggioranza dei voti in assemblea ordinaria
- Voti sufficienti per influenza dominante
- Vincoli contrattuali che consentano influenza dominante

**Regola 3 - Calcolo partecipazione indiretta**:
- Se A controlla Società X (es. al 60%), e X possiede il 40% della società cliente → A ha una partecipazione indiretta nella società cliente
- La soglia del 25% si verifica sulla società cliente, non sulle società intermedie
- Si risale la catena per individuare le persone fisiche che controllano (art. 2359)

**Regola 4 - Applicazione scalare dei criteri (art. 20)**:
1. Prima si cerca chi possiede >25% del capitale (co. 1-2)
2. Se nessuno → si cerca chi controlla la maggioranza dei voti (co. 3)
3. Se nessuno → chi ha poteri di amministrazione/direzione (co. 5)

---

## 4. FASCICOLO CLIENTE CENTRALIZZATO

### 4.1 Stato attuale

Il "fascicolo cliente" è attualmente frammentato tra multiple tabelle e schermate:
- Dati anagrafici → `clienti` + `ClienteWizard`
- Titolari effettivi → `titolari_effettivi` + `Step2TitolariEffettivi`
- Incarichi → `incarichi` (all'interno di RT2)
- Valutazioni rischio → `valutazioni_rischio` (all'interno di RT2)
- Documenti → `documenti` (senza UI strutturata)
- Controlli → `controlli_costanti` (all'interno di RT3)
- Alert → `alert` (sparsi nel dashboard)

**Non esiste una vista unificata "Fascicolo Cliente"** che aggreghi tutto.

### 4.2 Requisiti per il Fascicolo Cliente (dalle Linee Guida, par. 3.1, pag. 72)

Il fascicolo del cliente deve contenere almeno:

| Sezione | Contenuto | Stato attuale |
|---------|-----------|---------------|
| **Identificazione** | Documento identità cliente, esecutore | Parziale (JSONB) |
| **Titolare Effettivo** | Dati TE, metodo di individuazione, documentazione | Parziale (form base) |
| **Dichiarazione Cliente** | Modulo AV.4 firmato | Non implementato |
| **Valutazione Rischio** | Scheda AV.1 completa e datata | Implementato (RT2) |
| **Scopo e Natura** | Descrizione prestazione, scopo, mezzi pagamento | Parziale |
| **Controllo Costante** | Storico controlli, anomalie, esiti | Implementato (RT3) |
| **Documenti di Supporto** | Visura, mandato, certificati | Parziale (upload) |
| **Check-list AV.2** | Check-list completezza fascicolo | Non implementato |
| **SOS** | Valutazioni SOS e relative decisioni | Implementato (RT3) |
| **Storicità** | Versioning e audit trail | Parziale (activity_logs) |

### 4.3 Modello proposto: Fascicolo Cliente come hub centrale

```
┌─────────────────────────────────────────────────────┐
│                  FASCICOLO CLIENTE                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Anagrafica│  │Titolari  │  │ Catena controllo  │  │
│  │ Cliente   │  │Effettivi │  │ (NUOVO)           │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │            INCARICHI / PRESTAZIONI                │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐ │ │
│  │  │ Incarico 1 │  │ Incarico 2 │  │ Incarico N │ │ │
│  │  │ ┌────────┐ │  │ ┌────────┐ │  │ ┌────────┐ │ │ │
│  │  │ │R.Inerente│ │ │ │R.Inerente│ │ │ │R.Inerente│ │ │
│  │  │ │R.Specif. │ │ │ │R.Specif. │ │ │ │R.Specif. │ │ │
│  │  │ │R.Effett. │ │ │ │R.Effett. │ │ │ │R.Effett. │ │ │
│  │  │ │Tipo AV   │ │ │ │Tipo AV   │ │ │ │Tipo AV   │ │ │
│  │  │ └────────┘ │  │ └────────┘ │  │ └────────┘ │ │ │
│  │  │ Documenti  │  │ Documenti  │  │ Documenti  │ │ │
│  │  │ Controlli  │  │ Controlli  │  │ Controlli  │ │ │
│  │  └────────────┘  └────────────┘  └────────────┘ │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │Dichiaraz.│  │Check-list│  │ Timeline /        │  │
│  │AV.4      │  │AV.2      │  │ Audit Trail       │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │              ALERT & SCADENZE                     │ │
│  │  - Completamento 30gg  - Controllo costante       │ │
│  │  - Scadenza documenti  - Rinnovo AV               │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │           ESPORTAZIONE FASCICOLO                  │ │
│  │  [PDF] [DOCX] [Stampa Completa]                   │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 5. PIANO D'AZIONE OPERATIVO

### Fase 1: Fix algoritmo e validazione (Priorità ALTA)

| Task | Descrizione | File coinvolti | Stima |
|------|-------------|----------------|-------|
| 1.1 | Aggiungere validazione input score 1-4 in `calculateRT2Scores` | `calculations.ts` | Piccola |
| 1.2 | Verificare e correggere le soglie di classificazione nel componente RT2 UI | `RT2AdeguataVerifica.tsx` | Media |
| 1.3 | Implementare logica prestazioni multiple (rischio inerente = max) | `calculations.ts`, `RT2AdeguataVerifica.tsx` | Media |
| 1.4 | Migliorare gestione PPE (calcolare e documentare rischio anche se forzato) | `calculations.ts` | Piccola |
| 1.5 | Scrivere test unitari completi per tutte le combinazioni di rischio | `__tests__/calculations.test.ts` | Media |

### Fase 2: Titolare Effettivo e catene di controllo (Priorità ALTA)

| Task | Descrizione | File coinvolti | Stima |
|------|-------------|----------------|-------|
| 2.1 | Progettare schema DB per catene partecipative | Nuova migrazione Supabase | Media |
| 2.2 | Creare modello dati per struttura societaria (nodi + archi) | Nuovo file `types/titolare-effettivo.ts` | Media |
| 2.3 | Implementare algoritmo di calcolo partecipazione indiretta | Nuovo file `lib/titolare-effettivo.ts` | Grande |
| 2.4 | Implementare applicazione scalare dei criteri art. 20 | `lib/titolare-effettivo.ts` | Media |
| 2.5 | Creare UI per inserimento catena di controllo (grafo visuale) | Nuovo componente | Grande |
| 2.6 | Integrare validazione >25% con warning/obbligo astensione | Componenti wizard + RT2 | Media |
| 2.7 | Aggiungere gestione patti parasociali e controllo congiunto | DB + UI + logica | Media |
| 2.8 | Test unitari per tutti i casi del documento CNDCEC 2024 | Nuovo file test | Media |

### Fase 3: Fascicolo Cliente centralizzato (Priorità ALTA)

| Task | Descrizione | File coinvolti | Stima |
|------|-------------|----------------|-------|
| 3.1 | Progettare componente "FascicoloCliente" come hub centrale | Nuovo componente principale | Grande |
| 3.2 | Creare vista aggregata con tutte le info del cliente | Query Supabase + componente | Grande |
| 3.3 | Implementare check-list AV.2 (completezza fascicolo) | Nuovo componente + tabella DB | Media |
| 3.4 | Implementare modulo Dichiarazione Cliente AV.4 | Nuovo componente + generazione doc | Media |
| 3.5 | Implementare timeline/audit trail nel fascicolo | Componente + query activity_logs | Media |
| 3.6 | Implementare esportazione completa fascicolo (PDF/DOCX) | Logica export + template | Grande |
| 3.7 | Integrare alert e scadenze nel fascicolo | Componente alert + logica schedulazione | Media |
| 3.8 | Gestione status fascicolo (bozza, completo, archiviato) | DB + UI | Piccola |

### Fase 4: Miglioramenti e documentazione (Priorità MEDIA)

| Task | Descrizione | File coinvolti | Stima |
|------|-------------|----------------|-------|
| 4.1 | Documentare tutte le formule e riferimenti normativi nel codice | Tutti i file di calcolo | Piccola |
| 4.2 | Creare documentazione tecnica dell'algoritmo di rischio | `documentazione/` | Media |
| 4.3 | Implementare indicatori di anomalia (dal documento CNDCEC 2024) | Nuovi componenti + dati | Grande |
| 4.4 | Aggiungere data retention policy (10 anni dalla cessazione) | DB + logica | Media |

---

## 6. PRIORITÀ E SEQUENZA

```
Fase 1 ──────► Fase 2 ──────► Fase 3 ──────► Fase 4
(1-2 sett.)     (2-3 sett.)     (3-4 sett.)     (1-2 sett.)
  Fix algo       Tit. Effett.    Fascicolo       Doc & extra
  + test         + catene        centralizzato
```

**Dipendenze**:
- Fase 2 dipende parzialmente da Fase 1 (algoritmo corretto per valutazione TE/PPE)
- Fase 3 dipende da Fase 2 (il fascicolo deve includere le catene di controllo)
- Fase 4 può iniziare in parallelo con Fase 3

---

## 7. RIFERIMENTI NORMATIVI

| Documento | Sezioni chiave |
|-----------|---------------|
| D.Lgs. 231/2007 | Artt. 17-30 (adeguata verifica), Art. 20 (titolare effettivo), Art. 42 (astensione) |
| Regole Tecniche CNDCEC 2019/2025 | RT1 (autovalutazione), RT2 (adeguata verifica), RT3 (conservazione), RT4 (controllo costante) |
| Linee Guida CNDCEC 22/05/2019 | Parte I (autovalutazione), Parte II (adeguata verifica), Parte III (conservazione) |
| Documento CNDCEC Ottobre 2024 | "L'individuazione del titolare effettivo nelle società e negli enti di diritto privato" |
| Indicatori anomalia CNDCEC 2024 | Provvedimento UIF 12/05/2023, analisi per commercialisti |
| FAQ MEF/BdI/UIF 20/11/2023 | Chiarimenti su catene di controllo e partecipazione indiretta |
| Art. 2359 c.c. | Definizione di società controllate e collegate |
| Allegato AV.1 | Scheda determinazione rischio effettivo |
| Allegato AV.2 | Check-list fascicolo cliente |
| Allegato AV.4 | Dichiarazione del cliente ex art. 22 |

---

## 8. STATO DI IMPLEMENTAZIONE (Aggiornamento 3 Marzo 2026)

### Fase 1: Fix algoritmo e validazione - COMPLETATA

| Task | Stato | File modificati | Note |
|------|-------|----------------|------|
| 1.1 Validazione input 1-4 | ✅ COMPLETATO | `calculations.ts` | Funzioni `clampScore()`, `isValidScore()` con clamping 1.0-4.0 |
| 1.2 Classificazione rischio | ✅ COMPLETATO | `calculations.ts` | Funzione `classificaRischioEffettivo()` con 4 classi, tipo verifica e periodicità |
| 1.3 Prestazioni multiple | ✅ COMPLETATO | `calculations.ts` | `calculateRT2Scores()` accetta `string \| string[]`, usa max rischio inerente |
| 1.4 PPE migliorato | ✅ COMPLETATO | `calculations.ts` | Preserva `rischioEffettivoCalcolato` accanto al forzato 4.0 |
| 1.5 Test unitari | ✅ COMPLETATO | `calculations.test.ts` | 50 test: matrice completa RT1/RT2, multi-prestazione, PPE, clamping, classificazione |

### Fase 2: Titolare Effettivo e catene di controllo - COMPLETATA

| Task | Stato | File modificati | Note |
|------|-------|----------------|------|
| 2.1 Schema DB catene | ✅ COMPLETATO | `20260303000000_add_catena_controllo_tables.sql` | Tabelle `catena_controllo_nodi` e `catena_controllo_archi` con RLS |
| 2.2 Modello dati | ✅ COMPLETATO | `titolare-effettivo.ts` | Tipi: `NodoPartecipativo`, `ArcoPartecipativo`, `CatenaControllo`, `AnalisiTitolareEffettivo` |
| 2.3 Algoritmo partecipazione indiretta | ✅ COMPLETATO | `titolare-effettivo.ts` | `calcolaPartecipazioneIndiretta()` con traversamento catena e verifica art. 2359 |
| 2.4 Criteri scalari art. 20 | ✅ COMPLETATO | `titolare-effettivo.ts` | `analizzaTitolareEffettivo()` applica: proprietà >25% → controllo → residuale |
| 2.5 UI catena di controllo | ✅ COMPLETATO | `CatenaControlloEditor.tsx` | Aggiunta/rimozione nodi e archi, analisi TE con risultati visivi |
| 2.6 Integrazione nel wizard | ✅ COMPLETATO | `Step2TitolariEffettivi.tsx`, `types.ts`, `useClienteForm.ts`, `useClienteSave.ts` | Catena integrata nel wizard con salvataggio/caricamento DB |
| 2.7 Patti parasociali | ✅ COMPLETATO | `titolare-effettivo.ts` | Supporto: `patto_parasociale`, `controllo_congiunto`, `influenza_dominante_contratto` |
| 2.8 Test unitari TE | ✅ COMPLETATO | `titolare-effettivo.test.ts` | 16 test: proprietà diretta/indiretta, controllo, residuale, astensione, PPE |

### Fase 3: Fascicolo Cliente centralizzato - PARZIALMENTE COMPLETATA

| Task | Stato | File modificati | Note |
|------|-------|----------------|------|
| 3.1 Componente hub centrale | ✅ COMPLETATO | `FascicoloCliente.tsx` | 7 tab: Anagrafica, Titolari, Incarichi/Rischio, Documenti, Check-list AV.2, Timeline, Alert |
| 3.2 Vista aggregata | ✅ COMPLETATO | `FascicoloCliente.tsx` | Query multiple su clienti, titolari, incarichi, valutazioni, documenti, alert, logs |
| 3.3 Check-list AV.2 | ✅ COMPLETATO | `FascicoloCliente.tsx` | 16 item auto-valutati dai dati, percentuale completezza |
| 3.4 Dichiarazione AV.4 | ⏳ DA FARE | - | Generazione modulo firmabile |
| 3.5 Timeline/audit trail | ✅ COMPLETATO | `FascicoloCliente.tsx` | Visualizzazione activity_logs per cliente |
| 3.6 Esportazione PDF | ⏳ DA FARE | - | Placeholder presente, logica da implementare |
| 3.7 Alert nel fascicolo | ✅ COMPLETATO | `FascicoloCliente.tsx` | Tab Alert con lista alert per cliente |
| 3.8 Status fascicolo | ⏳ DA FARE | - | |
| 3.9 Navigazione | ✅ COMPLETATO | `Layout.tsx`, `App.tsx` | Tab "Fascicolo Cliente" con icona BookOpen |

### Riepilogo test

```
Test Files  5 passed (5)
      Tests  173 passed (173)
   - calculations.test.ts:     50 test
   - titolare-effettivo.test.ts: 16 test
   - utils.test.ts:             41 test
   - aml-data.test.ts:          19 test
   - rt1-wizard utils.test.ts:  47 test
```

### File creati/modificati

| File | Tipo | Descrizione |
|------|------|-------------|
| `src/lib/calculations.ts` | Modificato | Validazione input, classificazione, multi-prestazione, PPE migliorato |
| `src/lib/titolare-effettivo.ts` | Nuovo | Algoritmo completo TE con catene di controllo (art. 20 D.Lgs. 231/2007) |
| `src/lib/__tests__/calculations.test.ts` | Riscritto | 50 test completi per algoritmo rischio |
| `src/lib/__tests__/titolare-effettivo.test.ts` | Nuovo | 16 test per algoritmo TE |
| `src/components/cliente-wizard/components/CatenaControlloEditor.tsx` | Nuovo | UI per editing catena di controllo |
| `src/components/FascicoloCliente.tsx` | Nuovo | Hub centrale fascicolo cliente (7 tab) |
| `src/components/cliente-wizard/types.ts` | Modificato | Aggiunto campo `catena_controllo` a WizardData |
| `src/components/cliente-wizard/hooks/useClienteForm.ts` | Modificato | Caricamento catena da DB |
| `src/components/cliente-wizard/hooks/useClienteSave.ts` | Modificato | Salvataggio catena su DB |
| `src/components/cliente-wizard/components/Step2TitolariEffettivi.tsx` | Modificato | Integrazione CatenaControlloEditor |
| `src/components/Layout.tsx` | Modificato | Tab "Fascicolo Cliente" |
| `src/App.tsx` | Modificato | Routing per FascicoloCliente |
| `supabase/migrations/20260303000000_add_catena_controllo_tables.sql` | Nuovo | Tabelle DB catena con RLS |
| `documentazione/PIANO_AZIONE_AML.md` | Nuovo/Aggiornato | Questo documento |
