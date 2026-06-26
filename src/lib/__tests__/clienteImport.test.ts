import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';

// La pipeline pura (parseWorkbookBuffer) non tocca il DB, ma il modulo importa
// `supabase` a livello di modulo (che esige env mancanti nei test): lo stubbiamo.
vi.mock('../supabase', () => ({ supabase: {} }));

import { parseWorkbookBuffer, analyzeWorkbookBuffer, orderRowsForImport, type ColumnMapping, type RowReport, type TipoClienteImport } from '../clienteImport';

// Intestazioni identiche al file reale, comprese le colonne CAP/Comune/Provincia
// ripetute per Sede Legale e Domicilio Fiscale.
const HEADERS = [
  'Tipo soggetto - Descrizione', 'Cognome', 'Nome', 'Sesso', 'Stato di nascita',
  'Luogo di nascita', 'Provincia di nascita', 'Data di nascita (gg/mm/aaaa)',
  'Artigiano/Impresa artigiana', 'Codice Fiscale', 'Titolare Partita IVA',
  'Partita IVA', 'Nazionalità IVA', 'Indirizzo (Sede Legale)', 'C.A.P.', 'Comune',
  'Provincia', 'Indirizzo (Domicilio Fiscale)', 'C.A.P.', 'Comune', 'Provincia',
];

function makeBufferWith(headers: unknown[], rows: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Foglio1');
  // type:'array' restituisce direttamente un ArrayBuffer
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as unknown as ArrayBuffer;
}

function makeBuffer(rows: unknown[][]): ArrayBuffer {
  return makeBufferWith(HEADERS, rows);
}

