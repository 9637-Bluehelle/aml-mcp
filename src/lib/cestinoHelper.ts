import { supabase } from './supabase';
import { addUserLog } from '../components/LogUtente';
 
/**
 * Notifica all'app che il cestino è cambiato (sposta/ripristina/svuota).
 * Cestinare/ripristinare può eliminare o rigenerare alert (via trigger
 * `archiviato` + `check_alerts`): chi mostra contatori alert ascolta questo
 * evento e ricarica, senza dipendere unicamente dal realtime.
 */
function notifyCestinoChanged() {
  try {
    window.dispatchEvent(new CustomEvent('cestino-changed'));
  } catch {
    /* ambiente senza window (test) */
  }
}
 
// Tipi di entità che possono essere spostate nel cestino come "radice".
export type CestinoEntityType =
  | 'cliente'
  | 'incarico'
  | 'documento'
  | 'anagrafica'
  | 'autovalutazione'
  | 'valutazione'
  | 'controllo'
  | 'segnalazione';
 
// Una voce del cestino = un'operazione di cestinamento (radice + discendenti).
export interface CestinoEntry {
  id: string;
  studio_id: string;
  entity_type: CestinoEntityType;
  entity_id: string;
  etichetta: string | null;
  elementi: Array<{ tabella: string; id: string }>;
  riepilogo: Record<string, number>;
  file_paths: string[];
  deleted_by: string | null;
  deleted_at: string;
  stato: 'in_cestino' | 'ripristinato' | 'eliminato';
}
 
export interface PermessiCestino {
  cestina: boolean;
  ripristina: boolean;
  svuota: boolean;
}
 
/**
 * Sposta una radice (e i suoi discendenti) nel cestino tramite la RPC `cestina`.
 * Restituisce l'etichetta e il riepilogo dei record toccati.
 */
export async function spostaNelCestino(
  entityType: CestinoEntityType,
  entityId: string,
  includiAnagrafiche = false,
): Promise<{ cestino_id: string; etichetta: string; riepilogo: Record<string, number> }> {
  const { data, error } = await supabase.rpc('cestina', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_includi_anagrafiche: includiAnagrafiche,
  });
  if (error) throw error;
  await addUserLog(`Spostato nel cestino: ${data?.etichetta ?? entityType}`);
  notifyCestinoChanged();
  return data;
}
 
/**
 * Anagrafiche collegate SOLO a questo cliente (candidate a essere cestinate
 * insieme a lui). Quelle collegate anche ad altri clienti non vengono incluse.
 */
export async function anagraficheEsclusiveCliente(
  clienteId: string,
): Promise<Array<{ id: string; nome_cognome: string }>> {
  const { data, error } = await supabase.rpc('anagrafiche_esclusive_cliente', {
    p_cliente_id: clienteId,
  });
  if (error) return [];
  return (data ?? []) as Array<{ id: string; nome_cognome: string }>;
}
 
export interface AnagraficaCondivisa {
  id: string;
  nome_cognome: string;
  altri_clienti: string | null;
  // Numero di documenti conservati insieme all'anagrafica (tutti i suoi file:
  // via persona_id o bridge UUID azienda). Valorizzato solo nel dettaglio cestino.
  num_documenti?: number;
}
 
/**
 * Anagrafiche collegate al cliente MA anche ad altri clienti: cestinando il
 * cliente restano intatte. Usate per informare l'utente.
 */
export async function anagraficheCondiviseCliente(
  clienteId: string,
): Promise<AnagraficaCondivisa[]> {
  const { data, error } = await supabase.rpc('anagrafiche_condivise_cliente', {
    p_cliente_id: clienteId,
  });
  if (error) return [];
  return (data ?? []) as AnagraficaCondivisa[];
}
 
