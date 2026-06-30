// MCP — Whitelist tool, schemi di validazione (Zod) e gate (tier + ruolo).
//
// Centralizza ciò che è "esponibile" all'AI: lo schema di input di ogni tool (le cui descrizioni
// SONO le istruzioni per l'AI, §13.1), il tier minimo richiesto, e i gate di ruolo "app-only"
// che la RLS non impone e vanno re-implementati server-side (§4, caso RT1).

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { WizardData, TitolareEffettivo } from '../../src/components/cliente-wizard/types.js';
import type { PersonaFisicaRecord } from '../../src/lib/personeHelper.js';
import type { McpTier } from './mcpAuth.js';

// Riferimento a un'entità creata in un PASSO PRECEDENTE dello stesso piano: token "@passo:N"
// (N = numero del passo, 1-based). In esecuzione viene sostituito con l'UUID realmente creato da
// quel passo (vedi resolvePassoRefs in mcpPlans). Serve perché l'UUID di cliente/incarico non
// esiste finché il piano non viene eseguito: così crea_bozza_cliente → crea_incarico →
// crea_valutazione stanno in UN solo piano (una sola approvazione).
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PASSO_REF_RE = /^@passo:\d+$/;
/** Stringa che deve essere un UUID oppure un riferimento "@passo:N" a un passo precedente. */
function uuidOrPassoRef(entita: string) {
  return z.string().refine((v) => UUID_RE.test(v) || PASSO_REF_RE.test(v), {
    message: `Deve essere l'UUID ${entita} oppure "@passo:N" per riferirsi all'entità creata al passo N dello stesso piano.`,
  });
}

/** Tier minimo richiesto per ciascun tool (filtra tools/list ed esecuzione, §7.1/§8.2). */
export const TOOL_REQUIRED_TIER: Record<string, McpTier> = {
  crea_bozza_cliente: 'draft',
};

/**
 * Gate "app-only" (§4): per i domini il cui permesso vive solo nella UI (es. RT1, riservato a
 * admin/superadmin), la RLS non basta → il tool DEVE ricontrollare il ruolo server-side prima
 * di scrivere. Helper riusabile, pronto per i tool gated della whitelist (es. autovalutazione).
 * Lancia se il ruolo dell'utente non è tra quelli ammessi.
 */
export async function requireRole(
  client: SupabaseClient,
  userId: string,
  allowed: string[],
): Promise<void> {
  const { data, error } = await client
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();
  if (error || !data) {
    throw new Error('Impossibile verificare il ruolo utente per il controllo permessi.');
  }
  if (!allowed.includes(data.role)) {
    throw new Error(
      `Operazione riservata ai ruoli: ${allowed.join(', ')}. Ruolo attuale: ${data.role}.`,
    );
  }
}

