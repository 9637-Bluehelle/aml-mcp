import { supabase } from './supabase';
import { getActiveStudioIdHolder } from './studioHelper';

export type FormatoCodice = 'manuale' | 'sequenziale' | 'sequenziale_cliente' | 'nome' | 'cf_piva';

/**
 * Formati ammessi per il codice incarico. Sottoinsieme di FormatoCodice: 'nome' e
 * 'cf_piva' sono esclusi perché per un dato cliente producono sempre la stessa
 * stringa, mentre un cliente può avere più incarichi — il secondo violerebbe
 * l'unicità di codice_incarico. Chi vuole "INC-ROSSI-001" usa 'sequenziale_cliente'
 * con incarico_include_nome (o incarico_include_cf_piva) attivo.
 */
export type FormatoCodiceIncarico = 'manuale' | 'sequenziale' | 'sequenziale_cliente';

export interface ImpostazioniStudio {
  formato_codice_cliente: FormatoCodice;
  formato_codice_incarico: FormatoCodiceIncarico;
  prefisso_cliente_attivo: boolean;
  prefisso_cliente: string;
  prefisso_incarico_attivo: boolean;
  prefisso_incarico: string;
  sequenziale_inizio_cliente: number;
  sequenziale_inizio_incarico: number;
  cliente_include_nome: boolean;
  incarico_include_nome: boolean;
  cliente_include_cf_piva: boolean;
  incarico_include_cf_piva: boolean;
}

/**
 * Valori usati finché lo studio non salva le proprie Impostazioni (la riga in
 * `impostazioni_studio` nasce solo al primo salvataggio). Sono volutamente
 * "automatici": lasciando 'manuale' i codici restavano a carico dell'utente, che
 * nella pratica li ignorava. Devono restare allineati ai DEFAULT delle colonne
 * (migration 20260729010000_impostazioni_default_automatici).
 */
const DEFAULT_IMPOSTAZIONI: ImpostazioniStudio = {
  formato_codice_cliente: 'cf_piva',
  formato_codice_incarico: 'sequenziale_cliente',
  prefisso_cliente_attivo: true,
  prefisso_cliente: 'CLI',
  prefisso_incarico_attivo: true,
  prefisso_incarico: 'INC',
  sequenziale_inizio_cliente: 1,
  sequenziale_inizio_incarico: 1,
  cliente_include_nome: false,
  incarico_include_nome: false,
  cliente_include_cf_piva: false,
  incarico_include_cf_piva: true,
};

async function getMyStudioId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('user_profiles')
    .select('studio_id')
    .eq('user_id', user.id)
    .maybeSingle();
  return data?.studio_id ?? null;
}

export async function loadImpostazioni(): Promise<ImpostazioniStudio> {
  const studioId = await getMyStudioId();
  if (!studioId) return DEFAULT_IMPOSTAZIONI;

  const { data } = await supabase
    .from('impostazioni_studio')
    .select('*')
    .eq('studio_id', studioId)
    .maybeSingle();

  if (!data) return DEFAULT_IMPOSTAZIONI;

  const incaricoLegacy = normalizzaFormatoIncarico(
    data.formato_codice_incarico,
    data.incarico_include_nome ?? false,
    data.incarico_include_cf_piva ?? false
  );

  return {
    formato_codice_cliente: data.formato_codice_cliente as FormatoCodice,
    formato_codice_incarico: incaricoLegacy.formato,
    prefisso_cliente_attivo: data.prefisso_cliente_attivo ?? true,
    prefisso_cliente: data.prefisso_cliente || 'CLI',
    prefisso_incarico_attivo: data.prefisso_incarico_attivo ?? true,
    prefisso_incarico: data.prefisso_incarico || 'INC',
    sequenziale_inizio_cliente: data.sequenziale_inizio_cliente ?? 1,
    sequenziale_inizio_incarico: data.sequenziale_inizio_incarico ?? 1,
    cliente_include_nome: data.cliente_include_nome ?? false,
    incarico_include_nome: incaricoLegacy.includeNome,
    cliente_include_cf_piva: data.cliente_include_cf_piva ?? false,
    incarico_include_cf_piva: incaricoLegacy.includeCfPiva,
  };
}

