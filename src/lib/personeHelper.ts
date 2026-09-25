import { supabase } from './supabase';
import { fetchAllInBatches } from './fetchAll';
import { parseCodiceFiscale, formatDate } from '../components/cliente-wizard/components/forms/PersonaFisicaForm';
import { getActiveStudioIdHolder } from './studioHelper';

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
 */
export async function savePersona(persona: PersonaFisicaRecord): Promise<string | null> {
  if (!persona.nome_cognome?.trim()) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const payload: Record<string, any> = {
    tipo_soggetto: persona.tipo_soggetto || 'persona_fisica',
    nome_cognome: persona.nome_cognome,
    codice_fiscale: persona.codice_fiscale || '',
    data_nascita: persona.data_nascita || '',
    luogo_nascita: persona.luogo_nascita || '',
    provincia_nascita: persona.provincia_nascita || '',
    nazionalita: persona.nazionalita || 'Italiana',
    professione: persona.professione || '',
    residenza: persona.residenza || '',
    documento_tipo: persona.documento_tipo || '',
    documento_numero: persona.documento_numero || '',
    documento_data_rilascio: persona.documento_data_rilascio || '',
    documento_data_scadenza: persona.documento_data_scadenza || '',
    documento_ente_rilascio: persona.documento_ente_rilascio || '',
    partita_iva: persona.partita_iva || null,
    natura_giuridica: persona.natura_giuridica || null,
    codice_ateco: persona.codice_ateco || null,
    pep: persona.pep ?? false,
    pep_verificato: persona.pep_verificato ?? false,
    pep_carica: persona.pep_carica || null,
    pep_data_verifica: persona.pep_data_verifica || null,
    pep_fonte_verifica: persona.pep_fonte_verifica || null,
    sanzioni: persona.sanzioni ?? false,
    sanzioni_verificato: persona.sanzioni_verificato ?? false,
    sanzioni_data_verifica: persona.sanzioni_data_verifica || null,
    sanzioni_fonte_verifica: persona.sanzioni_fonte_verifica || null,
    note_verifica: persona.note_verifica || null,
  };

  // Se ha un id, prova UPDATE diretto. Se l'id non esiste in anagrafica ma è un uuid valido
  // (caso: arriva da un record `clienti` virtuale in search unificata), facciamo INSERT con
  // quell'id per realizzare il bridge UUID condiviso cliente↔anagrafica.
  if (persona.id) {
    const { data: existsInAnagrafica } = await supabase
      .from('anagrafica_soggetti')
      .select('id')
      .eq('id', persona.id)
      .maybeSingle();

    if (existsInAnagrafica) {
      await supabase.from('anagrafica_soggetti').update(payload).eq('id', persona.id);
      return persona.id;
    }

    // Bridge: l'uuid esiste in `clienti` ma non in `anagrafica_soggetti`. Crea il record
    // di anagrafica con stesso uuid e linka `clienti.persona_id = uuid` per coerenza.
    const { data: inserted } = await supabase
      .from('anagrafica_soggetti')
      .insert({ id: persona.id, user_id: user.id, ...payload })
      .select('id')
      .single();

    if (inserted?.id) {
      await supabase.from('clienti').update({ persona_id: inserted.id }).eq('id', inserted.id);
      return inserted.id;
    }
    return null;
  }

  // Dedup automatica per CF (priorità) e P.IVA (fallback per casi CF≠P.IVA)
  const cf = persona.codice_fiscale?.trim() || '';
  const piva = persona.partita_iva?.trim() || '';
  if (cf || piva) {
    const existing = await findSoggettoEsistente({ codice_fiscale: cf, partita_iva: piva });
    if (existing) {
      // Se trovato solo come cliente (non in anagrafica), crea l'anagrafica con stesso uuid (bridge).
      if (existing.foundIn === 'clienti') {
        // Guardia anti-409: l'uuid del cliente potrebbe già avere un record anagrafica
        // (bridge creato in precedenza) con codice_fiscale diverso da quello cercato — in
        // quel caso findSoggettoEsistente non lo trova via CF e ritorna comunque l'id del
        // cliente. Una INSERT con quell'id esploderebbe con un PK conflict (409) e i dati
        // (es. flag PEP) andrebbero persi. Se l'anagrafica esiste già, aggiorniamo.
        const { data: giaInAnagrafica } = await supabase
          .from('anagrafica_soggetti')
          .select('id')
          .eq('id', existing.id)
          .maybeSingle();

        if (giaInAnagrafica) {
          await supabase.from('anagrafica_soggetti').update(payload).eq('id', existing.id);
          return existing.id;
        }

        const { data: inserted, error: bridgeError } = await supabase
          .from('anagrafica_soggetti')
          .insert({ id: existing.id, user_id: user.id, ...payload })
          .select('id')
          .single();
        if (bridgeError) {
          console.error('Errore bridge anagrafica_soggetti (foundIn=clienti):', bridgeError);
          return null;
        }
        if (inserted?.id) {
          await supabase.from('clienti').update({ persona_id: inserted.id }).eq('id', inserted.id);
          return inserted.id;
        }
        return null;
      }
      // Già in anagrafica (o in entrambe con stesso uuid): UPDATE
      await supabase.from('anagrafica_soggetti').update(payload).eq('id', existing.id);
      return existing.id;
    }
  }

  const { data } = await supabase.from('anagrafica_soggetti').insert({
    user_id: user.id,
    ...payload,
  }).select('id').single();

  return data?.id || null;
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
  const cf = (input.codice_fiscale || '').trim();
  const piva = (input.partita_iva || '').trim();
  if (!cf && !piva) return null;

  // Scope allo studio attivo: per superadmin la RLS espone righe di TUTTI gli studi e
  // `.maybeSingle()` rompe (multiple rows) appena lo stesso soggetto esiste in due studi.
  // Senza questo filtro il dedup torna null e si finisce per fare una INSERT duplicata.
  // Se non c'è studio attivo (boot in corso, superadmin senza studio selezionato),
  // rifiutiamo il lookup: meglio "non trovato" → INSERT nuovo nel proprio scope, che
  // un match cross-studio che fa puntare un cliente all'anagrafica di un altro studio.
  const activeStudioId = getActiveStudioIdHolder();
  if (!activeStudioId) return null;

  // 1. Tenta CF prima (chiave primaria identificativa)
  if (cf) {
    const qa = supabase.from('anagrafica_soggetti').select('id')
      .eq('codice_fiscale', cf).eq('studio_id', activeStudioId);
    const qc = supabase.from('clienti').select('id')
      .eq('codice_fiscale', cf).eq('tipo_cliente', 'impresa').eq('studio_id', activeStudioId);
    const [{ data: a }, { data: c }] = await Promise.all([qa.maybeSingle(), qc.maybeSingle()]);
    if (a && c) {
      // Stesso uuid → bridge già attivo. Uuid diversi → duplicato legacy: preferiamo cliente (P3).
      return a.id === c.id
        ? { id: a.id, foundIn: 'both' }
        : { id: c.id, foundIn: 'clienti' };
    }
    if (a) return { id: a.id, foundIn: 'anagrafica' };
    if (c) return { id: c.id, foundIn: 'clienti' };
  }

  // 2. Fallback su P.IVA per i casi CF≠P.IVA
  if (piva) {
    const qa = supabase.from('anagrafica_soggetti').select('id')
      .eq('partita_iva', piva).eq('studio_id', activeStudioId);
    const qc = supabase.from('clienti').select('id')
      .eq('partita_iva', piva).eq('tipo_cliente', 'impresa').eq('studio_id', activeStudioId);
    const [{ data: a }, { data: c }] = await Promise.all([qa.maybeSingle(), qc.maybeSingle()]);
    if (a && c) {
      return a.id === c.id
        ? { id: a.id, foundIn: 'both' }
        : { id: c.id, foundIn: 'clienti' };
    }
    if (a) return { id: a.id, foundIn: 'anagrafica' };
    if (c) return { id: c.id, foundIn: 'clienti' };
  }

  return null;
}