describe('parseWorkbookBuffer — pulizia e normalizzazione', () => {
  it('professionista: data da seriale Excel, P.IVA → professionista, residenza da domicilio', () => {
    const rows = [[
      'Persone fisiche', 'Crisà', 'Giuseppe', 'M', 'ITALIA', 'ACIREALE', 'CT',
      25514, // seriale Excel = 07/11/1969 (timezone-safe)
      'No', 'CRSGPP69S07A028D', 'Si', '05296000879', 'Italiana',
      'VIA G. VERGA 30', '95024', 'ACIREALE', 'CT',
      'VIA G. VERGA 30', '95024', 'ACIREALE', 'CT',
    ]];
    const res = parseWorkbookBuffer(makeBuffer(rows));
    expect(res.rows).toHaveLength(1);
    const n = res.rows[0].normalized;
    expect(n.tipo_cliente).toBe('professionista');
    expect(n.ragione_sociale).toBe('Crisà Giuseppe'); // accento preservato (no mojibake)
    expect(n.data_nascita).toBe('07/11/1969');
    expect(n.codice_fiscale).toBe('CRSGPP69S07A028D');
    expect(n.partita_iva).toBe('05296000879');
    expect(n.indirizzo).toBe('VIA G. VERGA 30, 95024 ACIREALE (CT)');
    expect(res.rows[0].status).toBe('ok');
  });

  it('persona fisica senza P.IVA → persona_fisica; dati nascita ricavati dal CF', () => {
    const rows = [[
      'Persone fisiche', 'Rossi', 'Mario', 'M', '', '', '',
      '', // data assente → ricavata dal CF
      'No', 'RSSMRA85M01H501Z', 'No', '', 'Italiana',
      '', '', '', '',
      'VIA ROMA 1', '00100', 'ROMA', 'RM',
    ]];
    const res = parseWorkbookBuffer(makeBuffer(rows));
    const r = res.rows[0];
    expect(r.normalized.tipo_cliente).toBe('persona_fisica');
    expect(r.normalized.data_nascita).toBe('01/08/1985'); // dal CF
    expect(r.normalized.luogo_nascita).toBe('ROMA');
    expect(r.normalized.provincia_nascita).toBe('RM');
    expect(r.status).toBe('warning'); // ha note di pulizia (dati ricavati)
    expect(r.messages.join(' ')).toMatch(/ricavat/i);
  });

  it('marca duplicati: CF ripetuto nel file e CF già cliente nello studio', () => {
    const base = [
      'Persone fisiche', 'Bianchi', 'Anna', 'F', 'ITALIA', 'MILANO', 'MI',
      25514, 'No', 'BNCNNA80A41F205X', 'No', '', 'Italiana',
      '', '', '', '', 'VIA PO 2', '20100', 'MILANO', 'MI',
    ];
    const giaCliente = [
      'Persone fisiche', 'Verdi', 'Luca', 'M', 'ITALIA', 'TORINO', 'TO',
      25514, 'No', 'VRDLCU75A01L219Y', 'No', '', 'Italiana',
      '', '', '', '', 'VIA DANTE 3', '10100', 'TORINO', 'TO',
    ];
    const res = parseWorkbookBuffer(
      makeBuffer([base, [...base], giaCliente]),
      // già presente tra i clienti dello studio con lo STESSO tipo (persona fisica)
      new Map<string, Set<TipoClienteImport>>([['VRDLCU75A01L219Y', new Set(['persona_fisica'])]]),
    );
    expect(res.rows[0].status).toBe('ok');          // prima occorrenza
    expect(res.rows[1].status).toBe('duplicate');   // ripetuto nel file
    expect(res.rows[2].status).toBe('duplicate');   // già cliente
    expect(res.summary.duplicate).toBe(2);
  });

  it('CF già cliente ma con tipo DIVERSO → non duplicato, anagrafica condivisa', () => {
    // L'impresa (ditta individuale) con questo CF è già a sistema; ora importiamo
    // la persona fisica omonima: deve essere caricata (tipo diverso), non saltata.
    const persona = [
      'Persone fisiche', 'LEONARDI', 'ALFIO', 'M', 'ITALIA', '', '',
      '', 'No', 'LNRLFA90S20A028D', 'No', '', 'Italiana',
      '', '', '', '', 'VIA QUASIMODO 9', '95010', 'SANTA VENERINA', 'CT',
    ];
    const res = parseWorkbookBuffer(
      makeBuffer([persona]),
      new Map<string, Set<TipoClienteImport>>([['LNRLFA90S20A028D', new Set(['impresa'])]]),
    );
    expect(res.rows[0].status).toBe('warning');
    expect(res.rows[0].messages.join(' ')).toMatch(/anagrafica condivisa/i);
    expect(res.summary.duplicate).toBe(0);
  });

  it('stesso CF come azienda (ditta individuale) e come persona → carica entrambe', () => {
    const azienda = [
      'Società di capitali', 'ALFIO', 'LEONARDI', 'M', 'ITALIA', '', '',
      '', 'No', 'LNRLFA90S20A028D', 'Si', '05826860875', 'Italiana',
      'VIA SEDE 1', '95010', 'SANTA VENERINA', 'CT', '', '', '', '',
    ];
    const persona = [
      'Persone fisiche', 'ALFIO', 'LEONARDI', 'M', 'ITALIA', '', '',
      '', 'No', 'LNRLFA90S20A028D', 'No', '', 'Italiana',
      '', '', '', '', 'VIA QUASIMODO 9', '95010', 'SANTA VENERINA', 'CT',
    ];
    const res = parseWorkbookBuffer(makeBuffer([azienda, persona]));
    expect(res.rows).toHaveLength(2);
    expect(res.summary.duplicate).toBe(0); // nessuno saltato: tipi diversi
    expect(res.rows[0].normalized.tipo_cliente).toBe('impresa');
    expect(res.rows[1].normalized.tipo_cliente).toBe('persona_fisica');
    // Entrambe segnalate come "da rivedere" con la nota di anagrafica condivisa
    expect(res.rows[0].status).toBe('warning');
    expect(res.rows[1].status).toBe('warning');
    expect(res.rows[1].messages.join(' ')).toMatch(/anagrafica condivisa/i);
    // Indirizzi distinti conservati su ciascun cliente
    expect(res.rows[0].normalized.indirizzo).toMatch(/VIA SEDE 1/);
    expect(res.rows[1].normalized.indirizzo).toMatch(/VIA QUASIMODO 9/);
  });

  it('riga impresa/persona giuridica → importabile coi soli dati scalari', () => {
    const rows = [[
      'Persone giuridiche', 'ACME SRL', '', '', '', '', '',
      '', 'No', '12345678903', 'Si', '12345678903', 'Italiana',
      'VIA INDUSTRIA 5', '95100', 'CATANIA', 'CT', '', '', '', '',
    ]];
    const res = parseWorkbookBuffer(makeBuffer(rows));
    const r = res.rows[0];
    expect(r.normalized.tipo_cliente).toBe('impresa');
    expect(r.normalized.ragione_sociale).toBe('ACME SRL');
    expect(r.status).toBe('ok'); // dati a posto; verrà importata come bozza
  });

  it('impresa senza codice fiscale → usa la partita IVA come CF', () => {
    const rows = [[
      'Persone giuridiche', 'BETA SRL', '', '', '', '', '',
      '', 'No', '', 'Si', '12345678903', 'Italiana',
      'VIA INDUSTRIA 5', '95100', 'CATANIA', 'CT', '', '', '', '',
    ]];
    const res = parseWorkbookBuffer(makeBuffer(rows));
    const r = res.rows[0];
    expect(r.normalized.tipo_cliente).toBe('impresa');
    expect(r.normalized.codice_fiscale).toBe('12345678903'); // = P.IVA
    expect(r.messages.join(' ')).toMatch(/usata la partita iva/i);
  });

  it('file imprese reale: mappa denominazione, natura giuridica e sede legale', () => {
    const headers = [
      'Ragione Sociale Intera', 'Tipo soggetto - Descrizione', 'Codice Fiscale', 'Partita IVA',
      'Natura Giuridica (Descrizione)', 'Indirizzo (Sede Legale)', 'C.A.P.', 'Comune', 'Provincia',
    ];
    const rows = [[
      'Messapia Srl in liquidazione', 'Società di capitali', '80144410588', '02062740879',
      'Società a responsabilità limitata', 'Via Pietro Dell\'Ova, 51', '95100', 'CATANIA', 'CT',
    ]];
    const a = analyzeWorkbookBuffer(makeBufferWith(headers, rows));
    expect(a.autoMapping[0]).toBe('ragioneSociale');
    expect(a.autoMapping[1]).toBe('tipoSoggetto');
    expect(a.autoMapping[4]).toBe('naturaGiuridica');
    expect(a.autoMapping[5]).toBe('indirizzo');

    const res = parseWorkbookBuffer(makeBufferWith(headers, rows));
    const n = res.rows[0].normalized;
    expect(n.tipo_cliente).toBe('impresa');
    expect(n.ragione_sociale).toBe('Messapia Srl in liquidazione');
    expect(n.codice_fiscale).toBe('80144410588');
    expect(n.partita_iva).toBe('02062740879');
    expect(n.natura_giuridica).toBe('Società a responsabilità limitata');
    expect(n.indirizzo).toBe('Via Pietro Dell\'Ova, 51, 95100 CATANIA (CT)');
    expect(res.rows[0].status).toBe('ok');
  });

  it('riga senza nome → errore bloccante', () => {
    const rows = [[
      'Persone fisiche', '', '', 'M', 'ITALIA', '', '',
      25514, 'No', '', 'No', '', 'Italiana',
      '', '', '', '', '', '', '', '',
    ]];
    const res = parseWorkbookBuffer(makeBuffer(rows));
    expect(res.rows[0].status).toBe('error');
    expect(res.rows[0].messages.join(' ')).toMatch(/nome.*mancante/i);
  });

  it('persona con nazionalità estera → residenza in formato "<Nazione> | indirizzo"', () => {
    // Nessuna colonna "Paese": la nazione si deduce dalla nazionalità (come fa il wizard).
    const rows = [[
      'Persone fisiche', 'Müller', 'Hans', 'M', 'GERMANIA', 'BERLINO', '',
      '01/01/1980', 'No', '', 'No', '', 'Tedesca',
      'STRASSE 5', '10115', 'BERLINO', '', '', '', '', '',
    ]];
    const res = parseWorkbookBuffer(makeBuffer(rows));
    const n = res.rows[0].normalized;
    expect(n.nazionalita).toBe('Tedesca');
    expect(n.indirizzo.startsWith('Germania | ')).toBe(true);
    expect(n.indirizzo).toContain('STRASSE 5');
  });

  it('persona italiana → residenza in formato italiano (nessun separatore estero)', () => {
    const rows = [[
      'Persone fisiche', 'Rossi', 'Mario', 'M', 'ITALIA', 'ROMA', 'RM',
      '01/08/1985', 'No', 'RSSMRA85M01H501Z', 'No', '', 'Italiana',
      'VIA ROMA 1', '00100', 'ROMA', 'RM', '', '', '', '',
    ]];
    const res = parseWorkbookBuffer(makeBuffer(rows));
    const n = res.rows[0].normalized;
    expect(n.indirizzo).toBe('VIA ROMA 1, 00100 ROMA (RM)');
    expect(n.indirizzo).not.toContain(' | ');
  });

  it('impresa con sede estera → paese=nazionalità e indirizzo "<Nazione> | …"', () => {
    const headers = [
      'Ragione Sociale Intera', 'Tipo soggetto - Descrizione', 'Codice Fiscale',
      'Partita IVA', 'Indirizzo (Sede Legale)', 'Paese',
    ];
    const rows = [['ACME GmbH', 'Società di capitali', '', 'DE123456789', 'Hauptstrasse 1, Berlin', 'Germania']];
    const res = parseWorkbookBuffer(makeBufferWith(headers, rows));
    const n = res.rows[0].normalized;
    expect(n.tipo_cliente).toBe('impresa');
    expect(n.paese).toBe('Tedesca'); // nazionalità (formato del wizard), non "Germania"/"DE"
    expect(n.indirizzo.startsWith('Germania | ')).toBe(true);
    expect(n.indirizzo).toContain('Hauptstrasse 1, Berlin');
  });

  it('impresa italiana → paese="Italiana" e indirizzo in formato italiano', () => {
    const headers = [
      'Ragione Sociale Intera', 'Tipo soggetto - Descrizione', 'Codice Fiscale',
      'Partita IVA', 'Indirizzo (Sede Legale)', 'C.A.P.', 'Comune', 'Provincia',
    ];
    const rows = [['BETA SRL', 'Società di capitali', '12345678903', '12345678903', 'VIA INDUSTRIA 5', '95100', 'CATANIA', 'CT']];
    const res = parseWorkbookBuffer(makeBufferWith(headers, rows));
    const n = res.rows[0].normalized;
    expect(n.paese).toBe('Italiana');
    expect(n.indirizzo).toBe('VIA INDUSTRIA 5, 95100 CATANIA (CT)');
    expect(n.indirizzo).not.toContain(' | ');
  });

  it('CAP numerico con zeri persi (Excel) → reintegrato a 5 cifre (residenza italiana)', () => {
    const rows = [[
      'Persone fisiche', 'Neri', 'Ivo', 'M', 'ITALIA', 'ROMA', 'RM',
      '01/01/1970', 'No', '', 'No', '', 'Italiana',
      'VIA SUD 9', 100, 'ROMA', 'RM', '', '', '', '', // CAP come numero → 00100
    ]];
    const res = parseWorkbookBuffer(makeBuffer(rows));
    expect(res.rows[0].normalized.indirizzo).toBe('VIA SUD 9, 00100 ROMA (RM)');
  });

  it('CAP con zero iniziale (es. 04567) → padding a sinistra, mai 45670', () => {
    // come numero Excel (4567) → reintegrato a 04567
    const asNumber = [[
      'Persone fisiche', 'Neri', 'Ivo', 'M', 'ITALIA', 'TORINO', 'TO',
      '01/01/1970', 'No', '', 'No', '', 'Italiana',
      'VIA NORD 1', 4567, 'TORINO', 'TO', '', '', '', '',
    ]];
    expect(parseWorkbookBuffer(makeBuffer(asNumber)).rows[0].normalized.indirizzo)
      .toBe('VIA NORD 1, 04567 TORINO (TO)');

    // come testo "04567" → resta invariato
    const asText = [[
      'Persone fisiche', 'Neri', 'Ivo', 'M', 'ITALIA', 'TORINO', 'TO',
      '01/01/1970', 'No', '', 'No', '', 'Italiana',
      'VIA NORD 1', '04567', 'TORINO', 'TO', '', '', '', '',
    ]];
    expect(parseWorkbookBuffer(makeBuffer(asText)).rows[0].normalized.indirizzo)
      .toBe('VIA NORD 1, 04567 TORINO (TO)');
  });

  it('index = numero di riga reale nel file (intestazione=1, salta le vuote)', () => {
    const base = (cog: string) => [
      'Persone fisiche', cog, 'Aaa', 'M', 'ITALIA', 'ROMA', 'RM',
      '01/01/1970', 'No', '', 'No', '', 'Italiana', '', '', '', '', '', '', '', '',
    ];
    const empty = new Array(21).fill('');
    const res = parseWorkbookBuffer(makeBuffer([base('Uno'), empty, base('Due')]));
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].index).toBe(2); // intestazione=riga 1, primo dato=riga 2
    expect(res.rows[1].index).toBe(4); // riga 3 vuota saltata → secondo dato=riga 4
  });

  it('data di nascita nel futuro → warning di plausibilità (non bloccante)', () => {
    const rows = [[
      'Persone fisiche', 'Futuri', 'Franco', 'M', 'ITALIA', 'ROMA', 'RM',
      '01/01/2099', // formalmente valida (anno ≤ 2100) ma nel futuro
      'No', '', 'No', '', 'Italiana',
      '', '', '', '', 'VIA TEMPO 1', '00100', 'ROMA', 'RM',
    ]];
    const res = parseWorkbookBuffer(makeBuffer(rows));
    const r = res.rows[0];
    expect(r.status).toBe('warning');
    expect(r.messages.join(' ')).toMatch(/nel futuro/i);
  });

  it('P.IVA a 10 cifre (numero Excel, zero iniziale perso) → reintegrata a 11', () => {
    const headers = ['Ragione Sociale Intera', 'Tipo soggetto - Descrizione', 'Codice Fiscale', 'Partita IVA'];
    const rows = [['ACME SRL', 'Società di capitali', '', 5296000879]]; // cella numerica
    const res = parseWorkbookBuffer(makeBufferWith(headers, rows));
    const n = res.rows[0].normalized;
    expect(n.partita_iva).toBe('05296000879');
    expect(n.codice_fiscale).toBe('05296000879'); // impresa senza CF → usa la P.IVA
  });

  it('CF società a 10 cifre (numero Excel) → reintegrato a 11', () => {
    const headers = ['Ragione Sociale Intera', 'Tipo soggetto - Descrizione', 'Codice Fiscale', 'Partita IVA'];
    const rows = [['BETA SPA', 'Società di capitali', 1234567890, '']]; // CF numerico, zero perso
    const res = parseWorkbookBuffer(makeBufferWith(headers, rows));
    expect(res.rows[0].normalized.codice_fiscale).toBe('01234567890');
  });

  it('CF persona (16 alfanumerici) non viene toccato dal padding', () => {
    const rows = [[
      'Persone fisiche', 'Rossi', 'Mario', 'M', 'ITALIA', 'ROMA', 'RM',
      '01/08/1985', 'No', 'RSSMRA85M01H501Z', 'No', '', 'Italiana',
      'VIA ROMA 1', '00100', 'ROMA', 'RM', '', '', '', '',
    ]];
    const res = parseWorkbookBuffer(makeBuffer(rows));
    expect(res.rows[0].normalized.codice_fiscale).toBe('RSSMRA85M01H501Z');
  });

  it('ignora righe completamente vuote', () => {
    const rows = [
      ['Persone fisiche', 'Neri', 'Ivo', 'M', 'ITALIA', 'BARI', 'BA', 25514, 'No', 'NRESVI70A01A662K', 'No', '', 'Italiana', '', '', '', '', 'VIA SUD 9', '70100', 'BARI', 'BA'],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ];
    const res = parseWorkbookBuffer(makeBuffer(rows));
    expect(res.rows).toHaveLength(1);
  });
});