// --- Schema input di `crea_bozza_cliente` (Zod). I nomi combaciano con WizardData. ---
export const creaBozzaClienteSchema = {
  tipo_cliente: z.enum(['persona_fisica', 'impresa', 'professionista'])
    .describe('Tipo di cliente. Determina quali altri campi sono pertinenti.'),
  codice_cliente: z.string().min(1)
    .describe("Codice identificativo del cliente, univoco nello studio (es. 'CLI-001')."),

  // PERSONA FISICA
  nome_cognome_pf: z.string().optional().describe('[persona_fisica] Nome e cognome.'),
  codice_fiscale_pf: z.string().optional().describe('[persona_fisica] Codice fiscale (16 caratteri).'),
  data_nascita_pf: z.string().optional().describe('[persona_fisica] Data di nascita (formato dd/mm/yyyy, es. 15/01/1980).'),
  luogo_nascita_pf: z.string().optional().describe('[persona_fisica] Comune di nascita.'),
  provincia_nascita_pf: z.string().optional().describe('[persona_fisica] Provincia di nascita (sigla).'),
  nazionalita_pf: z.string().optional().describe('[persona_fisica] Nazionalità (default Italiana).'),
  professione_pf: z.string().optional().describe('[persona_fisica] Professione.'),
  residenza_pf: z.string().optional().describe('[persona_fisica] Indirizzo di residenza.'),
  pep_pf: z.boolean().optional().describe('[persona_fisica] È una persona politicamente esposta (PEP)?'),
  sanzioni_pf: z.boolean().optional().describe('[persona_fisica] Risulta in liste sanzioni?'),
  note_verifica_pf: z.string().optional().describe('[persona_fisica] Note di verifica.'),

  // IMPRESA
  ragione_sociale: z.string().optional().describe('[impresa] Ragione sociale.'),
  partita_iva_impresa: z.string().optional().describe('[impresa] Partita IVA (11 cifre).'),
  codice_fiscale_impresa: z.string().optional().describe("[impresa] Codice fiscale dell'impresa."),
  natura_giuridica: z.string().optional().describe("[impresa] Natura giuridica (es. 'S.R.L.')."),
  paese: z.string().optional().describe('[impresa] Paese della sede.'),
  indirizzo: z.string().optional().describe('[impresa] Indirizzo della sede legale.'),
  codice_ateco_impresa: z.string().optional().describe('[impresa] Codice ATECO.'),
  attivita_svolta_impresa: z.string().optional().describe('[impresa] Attività svolta.'),
  rappresentante_legale: z.string().optional().describe('[impresa] Nome e cognome del rappresentante legale.'),
  codice_fiscale_rappresentante: z.string().optional().describe('[impresa] Codice fiscale del rappresentante legale.'),
  pep_impresa: z.boolean().optional().describe('[impresa] Il rappresentante/impresa è PEP?'),
  sanzioni_impresa: z.boolean().optional().describe('[impresa] Risulta in liste sanzioni?'),
  note_verifica_impresa: z.string().optional().describe('[impresa] Note di verifica.'),

  // PROFESSIONISTA
  nome_cognome_prof: z.string().optional().describe('[professionista] Nome e cognome.'),
  codice_fiscale_prof: z.string().optional().describe('[professionista] Codice fiscale.'),
  partita_iva_prof: z.string().optional().describe('[professionista] Partita IVA.'),
  data_nascita_prof: z.string().optional().describe('[professionista] Data di nascita (formato dd/mm/yyyy, es. 15/01/1980).'),
  luogo_nascita_prof: z.string().optional().describe('[professionista] Comune di nascita.'),
  provincia_nascita_prof: z.string().optional().describe('[professionista] Provincia di nascita (sigla).'),
  nazionalita_prof: z.string().optional().describe('[professionista] Nazionalità (default Italiana).'),
  professione_prof: z.string().optional().describe('[professionista] Professione/specializzazione.'),
  residenza_prof: z.string().optional().describe('[professionista] Indirizzo di residenza.'),
  codice_ateco_prof: z.string().optional().describe('[professionista] Codice ATECO.'),
  pep_prof: z.boolean().optional().describe('[professionista] È PEP?'),
  sanzioni_prof: z.boolean().optional().describe('[professionista] Risulta in liste sanzioni?'),
  note_verifica_prof: z.string().optional().describe('[professionista] Note di verifica.'),

  // TITOLARI EFFETTIVI (solo [impresa]). Vanno inseriti QUI come dati strutturati, NON descritti
  // nelle note: solo così diventano veri titolari effettivi (anagrafica + tabella titolari_effettivi).
  titolari_effettivi: z.array(z.object({
    nome_cognome: z.string().min(1).describe('Nome e cognome (persona) o denominazione (azienda) del titolare effettivo.'),
    tipo_soggetto: z.enum(['persona_fisica', 'azienda']).optional().describe("Default 'persona_fisica'. Usa 'azienda' per un titolare che è una società."),
    tipo_rapporto: z.enum(['in_proprio', 'per_conto_persone', 'societa_ente', 'caso_residuale']).optional()
      .describe("Come si determina il titolare effettivo (default 'in_proprio' = partecipazione/controllo diretto)."),
    ruolo: z.string().optional().describe('Ruolo/partecipazione nel cliente (es. "Socio al 40%", "Amministratore unico").'),
    codice_fiscale: z.string().optional().describe('Codice fiscale del titolare.'),
    data_nascita: z.string().optional().describe('Data di nascita (formato dd/mm/yyyy), solo persona fisica.'),
    comune_nascita: z.string().optional().describe('Comune di nascita (persona fisica).'),
    provincia_nascita: z.string().optional().describe('Provincia di nascita, sigla (persona fisica).'),
    nazionalita: z.string().optional().describe('Nazionalità (default Italiana).'),
    residenza: z.string().optional().describe('Indirizzo di residenza (persona) / sede (azienda).'),
    professione: z.string().optional().describe('Professione (persona fisica).'),
    partita_iva: z.string().optional().describe('Partita IVA (solo tipo_soggetto=azienda).'),
    natura_giuridica: z.string().optional().describe('Natura giuridica (solo azienda).'),
    codice_ateco: z.string().optional().describe('Codice ATECO (solo azienda).'),
    is_pep: z.boolean().optional().describe('È una persona politicamente esposta (PEP)?'),
    pep_carica: z.string().optional().describe('Carica che rende PEP (se is_pep=true).'),
    sanzioni: z.boolean().optional().describe('Risulta in liste sanzioni?'),
    note_quota: z.string().optional().describe('Note libere su quota/rapporto.'),
  })).optional().describe('[impresa] Elenco dei titolari effettivi. Inseriscili come dati strutturati qui, non nelle note.'),
};

