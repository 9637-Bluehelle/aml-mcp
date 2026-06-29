// Servizio incarichi condiviso UI ↔ MCP. Fonte di verità neutra (no React/singleton) per:
// catalogo prestazioni "spiegato" all'AI, validazione tipologia/cliente, generazione del
// `codice_incarico` server-side (mirror di src/lib/codiceGenerator) e INSERT in `incarichi`.
//
// Un incarico nasce SEMPRE `active` (status di default DB) e fa scattare l'alert RT2 "incarico
// senza valutazione": NON è un record inerte come la bozza cliente. Per questo l'AI lo crea solo
// via `proponi_piano` → approvazione umana → `esegui_piano` (§7.2), mai come tool diretto.
//
// `studio_id` non è impostato qui: lo riempie il default DB `get_my_studio_id()` (come clienti/
// anagrafica), che per un superadmin via MCP risolve allo studio appuntato al token (§8.4).

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDateForDB } from '../../src/components/cliente-wizard/utils.js';

// Copia canonica/neutra del catalogo prestazioni (allineata a prestazioni_catalog in
// src/data/aml_regole_tecniche_v1.json). `inherentRisk` = rischio inerente della prestazione
// (RT2, 1-4); `onlyTabA` = la valutazione del rischio usa solo la Tabella A. Modificare qui se
// il catalogo regolatorio cambia.
export interface PrestazioneCatalog {
  id: string;
  label: string;
  inherentRisk: number;
  onlyTabA?: boolean;
}

export const PRESTAZIONI_CATALOG: PrestazioneCatalog[] = [
  { id: 'collegio-sindacale-no-revisione', label: 'Collegio sindacale senza revisione', inherentRisk: 1, onlyTabA: true },
  { id: 'visto-conformita', label: 'Apposizione del visto di conformità su dichiarazioni fiscali', inherentRisk: 1 },
  { id: 'predisposizione-interpelli', label: 'Predisposizione di interpelli con richiesta di chiarimenti interpretativi', inherentRisk: 1 },
  { id: 'risposte-quesiti', label: 'Risposte a quesiti di carattere fiscale e societario', inherentRisk: 1 },
  { id: 'consulente-tecnico', label: 'Consulente tecnico di parte', inherentRisk: 1 },
  { id: 'assistenza-innanzi-autorita', label: 'Funzioni di assistenza, difesa e rappresentanza innanzi ad una Autorità Giudiziale', inherentRisk: 1 },
  { id: 'funzioni-mediazione', label: 'Funzioni di mediazione e arbitrato', inherentRisk: 1 },
  { id: 'incarichi-giurisdizionali', label: 'Incarichi che derivano da nomine giurisdizionali', inherentRisk: 1 },
  { id: 'gestore-della-crisi', label: 'Incarichi di gestore della crisi e di esperto indipendente nell’ambito della composizione della crisi', inherentRisk: 1 },
  { id: 'formazione-editoria', label: 'Incarichi professionali nel settore della formazione e dell’editoria', inherentRisk: 1 },
  { id: 'odv', label: 'Componente di organismo di vigilanza ex d.lgs.231/2001 (OdV)', inherentRisk: 1 },
  { id: 'pratiche-telematiche', label: 'Predisposizione e/o invio telematico di pratiche varie agli uffici pubblici competenti', inherentRisk: 1 },
  { id: 'pratiche-diritti', label: 'Predisposizione presso gli uffici pubblici competenti di pratiche di prima iscrizione e rinnovo per la tutela di diritti', inherentRisk: 1 },
  { id: 'assitenza-tecnica-pa', label: 'Attività di assistenza tecnica e consulenza specialistica alla programmazione, gestione, attuazione, rendicontazione, monitoraggio, controllo, valutazione e supporto alla certificazione di risorse pubbliche, anche europee, nonché per l’esercizio e lo sviluppo della Funzione di Sorveglianza e Audit dei Programmi', inherentRisk: 1 },
  { id: 'amministrazione-societa', label: 'Amministrazione e liquidazione di società, enti, aziende, patrimoni, singoli beni (incarichi di nomina non giudiziale)', inherentRisk: 2 },
  { id: 'consulenza-tributaria', label: 'Consulenza in materia tributaria', inherentRisk: 2 },
  { id: 'consulenza-contrattuale', label: 'Consulenza contrattuale', inherentRisk: 2 },
  { id: 'amministrazione-liquidazione-non-giudiziale', label: 'Amministrazione/Liquidazione (nomina non giudiziale)', inherentRisk: 2 },
  { id: 'custodia-beni-non-giudiziale', label: 'Custodia e conservazione di beni e aziende (incarichi di nomina non giudiziale)', inherentRisk: 2 },
  { id: 'valutazioni-varie', label: "Valutazione di quote sociali, aziende, rami d'azienda, patrimoni, singoli beni e diritti (non rientranti in incarichi di CTP)", inherentRisk: 2 },
  { id: 'amministrazione-trust', label: 'Amministrazione di trust o istituti giuridici affini', inherentRisk: 3 },
  { id: 'assistenza-aziendale-continuativa', label: 'Assistenza e consulenza aziendale e societaria continuativa e generica', inherentRisk: 3, onlyTabA: true },
  { id: 'asseverazione-business-plan', label: "Attività di valutazione tecnica dell'iniziativa di impresa e di asseverazione dei business plan per l'accesso a finanziamenti pubblici", inherentRisk: 3 },
  { id: 'consulenza-economico-finanziaria', label: 'Consulenza economico-finanziaria-patrimoniale', inherentRisk: 3 },
  { id: 'costituzione-enti-trust', label: 'Costituzione di enti / trust / strutture analoghe', inherentRisk: 3 },
  { id: 'tenuta-contabilita', label: 'Tenuta della contabilità', inherentRisk: 3, onlyTabA: true },
  { id: 'consulenza-bilancio', label: 'Consulenza in materia di redazione del bilancio', inherentRisk: 3, onlyTabA: true },
  { id: 'revisione-legale', label: 'Revisione legale dei conti', inherentRisk: 3, onlyTabA: true },
  { id: 'finanza-straordinaria', label: 'Consulenza in operazioni di finanza straordinaria', inherentRisk: 4 },
];