describe('orderRowsForImport — persona condivisa caricata per ultima', () => {
  const mk = (index: number, tipo: TipoClienteImport, cf: string): RowReport => ({
    index, raw: {}, status: 'warning', messages: [],
    normalized: { tipo_cliente: tipo, codice_fiscale: cf } as unknown as RowReport['normalized'],
  });

  it('sposta in coda solo le persone con CF condiviso, mantenendo l\'ordine altrove', () => {
    const persA = mk(1, 'persona_fisica', 'CFAAA');   // condiviso con impresa A
    const impA = mk(2, 'impresa', 'CFAAA');
    const persB = mk(3, 'persona_fisica', 'CFBBB');    // unico
    const impC = mk(4, 'impresa', 'CFCCC');            // unico
    const out = orderRowsForImport([persA, impA, persB, impC]);
    // L'impresa con CF condiviso resta prima della persona corrispondente
    expect(out.map(r => r.index)).toEqual([2, 3, 4, 1]);
    expect(out[out.length - 1]).toBe(persA); // la persona condivisa è l'ultima
  });

  it('non tocca l\'ordine se non ci sono CF condivisi', () => {
    const a = mk(1, 'impresa', 'X');
    const b = mk(2, 'persona_fisica', 'Y');
    expect(orderRowsForImport([a, b])).toEqual([a, b]);
  });
});