/**
 * Converte i formati incarico legacy 'nome'/'cf_piva' nel loro equivalente sano.
 * Entrambi generavano un codice costante per cliente, quindi il secondo incarico
 * dello stesso cliente collideva sull'unicità di codice_incarico: diventano
 * 'sequenziale_cliente' con la rispettiva componente attiva, che produce lo stesso
 * codice più un progressivo. La migration 20260715000000 fa la stessa conversione
 * sui dati; questa è la rete di sicurezza per i DB non ancora migrati.
 */
function normalizzaFormatoIncarico(
  formato: string,
  includeNome: boolean,
  includeCfPiva: boolean
): { formato: FormatoCodiceIncarico; includeNome: boolean; includeCfPiva: boolean } {
  if (formato === 'nome') {
    return { formato: 'sequenziale_cliente', includeNome: true, includeCfPiva };
  }
  if (formato === 'cf_piva') {
    return { formato: 'sequenziale_cliente', includeNome, includeCfPiva: true };
  }
  if (formato === 'sequenziale' || formato === 'sequenziale_cliente') {
    return { formato, includeNome, includeCfPiva };
  }
  return { formato: 'manuale', includeNome, includeCfPiva };
}

export async function saveImpostazioni(impostazioni: ImpostazioniStudio): Promise<void> {
  const studioId = await getMyStudioId();
  if (!studioId) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const payload = {
    studio_id: studioId,
    user_id: user.id,
    formato_codice_cliente: impostazioni.formato_codice_cliente,
    formato_codice_incarico: impostazioni.formato_codice_incarico,
    prefisso_cliente_attivo: impostazioni.prefisso_cliente_attivo,
    prefisso_cliente: impostazioni.prefisso_cliente,
    prefisso_incarico_attivo: impostazioni.prefisso_incarico_attivo,
    prefisso_incarico: impostazioni.prefisso_incarico,
    sequenziale_inizio_cliente: impostazioni.sequenziale_inizio_cliente,
    sequenziale_inizio_incarico: impostazioni.sequenziale_inizio_incarico,
    cliente_include_nome: impostazioni.cliente_include_nome,
    incarico_include_nome: impostazioni.incarico_include_nome,
    cliente_include_cf_piva: impostazioni.cliente_include_cf_piva,
    incarico_include_cf_piva: impostazioni.incarico_include_cf_piva,
  };
  // console.log('[saveImpostazioni] payload:', payload);
  const { error } = await supabase.from('impostazioni_studio').upsert(payload, { onConflict: 'studio_id' });
  if (error) console.error('[saveImpostazioni] errore:', error);
}

function buildPrefix(attivo: boolean, prefisso: string): string {
  return attivo ? prefisso : '';
}

function joinParts(parts: string[]): string {
  return parts.filter(Boolean).join('-');
}

