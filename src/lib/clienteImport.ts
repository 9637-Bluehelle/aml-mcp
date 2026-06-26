// ============================================================================
// Import massivo clienti da file Excel/CSV
// ----------------------------------------------------------------------------
// Estrae, pulisce e normalizza righe da un foglio di calcolo e le trasforma in
// clienti, replicando la cascata del wizard (anagrafica_soggetti ↔ clienti via
// persona_id). Mapping colonne basato sui nomi delle intestazioni (con sinonimi
// e tolleranza ad accenti/maiuscole), correggibile a mano nella UI.
//
// Catalogo volutamente SNELLO: solo i dati anagrafici di base che i file tipici
// contengono. Documento d'identità, PEP/sanzioni, ATECO, ecc. si completano nel
// wizard → tutti gli import nascono come BOZZA.
//
// Regole:
//  - tipo cliente: persona fisica con P.IVA → professionista; persona giuridica
//    → impresa (solo dati scalari).
//  - duplicati: stesso CF + stesso tipo già a sistema o nel file → saltato.
//    Stesso CF ma tipo diverso (persona + azienda/ditta individuale) → caricati
//    entrambi con un'unica anagrafica condivisa (dedup per CF in savePersona).
//  - codice_cliente: formato dello studio; se 'manuale' → `${prefisso}-${CF|P.IVA}`.
// ============================================================================

import * as XLSX from 'xlsx';
// cpexcel abilita la decodifica delle code page legacy (es. Windows-1252 dei
// vecchi .xls): senza, "Crisà"/"Nazionalità" diventano mojibake "Cris�".
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';
import { supabase } from './supabase';
import { savePersona } from './personeHelper';
import { parseCodiceFiscale, normalizeDate } from '../components/cliente-wizard/components/forms/PersonaFisicaForm';
import { formatDateForDB, isValidDate } from '../components/cliente-wizard/utils';
import { generateCodiceCliente, loadImpostazioni, type ImpostazioniStudio } from './codiceGenerator';
import { getActiveStudioIdHolder } from './studioHelper';
import { normalizeNazionalita, getNazioneByNazionalita, isItaliana } from './nazionalitaHelper';

try { XLSX.set_cptable(cptable); } catch { /* in alcuni ambienti il cptable è già incorporato */ }

export type TipoClienteImport = 'persona_fisica' | 'professionista' | 'impresa';
export type RowStatus = 'ok' | 'warning' | 'error' | 'duplicate';

/** Campi canonici ("dati necessari") riconoscibili nelle intestazioni del file. */
export type CanonicalField =
  | 'tipoSoggetto'
  | 'cognome' | 'nome' | 'ragioneSociale' | 'codiceFiscale' | 'partitaIva' | 'nazionalita'
  | 'luogoNascita' | 'provinciaNascita' | 'dataNascita'
  | 'naturaGiuridica'
  | 'indirizzo' | 'cap' | 'comune' | 'provincia' | 'paese';

/** Metadati di un campo canonico, per la UI di mapping. */
export interface CanonicalFieldDef {
  key: CanonicalField;
  /** Numero d'ordine (1-based) mostrato nel badge. */
  order: number;
  label: string;
  group: string;
}

/** Elenco ordinato dei "dati necessari". L'`order` è il numeretto del badge. */
export const CANONICAL_FIELDS: CanonicalFieldDef[] = [
  { key: 'tipoSoggetto', order: 1, label: 'Tipo soggetto', group: 'Generale' },

  { key: 'cognome', order: 2, label: 'Cognome', group: 'Anagrafica' },
  { key: 'nome', order: 3, label: 'Nome', group: 'Anagrafica' },
  { key: 'ragioneSociale', order: 4, label: 'Ragione sociale / denominazione (impresa)', group: 'Anagrafica' },
  { key: 'codiceFiscale', order: 5, label: 'Codice fiscale', group: 'Anagrafica' },
  { key: 'partitaIva', order: 6, label: 'Partita IVA', group: 'Anagrafica' },
  { key: 'nazionalita', order: 7, label: 'Nazionalità', group: 'Anagrafica' },
  { key: 'naturaGiuridica', order: 8, label: 'Natura giuridica (impresa)', group: 'Anagrafica' },

  { key: 'luogoNascita', order: 9, label: 'Luogo di nascita', group: 'Nascita' },
  { key: 'provinciaNascita', order: 10, label: 'Provincia di nascita', group: 'Nascita' },
  { key: 'dataNascita', order: 11, label: 'Data di nascita', group: 'Nascita' },

  { key: 'indirizzo', order: 12, label: 'Indirizzo', group: 'Indirizzo' },
  { key: 'cap', order: 13, label: 'CAP', group: 'Indirizzo' },
  { key: 'comune', order: 14, label: 'Comune / città', group: 'Indirizzo' },
  { key: 'provincia', order: 15, label: 'Provincia', group: 'Indirizzo' },
  { key: 'paese', order: 16, label: 'Paese', group: 'Indirizzo' },
];

const FIELD_BY_KEY: Record<CanonicalField, CanonicalFieldDef> =
  Object.fromEntries(CANONICAL_FIELDS.map(f => [f.key, f])) as Record<CanonicalField, CanonicalFieldDef>;

export function getFieldDef(key: CanonicalField): CanonicalFieldDef {
  return FIELD_BY_KEY[key];
}

/** Mapping esplicito colonna→campo scelto dall'utente. La chiave è l'indice di
 *  colonna nel file; il valore `null`/assente significa "ignora la colonna". */