/**
 * True se l'anagrafica è ancora referenziata da record ATTIVI (clienti,
 * titolari effettivi, nodi catena di controllo, documenti): in tal caso NON è
 * cestinabile. Da chiamare prima di `spostaNelCestino('anagrafica', …)` per
 * mostrare l'avviso senza invocare la RPC, evitando la risposta 400 che il
 * browser logga in console.
 *
 * In caso di errore (es. RPC non ancora deployata) ritorna `false`: si lascia
 * procedere e la guardia server-side in `cestina` resta protezione finale.
 */
export async function anagraficaInUso(personaId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('anagrafica_in_uso', { p_persona_id: personaId });
  if (error) return false;
  return !!data;
}

/**
 * Clausola sul recupero da appendere ai messaggi delle modali di cestinamento,
 * adattata al permesso di RIPRISTINO dell'utente corrente: a un collaboratore
 * che (in base alle impostazioni dello studio) non può ripristinare NON va
 * promesso che "potrà ripristinarlo". Formulazione neutra rispetto a
 * genere/numero dell'elemento. In caso di dubbio (errore RPC) usa la forma
 * neutra "sarà ripristinabile".
 */
export async function clausolaRecuperoCestino(): Promise<string> {
  try {
    const { data } = await supabase.rpc('cestino_puo', { p_azione: 'ripristina' });
    if (data === false) {
      return 'Resterà nel cestino; il ripristino è riservato agli amministratori, fino all\'eliminazione definitiva.';
    }
  } catch {
    /* in dubbio: formulazione neutra sotto */
  }
  return 'Resterà nel cestino e sarà ripristinabile fino all\'eliminazione definitiva.';
}

/** Ripristina una voce del cestino (riporta in vita i record del batch). */
export async function ripristinaDalCestino(cestinoId: string): Promise<void> {
  const { error } = await supabase.rpc('ripristina', { p_cestino_id: cestinoId });
  if (error) throw error;
  await addUserLog('Ripristinato dal cestino');
  notifyCestinoChanged();
}
 
/** Rimuove i file dallo Storage in modo best-effort (gli orfani non sono critici). */
async function rimuoviFiles(paths: string[] | null | undefined): Promise<void> {
  const validi = (paths ?? []).filter(Boolean);
  if (validi.length === 0) return;
  try {
    await supabase.storage.from('file_allegati').remove(validi);
  } catch {
    /* best effort: i file orfani verranno comunque ignorati */
  }
}
 
/** Cancellazione definitiva di una singola voce del cestino (+ pulizia Storage). */
export async function svuotaElemento(cestinoId: string): Promise<void> {
  const { data, error } = await supabase.rpc('svuota_elemento', { p_cestino_id: cestinoId });
  if (error) throw error;
  await rimuoviFiles(data?.file_paths);
  await addUserLog('Eliminato definitivamente dal cestino');
  notifyCestinoChanged();
}
 
/** Svuota l'intero cestino dello studio (+ pulizia Storage). Ritorna il numero eliminato. */
export async function svuotaCestino(): Promise<number> {
  const { data, error } = await supabase.rpc('svuota_cestino');
  if (error) throw error;
  await rimuoviFiles(data?.file_paths);
  await addUserLog('Svuotato il cestino');
  notifyCestinoChanged();
  return data?.eliminati ?? 0;
}
 
/** Carica le voci attualmente nel cestino (opzionalmente filtrate per studio). */
export async function caricaCestino(studioId?: string | null): Promise<CestinoEntry[]> {
  let q = supabase
    .from('cestino')
    .select('*')
    .eq('stato', 'in_cestino')
    .order('deleted_at', { ascending: false });
  if (studioId) q = q.eq('studio_id', studioId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CestinoEntry[];
}
 
/** Conta le voci nel cestino (per il badge). */
export async function contaCestino(studioId?: string | null): Promise<number> {
  let q = supabase
    .from('cestino')
    .select('id', { count: 'exact', head: true })
    .eq('stato', 'in_cestino');
  if (studioId) q = q.eq('studio_id', studioId);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}
 
/**
 * Risolve gli UUID utente in nomi leggibili (per "eliminato da …").
 * Best-effort: se la lettura fallisce o un id manca, quel nome semplicemente
 * non comparirà (la UI mostra solo la data).
 */
export async function caricaNomiUtenti(
  userIds: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))] as string[];
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, nome, cognome, email')
    .in('user_id', ids);
  if (error) return {};
  const map: Record<string, string> = {};
  for (const p of (data ?? []) as any[]) {
    const nome = [p.nome, p.cognome].filter(Boolean).join(' ');
    map[p.user_id] = nome || p.email || 'Utente';
  }
  return map;
}