function cleanName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Restituisce il primo codice libero della serie, partendo dal progressivo `partenza`.
 *
 * Il solo conteggio non basta a garantire l'unicità: i record cestinati restano in
 * tabella e continuano a occupare il loro codice (l'indice unique non li esclude),
 * e un purge può aprire buchi nella numerazione. Il conteggio serve quindi solo come
 * stima del punto di partenza; da lì saliamo finché il codice non risulta libero.
 * La verifica ignora deleted_at proprio perché un codice cestinato è ancora preso.
 */
async function primoCodiceLibero(
  tabella: 'clienti' | 'incarichi',
  colonna: 'codice_cliente' | 'codice_incarico',
  studioId: string | null,
  partenza: number,
  build: (n: number) => string
): Promise<string> {
  const MAX_TENTATIVI = 200;
  let n = partenza;

  for (let i = 0; i < MAX_TENTATIVI; i++) {
    const codice = build(n);
    let q = supabase
      .from(tabella)
      .select('id', { count: 'exact', head: true })
      .eq(colonna, codice);
    if (studioId) q = q.eq('studio_id', studioId);
    const { count, error } = await q;
    // In caso di errore non insistiamo: meglio proporre il candidato e lasciare
    // che sia il vincolo DB a decidere, piuttosto che ciclare a vuoto.
    if (error) return codice;
    if (!count) return codice;
    n++;
  }

  return build(n);
}

/** Conta le righe di una tabella per lo studio attivo, cestinate incluse. */
async function contaPerStudio(
  tabella: 'clienti' | 'incarichi',
  studioId: string | null,
  clienteId?: string
): Promise<number> {
  let q = supabase.from(tabella).select('id', { count: 'exact', head: true });
  if (studioId) q = q.eq('studio_id', studioId);
  if (clienteId) q = q.eq('cliente_id', clienteId);
  const { count } = await q;
  return count || 0;
}

export async function generateCodiceCliente(
  formato: FormatoCodice,
  nomeCliente?: string,
  impostazioni?: ImpostazioniStudio,
  cfPiva?: string
): Promise<string | null> {
  if (formato === 'manuale') return null;

  const imp = impostazioni || await loadImpostazioni();
  const prefix = buildPrefix(imp.prefisso_cliente_attivo, imp.prefisso_cliente);

  if (formato === 'sequenziale') {
    // Conteggio scopato allo studio attivo: senza filtro un superadmin conterebbe
    // i clienti di TUTTI gli studi e il progressivo risulterebbe sballato.
    // I cestinati sono inclusi di proposito: il loro codice è ancora occupato,
    // quindi ignorarli farebbe ripartire il progressivo su un codice già preso.
    const studioId = getActiveStudioIdHolder();
    const conteggio = await contaPerStudio('clienti', studioId);
    const nomePart = imp.cliente_include_nome && nomeCliente ? cleanName(nomeCliente) : '';
    const cfPart = imp.cliente_include_cf_piva && cfPiva ? cfPiva.toUpperCase().replace(/\s/g, '') : '';
    return primoCodiceLibero(
      'clienti',
      'codice_cliente',
      studioId,
      conteggio + imp.sequenziale_inizio_cliente,
      n => joinParts([prefix, nomePart, cfPart, String(n).padStart(3, '0')])
    );
  }

  if (formato === 'cf_piva') {
    if (!cfPiva) return null;
    return joinParts([prefix, cfPiva.toUpperCase().replace(/\s/g, '')]);
  }

  if (formato === 'nome') {
    if (!nomeCliente) return null;
    return joinParts([prefix, cleanName(nomeCliente)]);
  }

  return null;
}

export async function generateCodiceIncarico(
  formato: FormatoCodiceIncarico,
  nomeCliente?: string,
  impostazioni?: ImpostazioniStudio,
  clienteId?: string,
  cfPiva?: string
): Promise<string | null> {
  if (formato === 'manuale') return null;

  const imp = impostazioni || await loadImpostazioni();
  const prefix = buildPrefix(imp.prefisso_incarico_attivo, imp.prefisso_incarico);
  const nomepart = imp.incarico_include_nome && nomeCliente ? cleanName(nomeCliente) : '';
  const cfPart = imp.incarico_include_cf_piva && cfPiva ? cfPiva.toUpperCase().replace(/\s/g, '') : '';
  const studioId = getActiveStudioIdHolder();
  const build = (n: number) => joinParts([prefix, nomepart, cfPart, String(n).padStart(3, '0')]);

  // Entrambi i formati chiudono con un progressivo: è l'unica parte che distingue
  // due incarichi dello stesso cliente, che altrimenti condividerebbero nome e CF.
  if (formato === 'sequenziale') {
    const conteggio = await contaPerStudio('incarichi', studioId);
    return primoCodiceLibero(
      'incarichi',
      'codice_incarico',
      studioId,
      conteggio + imp.sequenziale_inizio_incarico,
      build
    );
  }

  if (formato === 'sequenziale_cliente') {
    if (!clienteId) return null;
    const conteggio = await contaPerStudio('incarichi', studioId, clienteId);
    return primoCodiceLibero(
      'incarichi',
      'codice_incarico',
      studioId,
      conteggio + imp.sequenziale_inizio_incarico,
      build
    );
  }

  return null;
}