export type ColumnMapping = Record<number, CanonicalField | null>;

/** Colonna rilevata nel file, con valori di esempio per aiutare il mapping. */
export interface DetectedColumn {
  index: number;
  name: string;
  samples: string[];
}

/** Una riga candidata a essere l'intestazione, con anteprima leggibile. */
export interface HeaderRowOption {
  /** Indice 0-based della riga nel foglio. */
  index: number;
  /** Anteprima delle prime celle non vuote, per riconoscere la riga giusta. */
  preview: string;
}

/** Analisi del file pronta per la UI di mapping. */
export interface WorkbookAnalysis {
  sheetName: string;
  /** Nomi di tutti i fogli del file (per consentire la scelta quando sono >1). */
  sheetNames: string[];
  /** Indice del foglio analizzato. */
  sheetIndex: number;
  columns: DetectedColumn[];
  /** Accoppiamento automatico proposto (colonna→campo). */
  autoMapping: ColumnMapping;
  /** Indice della riga usata come intestazione (-1 se il foglio è vuoto). */
  headerRowIndex: number;
  /** Prime righe non vuote del foglio, per consentire all'utente di scegliere
   *  manualmente quale contiene le intestazioni (es. file con riga di titolo). */
  headerOptions: HeaderRowOption[];
}

/** Dati cliente puliti e normalizzati, pronti per l'inserimento. */
export interface NormalizedCliente {
  tipo_cliente: TipoClienteImport;
  ragione_sociale: string;     // "COGNOME NOME" o denominazione impresa
  codice_fiscale: string;
  partita_iva: string;
  data_nascita: string;        // dd/mm/yyyy
  luogo_nascita: string;
  provincia_nascita: string;
  nazionalita: string;
  natura_giuridica: string;
  indirizzo: string;           // indirizzo completo composto
  paese: string;
}

export interface RowReport {
  /** Numero di riga nel file (1-based, come in Excel/CSV): è il riferimento che
   *  l'utente vede nel foglio originale, intestazione inclusa nel conteggio.
   *  Usato anche come chiave stabile per selezione/esiti. */
  index: number;
  raw: Record<string, unknown>;
  normalized: NormalizedCliente;
  status: RowStatus;
  /** Note leggibili (warning di pulizia, motivo dell'errore/duplicato). */
  messages: string[];
}

export interface ParseResult {
  sheetName: string;
  rows: RowReport[];
  /** Intestazioni del file non riconosciute (ignorate). */
  unmappedHeaders: string[];
  /** Conteggi per stato, per la UI di anteprima. */
  summary: { total: number; ok: number; warning: number; error: number; duplicate: number };
}

export interface ImportOutcome {
  index: number;
  ragione_sociale: string;
  ok: boolean;
  skipped?: boolean;
  clienteId?: string;
  codice_cliente?: string;
  status?: 'draft' | 'active';
  error?: string;
  /** Avviso non bloccante su un inserimento andato a buon fine (es. anagrafica
   *  non collegata perché `savePersona` non ha restituito un id). */
  warning?: string;
}

// ==================== HELPER DI PULIZIA ====================

/** Normalizza un'intestazione per il matching: minuscole, niente accenti,
 *  punteggiatura → spazio, spazi collassati. */
