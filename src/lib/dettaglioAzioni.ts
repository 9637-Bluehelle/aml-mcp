// Costruttori (puri) delle righe di dettaglio mostrate nel div espandibile delle modali di
// approvazione AI. Una riga = { label, value } leggibile, niente dati tecnici (UUID/JSON): i nomi
// (cliente, incarico, prestazione) sono già risolti dal chiamante e passati come contesto.
// Condiviso tra PianoApprovazione (azioni di piano) e AzioniAiModale (documento / catalogazione).

import { getPrestazione } from './aml-data';
import { calculateRT2Scores } from './calculations';

export interface RigaDettaglio { label: string; value: string; gruppo?: string }

/** Etichetta leggibile di un tool di scrittura (azione di piano). */
export const TOOL_LABEL: Record<string, string> = {
  crea_bozza_cliente: 'Crea bozza cliente',
  crea_soggetto: 'Crea soggetto in anagrafica',
  crea_incarico: 'Crea incarico',
  crea_valutazione: 'Crea valutazione del rischio (RT2)',
};

/** Riepilogo breve degli argomenti di un'azione (una riga), dedotto dai campi presenti. I nomi
 *  (incarico, prestazione) sono risolti dal `ctx` quando disponibile, così il riepilogo non mostra
 *  mai UUID grezzi ma codici/etichette leggibili. */
export function riassuntoArgs(args: Record<string, any>, ctx?: ContestoNomi): string {
  const parts: string[] = [];
  // Valutazione RT2: incarico + punteggi. Mostriamo il codice incarico (non l'UUID); se non
  // risolto, omettiamo del tutto il riferimento invece di esporre l'id tecnico.
  if (args.tabella_a) {
    const codiceIncarico = ctx?.incarichiInfo[args.incarico_id]?.codice;
    if (codiceIncarico) parts.push(`incarico ${codiceIncarico}`);
    parts.push(`Tab.A: ${Object.values(args.tabella_a as Record<string, number>).join('/')}`);
    if (args.tabella_b) parts.push(`Tab.B: ${Object.values(args.tabella_b as Record<string, number>).join('/')}`);
    return parts.join(' · ') || '(dettagli sotto)';
  }
  // Incarico: campi propri. La prestazione è risolta in etichetta (non l'UUID del catalogo).
  if (args.tipologia_prestazione_id || args.data_inizio) {
    if (args.codice_incarico) parts.push(`codice: ${args.codice_incarico}`);
    const prest = getPrestazione(args.tipologia_prestazione_id);
    if (prest) parts.push(`prestazione: ${prest.label}`);
    if (args.data_inizio) parts.push(`inizio: ${args.data_inizio}`);
    return parts.join(' · ') || '(dettagli sotto)';
  }
  // Cliente / soggetto.
  const nome = args.nome_cognome_pf || args.ragione_sociale || args.nome_cognome_prof || args.nome_cognome;
  if (nome) parts.push(String(nome));
  if (args.tipo_cliente) parts.push(`tipo: ${args.tipo_cliente}`);
  if (args.codice_cliente) parts.push(`codice: ${args.codice_cliente}`);
  const cf = args.codice_fiscale_pf || args.codice_fiscale_impresa || args.codice_fiscale_prof || args.codice_fiscale;
  if (cf) parts.push(`CF/P.IVA: ${cf}`);
  return parts.join(' · ') || '(dettagli sotto)';
}

/** Info per risolvere i nomi citati dalle azioni (cliente per incarico; incarico+cliente+PEP per RT2). */
export interface ContestoNomi {
  clienteNomi: Record<string, string>;
  incarichiInfo: Record<string, { codice?: string; clienteNome?: string; tipologiaId?: string; isPep: boolean }>;
}