describe('analyzeWorkbookBuffer — rilevamento colonne e auto-mapping', () => {
  it('rileva le colonne con esempi e accoppia i campi (CAP sede vs domicilio distinti)', () => {
    const rows = [[
      'Persone fisiche', 'Crisà', 'Giuseppe', 'M', 'ITALIA', 'ACIREALE', 'CT',
      25514, 'No', 'CRSGPP69S07A028D', 'Si', '05296000879', 'Italiana',
      'VIA G. VERGA 30', '95024', 'ACIREALE', 'CT',
      'VIA DEL MARE 5', '95100', 'CATANIA', 'CT',
    ]];
    const a = analyzeWorkbookBuffer(makeBuffer(rows));
    expect(a.columns).toHaveLength(HEADERS.length);
    expect(a.columns[1].name).toBe('Cognome');
    expect(a.columns[1].samples[0]).toBe('Crisà'); // esempio per il mapping manuale

    // Codice fiscale accoppiato
    expect(a.autoMapping[9]).toBe('codiceFiscale');
    // Le due colonne CAP omonime (sede + domicilio) mappano sullo stesso campo:
    // in fase di lettura pick() prende il primo valore non vuoto.
    expect(a.autoMapping[14]).toBe('cap');
    expect(a.autoMapping[18]).toBe('cap');
  });
});

