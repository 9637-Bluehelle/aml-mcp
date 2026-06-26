import { supabase } from './supabase';
import { parseCodiceFiscale, formatDate } from '../components/cliente-wizard/components/forms/PersonaFisicaForm';
import { getActiveStudioIdHolder } from './studioHelper';
import { savePersonaWithClient, findSoggettoEsistenteWithClient } from '../../api/_lib/personeService';

// Le varianti client-injectable vivono nel modulo neutro `api/_lib/personeService` (no React,
// no singleton) per essere riusate dal server MCP. Ri-esportate qui per compatibilità con i
// consumatori esistenti che le importano da `personeHelper`.
export { savePersonaWithClient, findSoggettoEsistenteWithClient };

export type TipoSoggetto = 'persona_fisica' | 'azienda';

export interface PersonaFisicaRecord {
  id?: string;
  tipo_soggetto?: TipoSoggetto;
  // Per azienda: nome_cognome = ragione sociale, codice_fiscale = CF 11 cifre,
  // residenza = sede legale, professione = attività svolta
  nome_cognome: string;
  codice_fiscale: string;
  data_nascita: string;
  luogo_nascita: string;
  provincia_nascita: string;
  nazionalita: string;
  professione: string;
  residenza: string;
  documento_tipo: string;
  documento_numero: string;
  documento_data_rilascio: string;
  documento_data_scadenza: string;
  documento_ente_rilascio: string;
  // Campi specifici azienda
  partita_iva?: string;
  natura_giuridica?: string;
  codice_ateco?: string;
  // PEP & Sanzioni
  pep?: boolean;
  pep_verificato?: boolean;
  pep_carica?: string;
  pep_data_verifica?: string;
  pep_fonte_verifica?: string;
  sanzioni?: boolean;
  sanzioni_verificato?: boolean;
  sanzioni_data_verifica?: string;
  sanzioni_fonte_verifica?: string;
  note_verifica?: string;
  // Timestamp (read-only, popolati da DB)
  created_at?: string;
  updated_at?: string;
}

/**
 * Riconosce il tipo di soggetto dal codice fiscale.
 *  - 11 cifre numeriche → azienda
 *  - 16 caratteri alfanumerici → persona fisica
 *  - altrimenti null (indeterminato)
 */
export function detectTipoSoggetto(codiceFiscale: string | null | undefined): TipoSoggetto | null {
  const cf = (codiceFiscale || '').trim().toUpperCase();
  if (/^\d{11}$/.test(cf)) return 'azienda';
  if (/^[A-Z0-9]{16}$/.test(cf)) return 'persona_fisica';
  return null;
}

/**
 * Salva o aggiorna una persona fisica nella tabella centralizzata.
 * Se esiste già un record con lo stesso codice_fiscale (non vuoto), lo aggiorna.
 * Altrimenti crea un nuovo record.
 *
 * Wrapper che usa il client Supabase singleton (UI) e lo studio attivo dal holder.
 * La logica vive in `savePersonaWithClient` per essere riusata server-side (MCP),
 * dove il client autenticato e lo studio_id vengono iniettati per-richiesta.
 */
export async function savePersona(persona: PersonaFisicaRecord): Promise<string | null> {
  return savePersonaWithClient(supabase, persona, getActiveStudioIdHolder());
}

/**
 * Cerca soggetti combinando `anagrafica_soggetti` e `clienti` (tipo_cliente='impresa').
 * Dedup per UUID: i clienti già rappresentati come anagrafica con stesso uuid sono filtrati.
 * I clienti non ancora in anagrafica vengono mappati come PersonaFisicaRecord virtuale,
 * pronti a essere usati come bridge (UUID condiviso) al momento della selezione.
 */