/** Normalizza un titolare effettivo proposto dall'AI in TitolareEffettivo completo (default sui
 *  campi mancanti, come emptyTitolare lato wizard). I documenti d'identità non sono gestiti via MCP. */
export function mapArgToTitolare(t: Record<string, any>): TitolareEffettivo {
  return {
    tipo_rapporto: t.tipo_rapporto || 'in_proprio',
    tipo_soggetto: t.tipo_soggetto || 'persona_fisica',
    nome_cognome: t.nome_cognome || '',
    professione: t.professione || '',
    ruolo: t.ruolo || '',
    comune_nascita: t.comune_nascita || '',
    provincia_nascita: t.provincia_nascita || '',
    data_nascita: t.data_nascita || '',
    nazionalita: t.nazionalita || 'Italiana',
    residenza: t.residenza || '',
    codice_fiscale: t.codice_fiscale || '',
    partita_iva: t.partita_iva || '',
    natura_giuridica: t.natura_giuridica || '',
    codice_ateco: t.codice_ateco || '',
    documento_tipo: '',
    documento_numero: '',
    documento_rilascio_ente: '',
    documento_rilascio_data: '',
    documento_scadenza: '',
    is_pep: t.is_pep ?? false,
    pep_carica: t.pep_carica || '',
    sanzioni: t.sanzioni ?? false,
    note_quota: t.note_quota || '',
  };
}

/** Mappa gli argomenti del tool su WizardData (pass-through: i nomi combaciano) + required. I
 *  titolari effettivi proposti dall'AI vengono normalizzati (NON forzati a vuoto come prima). */
export function mapArgsToWizardData(args: Record<string, unknown>): WizardData {
  const { titolari_effettivi, ...rest } = args as Record<string, any>;
  const titolari = Array.isArray(titolari_effettivi) ? titolari_effettivi.map(mapArgToTitolare) : [];
  return { titolari_effettivi: titolari, ...rest } as unknown as WizardData;
}

// --- Schema input di `crea_soggetto` (Zod), condiviso tra factory ed esecutore piani (§5.2). ---
export const creaSoggettoSchema = {
  tipo_soggetto: z.enum(['persona_fisica', 'azienda']).optional().describe("Default 'persona_fisica'."),
  nome_cognome: z.string().min(1).describe('Nome e cognome (persona) o ragione sociale (azienda).'),
  codice_fiscale: z.string().optional().describe('Codice fiscale (16 char persona, 11 cifre azienda).'),
  partita_iva: z.string().optional().describe('Partita IVA (aziende).'),
  data_nascita: z.string().optional().describe('Data di nascita (formato dd/mm/yyyy, es. 15/01/1980), solo persona fisica.'),
  luogo_nascita: z.string().optional().describe('Comune di nascita (persona fisica).'),
  provincia_nascita: z.string().optional().describe('Provincia di nascita (sigla).'),
  nazionalita: z.string().optional().describe('Nazionalità (default Italiana).'),
  professione: z.string().optional().describe('Professione (persona) / attività (azienda).'),
  residenza: z.string().optional().describe('Residenza (persona) / sede (azienda).'),
  natura_giuridica: z.string().optional().describe('Natura giuridica (azienda).'),
  codice_ateco: z.string().optional().describe('Codice ATECO (azienda).'),
  pep: z.boolean().optional().describe('È PEP?'),
  sanzioni: z.boolean().optional().describe('Risulta in liste sanzioni?'),
};