describe('analyzeWorkbookBuffer / parseWorkbookBuffer — file con più fogli', () => {
  const makeMultiSheet = (): ArrayBuffer => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Note'], ['ignorami']]), 'Istruzioni');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Cognome', 'Nome', 'Codice Fiscale'],
      ['Crisà', 'Giuseppe', 'CRSGPP69S07A028D'],
    ]), 'Clienti');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as unknown as ArrayBuffer;
  };

  it('espone tutti i fogli e di default elabora il primo', () => {
    const a = analyzeWorkbookBuffer(makeMultiSheet());
    expect(a.sheetNames).toEqual(['Istruzioni', 'Clienti']);
    expect(a.sheetIndex).toBe(0);
    expect(a.sheetName).toBe('Istruzioni');
  });

  it('con sheetIndex elabora il foglio scelto', () => {
    const buf = makeMultiSheet();
    const a = analyzeWorkbookBuffer(buf, undefined, 1);
    expect(a.sheetName).toBe('Clienti');
    expect(a.autoMapping[0]).toBe('cognome');

    const res = parseWorkbookBuffer(buf, new Map(), undefined, undefined, 1);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].normalized.ragione_sociale).toBe('Crisà Giuseppe');
  });

  it('un sheetIndex fuori range ripiega sul primo foglio', () => {
    const a = analyzeWorkbookBuffer(makeMultiSheet(), undefined, 99);
    expect(a.sheetIndex).toBe(0);
    expect(a.sheetName).toBe('Istruzioni');
  });
});

