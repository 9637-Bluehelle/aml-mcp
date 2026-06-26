// Servizio condiviso per il salvataggio cliente (UI ↔ MCP).
//
// Logica pura estratta da `useClienteSave` (vedi §9 del piano MCP): niente React,
// niente singleton Supabase, niente toast. Riceve come parametri il client Supabase
// **autenticato** e lo `studio_id` attivo, così la stessa fonte di verità vale sia per
// la UI (che inietta il singleton browser + lo studio del holder) sia per il server MCP
// (che inietta un client coniato per-richiesta + lo studio appuntato al token).
//
// Importa solo moduli neutri (no React, no singleton Supabase) così da essere caricabile anche
// in Node per il server MCP: utility pure da `cliente-wizard/utils`, tipi type-only, e le funzioni
// anagrafica iniettabili da `./personeService`. Gli oggetti `File` nei titolari sono solo type
// (erased a runtime): l'upload file resta a carico della UI.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WizardData, TitolareEffettivo } from '../../src/components/cliente-wizard/types.js';
import { formatDateForDB, normalizeDate } from '../../src/components/cliente-wizard/utils.js';
import { savePersonaWithClient, findSoggettoEsistenteWithClient } from './personeService.js';

/** Un titolare effettivo pre-computato: campi relazionali pronti per l'INSERT in
 *  `titolari_effettivi` + i metadati (`_doc*`) del documento d'identità da caricare
 *  dopo il salvataggio. I `_doc*` non vengono persistiti: servono al chiamante (la UI)
 *  per l'upload differito del file, che resta browser-only e fuori da questo servizio. */
export interface TitolarePreparato {
  persona_id: string | null;
  tipo_rapporto: TitolareEffettivo['tipo_rapporto'];
  ruolo: string;
  is_pep: boolean;
  pep_carica: string;
  note_quota: string;
  _docFile?: File | null;
  _docCartaceo?: boolean;
  _docScadenza?: string;
  _docDescrizione?: string;
}

export interface SalvaClienteOptions {
  /** Se valorizzato → modalità UPDATE del cliente esistente; altrimenti INSERT. */
  clienteId?: string;
  /** Esito di `isClienteComplete()`: decide se lo status nasce `active` o `draft`. */
  isComplete: boolean;
  /** Studio attivo (UI: holder a modulo; MCP: studio appuntato al token). */
  activeStudioId: string | null;
  /** Log di debug non bloccante (UI: addDebugLog). Default: noop. */
  log?: (msg: string, data?: unknown) => void;
  /** Log audit utente (UI: addUserLog). Default: noop. */
  userLog?: (msg: string) => void;
}

export interface SalvaClienteResult {
  /** Riga `clienti` inserita/aggiornata. */
  cliente: any;
  clientePersonaId: string | null;
  rappresentantePersonaId: string | null;
  /** Titolari pre-computati (con metadati `_doc*` per l'upload differito a carico della UI). */
  titolariPreparati: TitolarePreparato[];
  /** id del cliente target (uguale a clienteId in edit, a cliente.id in create). */
  targetClienteId: string;
  clientStatus: 'active' | 'draft';
  isEditMode: boolean;
}

const noop = () => {};

/**
 * Validazione condivisa: quando viene registrato un documento d'identità (PDF o cartaceo),
 * la data di scadenza è obbligatoria (serve per gli alert di scadenza e come metadato sulla
 * riga `documenti`). Ritorna la lista delle entità con scadenza mancante (vuota se tutto ok),
 * lasciando al chiamante la presentazione (toast in UI, errore tool in MCP).
 */