// --- Schema input di `crea_incarico` (Zod), condiviso tra factory ed esecutore piani. ---
// Un incarico nasce `active` (fa scattare l'alert RT2): esposto SOLO via proponi_piano →
// approvazione umana → esegui_piano (§7.2), mai come tool diretto.
export const creaIncaricoSchema = {
  cliente_id: uuidOrPassoRef('del cliente').describe('UUID del cliente a cui associare l\'incarico (da lista_clienti/leggi_cliente). In un piano multi-azione puoi usare "@passo:N" per riferirti al cliente creato al passo N DELLO STESSO PIANO (es. dopo crea_bozza_cliente al passo 1: "@passo:1").'),
  tipologia_prestazione_id: z.string().min(1)
    .describe('ID della tipologia di prestazione (valore da descrivi_tipologie_prestazione).'),
  codice_incarico: z.string().optional()
    .describe('Codice univoco dell\'incarico. Se omesso viene generato dalle impostazioni dello studio; obbligatorio se lo studio usa la numerazione manuale.'),
  descrizione: z.string().optional().describe('Descrizione libera dell\'incarico.'),
  scopo_natura: z.string().optional().describe('Scopo e natura della prestazione professionale.'),
  data_inizio: z.string().describe('Data di inizio (formato dd/mm/yyyy, es. 15/01/2026).'),
  data_fine: z.string().optional().describe('Data di fine (formato dd/mm/yyyy, es. 31/12/2026), se nota.'),
  importo_stimato: z.number().optional().describe('Importo stimato della prestazione (default 0).'),
  relazioni_cliente_te: z.string().optional().describe('AV.4 — relazioni col cliente / titolare effettivo.'),
  provenienza_fondi: z.string().optional().describe('Informazioni sulla provenienza dei fondi.'),
  mezzi_pagamento: z.string().optional().describe('Mezzi di pagamento utilizzati.'),
  conferma_fondi_leciti: z.boolean().optional().describe('Conferma che i fondi sono leciti (default true).'),
};

export const modificaIncaricoSchema = {
  incarico_id: uuidOrPassoRef('dell\'incarico')
    .describe('UUID dell\'incarico esistente da modificare (da lista_incarichi).'),
  cliente_id: uuidOrPassoRef('del cliente').optional()
    .describe('Nuovo cliente_id, SOLO se vuoi spostare l\'incarico su un altro cliente (operazione delicata: di norma ometti questo campo).'),
  tipologia_prestazione_id: z.string().optional()
    .describe('Nuova tipologia di prestazione (da descrivi_tipologie_prestazione). Ometti per non cambiarla.'),
  codice_incarico: z.string().optional()
    .describe('Nuovo codice incarico. Ometti per NON cambiarlo (non viene mai rigenerato in modifica).'),
  descrizione: z.string().optional().describe('Descrizione libera dell\'incarico.'),
  scopo_natura: z.string().optional().describe('Scopo e natura della prestazione professionale.'),
  data_inizio: z.string().optional().describe('Data di inizio (formato dd/mm/yyyy).'),
  data_fine: z.string().optional().describe('Data di fine (formato dd/mm/yyyy). Passa stringa vuota per azzerarla.'),
  importo_stimato: z.number().optional().describe('Importo stimato della prestazione.'),
  relazioni_cliente_te: z.string().optional().describe('AV.4 — relazioni col cliente / titolare effettivo.'),
  provenienza_fondi: z.string().optional().describe('Informazioni sulla provenienza dei fondi.'),
  mezzi_pagamento: z.string().optional().describe('Mezzi di pagamento utilizzati.'),
  conferma_fondi_leciti: z.boolean().optional().describe('Conferma che i fondi sono leciti.'),
};