describe('analyzeWorkbookBuffer — scelta della riga di intestazione', () => {
  // File con una riga di titolo in cima: l'auto-detect prenderebbe quella, ma
  // l'utente può forzare la riga giusta tramite l'override.
  const buildWithTitleRow = () => {
    const titolo = ['Estrazione clienti del 15/06/2026', '', '', ''];
    const intestazioni = ['Cognome', 'Nome', 'Codice Fiscale', 'Data di nascita (gg/mm/aaaa)'];
    const dati = ['Crisà', 'Giuseppe', 'CRSGPP69S07A028D', 25514];
    return makeBufferWith(titolo, [intestazioni, dati]);
  };

  it('auto-detect cade sulla riga di titolo (mapping vuoto) e la espone fra le opzioni', () => {
    const a = analyzeWorkbookBuffer(buildWithTitleRow());
    expect(a.headerRowIndex).toBe(0); // prima riga non vuota = titolo
    expect(Object.keys(a.autoMapping)).toHaveLength(0); // il titolo non mappa nulla
    // Devono esserci almeno le righe titolo/intestazioni/dato come candidate
    expect(a.headerOptions.length).toBeGreaterThanOrEqual(2);
    expect(a.headerOptions[0].index).toBe(0);
  });

  it('con headerRowOverride=1 mappa correttamente le intestazioni vere', () => {
    const buf = buildWithTitleRow();
    const a = analyzeWorkbookBuffer(buf, 1);
    expect(a.headerRowIndex).toBe(1);
    expect(a.autoMapping[0]).toBe('cognome');
    expect(a.autoMapping[2]).toBe('codiceFiscale');

    const res = parseWorkbookBuffer(buf, new Map(), undefined, 1);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].normalized.ragione_sociale).toBe('Crisà Giuseppe');
    expect(res.rows[0].normalized.data_nascita).toBe('07/11/1969');
  });

  it('mostra le righe candidate con il numero reale della riga del foglio, anche se ci sono righe vuote', () => {
    const titolo = ['Titolo export', '', ''];
    const intestazioni = ['Cognome', 'Nome', 'Codice Fiscale'];
    const dati = ['Rossi', 'Mario', 'RSSMRA80A01H501Z'];
    const buf = makeBufferWith(titolo, [ ['', ''], ['', ''], intestazioni, dati ]);

    const a = analyzeWorkbookBuffer(buf);

    expect(a.headerOptions.map(opt => opt.index + 1)).toEqual([1, 2, 3, 4, 5]);
    expect(a.headerOptions[3].preview).toBe('Cognome · Nome · Codice Fiscale');
    expect(a.headerOptions[1].preview).toBe('— riga vuota —');
  });

  it('se la prima riga del file è vuota, il rilevamento usa comunque la riga reale delle intestazioni', () => {
    const buf = makeBufferWith(['', '', ''], [['Cognome', 'Nome', 'Codice Fiscale'], ['Rossi', 'Mario', 'RSSMRA80A01H501Z']]);

    const a = analyzeWorkbookBuffer(buf);
    const res = parseWorkbookBuffer(buf, new Map());

    expect(a.headerRowIndex).toBe(1);
    expect(a.headerOptions.map(opt => opt.index + 1)).toEqual([1, 2, 3]);
    expect(a.headerOptions[0].preview).toBe('— riga vuota —');
    expect(a.headerOptions[1].preview).toBe('Cognome · Nome · Codice Fiscale');
    expect(res.rows[0].index).toBe(3);
  });
});