/** Costruisce righe di dettaglio (+ eventuale anteprima RT2) per una singola azione di piano. */
export function buildDettaglioAzione(
  tool: string,
  args: Record<string, any>,
  ctx: ContestoNomi,
): { righe: RigaDettaglio[]; anteprima?: AnteprimaRT2 | null } {
  switch (tool) {
    case 'crea_bozza_cliente': return { righe: righeBozzaCliente(args) };
    case 'crea_soggetto': return { righe: righeSoggetto(args) };
    case 'crea_incarico': return { righe: righeIncarico(args, { clienteNome: ctx.clienteNomi[args.cliente_id] }) };
    case 'crea_valutazione': {
      const inc = ctx.incarichiInfo[args.incarico_id];
      return {
        righe: righeValutazione(args, { incaricoCodice: inc?.codice, clienteNome: inc?.clienteNome }),
        anteprima: anteprimaRT2(inc?.tipologiaId, args, inc?.isPep ?? false),
      };
    }
    default: return { righe: [] };
  }
}

const boolLabel = (v: unknown): string => (v === true ? 'Sì' : v === false ? 'No' : '');

/** Aggiunge una riga solo se il valore è valorizzato (i campi vuoti non compaiono). */
function add(rows: RigaDettaglio[], label: string, value: unknown, fmt?: (v: any) => string): void {
  if (value === undefined || value === null || value === '') return;
  const s = fmt ? fmt(value) : String(value);
  if (s && s.trim() !== '') rows.push({ label, value: s });
}

// ----------------------------------------------------------------- crea_bozza_cliente
export function righeBozzaCliente(a: Record<string, any>): RigaDettaglio[] {
  const r: RigaDettaglio[] = [];
  // Come add(), ma tagga la riga con un gruppo (mini-intestazioni nel dettaglio).
  const g = (gruppo: string, label: string, value: unknown, fmt?: (v: any) => string) => {
    const before = r.length;
    add(r, label, value, fmt);
    if (r.length > before) r[r.length - 1].gruppo = gruppo;
  };
  g('Anagrafica', 'Tipo cliente', a.tipo_cliente);
  g('Anagrafica', 'Codice cliente', a.codice_cliente);
  // Persona fisica
  g('Anagrafica', 'Nome e cognome', a.nome_cognome_pf);
  g('Anagrafica', 'Codice fiscale', a.codice_fiscale_pf);
  g('Anagrafica', 'Data di nascita', a.data_nascita_pf);
  g('Anagrafica', 'Luogo di nascita', a.luogo_nascita_pf);
  g('Anagrafica', 'Provincia di nascita', a.provincia_nascita_pf);
  g('Anagrafica', 'Nazionalità', a.nazionalita_pf);
  g('Anagrafica', 'Professione', a.professione_pf);
  g('Anagrafica', 'Residenza', a.residenza_pf);
  g('Verifiche', 'PEP', a.pep_pf, boolLabel);
  g('Verifiche', 'In liste sanzioni', a.sanzioni_pf, boolLabel);
  g('Verifiche', 'Note di verifica', a.note_verifica_pf);
  // Impresa
  g('Anagrafica', 'Ragione sociale', a.ragione_sociale);
  g('Anagrafica', 'Partita IVA', a.partita_iva_impresa);
  g('Anagrafica', 'Codice fiscale impresa', a.codice_fiscale_impresa);
  g('Anagrafica', 'Natura giuridica', a.natura_giuridica);
  g('Sede e attività', 'Paese', a.paese);
  g('Sede e attività', 'Indirizzo sede', a.indirizzo);
  g('Sede e attività', 'Codice ATECO', a.codice_ateco_impresa);
  g('Sede e attività', 'Attività svolta', a.attivita_svolta_impresa);
  g('Rappresentante', 'Rappresentante legale', a.rappresentante_legale);
  g('Rappresentante', 'CF rappresentante', a.codice_fiscale_rappresentante);
  g('Verifiche', 'PEP', a.pep_impresa, boolLabel);
  g('Verifiche', 'In liste sanzioni', a.sanzioni_impresa, boolLabel);
  g('Verifiche', 'Note di verifica', a.note_verifica_impresa);
  // Professionista
  g('Anagrafica', 'Nome e cognome', a.nome_cognome_prof);
  g('Anagrafica', 'Codice fiscale', a.codice_fiscale_prof);
  g('Anagrafica', 'Partita IVA', a.partita_iva_prof);
  g('Anagrafica', 'Data di nascita', a.data_nascita_prof);
  g('Anagrafica', 'Luogo di nascita', a.luogo_nascita_prof);
  g('Anagrafica', 'Provincia di nascita', a.provincia_nascita_prof);
  g('Anagrafica', 'Nazionalità', a.nazionalita_prof);
  g('Anagrafica', 'Professione', a.professione_prof);
  g('Anagrafica', 'Residenza', a.residenza_prof);
  g('Sede e attività', 'Codice ATECO', a.codice_ateco_prof);
  g('Verifiche', 'PEP', a.pep_prof, boolLabel);
  g('Verifiche', 'In liste sanzioni', a.sanzioni_prof, boolLabel);
  g('Verifiche', 'Note di verifica', a.note_verifica_prof);
  return r;
}