/**
 * Giorni di retention dell'auto-purge per ciascuno studio indicato.
 * Solo gli studi con auto-purge ATTIVO (valore intero > 0) compaiono nella
 * mappa; assenza = auto-purge spento.
 */
export async function leggiAutoPurgePerStudi(
  studioIds: Array<string | null | undefined>,
): Promise<Record<string, number>> {
  const ids = [...new Set(studioIds.filter(Boolean))] as string[];
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('impostazioni_studio')
    .select('studio_id, cestino_auto_purge_giorni')
    .in('studio_id', ids);
  if (error) return {};
  const map: Record<string, number> = {};
  for (const r of (data ?? []) as any[]) {
    const g = r.cestino_auto_purge_giorni;
    if (g != null && g > 0) map[r.studio_id] = g;
  }
  return map;
}

/**
 * Data e giorni rimanenti prima del purge automatico, dato il `deleted_at` e i
 * giorni di retention dello studio. Ritorna null se l'auto-purge è spento.
 */
export function calcolaPurge(
  deletedAt: string,
  giorni: number | null | undefined,
): { data: Date; giorniRimanenti: number } | null {
  if (!giorni || giorni <= 0) return null;
  const base = new Date(deletedAt).getTime();
  if (Number.isNaN(base)) return null;
  const giorno = 24 * 60 * 60 * 1000;
  const data = new Date(base + giorni * giorno);
  const giorniRimanenti = Math.max(0, Math.ceil((data.getTime() - Date.now()) / giorno));
  return { data, giorniRimanenti };
}

// Tabelle sorgente per i tipi il cui record radice appartiene a un incarico.
// Cliente/anagrafica/autovalutazione (RT1, per-studio) non hanno incarico;
// l'incarico stesso ha già il codice nel titolo. I documenti hanno un
// trattamento dedicato (incarico → cliente → anagrafica) qui sotto.
const FONTE_INCARICO: Partial<Record<CestinoEntityType, string>> = {
  valutazione: 'valutazioni_rischio',
  controllo: 'controlli_costanti',
  segnalazione: 'segnalazioni_sos',
};

/** Risolve id → nome leggibile per una tabella (cliente/anagrafica). */
async function nomiPerId(
  tabella: string,
  campo: string,
  ids: string[],
): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return m;
  const { data, error } = await supabase.from(tabella).select(`id, ${campo}`).in('id', uniq);
  if (error) return m;
  for (const r of (data ?? []) as any[]) if (r[campo]) m.set(r.id, r[campo]);
  return m;
}

/**
 * Contesto di appartenenza da mostrare nel titolo della voce di cestino:
 *  - RT2/RT3/SOS → incarico;
 *  - documento   → incarico se presente, altrimenti cliente, altrimenti anagrafica.
 * Ritorna cestino_id → etichetta; le voci senza contesto non compaiono.
 */
