// Logica di salvataggio/dedup anagrafica soggetti — variante client-injectable, condivisa UI ↔ MCP.
//
// Modulo **neutro**: nessun import a runtime di React né del singleton Supabase (quest'ultimo
// lancerebbe in Node perché legge `import.meta.env`). `PersonaFisicaRecord` è importato come
// **type-only** (erased a runtime), quindi non crea dipendenza di caricamento verso personeHelper.
// Le funzioni qui ricevono il client autenticato e lo studio attivo come parametri: la UI le usa
// via i wrapper in `personeHelper`, il server MCP iniettando un client coniato per-richiesta.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersonaFisicaRecord } from '../../src/lib/personeHelper.js';

/**
 * Salva o aggiorna una persona in `anagrafica_soggetti`. Se passa un `id`, fa UPDATE (o INSERT
 * con quell'uuid per il bridge cliente↔anagrafica); altrimenti dedup per CF (priorità) e P.IVA,
 * e in mancanza di match esegue un INSERT nuovo. Il client e lo studio attivo sono iniettati.
 */
/** Costruisce il payload colonne di `anagrafica_soggetti` da un PersonaFisicaRecord (senza
 *  user_id/id, aggiunti dal chiamante). Usato sia da save (con dedup) sia da crea (senza). */
function buildPersonaPayload(persona: PersonaFisicaRecord): Record<string, any> {
  return {
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
}

export async function savePersonaWithClient(
  client: SupabaseClient,
  persona: PersonaFisicaRecord,
  activeStudioId: string | null,
): Promise<string | null> {
  if (!persona.nome_cognome?.trim()) return null;

  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;

  const payload = buildPersonaPayload(persona);

  // Se ha un id, prova UPDATE diretto. Se l'id non esiste in anagrafica ma è un uuid valido
  // (caso: arriva da un record `clienti` virtuale in search unificata), facciamo INSERT con
  // quell'id per realizzare il bridge UUID condiviso cliente↔anagrafica.
  if (persona.id) {
    const { data: existsInAnagrafica } = await client
      .from('anagrafica_soggetti')
      .select('id')
      .eq('id', persona.id)
      .maybeSingle();

    if (existsInAnagrafica) {
      await client.from('anagrafica_soggetti').update(payload).eq('id', persona.id);
      return persona.id;
    }

    // Bridge: l'uuid esiste in `clienti` ma non in `anagrafica_soggetti`. Crea il record
    // di anagrafica con stesso uuid e linka `clienti.persona_id = uuid` per coerenza.
    const { data: inserted } = await client
      .from('anagrafica_soggetti')
      .insert({ id: persona.id, user_id: user.id, ...payload })
      .select('id')
      .single();

    if (inserted?.id) {
      await client.from('clienti').update({ persona_id: inserted.id }).eq('id', inserted.id);
      return inserted.id;
    }
    return null;
  }

  // Dedup automatica per CF (priorità) e P.IVA (fallback per casi CF≠P.IVA)
  const cf = persona.codice_fiscale?.trim() || '';
  const piva = persona.partita_iva?.trim() || '';
  if (cf || piva) {
    const existing = await findSoggettoEsistenteWithClient(client, { codice_fiscale: cf, partita_iva: piva }, activeStudioId);
    if (existing) {
      // Se trovato solo come cliente (non in anagrafica), crea l'anagrafica con stesso uuid (bridge).
      if (existing.foundIn === 'clienti') {
        const { data: inserted } = await client
          .from('anagrafica_soggetti')
          .insert({ id: existing.id, user_id: user.id, ...payload })
          .select('id')
          .single();
        if (inserted?.id) {
          await client.from('clienti').update({ persona_id: inserted.id }).eq('id', inserted.id);
          return inserted.id;
        }
        return null;
      }
      // Già in anagrafica (o in entrambe con stesso uuid): UPDATE
      await client.from('anagrafica_soggetti').update(payload).eq('id', existing.id);
      return existing.id;
    }
  }

  const { data } = await client.from('anagrafica_soggetti').insert({
    user_id: user.id,
    ...payload,
  }).select('id').single();

  return data?.id || null;
}

/**
 * Cerca un soggetto esistente per CF/P.IVA in `anagrafica_soggetti` e `clienti` (impresa).
 * Priorità: codice_fiscale > partita_iva. Scoping esplicito allo studio attivo (necessario per
 * neutralizzare le policy RLS cross-studio dei superadmin). Client e studio sono iniettati.
 */
export async function findSoggettoEsistenteWithClient(
  client: SupabaseClient,
  input: {
    codice_fiscale?: string | null;
    partita_iva?: string | null;
  },
  activeStudioId: string | null,
): Promise<{ id: string; foundIn: 'anagrafica' | 'clienti' | 'both' } | null> {
  const cf = (input.codice_fiscale || '').trim();
  const piva = (input.partita_iva || '').trim();
  if (!cf && !piva) return null;

  // Scope allo studio attivo: per superadmin la RLS espone righe di TUTTI gli studi e
  // `.maybeSingle()` rompe (multiple rows) appena lo stesso soggetto esiste in due studi.
  // Senza questo filtro il dedup torna null e si finisce per fare una INSERT duplicata.
  // Se non c'è studio attivo (boot in corso, superadmin senza studio selezionato),
  // rifiutiamo il lookup: meglio "non trovato" → INSERT nuovo nel proprio scope, che
  // un match cross-studio che fa puntare un cliente all'anagrafica di un altro studio.
  if (!activeStudioId) return null;

  // 1. Tenta CF prima (chiave primaria identificativa). `.is('deleted_at', null)`: un soggetto/
  // cliente CESTINATO non deve essere ripescato dal dedup e ri-collegato a un nuovo cliente (sarebbe
  // un riferimento vivo a un record nel cestino, e il successivo svuota-cestino lo lascerebbe orfano).
  if (cf) {
    const qa = client.from('anagrafica_soggetti').select('id')
      .eq('codice_fiscale', cf).eq('studio_id', activeStudioId).is('deleted_at', null);
    const qc = client.from('clienti').select('id')
      .eq('codice_fiscale', cf).eq('tipo_cliente', 'impresa').eq('studio_id', activeStudioId).is('deleted_at', null);
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

  // 2. Fallback su P.IVA per i casi CF≠P.IVA (stesso filtro anti-cestinati del blocco CF).
  if (piva) {
    const qa = client.from('anagrafica_soggetti').select('id')
      .eq('partita_iva', piva).eq('studio_id', activeStudioId).is('deleted_at', null);
    const qc = client.from('clienti').select('id')
      .eq('partita_iva', piva).eq('tipo_cliente', 'impresa').eq('studio_id', activeStudioId).is('deleted_at', null);
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
 * Crea un soggetto in anagrafica SOLO se il CF/P.IVA non esiste già (split create vs update, §5.2):
 * a differenza di `savePersonaWithClient`, NON aggiorna mai un soggetto esistente — se trova un
 * match lo restituisce e basta, così l'AI non sovrascrive per errore anagrafiche condivise.
 */
export async function creaSoggettoWithClient(
  client: SupabaseClient,
  persona: PersonaFisicaRecord,
  activeStudioId: string | null,
): Promise<{ created: boolean; id: string | null; foundIn?: 'anagrafica' | 'clienti' | 'both' }> {
  if (!persona.nome_cognome?.trim()) {
    throw new Error('nome_cognome obbligatorio.');
  }

  // Non sovrascrive: se esiste già per CF/P.IVA, ritorna il match.
  const cf = persona.codice_fiscale?.trim() || '';
  const piva = persona.partita_iva?.trim() || '';
  if (cf || piva) {
    const existing = await findSoggettoEsistenteWithClient(
      client,
      { codice_fiscale: cf, partita_iva: piva },
      activeStudioId,
    );
    if (existing) {
      // Se il match è SOLO un cliente-impresa (non ancora in anagrafica), l'id restituito sarebbe
      // un id-cliente NON valido come persona_id (es. per associare un documento level persona).
      // Materializza il bridge UUID: inserisci la riga anagrafica con lo STESSO id del cliente e
      // linka clienti.persona_id (stessa logica di savePersonaWithClient). Non è una sovrascrittura:
      // la riga anagrafica non esisteva. Così l'id ritornato è un persona_id realmente risolvibile.
      if (existing.foundIn === 'clienti') {
        const { data: { user } } = await client.auth.getUser();
        if (!user) throw new Error('Utente non autenticato.');
        const { data: bridged, error: brErr } = await client
          .from('anagrafica_soggetti')
          .insert({ id: existing.id, user_id: user.id, ...buildPersonaPayload(persona) })
          .select('id')
          .single();
        if (brErr) throw new Error(brErr.message);
        if (bridged?.id) {
          await client.from('clienti').update({ persona_id: bridged.id }).eq('id', bridged.id);
          return { created: false, id: bridged.id, foundIn: 'clienti' };
        }
      }
      return { created: false, id: existing.id, foundIn: existing.foundIn };
    }
  }

  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Utente non autenticato.');

  const { data, error } = await client
    .from('anagrafica_soggetti')
    .insert({ user_id: user.id, ...buildPersonaPayload(persona) })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  return { created: true, id: data?.id ?? null };
}