export async function searchPersone(query: string): Promise<PersonaFisicaRecord[]> {
  if (query.trim().length < 2) return [];

  // Split in token su whitespace così "Simona Castorina" e "Castorina Simona"
  // matchano la stessa riga indipendentemente dall'ordine in cui è stato salvato il nome.
  // Ogni token deve apparire in nome_cognome | codice_fiscale | partita_iva (AND fra token).
  const tokens = query
    .trim()
    .split(/\s+/)
    .map(t => t.replace(/[%,()*]/g, '')) // sanitizza i caratteri che rompono il parser PostgREST .or()
    .filter(t => t.length >= 2);

  if (tokens.length === 0) return [];

  // Scope allo studio attivo: per superadmin la RLS lascia passare righe di tutti gli studi
  // (vedi policy "Superadmin can view all anagrafica_soggetti"), quindi senza questo filtro
  // appaiono doppioni di soggetti presenti in più studi e il dedup downstream si rompe.
  // Se non c'è uno studio attivo (StudioContext non ancora pronto, o superadmin che non ha
  // ancora selezionato uno studio): rifiutiamo la ricerca per evitare bridge UUID cross-studio
  // accidentali. Meglio risultato vuoto che linkare un cliente a un'anagrafica di altro studio.
  const activeStudioId = getActiveStudioIdHolder();
  if (!activeStudioId) return [];

  // 1. Anagrafica soggetti (sorgente principale)
  let qAnagrafica = supabase.from('anagrafica_soggetti').select('*').eq('studio_id', activeStudioId).is('deleted_at', null);
  for (const t of tokens) {
    const like = `%${t}%`;
    qAnagrafica = qAnagrafica.or(`nome_cognome.ilike.${like},codice_fiscale.ilike.${like},partita_iva.ilike.${like}`);
  }

  // 2. Clienti impresa (per pescare le aziende già clienti ma non ancora in anagrafica).
  //    Le persone fisiche/professionisti-cliente hanno già il bridge tramite persona_id, quindi
  //    la loro anagrafica è già nei risultati di sopra: non dobbiamo cercarle qui.
  let qClienti = supabase
    .from('clienti')
    .select('id, ragione_sociale, codice_fiscale, partita_iva, natura_giuridica, codice_ateco, attivita_svolta, indirizzo, paese, persona_id, created_at, updated_at')
    .eq('tipo_cliente', 'impresa')
    .eq('studio_id', activeStudioId);
  for (const t of tokens) {
    const like = `%${t}%`;
    qClienti = qClienti.or(`ragione_sociale.ilike.${like},codice_fiscale.ilike.${like},partita_iva.ilike.${like}`);
  }

  // Le due query sono indipendenti: il dedup avviene dopo aver ricevuto entrambi i risultati,
  // quindi possiamo parallelizzarle per dimezzare la latenza dell'autocomplete.
  const [
    { data: anagraficaData },
    { data: clientiData },
  ] = await Promise.all([
    qAnagrafica.order('updated_at', { ascending: false }).limit(50),
    qClienti.order('updated_at', { ascending: false }).limit(50),
  ]);
  const fromAnagrafica = (anagraficaData || []).map(mapPersonaRow);

  // Filtra clienti già rappresentati dall'anagrafica (UUID condiviso) per evitare doppioni
  const anagraficaIds = new Set(fromAnagrafica.map(p => p.id).filter(Boolean));
  const fromClienti = (clientiData || [])
    .filter(c => !anagraficaIds.has(c.id))
    .map(mapClienteImpresaRow);

  // Merge: anagrafica prima (più ricca), poi clienti-only
  return [...fromAnagrafica, ...fromClienti];
}

/**
 * Cerca un soggetto esistente per CF/P.IVA in `anagrafica_soggetti` e `clienti` (impresa).
 * Priorità: codice_fiscale > partita_iva. Restituisce l'uuid del primo match trovato,
 * con indicazione della sorgente (utile a chi chiama per decidere se serve creare il bridge).
 * Multi-tenant: lo studio è già scope-limited dalle RLS.
 */
export async function findSoggettoEsistente(input: {
  codice_fiscale?: string | null;
  partita_iva?: string | null;
}): Promise<{ id: string; foundIn: 'anagrafica' | 'clienti' | 'both' } | null> {
  return findSoggettoEsistenteWithClient(supabase, input, getActiveStudioIdHolder());
}