export async function caricaContestoVoci(
  voci: CestinoEntry[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};

  // --- Tipi legati direttamente a un incarico (RT2/RT3/SOS) ---
  const perTabella = new Map<string, Array<{ cestinoId: string; entityId: string }>>();
  for (const v of voci) {
    const tabella = FONTE_INCARICO[v.entity_type];
    if (!tabella) continue;
    const arr = perTabella.get(tabella) ?? [];
    arr.push({ cestinoId: v.id, entityId: v.entity_id });
    perTabella.set(tabella, arr);
  }

  await Promise.all([
    ...Array.from(perTabella.entries()).map(async ([tabella, righe]) => {
      try {
        const { data, error } = await supabase
          .from(tabella)
          .select('id, incarichi(codice_incarico, descrizione)')
          .in('id', righe.map(r => r.entityId));
        if (error) return;
        const byEntity = new Map<string, string>();
        for (const r of (data ?? []) as any[]) {
          const label = r.incarichi?.codice_incarico || r.incarichi?.descrizione || null;
          if (label) byEntity.set(r.id, label);
        }
        for (const { cestinoId, entityId } of righe) {
          const label = byEntity.get(entityId);
          if (label) out[cestinoId] = label;
        }
      } catch { /* best effort */ }
    }),

    // --- Documenti: incarico → cliente → anagrafica (primo disponibile) ---
    (async () => {
      const docVoci = voci.filter(v => v.entity_type === 'documento');
      if (docVoci.length === 0) return;
      try {
        const { data, error } = await supabase
          .from('documenti')
          .select('id, cliente_id, persona_id, incarichi(codice_incarico, descrizione)')
          .in('id', docVoci.map(v => v.entity_id));
        if (error) return;
        const rows = (data ?? []) as any[];
        // Risolvi i nomi di cliente/anagrafica solo dove manca l'incarico.
        const clienteIds: string[] = [];
        const personaIds: string[] = [];
        for (const r of rows) {
          if (r.incarichi?.codice_incarico || r.incarichi?.descrizione) continue;
          if (r.cliente_id) clienteIds.push(r.cliente_id);
          else if (r.persona_id) personaIds.push(r.persona_id);
        }
        const [clientiMap, personeMap] = await Promise.all([
          nomiPerId('clienti', 'ragione_sociale', clienteIds),
          nomiPerId('anagrafica_soggetti', 'nome_cognome', personaIds),
        ]);
        const byEntity = new Map<string, string>();
        for (const r of rows) {
          const label =
            r.incarichi?.codice_incarico || r.incarichi?.descrizione
            || (r.cliente_id ? clientiMap.get(r.cliente_id) : null)
            || (r.persona_id ? personeMap.get(r.persona_id) : null)
            || null;
          if (label) byEntity.set(r.id, label);
        }
        for (const v of docVoci) {
          const label = byEntity.get(v.entity_id);
          if (label) out[v.id] = label;
        }
      } catch { /* best effort */ }
    })(),
  ]);

  return out;
}

/**
 * Conta, per ciascuna anagrafica indicata, TUTTI i suoi documenti ancora vivi
 * (`deleted_at IS NULL`): quelli legati via `persona_id` e, per le aziende col
 * bridge UUID, via `cliente_id`. Stesso criterio della scheda anagrafica
 * (persona_id = X OR cliente_id = X). Best-effort: in caso di errore mappa vuota.
 */