// --- Schema input di `crea_valutazione` (RT2), condiviso tra factory ed esecutore piani. ---
// L'AI fornisce i punteggi 1-4; il server calcola rischio/classe/misure/scadenza. Di norma i
// punteggi li indica l'utente: chiedili prima di proporre, salvo l'utente chieda esplicitamente
// di generarli (es. per un test). Tabella B richiesta salvo prestazioni "solo_tabella_a".
const punteggio = z.number().int().min(1).max(4);
export const creaValutazioneSchema = {
  incarico_id: uuidOrPassoRef('dell\'incarico').describe('UUID dell\'incarico da valutare (da lista_incarichi). In un piano multi-azione puoi usare "@passo:N" per riferirti all\'incarico creato al passo N DELLO STESSO PIANO (es. dopo crea_incarico al passo 2: "@passo:2").'),
  tabella_a: z.object({
    naturaGiuridica: punteggio.describe('Natura giuridica del cliente/controparte (1-4).'),
    attivitaPrevalente: punteggio.describe('Attività prevalente esercitata (1-4).'),
    comportamentoConferimento: punteggio.describe('Comportamento tenuto al conferimento dell\'incarico (1-4).'),
    areaClienteControparte: punteggio.describe('Area geografica del cliente/controparte (1-4).'),
  }).describe('Tabella A — 4 fattori di rischio specifico, punteggio 1-4 ciascuno.'),
  tabella_b: z.object({
    tipologia: punteggio.describe('Tipologia di operazione/prestazione (1-4).'),
    modalita: punteggio.describe('Modalità di svolgimento (1-4).'),
    ammontare: punteggio.describe('Ammontare dell\'operazione (1-4).'),
    frequenzaVolumeDurata: punteggio.describe('Frequenza, volume e durata (1-4).'),
    ragionevolezza: punteggio.describe('Ragionevolezza economica (1-4).'),
    areaDestinazione: punteggio.describe('Area geografica di destinazione (1-4).'),
  }).optional().describe('Tabella B — 6 fattori; obbligatoria salvo prestazioni solo_tabella_a.'),
  note: z.string().optional().describe('Note libere sulla valutazione.'),
};

/** Mappa gli argomenti di `crea_soggetto` su PersonaFisicaRecord (default sui campi mancanti). */
export function mapArgsToPersona(args: Record<string, any>): PersonaFisicaRecord {
  return {
    tipo_soggetto: args.tipo_soggetto || 'persona_fisica',
    nome_cognome: args.nome_cognome,
    codice_fiscale: args.codice_fiscale || '',
    data_nascita: args.data_nascita || '',
    luogo_nascita: args.luogo_nascita || '',
    provincia_nascita: args.provincia_nascita || '',
    nazionalita: args.nazionalita || 'Italiana',
    professione: args.professione || '',
    residenza: args.residenza || '',
    documento_tipo: '',
    documento_numero: '',
    documento_data_rilascio: '',
    documento_data_scadenza: '',
    documento_ente_rilascio: '',
    partita_iva: args.partita_iva || '',
    natura_giuridica: args.natura_giuridica || '',
    codice_ateco: args.codice_ateco || '',
    pep: args.pep ?? false,
    sanzioni: args.sanzioni ?? false,
  };
}


// dopo creaBozzaClienteSchema:
export const modificaClienteSchema = {
  cliente_id: uuidOrPassoRef('del cliente')
    .describe('UUID del cliente esistente da modificare (da lista_clienti/leggi_cliente).'),
  ...Object.fromEntries(
    Object.entries(creaBozzaClienteSchema).map(([k, v]) =>
      k === 'tipo_cliente' || k === 'codice_cliente' ? [k, (v as any).optional()] : [k, v],
    ),
  ),
};

/** Patch parziale: a differenza di mapArgsToWizardData, NON forza titolari_effettivi a [] se
 *  l'AI non lo passa — fondamentale per non cancellare i titolari esistenti in modifica_cliente. */
export function mapArgsToWizardDataPatch(args: Record<string, unknown>): Partial<WizardData> {
  const { cliente_id, titolari_effettivi, ...rest } = args as Record<string, any>;
  const patch: Record<string, any> = { ...rest };
  if (titolari_effettivi !== undefined) {
    patch.titolari_effettivi = Array.isArray(titolari_effettivi) ? titolari_effettivi.map(mapArgToTitolare) : [];
  }
  return patch as Partial<WizardData>;
}

/**
 * Tool di scrittura che possono comparire in un piano (`proponi_piano`). Per ciascuno, lo schema
 * Zod (oggetto) con cui validare gli `args` server-side prima di salvare il piano (§7.3).
 */
export const AZIONI_PIANO_SCHEMAS: Record<string, z.ZodTypeAny> = {
  crea_bozza_cliente: z.object(creaBozzaClienteSchema),
  modifica_cliente: z.object(modificaClienteSchema),   // <-- nuovo
  crea_soggetto: z.object(creaSoggettoSchema),
  crea_incarico: z.object(creaIncaricoSchema),
  modifica_incarico: z.object(modificaIncaricoSchema),
  crea_valutazione: z.object(creaValutazioneSchema),
};