export function getPrestazione(id: string): PrestazioneCatalog | undefined {
  return PRESTAZIONI_CATALOG.find((p) => p.id === id);
}

/** Catalogo "spiegato" per l'AI: id da usare in tipologia_prestazione_id, label e rischio inerente. */
export function descriviTipologiePrestazione() {
  return PRESTAZIONI_CATALOG.map((p) => ({
    value: p.id,
    label: p.label,
    rischio_inerente: p.inherentRisk,
    solo_tabella_a: p.onlyTabA ?? false,
  }));
}

export interface IncaricoArgs {
  cliente_id: string;
  tipologia_prestazione_id: string;
  codice_incarico?: string;
  descrizione?: string;
  scopo_natura?: string;
  data_inizio: string;
  data_fine?: string;
  importo_stimato?: number;
  relazioni_cliente_te?: string;
  provenienza_fondi?: string;
  mezzi_pagamento?: string;
  conferma_fondi_leciti?: boolean;
}

type FormatoCodice = 'manuale' | 'sequenziale' | 'sequenziale_cliente' | 'nome' | 'cf_piva';

interface ImpostazioniIncarico {
  formato: FormatoCodice;
  prefisso_attivo: boolean;
  prefisso: string;
  sequenziale_inizio: number;
  include_nome: boolean;
  include_cf_piva: boolean;
}

function cleanName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function joinParts(parts: string[]): string {
  return parts.filter(Boolean).join('-');
}