/**
 * Riduce un nome alla forma su cui ha senso confrontare due record che hanno
 * già lo stesso codice fiscale. Serve a rispondere a "è lo stesso soggetto?",
 * non a "è scritto identico?".
 *
 * Ignora **l'ordine delle parole**: la piattaforma scrive i nomi in due modi
 * diversi a seconda di come entrano. L'import da Excel produce "COGNOME NOME"
 * (vedi `clienteImport`), mentre i dati che arrivano dalla visura camerale sono
 * costruiti come `${name} ${surname}`, quindi "Nome Cognome". Lo stesso
 * soggetto finiva così a confronto con sé stesso e risultava diverso.
 *
 * Ignora anche accenti e punteggiatura: "Nicolò"/"Nicolo" e "ACME S.r.l."/"ACME
 * SRL" sono la stessa cosa. I punti e gli apostrofi spariscono senza lasciare
 * spazio (S.R.L. → srl), gli altri segni separano parole (Rossi-Bianchi → due
 * parole), che è come vengono usati.
 *
 * A parità di codice fiscale il rischio di confondere due soggetti davvero
 * distinti è trascurabile: dovrebbero avere nomi composti dalle stesse parole.
 */
export function normalizeNomeForCompare(s: string | null | undefined): string {
  const pulito = (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accenti
    .toLowerCase()
    .replace(/[.'’`]/g, '')       // punti e apostrofi: non separano
    .replace(/[^a-z0-9]+/g, ' ')  // ogni altro segno: separa
    .trim();
  if (!pulito) return '';
  return pulito.split(' ').sort().join(' ');
}

/**
 * Record che rappresentano il soggetto stesso, e che quindi non sono un conflitto
 * anche se il nome salvato è diverso da quello ora nel form.
 */
export interface CfConflictEsclusioni {
  /** Cliente in modifica: la sua riga in `clienti` non è un conflitto con sé stessa. */
  clienteId?: string | null;
  /** Righe di `anagrafica_soggetti` che sono il soggetto stesso (persona_id, rappresentante…). */
  personaIds?: (string | null | undefined)[];
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
 *
 * `esclusioni` serve in modifica: senza, il confronto è solo sul nome e basta correggere
 * un refuso nel nome del cliente aperto perché il suo stesso record salvato (che ha ancora
 * il nome vecchio) venga segnalato come conflitto. Escludendo per identità restano
 * segnalati solo i CF condivisi da soggetti realmente distinti.
 */
export async function findCodiceFiscaleConflict(
  codiceFiscale: string,
  currentName: string,
  esclusioni?: CfConflictEsclusioni,
): Promise<{ id: string; nome: string } | null> {
  const cf = (codiceFiscale || '').trim();
  if (!/^[A-Za-z0-9]{11}$|^[A-Za-z0-9]{16}$/.test(cf)) return null;

  const activeStudioId = getActiveStudioIdHolder();
  if (!activeStudioId) return null;

  const currentNorm = normalizeNomeForCompare(currentName);
  const personaEsclusi = new Set((esclusioni?.personaIds || []).filter(Boolean) as string[]);
  const clienteEscluso = esclusioni?.clienteId || null;

  // Lanciamo entrambe le lookup in parallelo: vengono usate solo per la disambiguazione del nome
  // mostrata nel banner del wizard, quindi tagliare un round-trip vale il costo della query
  // extra anche nel caso "match trovato in anagrafica" (la tabella è indicizzata su codice_fiscale).
  const [
    { data: anag },
    { data: cli },
  ] = await Promise.all([
    // `deleted_at`: un soggetto spostato nel cestino non è un conflitto. Senza
    // questo filtro l'avviso restava anche dopo aver cestinato il duplicato, e
    // non c'era modo di farlo tacere.
    supabase
      .from('anagrafica_soggetti')
      .select('id, nome_cognome')
      .eq('studio_id', activeStudioId)
      .is('deleted_at', null)
      .ilike('codice_fiscale', cf)
      .limit(10),
    supabase
      .from('clienti')
      .select('id, ragione_sociale, codice_cliente')
      .eq('studio_id', activeStudioId)
      .is('deleted_at', null)
      .ilike('codice_fiscale', cf)
      .limit(10),
  ]);

  for (const row of anag || []) {
    if (personaEsclusi.has(row.id)) continue;
    if (normalizeNomeForCompare(row.nome_cognome) !== currentNorm) {
      return { id: row.id, nome: row.nome_cognome || '' };
    }
  }

  const anagIds = new Set((anag || []).map(r => r.id));
  for (const row of cli || []) {
    if (anagIds.has(row.id)) continue;
    // Con il bridge cliente↔anagrafica l'uuid è condiviso: un id escluso come
    // persona vale anche per la riga `clienti` omonima.
    if (row.id === clienteEscluso || personaEsclusi.has(row.id)) continue;
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
 * Rilegge una singola anagrafica per id (usata per riallineare una scheda di
 * dettaglio aperta dopo un salvataggio, senza attendere il ricarico della lista).
 */
export async function getPersona(id: string): Promise<PersonaFisicaRecord | null> {
  const { data, error } = await supabase
    .from('anagrafica_soggetti')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return null;
  return mapPersonaRow(data);
}

/**
 * Elenca tutte le persone fisiche dell'utente corrente.
 */
export async function listPersone(
  search?: string,
  studioId?: string | null,
  onBatch?: (persone: PersonaFisicaRecord[]) => void,
): Promise<PersonaFisicaRecord[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Stessa sanitizzazione di cercaPersone: rimuove i caratteri che rompono/iniettano il parser
  // PostgREST `.or()` (l'interpolazione grezza era il difetto).
  const term = (search && search.trim().length >= 2)
    ? search.trim().replace(/[%,()*]/g, '')
    : '';

  // Costruttore di query fresca per ogni blocco: la ricerca resta lato server, quindi il
  // caricamento a blocchi scorre comunque l'intero insieme dei risultati coerenti con la
  // ricerca (nessun cap silenzioso a 1000 righe). Ordine per created_at desc + id per stabilità:
  // così durante il caricamento progressivo pagina 1 non si rimescola.
  const buildQuery = () => {
    let query = supabase
      .from('anagrafica_soggetti')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true });

    if (studioId) query = query.eq('studio_id', studioId);

    if (term.length >= 2) {
      const q = `%${term}%`;
      query = query.or(`nome_cognome.ilike.${q},codice_fiscale.ilike.${q},partita_iva.ilike.${q}`);
    }
    return query;
  };

  try {
    const data = await fetchAllInBatches<any>(buildQuery, {
      // Ogni blocco: rimappa l'accumulato e notifica il chiamante per il rendering progressivo.
      onBatch: onBatch ? (all) => onBatch(all.map(mapPersonaRow)) : undefined,
    });
    return data.map(mapPersonaRow);
  } catch (err) {
    console.error('Errore caricamento anagrafiche:', err);
    return [];
  }
}

/**
 * Elimina una persona fisica per id.
 */
export async function deletePersona(id: string): Promise<void> {
  await supabase.from('anagrafica_soggetti').delete().eq('id', id);
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