export function validateScadenzeDocumenti(formData: WizardData): string[] {
  const scadenzaMancante: string[] = [];
  const docRegistrato = (d?: { file?: File | null; cartaceo?: boolean }) =>
    !!(d && (d.file || d.cartaceo));

  if (formData.tipo_cliente === 'persona_fisica'
      && docRegistrato(formData.documento_pf)
      && !formData.documento_pf?.data_scadenza) {
    scadenzaMancante.push(`cliente (${formData.nome_cognome_pf || 'persona fisica'})`);
  }
  if (formData.tipo_cliente === 'professionista'
      && docRegistrato(formData.documento_prof)
      && !formData.documento_prof?.data_scadenza) {
    scadenzaMancante.push(`professionista (${formData.nome_cognome_prof || ''})`);
  }
  if (formData.tipo_cliente === 'impresa') {
    if (docRegistrato(formData.documento_rappresentante)
        && !formData.documento_rappresentante?.data_scadenza) {
      scadenzaMancante.push(`rappresentante legale (${formData.rappresentante_legale || ''})`);
    }
    formData.titolari_effettivi.forEach((t, i) => {
      const registrato = !!(t.documento_file || t.documento_cartaceo);
      if (registrato && !t.documento_scadenza) {
        scadenzaMancante.push(`titolare effettivo #${i + 1} (${t.nome_cognome || ''})`);
      }
    });
  }
  return scadenzaMancante;
}

/** Salva ogni titolare in anagrafica_soggetti e prepara i dati per INSERT in titolari_effettivi con persona_id.
 *  Solo i campi relazionali vanno in titolari_effettivi; i dati anagrafici vivono in anagrafica_soggetti.
 *  NB: il cliente_id NON viene aggiunto qui; va aggiunto al momento dell'INSERT. Questo permette di
 *  pre-eseguire le savePersona PRIMA di qualsiasi DELETE, evitando perdita dati in caso di errore. */
async function prepareTitolariData(
  client: SupabaseClient,
  titolari: TitolareEffettivo[],
  activeStudioId: string | null,
): Promise<TitolarePreparato[]> {
  const results: TitolarePreparato[] = [];
  for (const t of titolari) {
    let personaId: string | null = null;
    if (t.nome_cognome) {
      const isAzienda = t.tipo_soggetto === 'azienda';
      personaId = await savePersonaWithClient(client, {
        tipo_soggetto: t.tipo_soggetto || 'persona_fisica',
        nome_cognome: t.nome_cognome,
        codice_fiscale: t.codice_fiscale || '',
        // Per azienda i campi nascita/documento non hanno senso: vengono azzerati
        data_nascita: isAzienda ? '' : normalizeDate(t.data_nascita),
        luogo_nascita: isAzienda ? '' : (t.comune_nascita || ''),
        provincia_nascita: isAzienda ? '' : (t.provincia_nascita || ''),
        nazionalita: t.nazionalita || 'Italiana',
        professione: t.professione || '',
        residenza: t.residenza || '',
        documento_tipo: isAzienda ? '' : (t.documento_tipo || ''),
        documento_numero: isAzienda ? '' : (t.documento_numero || ''),
        documento_data_rilascio: isAzienda ? '' : normalizeDate(t.documento_rilascio_data),
        documento_data_scadenza: isAzienda ? '' : normalizeDate(t.documento_scadenza),
        documento_ente_rilascio: isAzienda ? '' : (t.documento_rilascio_ente || ''),
        partita_iva: isAzienda ? (t.partita_iva || '') : '',
        natura_giuridica: isAzienda ? (t.natura_giuridica || '') : '',
        codice_ateco: isAzienda ? (t.codice_ateco || '') : '',
        pep: t.is_pep,
        pep_verificato: t.pep_verificato,
        pep_carica: t.pep_carica,
        pep_data_verifica: normalizeDate(t.pep_data_verifica),
        pep_fonte_verifica: t.pep_fonte_verifica,
        sanzioni: t.sanzioni,
        sanzioni_verificato: t.sanzioni_verificato,
        sanzioni_data_verifica: normalizeDate(t.sanzioni_data_verifica),
        sanzioni_fonte_verifica: t.sanzioni_fonte_verifica,
      }, activeStudioId);
    }
    results.push({
      persona_id: personaId,
      tipo_rapporto: t.tipo_rapporto,
      ruolo: t.ruolo || '',
      is_pep: t.is_pep,
      pep_carica: t.pep_carica,
      note_quota: t.note_quota,
      _docFile: t.documento_file,
      _docCartaceo: t.documento_cartaceo,
      _docScadenza: formatDateForDB(t.documento_scadenza || '') || undefined,
      _docDescrizione: t.documento_descrizione,
    });
  }
  return results;
}