async function conteggiDocumentiPerAnagrafica(
  anagIds: string[],
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  const uniq = [...new Set(anagIds.filter(Boolean))];
  if (uniq.length === 0) return m;
  const lista = uniq.join(',');
  const { data, error } = await supabase
    .from('documenti')
    .select('id, persona_id, cliente_id')
    .is('deleted_at', null)
    .or(`persona_id.in.(${lista}),cliente_id.in.(${lista})`);
  if (error) return m;
  const set = new Set(uniq);
  for (const d of (data ?? []) as Array<{ persona_id: string | null; cliente_id: string | null }>) {
    // Un documento può appartenere all'anagrafica via persona_id e/o (bridge)
    // via cliente_id: conta una sola volta per ciascuna anagrafica.
    const ids = new Set<string>();
    if (d.persona_id && set.has(d.persona_id)) ids.add(d.persona_id);
    if (d.cliente_id && set.has(d.cliente_id)) ids.add(d.cliente_id);
    for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

/** Legge i permessi correnti dell'utente sul cestino (gate server-side). */
export async function leggiPermessiCestino(): Promise<PermessiCestino> {
  const [c, r, s] = await Promise.all([
    supabase.rpc('cestino_puo', { p_azione: 'cestina' }),
    supabase.rpc('cestino_puo', { p_azione: 'ripristina' }),
    supabase.rpc('cestino_puo', { p_azione: 'svuota' }),
  ]);
  return { cestina: !!c.data, ripristina: !!r.data, svuota: !!s.data };
}
 
// --- Dettaglio espandibile di una voce del cestino ---
 
export interface DettaglioVoce {
  id: string;
  label: string;
  // `meta`: informazioni aggiuntive (date, classe rischio, incarico, …), mostrate
  // come chip evidenziati accanto al nome.
  meta?: string[];
  // `nota`: annotazione di stato (es. rappresentante conservato/eliminato), in blu.
  nota?: string;
}

export interface DettaglioGruppo {
  tabella: string;
  etichetta: string;
  items: DettaglioVoce[];
}
 
export interface RappresentanteVoce {
  id: string;
  nome_cognome: string;
  stato: 'eliminato' | 'conservato';
}
 
export interface DettaglioCestino {
  gruppi: DettaglioGruppo[];
  // Anagrafiche condivise (conservate), arricchite col conteggio dei loro documenti.
  conservate: AnagraficaCondivisa[];
}

function fmtDataBreve(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return String(iso);
  }
}
 
// ---------------------------------------------------------------------------
// DETTAGLIO_CONFIG
//
// Configurazione per-tabella: campi da leggere ed etichetta leggibile.
// Le righe sono soft-deleted ma esistono ancora: si leggono per id,
// usando .or('deleted_at.is.null,deleted_at.not.is.null') per bypassare
// eventuali filtri RLS che escludono i record soft-deleted.
//
// Ordine di visualizzazione:
//   0  clienti
//   1  rappresentanti legali (gruppo sintetico, costruito a parte)
//   2  titolari effettivi
//   3  anagrafiche
//   4  incarichi
//   5  autovalutazioni (RT1)
//   6  valutazioni_rischio (RT2)
//   7  controlli_costanti (RT3)
//   8  segnalazioni_sos
//   9  documenti
// ---------------------------------------------------------------------------
// La `label` separa il nome principale (`testo`) dalle informazioni aggiuntive
// (`meta`): queste ultime sono rese come chip evidenziati nel pannello.
type EtichettaVoce = { testo: string; meta?: string[] };

const DETTAGLIO_CONFIG: Record<
  string,
  { etichetta: string; ordine: number; select: string; label: (r: any) => EtichettaVoce }
> = {
  clienti: {
    etichetta: 'Cliente', ordine: 0,
    select: 'id, ragione_sociale, codice_cliente',
    label: r => ({
      testo: r.ragione_sociale || r.codice_cliente || 'Cliente',
      meta: r.ragione_sociale && r.codice_cliente ? [r.codice_cliente] : undefined,
    }),
  },
  titolari_effettivi: {
    etichetta: 'Titolari effettivi', ordine: 2,
    select: 'id, anagrafica_soggetti(nome_cognome)',
    label: r => ({ testo: r.anagrafica_soggetti?.nome_cognome || 'Titolare effettivo' }),
  },
  anagrafica_soggetti: {
    etichetta: 'Anagrafiche', ordine: 3,
    select: 'id, nome_cognome',
    label: r => ({ testo: r.nome_cognome || 'Anagrafica' }),
  },
  incarichi: {
    etichetta: 'Incarichi', ordine: 4,
    select: 'id, codice_incarico, descrizione, data_inizio, data_fine, status',
    label: r => {
      const testo = [r.codice_incarico, r.descrizione].filter(Boolean).join(' — ') || 'Incarico';
      const date = [fmtDataBreve(r.data_inizio), fmtDataBreve(r.data_fine)].filter(Boolean).join(' → ');
      return { testo, meta: date ? [date] : undefined };
    },
  },
  autovalutazioni: {
    etichetta: 'Autovalutazioni (RT1)', ordine: 5,
    select: 'id, created_at, version, status',
    label: r => ({
      testo: `Autovalutazione del ${fmtDataBreve(r.created_at)}`,
      meta: r.version ? [`v${r.version}`] : undefined,
    }),
  },
  valutazioni_rischio: {
    etichetta: 'Valutazioni del rischio (RT2)', ordine: 6,
    select: 'id, data_valutazione, classe_rischio, rischio_effettivo, created_at, incarico_id, incarichi(codice_incarico, descrizione, clienti(ragione_sociale))',
    label: r => {
      const data = fmtDataBreve(r.data_valutazione ?? r.created_at);
      const incarico = r.incarichi?.codice_incarico || r.incarichi?.descrizione || null;
      const cliente = r.incarichi?.clienti?.ragione_sociale ?? null;
      return {
        testo: `RT2 del ${data}`,
        meta: [
          r.classe_rischio ? `classe ${r.classe_rischio}` : null,
          incarico ? `incarico ${incarico}` : null,
          cliente,
        ].filter(Boolean) as string[],
      };
    },
  },
  controlli_costanti: {
    etichetta: 'Controlli costanti (RT3)', ordine: 7,
    select: 'id, data_controllo, tipologia, esito, incarico_id, incarichi(codice_incarico, descrizione, clienti(ragione_sociale))',
    label: r => {
      const data = fmtDataBreve(r.data_controllo);
      const tipo = r.tipologia === 'event-driven' ? 'straordinario' : r.tipologia === 'periodic' ? 'periodico' : r.tipologia ?? null;
      const incarico = r.incarichi?.codice_incarico || r.incarichi?.descrizione || null;
      const cliente = r.incarichi?.clienti?.ragione_sociale ?? null;
      return {
        testo: `Controllo del ${data}`,
        meta: [tipo, incarico ? `incarico ${incarico}` : null, cliente].filter(Boolean) as string[],
      };
    },
  },
  segnalazioni_sos: {
    etichetta: 'Segnalazioni SOS', ordine: 8,
    select: 'id, data_valutazione, decisione, incarico_id, incarichi(codice_incarico, descrizione, clienti(ragione_sociale))',
    label: r => {
      const data = fmtDataBreve(r.data_valutazione);
      const decisione = r.decisione === 'sent' ? 'inviata' : r.decisione === 'archived' ? 'archiviata' : r.decisione ?? null;
      const incarico = r.incarichi?.codice_incarico || r.incarichi?.descrizione || null;
      const cliente = r.incarichi?.clienti?.ragione_sociale ?? null;
      return {
        testo: `SOS del ${data}`,
        meta: [decisione, incarico ? `incarico ${incarico}` : null, cliente].filter(Boolean) as string[],
      };
    },
  },
  documenti: {
    etichetta: 'Documenti', ordine: 9,
    select: 'id, nome_file, tipologia, data_acquisizione, data_scadenza, persona_id, cliente_id, incarico_id, incarichi(codice_incarico, descrizione)',
    label: r => {
      const nome = r.nome_file || r.tipologia || 'Documento';
      const incarico = r.incarichi?.codice_incarico || r.incarichi?.descrizione || null;
      return {
        testo: nome,
        meta: [
          r.data_scadenza ? `scade ${fmtDataBreve(r.data_scadenza)}` : null,
          incarico ? `incarico ${incarico}` : null,
        ].filter(Boolean) as string[],
      };
    },
  },
};
 
/**
 * Carica i record contenuti in una voce del cestino, raggruppati e con etichette
 * leggibili, per mostrare all'utente cosa sta per essere eliminato.
 *
 * Nota sulla lettura dei soft-deleted: le query usano `.in('id', ids)` senza
 * filtro `deleted_at IS NULL` perché i record in `elementi` sono già cestinati
 * (deleted_at valorizzato). Le RLS permettono la lettura via studio_id.
 */
export async function caricaDettaglioCestino(
  entry: CestinoEntry,
): Promise<DettaglioCestino> {
  const elementi = entry.elementi;
 
  // Raggruppa gli id per tabella (solo quelle con config leggibile).
  const perTabella = new Map<string, string[]>();
  for (const e of elementi || []) {
    if (!DETTAGLIO_CONFIG[e.tabella]) continue;
    const arr = perTabella.get(e.tabella) ?? [];
    arr.push(e.id);
    perTabella.set(e.tabella, arr);
  }
 
  // Anagrafiche condivise (conservate) — solo per i batch cliente. Arricchite
  // col numero di documenti conservati insieme a ciascuna (tutti i loro file).
  let conservate: AnagraficaCondivisa[] = entry.entity_type === 'cliente'
    ? await anagraficheCondiviseCliente(entry.entity_id)
    : [];
  if (conservate.length > 0) {
    const conteggi = await conteggiDocumentiPerAnagrafica(conservate.map(c => c.id));
    conservate = conservate.map(c => ({ ...c, num_documenti: conteggi.get(c.id) ?? 0 }));
  }

  // Per i batch cliente: ruoli speciali delle anagrafiche (rappresentante legale /
  // soggetto del cliente), così da distinguerle nel dettaglio.
  let repPersonaId: string | null = null;
  let clientePersonaId: string | null = null;
  const clienteEl = (elementi || []).find(e => e.tabella === 'clienti');
  if (clienteEl) {
    try {
      const { data } = await supabase
        .from('clienti')
        .select('rappresentante_persona_id, persona_id')
        .eq('id', clienteEl.id)
        .maybeSingle();
      repPersonaId = (data as any)?.rappresentante_persona_id ?? null;
      clientePersonaId = (data as any)?.persona_id ?? null;
    } catch { /* ignora */ }
  }

  // Anagrafiche collegate SOLO a questo cliente ma ancora vive = mantenute per
  // scelta dell'utente (non incluse nel cestino). `anagrafiche_esclusive_cliente`
  // filtra già su `deleted_at IS NULL`, quindi restituisce solo le superstiti.
  // Il rappresentante è escluso: ha già il suo gruppo con badge dedicato.
  let mantenute: Array<{ id: string; nome_cognome: string }> = [];
  if (entry.entity_type === 'cliente') {
    try {
      const esclusive = await anagraficheEsclusiveCliente(entry.entity_id);
      mantenute = esclusive.filter(a => a.id !== repPersonaId);
    } catch { /* best effort */ }
  }

  // Carica tutti i gruppi in parallelo.
  const gruppi = await Promise.all(
    Array.from(perTabella.entries()).map(async ([tabella, ids]) => {
      const cfg = DETTAGLIO_CONFIG[tabella];
      try {
        const { data, error } = await supabase
          .from(tabella)
          .select(cfg.select)
          .in('id', ids);
        if (error) throw error;
        const items: DettaglioVoce[] = (data ?? []).map((r: any) => {
          const { testo, meta } = cfg.label(r);
          return { id: r.id, label: testo, meta };
        });
        return { tabella, etichetta: cfg.etichetta, ordine: cfg.ordine, items };
      } catch {
        // Una tabella che fallisce non deve rompere l'intero dettaglio.
        return { tabella, etichetta: cfg.etichetta, ordine: cfg.ordine, items: [] };
      }
    }),
  );
 
  // ---------------------------------------------------------------------------
  // Rappresentanti legali del cliente: gruppo sintetico con nota su stato.
  // ---------------------------------------------------------------------------
  let rappresentanti: RappresentanteVoce[] = [];
  const repIds = repPersonaId ? [repPersonaId] : [];
  if (repIds.length > 0) {
    try {
      const { data } = await supabase
        .from('anagrafica_soggetti')
        .select('id, nome_cognome')
        .in('id', repIds);
      const eliminate = new Set(
        (elementi || []).filter(e => e.tabella === 'anagrafica_soggetti').map(e => e.id),
      );
      rappresentanti = (data ?? []).map((r: any) => ({
        id: r.id,
        nome_cognome: r.nome_cognome,
        stato: eliminate.has(r.id) ? 'eliminato' : 'conservato',
      }));
    } catch { /* ignora */ }
  }
 
  const repIdSet = new Set(rappresentanti.map(r => r.id));
  if (rappresentanti.length > 0) {
    gruppi.push({
      tabella: 'rappresentanti',
      etichetta: rappresentanti.length === 1 ? 'Rappresentante legale' : 'Rappresentanti legali',
      ordine: 1,
      items: rappresentanti.map(r => ({
        id: r.id,
        label: r.nome_cognome,
        nota: r.stato === 'eliminato' ? 'eliminato col cliente' : 'conservato',
      })),
    });
  }

  // Badge "conservato" sui titolari effettivi la cui anagrafica è stata MANTENUTA
  // (collegata solo a questo cliente ma non eliminata): la relazione TE viene
  // rimossa col cliente, ma la persona sopravvive. Evita il doppione con una
  // sezione separata mostrando lo stato direttamente sulla voce.
  const mantenuteIds = new Set(mantenute.map(m => m.id));
  if (mantenuteIds.size > 0) {
    const teIdx = gruppi.findIndex(g => g.tabella === 'titolari_effettivi');
    if (teIdx >= 0 && gruppi[teIdx].items.length > 0) {
      try {
        const { data } = await supabase
          .from('titolari_effettivi')
          .select('id, persona_id')
          .in('id', gruppi[teIdx].items.map(it => it.id));
        const personaPerRiga = new Map<string, string>();
        for (const r of (data ?? []) as Array<{ id: string; persona_id: string | null }>) {
          if (r.persona_id) personaPerRiga.set(r.id, r.persona_id);
        }
        gruppi[teIdx] = {
          ...gruppi[teIdx],
          items: gruppi[teIdx].items.map(it => {
            const pid = personaPerRiga.get(it.id);
            return pid && mantenuteIds.has(pid) ? { ...it, nota: 'conservato' } : it;
          }),
        };
      } catch { /* best effort */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Assemblaggio finale.
  // ---------------------------------------------------------------------------
  const gruppiFinali = gruppi
    // Il rappresentante ha il suo gruppo dedicato: escludilo da "Anagrafiche".
    .map(g => g.tabella === 'anagrafica_soggetti'
      ? { ...g, items: g.items.filter(it => !repIdSet.has(it.id)) }
      : g)
    .filter(g => g.items.length > 0)
    .sort((a, b) => a.ordine - b.ordine)
    .map(({ tabella, etichetta, items }) => ({
      tabella,
      etichetta,
      items: tabella === 'anagrafica_soggetti'
        ? items.map(it => (
            it.id === clientePersonaId
              ? { ...it, meta: [...(it.meta ?? []), 'soggetto cliente'] }
              : it
          ))
        : items,
    }));
 
  return { gruppi: gruppiFinali, conservate };
}
 
/**
 * Etichetta leggibile per il riepilogo dei contenuti di una voce.
 * L'ordine segue quello del pannello di dettaglio (titolari → anagrafiche →
 * incarichi → RT2 → RT3 → SOS → documenti); eventuali chiavi non previste
 * vengono accodate per non perderle.
 */
export function descriviRiepilogo(riepilogo: Record<string, number>): string {
  const ORDINE: Array<[string, string]> = [
    ['titolari', 'titolari'],
    ['anagrafiche', 'anagrafiche'],
    ['incarichi', 'incarichi'],
    ['valutazioni', 'valutazioni'],
    ['controlli', 'controlli'],
    ['segnalazioni_sos', 'segnalazioni SOS'],
    ['documenti', 'documenti'],
  ];
  const noti = new Set(ORDINE.map(([k]) => k));
  const r = riepilogo || {};
  const parti = ORDINE
    .filter(([k]) => (r[k] ?? 0) > 0)
    .map(([k, etichetta]) => `${r[k]} ${etichetta}`);
  // Chiavi non previste (future estensioni): in coda, ordine di arrivo.
  for (const [k, n] of Object.entries(r)) {
    if (!noti.has(k) && (n ?? 0) > 0) parti.push(`${n} ${k}`);
  }
  return parti.join(' · ');
}