async function loadImpostazioniIncarico(
  client: SupabaseClient,
  studioId: string,
): Promise<ImpostazioniIncarico> {
  const { data } = await client
    .from('impostazioni_studio')
    .select('formato_codice_incarico, prefisso_incarico_attivo, prefisso_incarico, sequenziale_inizio_incarico, incarico_include_nome, incarico_include_cf_piva')
    .eq('studio_id', studioId)
    .maybeSingle();
  return {
    formato: (data?.formato_codice_incarico as FormatoCodice) || 'manuale',
    prefisso_attivo: data?.prefisso_incarico_attivo ?? true,
    prefisso: data?.prefisso_incarico || 'INC',
    sequenziale_inizio: data?.sequenziale_inizio_incarico ?? 1,
    include_nome: data?.incarico_include_nome ?? false,
    include_cf_piva: data?.incarico_include_cf_piva ?? false,
  };
}

/**
 * Policy di numerazione del codice incarico dello studio, "spiegata" all'AI: serve a sapere PRIMA
 * di proporre un incarico se il `codice_incarico` va fornito a mano (formato 'manuale') o se lo
 * genera il sistema — evitando il fallimento "codice_incarico mancante" in esecuzione.
 */
export async function descriviImpostazioniIncarico(
  client: SupabaseClient,
  studioId: string,
): Promise<{ codice_incarico: { formato: FormatoCodice; manuale: boolean; nota: string } }> {
  const imp = await loadImpostazioniIncarico(client, studioId);
  const manuale = imp.formato === 'manuale';
  return {
    codice_incarico: {
      formato: imp.formato,
      manuale,
      nota: manuale
        ? 'Numerazione MANUALE: devi fornire tu il codice_incarico in crea_incarico (segui la convenzione degli altri incarichi dello studio, vedi lista_incarichi).'
        : 'Numerazione AUTOMATICA: ometti codice_incarico, lo genera il sistema. Se ne fornisci uno, viene usato quello.',
    },
  };
}

/**
 * Genera il codice incarico secondo le impostazioni dello studio (mirror di
 * src/lib/codiceGenerator.generateCodiceIncarico), con i conteggi scopati allo studio per non
 * collidere/sballare per un superadmin. Ritorna null se il formato è 'manuale' (il codice deve
 * arrivare dall'AI) o se mancano i dati richiesti dal formato scelto.
 */
async function generaCodiceIncarico(
  client: SupabaseClient,
  studioId: string,
  imp: ImpostazioniIncarico,
  cliente: { id: string; ragione_sociale?: string | null; codice_fiscale?: string | null; partita_iva?: string | null },
): Promise<string | null> {
  if (imp.formato === 'manuale') return null;

  const prefix = imp.prefisso_attivo ? imp.prefisso : '';
  const nomePart = imp.include_nome && cliente.ragione_sociale ? cleanName(cliente.ragione_sociale) : '';
  const cfPiva = (cliente.codice_fiscale || cliente.partita_iva || '').toUpperCase().replace(/\s/g, '');
  const cfPart = imp.include_cf_piva && cfPiva ? cfPiva : '';

  if (imp.formato === 'sequenziale' || imp.formato === 'sequenziale_cliente') {
    let cq = client.from('incarichi').select('*', { count: 'exact', head: true }).eq('studio_id', studioId);
    if (imp.formato === 'sequenziale_cliente') cq = cq.eq('cliente_id', cliente.id);
    const { count } = await cq;
    const next = (count || 0) + imp.sequenziale_inizio;
    return joinParts([prefix, nomePart, cfPart, String(next).padStart(3, '0')]);
  }
  if (imp.formato === 'cf_piva') {
    return cfPiva ? joinParts([prefix, nomePart, cfPiva]) : null;
  }
  if (imp.formato === 'nome') {
    return cliente.ragione_sociale ? joinParts([prefix, cleanName(cliente.ragione_sociale)]) : null;
  }
  return null;
}