describe('parseWorkbookBuffer — CSV con separatore ";"', () => {
  // SheetJS auto-rileva il delimitatore (`,`/`;`/tab): il punto e virgola degli
  // export italiani viene gestito senza configurazione. Con BOM UTF-8 gli accenti
  // sono preservati nonostante il codepage 1252 forzato per i vecchi .xls.
  it('rileva le colonne di un CSV punto e virgola UTF-8 (con BOM)', () => {
    const csv = [
      'Cognome;Nome;Codice Fiscale;Partita IVA',
      'Crisà;Giuseppe;CRSGPP69S07A028D;05296000879',
    ].join('\r\n');
    const buf = new TextEncoder().encode('﻿' + csv).buffer; // BOM UTF-8
    const res = parseWorkbookBuffer(buf);
    expect(res.rows).toHaveLength(1);
    const n = res.rows[0].normalized;
    expect(n.ragione_sociale).toBe('Crisà Giuseppe'); // accenti preservati + colonne separate da ;
    expect(n.codice_fiscale).toBe('CRSGPP69S07A028D');
    expect(n.tipo_cliente).toBe('professionista'); // ha P.IVA
  });
});

describe('parseWorkbookBuffer — mapping esplicito (override)', () => {
  it('usa il mapping fornito quando le intestazioni non sono standard', () => {
    const headers = ['Surname', 'GivenName', 'Fiscale', 'Born'];
    const rows = [['Crisà', 'Giuseppe', 'CRSGPP69S07A028D', 25514]];
    const buf = makeBufferWith(headers, rows);

    // Senza mapping l'auto-detect non riconosce queste intestazioni
    const auto = analyzeWorkbookBuffer(buf);
    expect(Object.keys(auto.autoMapping)).toHaveLength(0);

    const mapping: ColumnMapping = { 0: 'cognome', 1: 'nome', 2: 'codiceFiscale', 3: 'dataNascita' };
    const res = parseWorkbookBuffer(buf, new Map(), mapping);
    const n = res.rows[0].normalized;
    expect(n.ragione_sociale).toBe('Crisà Giuseppe');
    expect(n.codice_fiscale).toBe('CRSGPP69S07A028D');
    expect(n.data_nascita).toBe('07/11/1969');
  });

  it('una colonna lasciata su "ignora" non viene letta (CF assente → warning)', () => {
    const rows = [[
      'Persone fisiche', 'Rossi', 'Mario', 'M', 'ITALIA', 'ROMA', 'RM',
      25514, 'No', 'RSSMRA85M01H501Z', 'No', '', 'Italiana',
      '', '', '', '', 'VIA ROMA 1', '00100', 'ROMA', 'RM',
    ]];
    // Mapping che ignora deliberatamente il codice fiscale (colonna 9 assente)
    const mapping: ColumnMapping = { 1: 'cognome', 2: 'nome', 7: 'dataNascita', 17: 'indirizzo' };
    const res = parseWorkbookBuffer(makeBuffer(rows), new Map(), mapping);
    const r = res.rows[0];
    expect(r.normalized.codice_fiscale).toBe('');
    expect(r.messages.join(' ')).toMatch(/codice fiscale assente/i);
  });
});