/** Pre-computa i nodi della catena di controllo eseguendo savePersona per i nodi persona_fisica.
 *  Anche qui cliente_id NON è incluso: viene aggiunto al momento dell'INSERT. */
async function prepareNodiCatenaData(
  client: SupabaseClient,
  catena: NonNullable<WizardData['catena_controllo']>,
  activeStudioId: string | null,
): Promise<any[]> {
  const results: any[] = [];
  for (const n of catena.nodi) {
    let nodoPersonaId: string | null = null;
    if (n.tipo === 'persona_fisica' && n.nome_cognome) {
      try {
        nodoPersonaId = await savePersonaWithClient(client, {
          nome_cognome: n.nome_cognome,
          codice_fiscale: n.codice_fiscale || '',
          data_nascita: normalizeDate(n.data_nascita),
          luogo_nascita: '',
          provincia_nascita: '',
          nazionalita: 'Italiana',
          professione: '',
          residenza: n.residenza || '',
          documento_tipo: '',
          documento_numero: '',
          documento_data_rilascio: '',
          documento_data_scadenza: '',
          documento_ente_rilascio: '',
          pep: n.is_pep || false,
          pep_carica: n.pep_carica || '',
        }, activeStudioId);
      } catch { /* non bloccante */ }
    }
    results.push({
      nodo_id: n.id,
      tipo: n.tipo,
      denominazione: n.denominazione,
      natura_giuridica: n.natura_giuridica || null,
      is_pep: n.is_pep || false,
      pep_carica: n.pep_carica || null,
      capitale_sociale: n.capitale_sociale || null,
      sede_legale: n.sede_legale || null,
      is_cliente_nodo: n.id === catena.clienteNodoId,
      persona_id: nodoPersonaId,
    });
  }
  return results;
}

/**
 * Salva (INSERT o UPDATE) un cliente con tutte le sue entità relazionali (anagrafiche,
 * titolari effettivi, catena di controllo). Logica identica a quella che viveva in
 * `useClienteSave`, ma pura e iniettata col client. NON gestisce l'upload dei file documento
 * (browser-only): restituisce `titolariPreparati`/`*PersonaId` perché il chiamante lo faccia.
 */