/**
 * Crea un incarico per un cliente dello studio. Valida che il cliente appartenga allo studio e
 * che la tipologia di prestazione esista in catalogo; genera il codice se non fornito (o lo esige
 * se il formato è 'manuale'). L'INSERT passa per RLS piena: lo `status` resta il default DB
 * ('active'). Lancia con messaggio chiaro su ogni precondizione non soddisfatta.
 */
export async function salvaIncarico(
  client: SupabaseClient,
  args: IncaricoArgs,
  studioId: string | null,
): Promise<{ incarico_id: string; codice_incarico: string; cliente_id: string; status: string }> {
  if (!studioId) throw new Error('Studio non determinato: impossibile creare l\'incarico.');

  if (!args.cliente_id) throw new Error('cliente_id obbligatorio.');
  if (!args.tipologia_prestazione_id) throw new Error('tipologia_prestazione_id obbligatorio.');
  if (!getPrestazione(args.tipologia_prestazione_id)) {
    throw new Error(
      `tipologia_prestazione_id "${args.tipologia_prestazione_id}" non valida. Usa descrivi_tipologie_prestazione per i valori ammessi.`,
    );
  }
  if (!args.data_inizio) throw new Error('data_inizio obbligatoria.');

  // Il cliente deve esistere ed appartenere allo studio appuntato (§8.4): oltre alla RLS, filtro
  // esplicito su studio_id così un superadmin non aggancia incarichi a clienti di altri studi.
  const { data: cliente, error: cliErr } = await client
    .from('clienti')
    .select('id, ragione_sociale, codice_fiscale, partita_iva')
    .eq('id', args.cliente_id)
    .eq('studio_id', studioId)
    .maybeSingle();
  if (cliErr) throw new Error(cliErr.message);
  if (!cliente) throw new Error('Cliente non trovato nello studio: verifica cliente_id con lista_clienti.');

  const dataInizio = formatDateForDB(args.data_inizio);
  if (!dataInizio) throw new Error(`data_inizio non valida ("${args.data_inizio}"): usa il formato dd/mm/yyyy (es. 15/01/2026).`);
  const dataFine = args.data_fine ? formatDateForDB(args.data_fine) : null;

  // Codice: usa quello fornito; altrimenti generalo dalle impostazioni studio. Se il formato è
  // 'manuale' e non è stato fornito → errore chiaro (non inventiamo un codice fuori convenzione).
  let codice = args.codice_incarico?.trim() || '';
  if (!codice) {
    const imp = await loadImpostazioniIncarico(client, studioId);
    const generato = await generaCodiceIncarico(client, studioId, imp, cliente);
    if (!generato) {
      throw new Error(
        'codice_incarico mancante: lo studio usa la numerazione manuale (o mancano i dati per generarlo). Fornisci codice_incarico.',
      );
    }
    codice = generato;
  }

  const payload = {
    cliente_id: args.cliente_id,
    codice_incarico: codice,
    tipologia_prestazione_id: args.tipologia_prestazione_id,
    descrizione: args.descrizione ?? '',
    scopo_natura: args.scopo_natura ?? '',
    data_inizio: dataInizio,
    data_fine: dataFine,
    importo_stimato: args.importo_stimato ?? 0,
    relazioni_cliente_te: args.relazioni_cliente_te ?? '',
    provenienza_fondi: args.provenienza_fondi ?? '',
    mezzi_pagamento: args.mezzi_pagamento ?? '',
    conferma_fondi_leciti: args.conferma_fondi_leciti ?? true,
  };

  const { data, error } = await client
    .from('incarichi')
    .insert(payload)
    .select('id, codice_incarico, status')
    .single();
  if (error) {
    // Violazione di unicità sul codice → messaggio attuabile invece dell'errore Postgres grezzo.
    if (/duplicate key|unique/i.test(error.message)) {
      throw new Error(`Codice incarico "${codice}" già esistente: fornisci un codice_incarico diverso.`);
    }
    throw new Error(error.message);
  }

  return {
    incarico_id: data.id,
    codice_incarico: data.codice_incarico,
    cliente_id: args.cliente_id,
    status: data.status,
  };
}