// ----------------------------------------------------------------- crea_soggetto
export function righeSoggetto(a: Record<string, any>): RigaDettaglio[] {
  const r: RigaDettaglio[] = [];
  add(r, 'Tipo soggetto', a.tipo_soggetto || 'persona_fisica');
  add(r, 'Nome / ragione sociale', a.nome_cognome);
  add(r, 'Codice fiscale', a.codice_fiscale);
  add(r, 'Partita IVA', a.partita_iva);
  add(r, 'Data di nascita', a.data_nascita);
  add(r, 'Luogo di nascita', a.luogo_nascita);
  add(r, 'Provincia di nascita', a.provincia_nascita);
  add(r, 'Nazionalità', a.nazionalita);
  add(r, 'Professione / attività', a.professione);
  add(r, 'Residenza / sede', a.residenza);
  add(r, 'Natura giuridica', a.natura_giuridica);
  add(r, 'Codice ATECO', a.codice_ateco);
  add(r, 'PEP', a.pep, boolLabel);
  add(r, 'In liste sanzioni', a.sanzioni, boolLabel);
  return r;
}

// ----------------------------------------------------------------- crea_incarico
export function righeIncarico(a: Record<string, any>, ctx: { clienteNome?: string }): RigaDettaglio[] {
  const r: RigaDettaglio[] = [];
  add(r, 'Cliente', ctx.clienteNome || '(non risolto)');
  const prest = getPrestazione(a.tipologia_prestazione_id);
  add(r, 'Prestazione', prest ? `${prest.label} (rischio inerente ${prest.inherentRisk})` : a.tipologia_prestazione_id);
  add(r, 'Codice incarico', a.codice_incarico || 'generato automaticamente');
  add(r, 'Descrizione', a.descrizione);
  add(r, 'Scopo e natura', a.scopo_natura);
  add(r, 'Data inizio', a.data_inizio);
  add(r, 'Data fine', a.data_fine);
  add(r, 'Importo stimato', a.importo_stimato, (v) => `€ ${v}`);
  add(r, 'Relazioni cliente / TE', a.relazioni_cliente_te);
  add(r, 'Provenienza fondi', a.provenienza_fondi);
  add(r, 'Mezzi di pagamento', a.mezzi_pagamento);
  add(r, 'Conferma fondi leciti', a.conferma_fondi_leciti, boolLabel);
  return r;
}

// ----------------------------------------------------------------- crea_valutazione (RT2)
const LABELS_A: Record<string, string> = {
  naturaGiuridica: 'Natura giuridica',
  attivitaPrevalente: 'Attività prevalente',
  comportamentoConferimento: 'Comportamento al conferimento',
  areaClienteControparte: 'Area cliente/controparte',
};
const LABELS_B: Record<string, string> = {
  tipologia: 'Tipologia',
  modalita: 'Modalità',
  ammontare: 'Ammontare',
  frequenzaVolumeDurata: 'Frequenza/volume/durata',
  ragionevolezza: 'Ragionevolezza',
  areaDestinazione: 'Area destinazione',
};