export async function salvaCliente(
  client: SupabaseClient,
  formData: WizardData,
  opts: SalvaClienteOptions,
): Promise<SalvaClienteResult> {
  const log = opts.log ?? noop;
  const userLog = opts.userLog ?? noop;
  const { clienteId, activeStudioId } = opts;

  const isEditMode = !!clienteId;
  log(isEditMode ? '✏️ Inizio UPDATE cliente' : '💾 Inizio INSERT cliente', { tipo: formData.tipo_cliente, clienteId });

  // Determina lo status in base alla completezza dei dati
  const isComplete = opts.isComplete;
  const clientStatus: 'active' | 'draft' = isComplete ? 'active' : 'draft';

  log('📊 Status cliente', { isComplete, status: clientStatus });

  // Prepara i dati del cliente in base al tipo
  let clienteData: any = {
    tipo_cliente: formData.tipo_cliente,
    codice_cliente: formData.codice_cliente,
    status: clientStatus,
  };

  // PERSONA FISICA
  if (formData.tipo_cliente === 'persona_fisica') {
    clienteData = {
      ...clienteData,
      ragione_sociale: formData.nome_cognome_pf, // Usa ragione_sociale per il nome
      codice_fiscale: formData.codice_fiscale_pf,
      data_nascita: formatDateForDB(formData.data_nascita_pf || ''),
      luogo_nascita: formData.luogo_nascita_pf,
      provincia_nascita: formData.provincia_nascita_pf || '',
      nazionalita: formData.nazionalita_pf,
      professione: formData.professione_pf,
      residenza: formData.residenza_pf,
      documento_identita: formData.documento_pf ? {
        ...formData.documento_pf,
        data_rilascio: formatDateForDB(formData.documento_pf.data_rilascio),
        data_scadenza: formatDateForDB(formData.documento_pf.data_scadenza)
      } : null,
      pep: formData.pep_pf,
      pep_verificato: formData.pep_verificato_pf || false,
      pep_data_verifica: formatDateForDB(formData.pep_data_verifica_pf || ''),
      pep_fonte_verifica: formData.pep_fonte_verifica_pf || null,
      sanzioni: formData.sanzioni_pf,
      sanzioni_verificato: formData.sanzioni_verificato_pf || false,
      sanzioni_data_verifica: formatDateForDB(formData.sanzioni_data_verifica_pf || ''),
      sanzioni_fonte_verifica: formData.sanzioni_fonte_verifica_pf || null,
      note_verifica: formData.note_verifica_pf
    };
  }

  // IMPRESA (rappresentante legale dati via rappresentante_persona_id)
  if (formData.tipo_cliente === 'impresa') {
    clienteData = {
      ...clienteData,
      ragione_sociale: formData.ragione_sociale,
      natura_giuridica: formData.natura_giuridica,
      partita_iva: formData.partita_iva_impresa,
      codice_fiscale: formData.codice_fiscale_impresa,
      paese: formData.paese,
      indirizzo: formData.indirizzo,
      pep: formData.pep_impresa,
      pep_verificato: formData.pep_verificato_impresa || false,
      pep_data_verifica: formatDateForDB(formData.pep_data_verifica_impresa || ''),
      pep_fonte_verifica: formData.pep_fonte_verifica_impresa || null,
      sanzioni: formData.sanzioni_impresa,
      sanzioni_verificato: formData.sanzioni_verificato_impresa || false,
      sanzioni_data_verifica: formatDateForDB(formData.sanzioni_data_verifica_impresa || ''),
      sanzioni_fonte_verifica: formData.sanzioni_fonte_verifica_impresa || null,
      codice_ateco: formData.codice_ateco_impresa || null,
      attivita_svolta: formData.attivita_svolta_impresa || null,
      codice_rae: formData.codice_rae_impresa || null,
      descrizione_rae: formData.descrizione_rae_impresa || null,
      note_verifica: formData.note_verifica_impresa
    };
  }

  // PROFESSIONISTA
  if (formData.tipo_cliente === 'professionista') {
    clienteData = {
      ...clienteData,
      ragione_sociale: formData.nome_cognome_prof, // Usa ragione_sociale per il nome
      codice_fiscale: formData.codice_fiscale_prof,
      partita_iva: formData.partita_iva_prof,
      data_nascita: formatDateForDB(formData.data_nascita_prof || ''),
      luogo_nascita: formData.luogo_nascita_prof,
      provincia_nascita: formData.provincia_nascita_prof || '',
      nazionalita: formData.nazionalita_prof,
      professione: formData.professione_prof,
      residenza: formData.residenza_prof,
      documento_identita: formData.documento_prof ? {
        ...formData.documento_prof,
        data_rilascio: formatDateForDB(formData.documento_prof.data_rilascio),
        data_scadenza: formatDateForDB(formData.documento_prof.data_scadenza)
      } : null,
      codice_ateco: formData.codice_ateco_prof || null,
      attivita_svolta: formData.attivita_svolta_prof || null,
      codice_rae: formData.codice_rae_prof || null,
      descrizione_rae: formData.descrizione_rae_prof || null,
      pep: formData.pep_prof,
      pep_verificato: formData.pep_verificato_prof || false,
      // pep_carica vive in anagrafica_soggetti (non su clienti) — salvato sotto via savePersona
      pep_data_verifica: formatDateForDB(formData.pep_data_verifica_prof || ''),
      pep_fonte_verifica: formData.pep_fonte_verifica_prof || null,
      sanzioni: formData.sanzioni_prof,
      sanzioni_verificato: formData.sanzioni_verificato_prof || false,
      sanzioni_data_verifica: formatDateForDB(formData.sanzioni_data_verifica_prof || ''),
      sanzioni_fonte_verifica: formData.sanzioni_fonte_verifica_prof || null,
      note_verifica: formData.note_verifica_prof
    };
  }

  // ---- Salva persone fisiche in tabella centralizzata e ottieni persona_id ----
  let clientePersonaId: string | null = null;
  let rappresentantePersonaId: string | null = null;

  try {
    if (formData.tipo_cliente === 'persona_fisica' && formData.nome_cognome_pf) {
      clientePersonaId = await savePersonaWithClient(client, {
        nome_cognome: formData.nome_cognome_pf,
        codice_fiscale: formData.codice_fiscale_pf || '',
        data_nascita: normalizeDate(formData.data_nascita_pf),
        luogo_nascita: formData.luogo_nascita_pf || '',
        provincia_nascita: formData.provincia_nascita_pf || '',
        nazionalita: formData.nazionalita_pf || 'Italiana',
        professione: formData.professione_pf || '',
        residenza: formData.residenza_pf || '',
        documento_tipo: formData.documento_pf?.tipo || '',
        documento_numero: formData.documento_pf?.numero || '',
        documento_data_rilascio: normalizeDate(formData.documento_pf?.data_rilascio),
        documento_data_scadenza: normalizeDate(formData.documento_pf?.data_scadenza),
        documento_ente_rilascio: formData.documento_pf?.ente_rilascio || '',
        pep: formData.pep_pf,
        pep_verificato: formData.pep_verificato_pf,
        pep_carica: formData.pep_carica_pf,
        pep_data_verifica: normalizeDate(formData.pep_data_verifica_pf),
        pep_fonte_verifica: formData.pep_fonte_verifica_pf,
        sanzioni: formData.sanzioni_pf,
        sanzioni_verificato: formData.sanzioni_verificato_pf,
        sanzioni_data_verifica: normalizeDate(formData.sanzioni_data_verifica_pf),
        sanzioni_fonte_verifica: formData.sanzioni_fonte_verifica_pf,
        note_verifica: formData.note_verifica_pf,
      }, activeStudioId);
      log('✅ Persona fisica salvata', { clientePersonaId });
    }
    if (formData.tipo_cliente === 'professionista' && formData.nome_cognome_prof) {
      clientePersonaId = await savePersonaWithClient(client, {
        nome_cognome: formData.nome_cognome_prof,
        codice_fiscale: formData.codice_fiscale_prof || '',
        data_nascita: normalizeDate(formData.data_nascita_prof),
        luogo_nascita: formData.luogo_nascita_prof || '',
        provincia_nascita: formData.provincia_nascita_prof || '',
        nazionalita: formData.nazionalita_prof || 'Italiana',
        professione: formData.professione_prof || '',
        residenza: formData.residenza_prof || '',
        documento_tipo: formData.documento_prof?.tipo || '',
        documento_numero: formData.documento_prof?.numero || '',
        documento_data_rilascio: normalizeDate(formData.documento_prof?.data_rilascio),
        documento_data_scadenza: normalizeDate(formData.documento_prof?.data_scadenza),
        documento_ente_rilascio: formData.documento_prof?.ente_rilascio || '',
        pep: formData.pep_prof,
        pep_verificato: formData.pep_verificato_prof,
        pep_carica: formData.pep_carica_prof,
        pep_data_verifica: normalizeDate(formData.pep_data_verifica_prof),
        pep_fonte_verifica: formData.pep_fonte_verifica_prof,
        sanzioni: formData.sanzioni_prof,
        sanzioni_verificato: formData.sanzioni_verificato_prof,
        sanzioni_data_verifica: normalizeDate(formData.sanzioni_data_verifica_prof),
        sanzioni_fonte_verifica: formData.sanzioni_fonte_verifica_prof,
        note_verifica: formData.note_verifica_prof,
      }, activeStudioId);
      log('✅ Professionista persona salvata', { clientePersonaId });
    }
    if (formData.tipo_cliente === 'impresa' && formData.rappresentante_legale) {
      const rappresentanteIsAzienda = formData.tipo_soggetto_rappresentante === 'azienda';
      rappresentantePersonaId = await savePersonaWithClient(client, {
        tipo_soggetto: rappresentanteIsAzienda ? 'azienda' : 'persona_fisica',
        nome_cognome: formData.rappresentante_legale,
        codice_fiscale: formData.codice_fiscale_rappresentante || '',
        data_nascita: rappresentanteIsAzienda ? '' : normalizeDate(formData.data_nascita_rappresentante),
        luogo_nascita: rappresentanteIsAzienda ? '' : (formData.luogo_nascita_rappresentante || ''),
        provincia_nascita: rappresentanteIsAzienda ? '' : (formData.provincia_nascita_rappresentante || ''),
        nazionalita: formData.nazionalita_rappresentante || 'Italiana',
        professione: '',
        residenza: formData.residenza_rappresentante || '',
        documento_tipo: rappresentanteIsAzienda ? '' : (formData.documento_rappresentante?.tipo || ''),
        documento_numero: rappresentanteIsAzienda ? '' : (formData.documento_rappresentante?.numero || ''),
        documento_data_rilascio: rappresentanteIsAzienda ? '' : normalizeDate(formData.documento_rappresentante?.data_rilascio),
        documento_data_scadenza: rappresentanteIsAzienda ? '' : normalizeDate(formData.documento_rappresentante?.data_scadenza),
        documento_ente_rilascio: rappresentanteIsAzienda ? '' : (formData.documento_rappresentante?.ente_rilascio || ''),
        partita_iva: rappresentanteIsAzienda ? (formData.partita_iva_rappresentante || '') : '',
        natura_giuridica: rappresentanteIsAzienda ? (formData.natura_giuridica_rappresentante || '') : '',
        codice_ateco: rappresentanteIsAzienda ? (formData.codice_ateco_rappresentante || '') : '',
        pep: formData.pep_impresa,
        pep_verificato: formData.pep_verificato_impresa,
        pep_carica: formData.pep_carica_impresa,
        pep_data_verifica: normalizeDate(formData.pep_data_verifica_impresa),
        pep_fonte_verifica: formData.pep_fonte_verifica_impresa,
        sanzioni: formData.sanzioni_impresa,
        sanzioni_verificato: formData.sanzioni_verificato_impresa,
        sanzioni_data_verifica: normalizeDate(formData.sanzioni_data_verifica_impresa),
        sanzioni_fonte_verifica: formData.sanzioni_fonte_verifica_impresa,
        note_verifica: formData.note_verifica_impresa,
      }, activeStudioId);
      log('✅ Rappresentante legale persona salvata', { rappresentantePersonaId });
    }
  } catch (e: any) {
    // Propaghiamo invece di ingoiare: un cliente persona_fisica/professionista salvato SENZA il suo
    // persona_id (o un'impresa senza rappresentante) è incoerente. Meglio fallire chiaramente —
    // un'eventuale anagrafica già creata verrà riusata dal dedup al ritentativo (stesso CF/P.IVA).
    log('❌ Errore salvataggio anagrafica_soggetti', e);
    throw new Error(`Salvataggio anagrafica fallito: ${e?.message || String(e)}`);
  }

  // Aggiungi persona_id ai dati cliente
  if (clientePersonaId) {
    clienteData.persona_id = clientePersonaId;
  }
  if (rappresentantePersonaId) {
    clienteData.rappresentante_persona_id = rappresentantePersonaId;
  }

  // Per le imprese, prova a riusare un uuid esistente di anagrafica per realizzare
  // il bridge cliente↔anagrafica con UUID condiviso. Due fonti, in ordine di priorità:
  //   1. Import esplicito dall'anagrafica (`_importedClientePersonaId`) — l'utente ha
  //      scelto consapevolmente quel soggetto, lo onoriamo a meno che l'uuid non sia
  //      già preso da un altro cliente (caso anomalo: bridge altrove).
  //   2. Lookup automatico CF/P.IVA su `anagrafica_soggetti` — riusa l'anagrafica già
  //      esistente per lo stesso soggetto (es. era titolare di un altro cliente).
  // Se nessuna delle due trova un uuid usabile → uuid auto-generato dal DB, niente bridge.
  if (formData.tipo_cliente === 'impresa' && !isEditMode) {
    let bridgeUuid: string | null = null;
    if (formData._importedClientePersonaId) {
      const { data: alreadyUsed } = await client
        .from('clienti')
        .select('id')
        .eq('id', formData._importedClientePersonaId)
        .maybeSingle();
      if (!alreadyUsed) {
        bridgeUuid = formData._importedClientePersonaId;
      }
    }
    if (!bridgeUuid) {
      const found = await findSoggettoEsistenteWithClient(client, {
        codice_fiscale: formData.codice_fiscale_impresa,
        partita_iva: formData.partita_iva_impresa,
      }, activeStudioId);
      if (found && found.foundIn === 'anagrafica') {
        bridgeUuid = found.id;
      }
    }
    if (bridgeUuid) {
      clienteData.id = bridgeUuid;
      clienteData.persona_id = bridgeUuid;
      log('🔗 Bridge cliente↔anagrafica realizzato con UUID condiviso', { uuid: bridgeUuid });
    }
  }

  log('📦 Dati cliente preparati', clienteData);

  // ============================================================
  // PRE-COMPUTAZIONE DATI RELAZIONALI (PRIMA di qualsiasi DELETE)
  // ============================================================
  // Eseguiamo qui tutte le savePersona() per titolari e catena di controllo,
  // PRIMA di toccare il DB con DELETE. In questo modo, se qualcosa fallisce
  // (es. errore di rete o validazione), non perdiamo dati esistenti.
  // I DB writes successivi (UPDATE clienti + DELETE/INSERT titolari/catena)
  // useranno solo dati già preparati in memoria.
  let titolariPreparati: TitolarePreparato[] = [];
  let nodiCatenaPreparati: any[] = [];

  if (formData.tipo_cliente === 'impresa') {
    if (formData.titolari_effettivi.length > 0) {
      titolariPreparati = await prepareTitolariData(client, formData.titolari_effettivi, activeStudioId);
      log('🔧 Titolari pre-computati in memoria', { count: titolariPreparati.length });
    }
    if (formData.catena_controllo && formData.catena_controllo.nodi.length > 0) {
      nodiCatenaPreparati = await prepareNodiCatenaData(client, formData.catena_controllo, activeStudioId);
      log('🔧 Nodi catena pre-computati in memoria', { count: nodiCatenaPreparati.length });
    }
  }

  let cliente: any;

  if (isEditMode) {
    // UPDATE cliente esistente
    const { data: updatedCliente, error: clienteError } = await client
      .from('clienti')
      .update(clienteData)
      .eq('id', clienteId)
      .select()
      .single();

    if (clienteError) {
      log('❌ Errore UPDATE cliente', clienteError);
      throw clienteError;
    }

    cliente = updatedCliente;
    log('✅ Cliente aggiornato', cliente);

    // Gestione titolari effettivi per UPDATE (solo per imprese)
    // I dati sono già stati pre-computati sopra: qui facciamo solo
    // DELETE seguito immediatamente da INSERT, senza chiamate intermedie.
    if (formData.tipo_cliente === 'impresa') {
      // DELETE vecchi titolari
      const { error: deleteError } = await client
        .from('titolari_effettivi')
        .delete()
        .eq('cliente_id', clienteId);

      if (deleteError) {
        log('❌ Errore eliminazione vecchi titolari', deleteError);
        throw deleteError;
      }

      log('🗑️ Vecchi titolari eliminati');

      // INSERT nuovi titolari se presenti (usando dati pre-computati)
      if (titolariPreparati.length > 0) {
        const titolariData = titolariPreparati.map(({ _docFile, _docCartaceo, _docScadenza, _docDescrizione, ...persist }) => {
          void _docFile; void _docCartaceo; void _docScadenza; void _docDescrizione;
          return { ...persist, cliente_id: clienteId! };
        });

        const { error: titolariError } = await client
          .from('titolari_effettivi')
          .insert(titolariData);

        if (titolariError) {
          log('❌ Errore inserimento nuovi titolari', titolariError);
          throw titolariError;
        }

        log('✅ Nuovi titolari inseriti', { count: titolariData.length });
        const nomiTitolari = formData.titolari_effettivi.map(t => t.nome_cognome).filter(Boolean).join(', ');
        userLog(`Titolari effettivi aggiornati per cliente ${formData.ragione_sociale || ''}: ${nomiTitolari}`);
      }
    }
  } else {
    // INSERT nuovo cliente
    const { data: newCliente, error: clienteError } = await client
      .from('clienti')
      .insert(clienteData)
      .select()
      .single();

    if (clienteError) {
      log('❌ Errore INSERT cliente', clienteError);
      throw clienteError;
    }

    cliente = newCliente;
    log('✅ Cliente inserito', cliente);

    // Inserimento titolari effettivi (solo per imprese, usando dati pre-computati)
    if (formData.tipo_cliente === 'impresa' && titolariPreparati.length > 0) {
      const titolariData = titolariPreparati.map(({ _docFile, _docCartaceo, _docScadenza, _docDescrizione, ...persist }) => {
        void _docFile; void _docCartaceo; void _docScadenza; void _docDescrizione;
        return { ...persist, cliente_id: cliente.id };
      });

      const { error: titolariError } = await client
        .from('titolari_effettivi')
        .insert(titolariData);

      if (titolariError) {
        log('❌ Errore inserimento titolari effettivi', titolariError);
        throw titolariError;
      }

      log('✅ Titolari effettivi inseriti', { count: titolariData.length });
      const nomiTitolari = formData.titolari_effettivi.map(t => t.nome_cognome).filter(Boolean).join(', ');
      userLog(`Titolari effettivi inseriti per nuovo cliente ${formData.ragione_sociale || ''}: ${nomiTitolari}`);
    }
  }

  // Salva catena di controllo (solo per imprese)
  // Anche qui i nodi sono già stati pre-computati sopra: facciamo solo DELETE+INSERT.
  if (formData.tipo_cliente === 'impresa' && formData.catena_controllo) {
    const catena = formData.catena_controllo;
    const targetClienteId = isEditMode ? clienteId! : cliente.id;

    // Delete existing chain data
    await client.from('catena_controllo_archi').delete().eq('cliente_id', targetClienteId);
    await client.from('catena_controllo_nodi').delete().eq('cliente_id', targetClienteId);

    // Insert nodes (usando dati pre-computati)
    if (nodiCatenaPreparati.length > 0) {
      const nodiData = nodiCatenaPreparati.map(n => ({ ...n, cliente_id: targetClienteId }));

      const { error: nodiError } = await client
        .from('catena_controllo_nodi')
        .insert(nodiData);

      // Errore NON ingoiato: la catena è stata appena svuotata (DELETE sopra), quindi un INSERT
      // fallito lascerebbe la catena vuota in silenzio (dato di compliance perso). Propaghiamo.
      if (nodiError) throw new Error(`Salvataggio nodi catena di controllo fallito: ${nodiError.message}`);
      log('✅ Nodi catena salvati', { count: nodiData.length });
    }

    // Insert edges
    if (catena.archi.length > 0) {
      const archiData = catena.archi.map(a => ({
        cliente_id: targetClienteId,
        arco_id: a.id,
        da_nodo_id: a.da_nodo_id,
        a_nodo_id: a.a_nodo_id,
        percentuale_capitale: a.percentuale_capitale,
        percentuale_voti: a.percentuale_voti || null,
        tipo_controllo: a.tipo_controllo,
        note: a.note || null,
        tramite_fiduciaria: a.tramite_fiduciaria || false,
        diritto_reale: a.diritto_reale || null,
      }));

      const { error: archiError } = await client
        .from('catena_controllo_archi')
        .insert(archiData);

      if (archiError) throw new Error(`Salvataggio archi catena di controllo fallito: ${archiError.message}`);
      log('✅ Archi catena salvati', { count: archiData.length });
    }
  }

  const targetClienteId: string = isEditMode ? clienteId! : cliente.id;

  return {
    cliente,
    clientePersonaId,
    rappresentantePersonaId,
    titolariPreparati,
    targetClienteId,
    clientStatus,
    isEditMode,
  };
}