function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .toLowerCase()
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // rimuove diacritici
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Trim + collasso degli spazi interni. Mantiene maiuscole/minuscole originali. */
function cleanText(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** CF: maiuscolo, senza spazi/punteggiatura. Se risulta di sole 10 cifre è quasi
 *  certamente un CF di società che Excel ha memorizzato come numero perdendo lo
 *  zero iniziale (il CF persona è 16 alfanumerici): lo reintegriamo a 11.
 *  Importante per la deduplica, che usa il CF come chiave. */
function cleanCF(v: unknown): string {
  const cf = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^\d{10}$/.test(cf) ? `0${cf}` : cf;
}

/** P.IVA: solo cifre. La P.IVA italiana è di 11 cifre: se Excel l'ha memorizzata
 *  come numero perdendo lo zero iniziale (10 cifre) lo reintegriamo. */
function cleanPIva(v: unknown): string {
  const digits = String(v ?? '').replace(/\D+/g, '');
  return digits.length === 10 ? `0${digits}` : digits;
}

/** Provincia: trim + maiuscolo (le sigle sono già di 2 lettere nei file tipici). */
function cleanProvincia(v: unknown): string {
  return cleanText(v).toUpperCase();
}

/** CAP italiano: 5 cifre. Se Excel l'ha memorizzato come numero perdendo gli zeri
 *  iniziali (es. "00100" → 100), li reintegriamo. Valori non numerici o già di 5+
 *  caratteri restano invariati (i CAP esteri non vengono toccati). */
function cleanCap(v: unknown): string {
  const cap = cleanText(v);
  return /^\d{1,4}$/.test(cap) ? cap.padStart(5, '0') : cap;
}

/** Converte un valore-data di varia natura in dd/mm/yyyy.
 *  Gestisce: numero seriale Excel (timezone-safe via SSF), oggetto Date,
 *  stringa ISO o dd/mm/yyyy (anche con separatori `-`/`.`). */
function cleanDate(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && isFinite(v)) {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d || !d.y) return '';
    return `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.y}`;
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    // getter LOCALI: evita lo slittamento di un giorno dovuto al fuso orario
    return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`;
  }
  return normalizeDate(String(v));
}

/** Compone un indirizzo leggibile da via + CAP + comune + provincia. */
function composeIndirizzo(via: string, cap: string, comune: string, prov: string): string {
  const tail = [cap, comune, prov && `(${prov})`].filter(Boolean).join(' ');
  return [via, tail].filter(Boolean).join(', ').trim();
}


// ==================== MAPPING INTESTAZIONI ====================

/** Associa l'indice di colonna a un campo canonico, dal nome dell'intestazione. */
function buildColumnMap(headerRow: unknown[]): {
  map: Map<number, CanonicalField>;
  unmapped: string[];
} {
  const map = new Map<number, CanonicalField>();
  const unmapped: string[] = [];

  for (let col = 0; col < headerRow.length; col++) {
    const norm = normalizeHeader(headerRow[col]);
    if (!norm) continue;
    const field = matchSimpleHeader(norm);
    if (field) map.set(col, field);
    else unmapped.push(cleanText(headerRow[col]));
  }
  return { map, unmapped };
}

/** Mapping intestazione→campo, con sinonimi. */
function matchSimpleHeader(norm: string): CanonicalField | null {
  const has = (...ws: string[]) => ws.every(w => norm.includes(w));

  if (has('tipo', 'soggetto') || norm === 'tipo' || has('tipo', 'cliente')) return 'tipoSoggetto';
  if (has('ragione', 'sociale') || norm.includes('denominazione')) return 'ragioneSociale';
  if (norm === 'cognome' || has('cognome')) return 'cognome';
  if (norm === 'nome' || (norm.includes('nome') && !norm.includes('cognome'))) return 'nome';
  if (has('natura', 'giuridica') || has('forma', 'giuridica')) return 'naturaGiuridica';
  if (has('luogo', 'nascita') || has('comune', 'nascita') || norm === 'nato a') return 'luogoNascita';
  if (has('provincia', 'nascita') || has('prov', 'nascita')) return 'provinciaNascita';
  if (has('data', 'nascita') || norm === 'nato il' || has('nascita', 'gg')) return 'dataNascita';
  // "Titolare di P.IVA (Sì/No)" è un flag, non il numero: escludiamolo.
  if (!norm.includes('titolare') && (has('partita', 'iva') || norm === 'piva' || norm === 'p iva' || norm === 'vat')) return 'partitaIva';
  if (has('codice', 'fiscale') || norm === 'cf') return 'codiceFiscale';
  if (norm.includes('nazionalita') || norm.includes('cittadinanza')) return 'nazionalita';
  // Indirizzo (un solo blocco): in file con sede + domicilio, pick() prende il
  // primo valore non vuoto fra le colonne mappate, quindi entrambe vanno bene.
  if (norm.includes('indirizzo') || norm.includes('residenza') || norm === 'via') return 'indirizzo';
  if (norm === 'cap' || norm.includes('c a p') || norm.includes('codice avviamento')) return 'cap';
  if (norm.includes('provincia') || norm === 'prov' || norm === 'pr') return 'provincia';
  if (norm === 'comune' || norm === 'citta' || norm.includes('comune') || norm.includes('localita')) return 'comune';
  if (norm === 'paese' || norm === 'nazione' || norm.includes('nazione')) return 'paese';
  return null;
}

/** Estrae il valore di un campo: fra tutte le colonne mappate su quel campo
 *  restituisce il PRIMO valore non vuoto (così sede + domicilio convivono). */
function pick(row: unknown[], map: Map<number, CanonicalField>, field: CanonicalField): unknown {
  let first: unknown = '';
  let seen = false;
  for (const [col, f] of map) {
    if (f !== field) continue;
    if (!seen) { first = row[col]; seen = true; }
    if (cleanText(row[col]) !== '') return row[col];
  }
  return first;
}

// ==================== NORMALIZZAZIONE RIGA ====================

/** Determina il tipo cliente di base dalle colonne disponibili. */
function detectTipoBase(tipoSoggettoRaw: string, denominazione: string, personaName: string, cf: string): TipoClienteImport {
  const t = normalizeHeader(tipoSoggettoRaw);
  if (t.includes('giuridic') || t.includes('societ') || t.includes('impresa') || t.includes('ditta') || t.includes('azienda')) {
    return 'impresa';
  }
  if (t.includes('fisic')) return 'persona_fisica';
  // Senza indicazione esplicita: una denominazione senza nome/cognome ⇒ impresa.
  if (denominazione && !personaName) return 'impresa';
  // Fallback dal CF: 11 cifre = azienda, 16 alfanumerici = persona fisica.
  if (/^\d{11}$/.test(cf)) return 'impresa';
  return 'persona_fisica';
}

/** Pulisce e normalizza una singola riga dati. */
function normalizeRow(row: unknown[], map: Map<number, CanonicalField>): { normalized: NormalizedCliente; messages: string[]; blocking: boolean } {
  const messages: string[] = [];

  const cognome = cleanText(pick(row, map, 'cognome'));
  const nome = cleanText(pick(row, map, 'nome'));
  const denominazione = cleanText(pick(row, map, 'ragioneSociale'));
  const personaName = [cognome, nome].filter(Boolean).join(' ').trim();
  let cf = cleanCF(pick(row, map, 'codiceFiscale'));
  const piva = cleanPIva(pick(row, map, 'partitaIva'));

  const tipoBase = detectTipoBase(cleanText(pick(row, map, 'tipoSoggetto')), denominazione, personaName, cf);

  // Una persona fisica con P.IVA è un professionista.
  let tipo_cliente: TipoClienteImport = tipoBase;
  if (tipoBase === 'persona_fisica' && !!piva) tipo_cliente = 'professionista';

  // Impresa senza codice fiscale: per le persone giuridiche il CF coincide
  // tipicamente con la partita IVA → la usiamo (serve anche alla deduplica).
  if (tipo_cliente === 'impresa' && !cf && piva) {
    cf = piva;
    messages.push('Codice fiscale assente: usata la partita IVA');
  }

  const ragione_sociale = tipo_cliente === 'impresa' ? (denominazione || personaName) : personaName;

  // Date e dati nascita, con fallback dal codice fiscale (solo persone fisiche)
  let data_nascita = cleanDate(pick(row, map, 'dataNascita'));
  let luogo_nascita = cleanText(pick(row, map, 'luogoNascita'));
  let provincia_nascita = cleanProvincia(pick(row, map, 'provinciaNascita'));

  if (tipo_cliente !== 'impresa' && cf.length === 16) {
    const cfData = parseCodiceFiscale(cf);
    if (cfData) {
      if (!data_nascita && cfData.data_nascita) {
        data_nascita = normalizeDate(cfData.data_nascita);
        messages.push('Data di nascita ricavata dal codice fiscale');
      }
      if (!luogo_nascita && cfData.comune) { luogo_nascita = cfData.comune; messages.push('Luogo di nascita ricavato dal CF'); }
      if (!provincia_nascita && cfData.provincia) { provincia_nascita = cfData.provincia; messages.push('Provincia di nascita ricavata dal CF'); }
    }
  }

  const nazionalita = normalizeNazionalita(cleanText(pick(row, map, 'nazionalita')) || 'Italiana');
  const paeseRaw = cleanText(pick(row, map, 'paese'));

  // Modello del wizard per la nazione di residenza/sede:
  //  - persone fisiche/professionisti: nessuna colonna dedicata → la nazione viene
  //    incapsulata in `residenza` come "<Nazione> | <indirizzo>";
  //  - imprese: nel campo `paese` il wizard salva la NAZIONALITÀ (es. "Tedesca",
  //    NON "Germania"/"DE"), e la sede estera è comunque codificata in `indirizzo`
  //    con lo stesso separatore " | ".
  // In entrambi i casi il flag "estero" è dedotto dal separatore (isIndirizzoEstero).
  // Nazionalità di riferimento: quella del `paese` mappato (priorità) o, in mancanza,
  // quella anagrafica. Così il dato non si perde e il wizard rilegge la residenza/sede
  // come estera.
  const nazionalitaResidenza = (paeseRaw ? normalizeNazionalita(paeseRaw) : '') || nazionalita;
  const nazioneEstera = isItaliana(nazionalitaResidenza) ? '' : (getNazioneByNazionalita(nazionalitaResidenza) || '');

  // CAP: reintegriamo gli zeri iniziali solo per le residenze italiane; per le
  // estere il CAP non è un campo strutturato (codici postali di lunghezza varia).
  const capRaw = cleanText(pick(row, map, 'cap'));
  const cap = nazioneEstera ? capRaw : cleanCap(capRaw);
  const indirizzoBase = composeIndirizzo(
    cleanText(pick(row, map, 'indirizzo')), cap,
    cleanText(pick(row, map, 'comune')), cleanProvincia(pick(row, map, 'provincia')),
  );
  const indirizzo = nazioneEstera ? `${nazioneEstera} | ${indirizzoBase}` : indirizzoBase;

  const normalized: NormalizedCliente = {
    tipo_cliente,
    ragione_sociale,
    codice_fiscale: cf,
    partita_iva: piva,
    data_nascita,
    luogo_nascita,
    provincia_nascita,
    nazionalita,
    natura_giuridica: cleanText(pick(row, map, 'naturaGiuridica')),
    indirizzo,
    // Per l'impresa `paese` è la NAZIONALITÀ attesa dal wizard (es. "Italiana"),
    // non il nome della nazione/ISO. Per le persone il campo non è usato in fase
    // di insert (la nazione vive dentro `residenza`): teniamo il valore grezzo.
    paese: tipo_cliente === 'impresa' ? nazionalitaResidenza : paeseRaw,
  };

  // ---- Validazioni ----
  let blocking = false;

  if (!ragione_sociale) {
    messages.push(tipo_cliente === 'impresa' ? 'Ragione sociale mancante' : 'Nome/cognome mancante');
    blocking = true;
  }

  if (cf && cf.length !== 16 && cf.length !== 11) {
    messages.push(`Codice fiscale di lunghezza anomala (${cf.length} caratteri)`);
  } else if (!cf) {
    messages.push('Codice fiscale assente: impossibile deduplicare');
  }

  if (piva && piva.length !== 11) {
    messages.push(`Partita IVA di lunghezza anomala (${piva.length} cifre)`);
  }
  if (data_nascita && !isValidDate(data_nascita)) {
    messages.push(`Data di nascita non valida: "${data_nascita}"`);
  } else if (data_nascita) {
    // Plausibilità: una data formalmente valida ma nel futuro è quasi sempre un
    // refuso (es. anno digitato male). Segnaliamo senza bloccare.
    const [dd, mm, yyyy] = data_nascita.split('/').map(Number);
    if (Number.isFinite(yyyy) && new Date(yyyy, (mm || 1) - 1, dd || 1).getTime() > Date.now()) {
      messages.push(`Data di nascita nel futuro: "${data_nascita}" — verifica`);
    }
  }

  return { normalized, messages, blocking };
}

// ==================== PARSING FILE ====================

/** Legge un foglio come matrice di celle e individua la riga intestazione.
 *  `sheetIndex` sceglie il foglio (default 0: il primo); un indice fuori range
 *  ripiega sul primo. Se `headerRowOverride` è un indice valido (≥0 e dentro il
 *  foglio) viene usato quello; altrimenti si auto-rileva la prima riga non vuota.
 *  
 *  Nota IMPORTANTE: Il numero di riga restituito (headerIdx) è l'INDICE REALE
 *  nel file Excel (0-based), non l'indice nell'array aoa. Se il file ha righe
 *  vuote che SheetJS salta, manteniamo comunque traccia del numero corretto. */
function readSheetAoa(
  buf: ArrayBuffer,
  headerRowOverride?: number,
  sheetIndex = 0,
): { sheetName: string; sheetNames: string[]; sheetIndex: number; aoa: unknown[][]; headerIdx: number } {
  // Codepage 1252 serve a decodificare i vecchi .xls/CSV ANSI (Windows-1252).
  // Ma un CSV/testo UTF-8 con BOM va letto come UTF-8, altrimenti gli accenti
  // diventano mojibake ("Crisà" → "CrisÃ"): se rileviamo il BOM non forziamo il
  // codepage e lasciamo che SheetJS riconosca l'UTF-8.
  const head = new Uint8Array(buf.slice(0, 3));
  const hasUtf8Bom = head[0] === 0xEF && head[1] === 0xBB && head[2] === 0xBF;
  const readOpts: XLSX.ParsingOptions = {
    type: 'array', cellDates: false, raw: true,
    codepage: hasUtf8Bom ? 65001 : 1252, // 65001 = UTF-8
  };
  const wb = XLSX.read(buf, readOpts);
  const sheetNames = wb.SheetNames;
  const idx = sheetIndex >= 0 && sheetIndex < sheetNames.length ? sheetIndex : 0;
  const sheetName = sheetNames[idx];
  const ws = wb.Sheets[sheetName];
  
  // Leggiamo il foglio mantenendo traccia dei numeri di riga REALI (0-based).
  // SheetJS fornisce il range delle celle ('!ref'), da cui estraiamo la prima
  // e l'ultima riga occupata. Poi iteriamo su tutte le righe nel range,
  // mantenendo l'indice reale anche per le righe che SheetJS poi salta.
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const aoa: unknown[][] = [];
  const rowToAoaIndex: Map<number, number> = new Map(); // mappa: rowIndex → aoaIndex
  
  for (let rowNum = range.s.r; rowNum <= range.e.r; rowNum++) {
    const row: unknown[] = [];
    for (let colNum = range.s.c; colNum <= range.e.c; colNum++) {
      const cellRef = XLSX.utils.encode_cell({ r: rowNum, c: colNum });
      const cell = ws[cellRef];
      row.push(cell?.v ?? '');
    }
    rowToAoaIndex.set(rowNum, aoa.length);
    aoa.push(row);
  }
  
  // Auto-rileva la prima riga non vuota, ma mantiene il numero di riga reale.
  let headerIdx = -1;
  if (headerRowOverride != null && headerRowOverride >= 0 && headerRowOverride <= range.e.r) {
    headerIdx = headerRowOverride;
  } else {
    for (let rowNum = range.s.r; rowNum <= range.e.r; rowNum++) {
      const aoaIdx = rowToAoaIndex.get(rowNum)!;
      const row = aoa[aoaIdx];
      if (row.some(c => cleanText(c) !== '')) {
        headerIdx = rowNum;
        break;
      }
    }
  }
  
  return { sheetName, sheetNames, sheetIndex: idx, aoa, headerIdx };
}

/** Estrae le prime righe non vuote come candidate per l'intestazione, con
 *  un'anteprima delle celle, così l'utente può scegliere quella giusta nei file
 *  che antepongono righe di titolo/note alle intestazioni vere.
 *  Nota: `index` è sempre l'indice 0-based della riga nel foglio, in modo che
 *  quando viene mostrato come `index + 1` l'utente vede il numero di riga
 *  effettivo del file Excel. */
function buildHeaderOptions(aoa: unknown[][], max = 15): HeaderRowOption[] {
  const out: HeaderRowOption[] = [];
  for (let i = 0; i < aoa.length && out.length < max; i++) {
    const r = aoa[i];
    if (!Array.isArray(r)) continue;
    const cells = r.map(c => cleanText(c)).filter(Boolean);
    out.push({
      index: i,
      preview: cells.length > 0 ? cells.slice(0, 6).join(' · ') : '— riga vuota —',
    });
  }
  return out;
}

/** Raccoglie fino a `max` valori di esempio (non vuoti) per una colonna. */
function collectSamples(aoa: unknown[][], headerIdx: number, col: number, max = 3): string[] {
  const out: string[] = [];
  for (let i = headerIdx + 1; i < aoa.length && out.length < max; i++) {
    const r = aoa[i];
    const s = Array.isArray(r) ? cleanText(r[col]) : '';
    if (s) out.push(s);
  }
  return out;
}

/** Analizza il file per la UI di mapping: colonne rilevate (con esempi) e
 *  accoppiamento automatico proposto. Non tocca il DB. */
export function analyzeWorkbookBuffer(buf: ArrayBuffer, headerRowOverride?: number, sheetIndex?: number): WorkbookAnalysis {
  const { sheetName, sheetNames, sheetIndex: usedSheet, aoa, headerIdx } = readSheetAoa(buf, headerRowOverride, sheetIndex);
  const headerOptions = buildHeaderOptions(aoa);
  if (headerIdx === -1) return { sheetName, sheetNames, sheetIndex: usedSheet, columns: [], autoMapping: {}, headerRowIndex: -1, headerOptions };
  const header = aoa[headerIdx];
  const { map } = buildColumnMap(header);
  const autoMapping: ColumnMapping = {};
  for (const [col, f] of map) autoMapping[col] = f;
  const columns: DetectedColumn[] = [];
  for (let c = 0; c < header.length; c++) {
    const name = cleanText(header[c]);
    if (!name) continue;
    columns.push({ index: c, name, samples: collectSamples(aoa, headerIdx, c) });
  }
  return { sheetName, sheetNames, sheetIndex: usedSheet, columns, autoMapping, headerRowIndex: headerIdx, headerOptions };
}

/** Legge un file (.xls/.xlsx/.csv) e ne esegue l'intera pipeline. Se `mapping`
 *  è fornito, usa quell'accoppiamento colonna→campo invece di quello automatico. */
export async function parseClientiFile(file: File, mapping?: ColumnMapping, headerRowIndex?: number, sheetIndex?: number): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  return parseClientiBuffer(buf, mapping, headerRowIndex, sheetIndex);
}

/** Come sopra, ma partendo da un buffer già letto (evita di rileggere il File). */
export async function parseClientiBuffer(buf: ArrayBuffer, mapping?: ColumnMapping, headerRowIndex?: number, sheetIndex?: number): Promise<ParseResult> {
  const existingCF = await fetchExistingClienteCF();
  return parseWorkbookBuffer(buf, existingCF, mapping, headerRowIndex, sheetIndex);
}

/** Versione pura (senza accesso al DB) della pipeline parse → pulizia →
 *  validazione → dedup. `existingCF` è l'insieme dei codici fiscali già clienti;
 *  `mappingOverride` permette di forzare l'accoppiamento colonna→campo.
 *  Esposta per consentire test deterministici della pulizia dati. */
export function parseWorkbookBuffer(
  buf: ArrayBuffer,
  existingByCf: Map<string, Set<TipoClienteImport>> = new Map(),
  mappingOverride?: ColumnMapping,
  headerRowIndex?: number,
  sheetIndex?: number,
): ParseResult {
  const { sheetName, aoa, headerIdx } = readSheetAoa(buf, headerRowIndex, sheetIndex);
  if (headerIdx === -1) {
    return { sheetName, rows: [], unmappedHeaders: [], summary: { total: 0, ok: 0, warning: 0, error: 0, duplicate: 0 } };
  }
  const header = aoa[headerIdx];

  // Mapping: esplicito (scelto dall'utente) oppure automatico.
  let map: Map<number, CanonicalField>;
  let unmapped: string[];
  if (mappingOverride) {
    map = new Map();
    for (const [k, v] of Object.entries(mappingOverride)) if (v) map.set(Number(k), v);
    unmapped = [];
    for (let c = 0; c < header.length; c++) {
      const name = cleanText(header[c]);
      if (name && !map.has(c)) unmapped.push(name);
    }
  } else {
    const built = buildColumnMap(header);
    map = built.map;
    unmapped = built.unmapped;
  }

  // Per ogni CF teniamo la prima riga vista e i tipi già incontrati. Stesso CF +
  // stesso tipo = vero doppione (saltato). Stesso CF + tipo diverso (es. persona
  // + azienda/ditta individuale) = righe complementari: le carichiamo ENTRAMBE,
  // condivideranno una sola anagrafica (dedup per CF in savePersona).
  const seenCf = new Map<string, { report: RowReport; tipi: Set<TipoClienteImport> }>();
  const NOTA_CONDIVISA = 'Stesso soggetto (CF) presente nel file con tipo diverso: caricati entrambi con anagrafica condivisa — verifica i dati';

  const rows: RowReport[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!Array.isArray(r) || !r.some(c => cleanText(c) !== '')) continue; // salta righe vuote

    const { normalized, messages, blocking } = normalizeRow(r, map);

    // raw leggibile per la UI (solo colonne mappate)
    const raw: Record<string, unknown> = {};
    for (const [col, f] of map) raw[f] = r[col];

    const status: RowStatus = blocking ? 'error' : (messages.length ? 'warning' : 'ok');
    // `index` = numero di riga reale nel file (1-based, come in Excel/CSV), così il
    // riferimento mostrato all'utente combacia con il foglio originale anche in
    // presenza di righe vuote saltate.
    const rep: RowReport = { index: i + 1, raw, normalized, status, messages };

    const cf = normalized.codice_fiscale;
    if (!blocking && cf) {
      const existingTipi = existingByCf.get(cf);
      const prev = seenCf.get(cf);

      if (existingTipi?.has(normalized.tipo_cliente)) {
        // Stesso CF + stesso tipo già cliente nello studio → vero doppione.
        rep.status = 'duplicate';
        rep.messages.push('Codice fiscale già presente tra i clienti dello studio (stesso tipo): riga saltata');
      } else if (prev?.tipi.has(normalized.tipo_cliente)) {
        // Stesso CF + stesso tipo già incontrato in questo file → doppione interno.
        rep.status = 'duplicate';
        rep.messages.push('Codice fiscale duplicato all\'interno del file (stesso tipo): riga saltata');
      } else {
        // Prima volta che vediamo questa coppia (CF, tipo): la carichiamo.
        // Se lo stesso CF è già presente con un tipo DIVERSO — fra i clienti dello
        // studio o in una riga precedente del file — è il caso "persona + azienda/
        // ditta individuale": anagrafica condivisa, entrambi importati.
        const sharedWithOther = !!existingTipi || (!!prev && prev.tipi.size > 0);
        if (prev) prev.tipi.add(normalized.tipo_cliente);
        else seenCf.set(cf, { report: rep, tipi: new Set([normalized.tipo_cliente]) });

        if (sharedWithOther) {
          if (rep.status === 'ok') rep.status = 'warning';
          rep.messages.push(NOTA_CONDIVISA);
          if (prev) {
            if (prev.report.status === 'ok') prev.report.status = 'warning';
            if (!prev.report.messages.includes(NOTA_CONDIVISA)) prev.report.messages.push(NOTA_CONDIVISA);
          }
        }
      }
    }

    rows.push(rep);
  }

  const summary = {
    total: rows.length,
    ok: rows.filter(r => r.status === 'ok').length,
    warning: rows.filter(r => r.status === 'warning').length,
    error: rows.filter(r => r.status === 'error').length,
    duplicate: rows.filter(r => r.status === 'duplicate').length,
  };

  return { sheetName, rows, unmappedHeaders: unmapped, summary };
}

/** Recupera i CF dei clienti già esistenti nello studio attivo (scoped via RLS;
 *  filtrati esplicitamente per studio attivo per coerenza col resto dell'app). */
async function fetchExistingClienteCF(): Promise<Map<string, Set<TipoClienteImport>>> {
  // Leggiamo anche `tipo_cliente`: la deduplica marca doppione solo a parità di
  // (CF, tipo). Stesso CF con tipo diverso (persona + ditta individuale) resta
  // importabile e condividerà l'anagrafica. Escludiamo i clienti nel cestino
  // (deleted_at valorizzato): un soggetto cestinato dev'essere reimportabile.
  let q = supabase.from('clienti').select('codice_fiscale, tipo_cliente').is('deleted_at', null);
  const studioId = getActiveStudioIdHolder();
  if (studioId) q = q.eq('studio_id', studioId);
  const { data } = await q;
  const map = new Map<string, Set<TipoClienteImport>>();
  for (const row of data || []) {
    const r = row as { codice_fiscale?: string; tipo_cliente?: string };
    const cf = cleanCF(r.codice_fiscale);
    if (!cf) continue;
    const tipo = (r.tipo_cliente as TipoClienteImport) || 'persona_fisica';
    let set = map.get(cf);
    if (!set) { set = new Set<TipoClienteImport>(); map.set(cf, set); }
    set.add(tipo);
  }
  return map;
}

// ==================== INSERIMENTO (CASCATA) ====================

/** Genera un codice_cliente univoco per la riga, rispettando il formato studio. */
async function makeCodiceCliente(
  imp: ImpostazioniStudio,
  n: NormalizedCliente,
  used: Set<string>,
): Promise<string> {
  const cfPiva = n.codice_fiscale || n.partita_iva;
  let code: string | null = null;
  if (imp.formato_codice_cliente !== 'manuale') {
    code = await generateCodiceCliente(imp.formato_codice_cliente, n.ragione_sociale, imp, cfPiva);
  }
  if (!code) {
    const prefix = (imp.prefisso_cliente_attivo && imp.prefisso_cliente) ? imp.prefisso_cliente : 'CLI';
    code = `${prefix}-${(cfPiva || 'SENZA-CF').toUpperCase()}`;
  }
  let final = code;
  let n2 = 2;
  while (used.has(final)) final = `${code}-${n2++}`;
  used.add(final);
  return final;
}

/** Inserisce un singolo cliente normalizzato. Persona/professionista creano
 *  l'anagrafica (savePersona → persona_id). Le imprese inseriscono i soli dati
 *  scalari; se "ditta individuale" (CF persona 16 char) condividono l'anagrafica
 *  con l'eventuale riga persona. Tutti gli import nascono come BOZZA: i dati di
 *  dettaglio (documento, PEP, titolari…) si completano nel wizard. */
async function insertOne(
  n: NormalizedCliente,
  imp: ImpostazioniStudio,
  usedCodes: Set<string>,
): Promise<{ clienteId: string; codice: string; status: 'draft' | 'active'; warning?: string }> {
  const status: 'draft' = 'draft';
  let base: Record<string, unknown>;
  let warning: string | undefined;

  if (n.tipo_cliente === 'impresa') {
    let personaId: string | null = null;
    if (n.codice_fiscale.length === 16) {
      const cfData = parseCodiceFiscale(n.codice_fiscale);
      personaId = await savePersona({
        nome_cognome: n.ragione_sociale,
        codice_fiscale: n.codice_fiscale,
        data_nascita: cfData ? normalizeDate(cfData.data_nascita) : '',
        luogo_nascita: cfData?.comune || '',
        provincia_nascita: cfData?.provincia || '',
        nazionalita: n.nazionalita || 'Italiana',
        professione: '',
        residenza: n.indirizzo,
        partita_iva: n.partita_iva,
        documento_tipo: '', documento_numero: '', documento_data_rilascio: '',
        documento_data_scadenza: '', documento_ente_rilascio: '',
      });
    }
    base = {
      tipo_cliente: 'impresa',
      status,
      ragione_sociale: n.ragione_sociale,
      natura_giuridica: n.natura_giuridica,
      partita_iva: n.partita_iva,
      codice_fiscale: n.codice_fiscale,
      paese: n.paese || 'Italiana',
      indirizzo: n.indirizzo,
    };
    if (personaId) base.persona_id = personaId;
  } else {
    const personaId = await savePersona({
      nome_cognome: n.ragione_sociale,
      codice_fiscale: n.codice_fiscale,
      data_nascita: normalizeDate(n.data_nascita), // anagrafica conserva dd/mm/yyyy
      luogo_nascita: n.luogo_nascita,
      provincia_nascita: n.provincia_nascita,
      nazionalita: n.nazionalita || 'Italiana',
      professione: '',
      residenza: n.indirizzo,
      partita_iva: n.tipo_cliente === 'professionista' ? n.partita_iva : '',
      documento_tipo: '', documento_numero: '', documento_data_rilascio: '',
      documento_data_scadenza: '', documento_ente_rilascio: '',
    });
    base = {
      tipo_cliente: n.tipo_cliente,
      status,
      ragione_sociale: n.ragione_sociale,
      codice_fiscale: n.codice_fiscale,
      data_nascita: formatDateForDB(n.data_nascita),
      luogo_nascita: n.luogo_nascita,
      provincia_nascita: n.provincia_nascita,
      nazionalita: n.nazionalita,
      residenza: n.indirizzo,
    };
    if (n.tipo_cliente === 'professionista') base.partita_iva = n.partita_iva;
    if (personaId) base.persona_id = personaId;
    else warning = 'Anagrafica non collegata: il soggetto non è stato salvato in anagrafica (verifica nel wizard)';
  }

  // studio_id esplicito sullo studio ATTIVO: la dedup (fetchExistingClienteCF) è
  // scopata su `getActiveStudioIdHolder()`, quindi l'insert deve finire nello
  // stesso studio, altrimenti il controllo doppioni e la scrittura divergerebbero.
  // Se l'holder non è ancora valorizzato lasciamo il DEFAULT get_my_studio_id().
  // (Per un superadmin in cross-studio la RLS consente l'INSERT solo nel proprio
  // studio: l'eventuale errore è preferibile a un inserimento nello studio sbagliato.)
  const studioId = getActiveStudioIdHolder();
  if (studioId) base.studio_id = studioId;

  // INSERT con retry sul codice in caso di collisione (unique per studio).
  for (let attempt = 0; attempt < 3; attempt++) {
    const codice = await makeCodiceCliente(imp, n, usedCodes);
    const { data, error } = await supabase
      .from('clienti')
      .insert({ ...base, codice_cliente: codice })
      .select('id')
      .single();
    if (!error && data) return { clienteId: data.id, codice, status, warning };
    const dup = error?.code === '23505' && `${error?.message} ${error?.details}`.includes('codice_cliente');
    if (!dup) throw error;
  }
  throw new Error('Impossibile generare un codice_cliente univoco dopo più tentativi');
}

/** Ordina le righe per l'inserimento: le persone fisiche/professionisti che
 *  condividono il codice fiscale con un'altra riga (es. la stessa persona anche
 *  come azienda/ditta individuale) vengono caricati per ULTIMI. Così la loro
 *  anagrafica — più ricca di dati anagrafici — prevale sempre su quella creata
 *  dalla riga azienda, indipendentemente dall'ordine nel file. Le altre righe
 *  mantengono l'ordine originale. */
export function orderRowsForImport(rows: RowReport[]): RowReport[] {
  const cfCount = new Map<string, number>();
  for (const r of rows) {
    const cf = r.normalized.codice_fiscale;
    if (cf) cfCount.set(cf, (cfCount.get(cf) || 0) + 1);
  }
  const head: RowReport[] = [];
  const tail: RowReport[] = [];
  for (const r of rows) {
    const cf = r.normalized.codice_fiscale;
    const isPersona = r.normalized.tipo_cliente !== 'impresa';
    if (isPersona && cf && (cfCount.get(cf) || 0) > 1) tail.push(r);
    else head.push(r);
  }
  return [...head, ...tail];
}

/** Esegue l'import delle righe selezionate (di default: tutte tranne
 *  error/duplicate). Best-effort: una riga fallita non blocca le altre.
 *  `onProgress` è invocato dopo ogni riga per aggiornare la UI.
 *  `signal` permette di annullare: l'import si ferma PRIMA della riga successiva
 *  (le righe già inserite restano), restituendo gli esiti accumulati. */
export async function importClienti(
  rows: RowReport[],
  onProgress?: (done: number, total: number, last: ImportOutcome) => void,
  signal?: AbortSignal,
): Promise<ImportOutcome[]> {
  const imp = await loadImpostazioni();
  const usedCodes = new Set<string>();
  const importable = orderRowsForImport(rows.filter(r => r.status === 'ok' || r.status === 'warning'));
  const outcomes: ImportOutcome[] = [];

  let done = 0;
  for (const row of importable) {
    if (signal?.aborted) break; // annullato dall'utente: interrompi senza toccare il già fatto
    let outcome: ImportOutcome;
    try {
      const { clienteId, codice, status, warning } = await insertOne(row.normalized, imp, usedCodes);
      outcome = {
        index: row.index,
        ragione_sociale: row.normalized.ragione_sociale,
        ok: true,
        clienteId,
        codice_cliente: codice,
        status,
        warning,
      };
    } catch (e) {
      outcome = {
        index: row.index,
        ragione_sociale: row.normalized.ragione_sociale,
        ok: false,
        error: (e as { message?: string })?.message || 'Errore sconosciuto durante l\'inserimento',
      };
    }
    outcomes.push(outcome);
    done++;
    onProgress?.(done, importable.length, outcome);
  }

  return outcomes;
}