export function righeValutazione(a: Record<string, any>, ctx: { incaricoCodice?: string; clienteNome?: string }): RigaDettaglio[] {
  const r: RigaDettaglio[] = [];
  add(r, 'Incarico', [ctx.incaricoCodice, ctx.clienteNome].filter(Boolean).join(' — ') || '(non risolto)');
  if (a.tabella_a) for (const k of Object.keys(LABELS_A)) add(r, `Tab. A · ${LABELS_A[k]}`, a.tabella_a[k]);
  if (a.tabella_b) for (const k of Object.keys(LABELS_B)) add(r, `Tab. B · ${LABELS_B[k]}`, a.tabella_b[k]);
  add(r, 'Note', a.note);
  return r;
}

export interface AnteprimaRT2 {
  rischioSpecifico: number;
  rischioEffettivo: number;
  classe: number;
  periodicitaMesi: number;
  isPep: boolean;
}

/**
 * Anteprima RT2 calcolata client-side con la STESSA formula del server/UI (calculateRT2Scores +
 * soglie classe esplicite), così l'utente vede già rischio/classe prima di approvare. Ritorna null
 * se mancano i dati (prestazione non in catalogo, Tabella A assente). PEP → rischio effettivo 4.
 */
export function anteprimaRT2(tipologiaId: string | undefined, a: Record<string, any>, isPep: boolean): AnteprimaRT2 | null {
  if (!tipologiaId) return null;
  const prest = getPrestazione(tipologiaId);
  if (!prest || !a?.tabella_a) return null;
  const adapt = (n: number) => ({ score: Number(n), fattoriSelezionati: [] as string[], altro: '' });
  const A = a.tabella_a;
  const tabA = {
    naturaGiuridica: adapt(A.naturaGiuridica),
    attivitaPrevalente: adapt(A.attivitaPrevalente),
    comportamentoConferimento: adapt(A.comportamentoConferimento),
    areaClienteControparte: adapt(A.areaClienteControparte),
  };
  const B = a.tabella_b;
  const tabB = B ? {
    tipologia: adapt(B.tipologia),
    modalita: adapt(B.modalita),
    ammontare: adapt(B.ammontare),
    frequenzaVolumeDurata: adapt(B.frequenzaVolumeDurata),
    ragionevolezza: adapt(B.ragionevolezza),
    areaDestinazione: adapt(B.areaDestinazione),
  } : undefined;
  let s;
  try {
    s = calculateRT2Scores(tipologiaId, tabA as any, prest.onlyTabA ? undefined : (tabB as any), isPep);
  } catch {
    return null;
  }
  const re = s.rischioEffettivo;
  const classe = re >= 3.6 ? 4 : re >= 2.6 ? 3 : re >= 1.6 ? 2 : 1;
  const periodicitaMesi = classe >= 4 ? 6 : classe >= 3 ? 12 : classe >= 2 ? 24 : 36;
  return { rischioSpecifico: s.rischioSpecifico, rischioEffettivo: re, classe, periodicitaMesi, isPep };
}

// ----------------------------------------------------------------- documento / catalogazione
export function righeDocumento(
  d: { nome_file: string; cartella?: string | null; data_scadenza?: string | null; descrizione?: string | null; dimensione?: number | null },
  ctx: { tipologiaLabel: string; associazione?: string },
): RigaDettaglio[] {
  const r: RigaDettaglio[] = [];
  add(r, 'Tipologia', ctx.tipologiaLabel);
  add(r, 'File', d.nome_file);
  add(r, 'Cartella', d.cartella);
  add(r, 'Associazione', ctx.associazione);
  add(r, 'Scadenza', d.data_scadenza);
  add(r, 'Descrizione', d.descrizione);
  return r;
}