function normalizeNomeForCompare(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Cerca un soggetto che usa lo stesso codice fiscale ma ha un nome diverso da quello
 * attualmente inserito nel form. Usato per avvisi non-bloccanti nel wizard cliente.
 *
 * Match valido solo se il CF è formalmente plausibile (11 cifre per azienda, 16 alfanumerici
 * per persona fisica); altrimenti restituisce null senza interrogare il DB.
 *
 * Cerca sia in `anagrafica_soggetti` che in `clienti` (fallback per record legacy senza bridge),
 * scopato allo studio attivo.
 */
export async function findCodiceFiscaleConflict(
  codiceFiscale: string,
  currentName: string,
): Promise<{ id: string; nome: string } | null> {
  const cf = (codiceFiscale || '').trim();
  if (!/^[A-Za-z0-9]{11}$|^[A-Za-z0-9]{16}$/.test(cf)) return null;

  const activeStudioId = getActiveStudioIdHolder();
  if (!activeStudioId) return null;

  const currentNorm = normalizeNomeForCompare(currentName);

  // Lanciamo entrambe le lookup in parallelo: vengono usate solo per la disambiguazione del nome
  // mostrata nel banner del wizard, quindi tagliare un round-trip vale il costo della query
  // extra anche nel caso "match trovato in anagrafica" (la tabella è indicizzata su codice_fiscale).
  const [
    { data: anag },
    { data: cli },
  ] = await Promise.all([
    supabase
      .from('anagrafica_soggetti')
      .select('id, nome_cognome')
      .eq('studio_id', activeStudioId)
      .ilike('codice_fiscale', cf)
      .is('deleted_at', null)
      .limit(10),
    supabase
      .from('clienti')
      .select('id, ragione_sociale, codice_cliente')
      .eq('studio_id', activeStudioId)
      .ilike('codice_fiscale', cf)
      .is('deleted_at', null)
      .limit(10),
  ]);

  for (const row of anag || []) {
    if (normalizeNomeForCompare(row.nome_cognome) !== currentNorm) {
      return { id: row.id, nome: row.nome_cognome || '' };
    }
  }

  const anagIds = new Set((anag || []).map(r => r.id));
  for (const row of cli || []) {
    if (anagIds.has(row.id)) continue;
    const nome = row.ragione_sociale || row.codice_cliente || '';
    if (normalizeNomeForCompare(nome) !== currentNorm) {
      return { id: row.id, nome };
    }
  }

  return null;
}

/**
 * Mappa una riga di `clienti` (tipo_cliente='impresa') in PersonaFisicaRecord.
 * Usata dalla search unificata per esporre i clienti azienda ancora privi di anagrafica
 * come opzioni selezionabili. L'uuid è quello del cliente: al primo "import esplicito"
 * (savePersona con id valorizzato) verrà creato il record anagrafica con stesso uuid.
 */
function mapClienteImpresaRow(r: any): PersonaFisicaRecord {
  return {
    id: r.id,
    tipo_soggetto: 'azienda',
    nome_cognome: r.ragione_sociale || '',
    codice_fiscale: r.codice_fiscale || '',
    data_nascita: '',
    luogo_nascita: '',
    provincia_nascita: '',
    nazionalita: r.paese || 'Italiana',
    professione: '',
    residenza: r.indirizzo || '',
    documento_tipo: '',
    documento_numero: '',
    documento_data_rilascio: '',
    documento_data_scadenza: '',
    documento_ente_rilascio: '',
    partita_iva: r.partita_iva || '',
    natura_giuridica: r.natura_giuridica || '',
    codice_ateco: r.codice_ateco || '',
    pep: false,
    pep_verificato: false,
    pep_carica: '',
    pep_data_verifica: '',
    pep_fonte_verifica: '',
    sanzioni: false,
    sanzioni_verificato: false,
    sanzioni_data_verifica: '',
    sanzioni_fonte_verifica: '',
    note_verifica: '',
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function mapPersonaRow(r: any): PersonaFisicaRecord {
  let data_nascita = r.data_nascita || '';
  let luogo_nascita = r.luogo_nascita || '';
  let provincia_nascita = r.provincia_nascita || '';

  // Se ci sono campi nascita vuoti ma il CF è valido, recuperali dal codice fiscale
  const cf = r.codice_fiscale || '';
  if (cf.length === 16 && (!data_nascita || !luogo_nascita || !provincia_nascita)) {
    const dati = parseCodiceFiscale(cf);
    if (dati) {
      if (!data_nascita) data_nascita = formatDate(dati.data_nascita);
      if (!luogo_nascita && dati.comune) luogo_nascita = dati.comune;
      if (!provincia_nascita && dati.provincia) provincia_nascita = dati.provincia;
    }
  }

  return {
    id: r.id,
    tipo_soggetto: (r.tipo_soggetto as TipoSoggetto) || 'persona_fisica',
    nome_cognome: r.nome_cognome || '',
    codice_fiscale: cf,
    data_nascita,
    luogo_nascita,
    provincia_nascita,
    nazionalita: r.nazionalita || 'Italiana',
    professione: r.professione || '',
    residenza: r.residenza || '',
    documento_tipo: r.documento_tipo || '',
    documento_numero: r.documento_numero || '',
    documento_data_rilascio: r.documento_data_rilascio || '',
    documento_data_scadenza: r.documento_data_scadenza || '',
    documento_ente_rilascio: r.documento_ente_rilascio || '',
    partita_iva: r.partita_iva || '',
    natura_giuridica: r.natura_giuridica || '',
    codice_ateco: r.codice_ateco || '',
    pep: r.pep ?? false,
    pep_verificato: r.pep_verificato ?? false,
    pep_carica: r.pep_carica || '',
    pep_data_verifica: r.pep_data_verifica || '',
    pep_fonte_verifica: r.pep_fonte_verifica || '',
    sanzioni: r.sanzioni ?? false,
    sanzioni_verificato: r.sanzioni_verificato ?? false,
    sanzioni_data_verifica: r.sanzioni_data_verifica || '',
    sanzioni_fonte_verifica: r.sanzioni_fonte_verifica || '',
    note_verifica: r.note_verifica || '',
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * Elenca tutte le persone fisiche dell'utente corrente.
 */
export async function listPersone(search?: string, studioId?: string | null): Promise<PersonaFisicaRecord[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('anagrafica_soggetti')
    .select('*')
    .is('deleted_at', null)
    .order('nome_cognome', { ascending: true });

  if (studioId) query = query.eq('studio_id', studioId);

  if (search && search.trim().length >= 2) {
    // Stessa sanitizzazione di cercaPersone: rimuove i caratteri che rompono/iniettano il parser
    // PostgREST `.or()` (l'interpolazione grezza era il difetto).
    const term = search.trim().replace(/[%,()*]/g, '');
    if (term.length >= 2) {
      const q = `%${term}%`;
      query = query.or(`nome_cognome.ilike.${q},codice_fiscale.ilike.${q},partita_iva.ilike.${q}`);
    }
  }

  const { data } = await query;
  return (data || []).map(mapPersonaRow);
}

/**
 * Elimina una persona fisica per id. Hard-delete di sicurezza: PRIMA verifica che non sia ancora in
 * uso (titolare/rappresentante/nodo/documento) per non lasciare orfani via FK SET NULL, e propaga
 * gli errori invece di ingoiarli. La via normale di cancellazione resta il cestino.
 */
export async function deletePersona(id: string): Promise<void> {
  const { data: inUso, error: chkErr } = await supabase.rpc('anagrafica_in_uso', { p_persona_id: id });
  if (chkErr) throw new Error(chkErr.message);
  if (inUso) throw new Error('Anagrafica ancora in uso (titolare/rappresentante/nodo/documento): non eliminabile.');
  const { error } = await supabase.from('anagrafica_soggetti').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface ClienteAssociato {
  id: string;
  codice_cliente: string;
  ragione_sociale: string;
  tipo_cliente: string;
  ruolo: string; // 'cliente' | 'titolare_effettivo' | 'rappresentante_legale'
}

/**
 * Trova i clienti associati a una persona fisica (per codice_fiscale o nome).
 */
// ---------- Documenti legati alla persona ----------

export interface DocumentoPersona {
  id: string;
  persona_id: string;
  tipologia: string;
  nome_file: string;
  descrizione: string;
  file_path: string;
  data_acquisizione: string;
  data_scadenza: string | null;
  rinnovo_di: string | null;
  created_at?: string;
}

/**
 * Carica i documenti allegati a una persona fisica.
 */
export async function listDocumentiPersona(personaId: string): Promise<DocumentoPersona[]> {
  const { data } = await supabase
    .from('documenti')
    .select('id, persona_id, tipologia, nome_file, descrizione, file_path, data_acquisizione, data_scadenza, rinnovo_di, created_at')
    .eq('persona_id', personaId)
    .is('deleted_at', null)
    .order('data_acquisizione', { ascending: false })
    .order('created_at', { ascending: false });
  return (data || []) as DocumentoPersona[];
}

/**
 * Trova tutti i persona_id associati a un cliente (cliente diretto + titolari effettivi).
 * Usato da DocumentiAllegati per mostrare i documenti persona nella sezione cliente.
 * Usa i FK persona_id diretti quando disponibili, con fallback su codice_fiscale.
 */
export async function findPersoneIdByCliente(clienteId: string): Promise<string[]> {
  const ids: string[] = [];

  // 1. Il cliente stesso (via persona_id FK)
  const { data: cliente } = await supabase
    .from('clienti')
    .select('persona_id')
    .eq('id', clienteId)
    .maybeSingle();

  if (cliente?.persona_id) {
    ids.push(cliente.persona_id);
  }

  // 2. Titolari effettivi del cliente (via persona_id FK)
  const { data: titolari } = await supabase
    .from('titolari_effettivi')
    .select('persona_id')
    .eq('cliente_id', clienteId);

  if (titolari) {
    for (const t of titolari) {
      if (t.persona_id && !ids.includes(t.persona_id)) {
        ids.push(t.persona_id);
      }
    }
  }

  return ids;
}

export async function findClientiAssociati(persona: PersonaFisicaRecord): Promise<ClienteAssociato[]> {
  const risultati: ClienteAssociato[] = [];
  if (!persona.id) return risultati;

  // Le tre lookup iniziali sono indipendenti (cliente diretto / rappresentante legale / titolare
  // effettivo): tre round-trip sequenziali diventano uno solo se parallelizzate.
  const [
    { data: clientiByFK },
    { data: clientiByRL },
    { data: titolariByFK },
  ] = await Promise.all([
    supabase
      .from('clienti')
      .select('id, codice_cliente, ragione_sociale, tipo_cliente')
      .eq('persona_id', persona.id),
    supabase
      .from('clienti')
      .select('id, codice_cliente, ragione_sociale, tipo_cliente')
      .eq('rappresentante_persona_id', persona.id),
    supabase
      .from('titolari_effettivi')
      .select('cliente_id')
      .eq('persona_id', persona.id),
  ]);

  if (clientiByFK) {
    clientiByFK.forEach(c => {
      risultati.push({ ...c, ruolo: 'cliente' });
    });
  }

  if (clientiByRL) {
    clientiByRL.forEach(c => {
      if (!risultati.find(r => r.id === c.id && r.ruolo === 'rappresentante_legale')) {
        risultati.push({ ...c, ruolo: 'rappresentante_legale' });
      }
    });
  }

  // La risoluzione clienti per titolare effettivo dipende dagli ID restituiti sopra, quindi resta
  // sequenziale; ma ora parte subito dopo il batch parallelo invece di attendere 3 round-trip.
  if (titolariByFK && titolariByFK.length > 0) {
    const clienteIds = [...new Set(titolariByFK.map(t => t.cliente_id))];
    const { data: clienti } = await supabase
      .from('clienti')
      .select('id, codice_cliente, ragione_sociale, tipo_cliente')
      .in('id', clienteIds);

    if (clienti) {
      clienti.forEach(c => {
        if (!risultati.find(r => r.id === c.id && r.ruolo === 'titolare_effettivo')) {
          risultati.push({ ...c, ruolo: 'titolare_effettivo' });
        }
      });
    }
  }

  return risultati;
}

/**
 * Arricchisce un record cliente con i dati del rappresentante legale da anagrafica_soggetti.
 * Aggiunge i campi rappresentante_legale, codice_fiscale_rappresentante, etc.
 * al record in modo che i componenti di visualizzazione funzionino senza modifiche.
 */
export async function enrichClienteWithRappresentante(clienteData: any): Promise<any> {
  let enriched = { ...clienteData };

  // Arricchisci con dati PEP da anagrafica_soggetti (persona_fisica / professionista)
  if (clienteData.persona_id) {
    const { data: persona } = await supabase
      .from('anagrafica_soggetti')
      .select('pep, pep_verificato, pep_carica, pep_data_verifica, pep_fonte_verifica, sanzioni, sanzioni_verificato, sanzioni_data_verifica, sanzioni_fonte_verifica, note_verifica')
      .eq('id', clienteData.persona_id)
      .maybeSingle();
    if (persona) {
      enriched.pep = persona.pep ?? enriched.pep;
      enriched.pep_verificato = persona.pep_verificato ?? enriched.pep_verificato;
      enriched.pep_carica = persona.pep_carica || '';
      enriched.pep_data_verifica = persona.pep_data_verifica || enriched.pep_data_verifica;
      enriched.pep_fonte_verifica = persona.pep_fonte_verifica || enriched.pep_fonte_verifica;
      enriched.sanzioni = persona.sanzioni ?? enriched.sanzioni;
      enriched.sanzioni_verificato = persona.sanzioni_verificato ?? enriched.sanzioni_verificato;
      enriched.note_verifica = persona.note_verifica || enriched.note_verifica;
    }
  }

  // Arricchisci con dati rappresentante legale (impresa)
  if (clienteData.rappresentante_persona_id) {
    const { data: rl } = await supabase
      .from('anagrafica_soggetti')
      .select('*')
      .eq('id', clienteData.rappresentante_persona_id)
      .maybeSingle();

    if (rl) {
      Object.assign(enriched, {
        rappresentante_legale: rl.nome_cognome || '',
        codice_fiscale_rappresentante: rl.codice_fiscale || '',
        tipo_soggetto_rappresentante: rl.tipo_soggetto || 'persona_fisica',
        partita_iva_rappresentante: rl.partita_iva || '',
        natura_giuridica_rappresentante: rl.natura_giuridica || '',
        codice_ateco_rappresentante: rl.codice_ateco || '',
        data_nascita_rappresentante: rl.data_nascita || '',
        luogo_nascita_rappresentante: rl.luogo_nascita || '',
        provincia_nascita_rappresentante: rl.provincia_nascita || '',
        nazionalita_rappresentante: rl.nazionalita || '',
        residenza_rappresentante: rl.residenza || '',
        rappresentante_legale_documento: {
          tipo: rl.documento_tipo || '',
          numero: rl.documento_numero || '',
          data_rilascio: rl.documento_data_rilascio || '',
          data_scadenza: rl.documento_data_scadenza || '',
          ente_rilascio: rl.documento_ente_rilascio || '',
        },
        // PEP del rappresentante → PEP dell'impresa
        pep: rl.pep ?? enriched.pep,
        pep_verificato: rl.pep_verificato ?? enriched.pep_verificato,
        pep_carica: rl.pep_carica || '',
        pep_data_verifica: rl.pep_data_verifica || enriched.pep_data_verifica,
        pep_fonte_verifica: rl.pep_fonte_verifica || enriched.pep_fonte_verifica,
      });
    }
  }

  return enriched;
}

/**
 * Arricchisce i record titolari_effettivi con i dati persona da anagrafica_soggetti.
 * I titolari vengono caricati con join e mappati al formato atteso dai componenti.
 */
export async function loadTitolariWithPersona(clienteId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('titolari_effettivi')
    .select('id, cliente_id, persona_id, tipo_rapporto, ruolo, is_pep, pep_carica, note_quota, anagrafica_soggetti(tipo_soggetto, nome_cognome, codice_fiscale, professione, luogo_nascita, provincia_nascita, data_nascita, nazionalita, residenza, documento_tipo, documento_numero, documento_ente_rilascio, documento_data_rilascio, documento_data_scadenza, partita_iva, natura_giuridica, codice_ateco, pep, pep_verificato, pep_carica, pep_data_verifica, pep_fonte_verifica, sanzioni, sanzioni_verificato, sanzioni_data_verifica, sanzioni_fonte_verifica)')
    .eq('cliente_id', clienteId);

  if (error || !data) return [];

  return data.map(t => {
    const pf = (t as any).anagrafica_soggetti || {};
    return {
      id: t.id,
      cliente_id: t.cliente_id,
      persona_id: t.persona_id,
      tipo_rapporto: t.tipo_rapporto,
      ruolo: (t as any).ruolo || '',
      tipo_soggetto: pf.tipo_soggetto || 'persona_fisica',
      is_pep: pf.pep ?? t.is_pep ?? false,
      pep_carica: pf.pep_carica || t.pep_carica || '',
      pep_verificato: pf.pep_verificato ?? false,
      pep_data_verifica: pf.pep_data_verifica || '',
      pep_fonte_verifica: pf.pep_fonte_verifica || '',
      sanzioni: pf.sanzioni ?? false,
      sanzioni_verificato: pf.sanzioni_verificato ?? false,
      sanzioni_data_verifica: pf.sanzioni_data_verifica || '',
      sanzioni_fonte_verifica: pf.sanzioni_fonte_verifica || '',
      note_quota: t.note_quota,
      // Dati persona da anagrafica_soggetti
      nome_cognome: pf.nome_cognome || '',
      codice_fiscale: pf.codice_fiscale || '',
      professione: pf.professione || '',
      comune_nascita: pf.luogo_nascita || '',
      provincia_nascita: pf.provincia_nascita || '',
      data_nascita: pf.data_nascita || '',
      nazionalita: pf.nazionalita || '',
      residenza: pf.residenza || '',
      documento_tipo: pf.documento_tipo || '',
      documento_numero: pf.documento_numero || '',
      documento_rilascio_ente: pf.documento_ente_rilascio || '',
      documento_rilascio_data: pf.documento_data_rilascio || '',
      documento_scadenza: pf.documento_data_scadenza || '',
      // Campi azienda (popolati solo quando tipo_soggetto='azienda')
      partita_iva: pf.partita_iva || '',
      natura_giuridica: pf.natura_giuridica || '',
      codice_ateco: pf.codice_ateco || '',
    };
  });
}
