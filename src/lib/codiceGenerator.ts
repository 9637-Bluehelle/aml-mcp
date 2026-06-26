import { supabase } from './supabase';
import { getActiveStudioIdHolder } from './studioHelper';

export type FormatoCodice = 'manuale' | 'sequenziale' | 'sequenziale_cliente' | 'nome' | 'cf_piva';

export interface ImpostazioniStudio {
  formato_codice_cliente: FormatoCodice;
  formato_codice_incarico: FormatoCodice;
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

const DEFAULT_IMPOSTAZIONI: ImpostazioniStudio = {
  formato_codice_cliente: 'manuale',
  formato_codice_incarico: 'manuale',
  prefisso_cliente_attivo: true,
  prefisso_cliente: 'CLI',
  prefisso_incarico_attivo: true,
  prefisso_incarico: 'INC',
  sequenziale_inizio_cliente: 1,
  sequenziale_inizio_incarico: 1,
  cliente_include_nome: false,
  incarico_include_nome: false,
  cliente_include_cf_piva: false,
  incarico_include_cf_piva: false,
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
  return {
    formato_codice_cliente: data.formato_codice_cliente as FormatoCodice,
    formato_codice_incarico: data.formato_codice_incarico as FormatoCodice,
    prefisso_cliente_attivo: data.prefisso_cliente_attivo ?? true,
    prefisso_cliente: data.prefisso_cliente || 'CLI',
    prefisso_incarico_attivo: data.prefisso_incarico_attivo ?? true,
    prefisso_incarico: data.prefisso_incarico || 'INC',
    sequenziale_inizio_cliente: data.sequenziale_inizio_cliente ?? 1,
    sequenziale_inizio_incarico: data.sequenziale_inizio_incarico ?? 1,
    cliente_include_nome: data.cliente_include_nome ?? false,
    incarico_include_nome: data.incarico_include_nome ?? false,
    cliente_include_cf_piva: data.cliente_include_cf_piva ?? false,
    incarico_include_cf_piva: data.incarico_include_cf_piva ?? false,
  };
}

export async function saveImpostazioni(impostazioni: ImpostazioniStudio): Promise<{ error: string | null }> {
  const studioId = await getMyStudioId();
  if (!studioId) return { error: 'Studio non determinato.' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessione non valida.' };

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
  if (error) { console.error('[saveImpostazioni] errore:', error); return { error: error.message }; }
  return { error: null };
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
    // Conteggio scopato allo studio attivo ed escludendo il cestino: senza filtro
    // un superadmin conterebbe i clienti di TUTTI gli studi e il progressivo
    // risulterebbe sballato (i clienti cestinati gonfierebbero il numero).
    let cq = supabase
      .from('clienti')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null);
    const studioId = getActiveStudioIdHolder();
    if (studioId) cq = cq.eq('studio_id', studioId);
    const { count } = await cq;
    const next = (count || 0) + imp.sequenziale_inizio_cliente;
    const nomePart = imp.cliente_include_nome && nomeCliente ? cleanName(nomeCliente) : '';
    const cfPart = imp.cliente_include_cf_piva && cfPiva ? cfPiva.toUpperCase().replace(/\s/g, '') : '';
    return joinParts([prefix, nomePart, cfPart, String(next).padStart(3, '0')]);
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
  formato: FormatoCodice,
  nomeCliente?: string,
  impostazioni?: ImpostazioniStudio,
  clienteId?: string,
  cfPiva?: string
): Promise<string | null> {
  if (formato === 'manuale') return null;

  const imp = impostazioni || await loadImpostazioni();
  const prefix = buildPrefix(imp.prefisso_incarico_attivo, imp.prefisso_incarico);
  const nomepart = imp.incarico_include_nome && nomeCliente ? cleanName(nomeCliente) : '';

  if (formato === 'sequenziale') {
    const { count } = await supabase
      .from('incarichi')
      .select('*', { count: 'exact', head: true });
    const next = (count || 0) + imp.sequenziale_inizio_incarico;
    const cfPart = imp.incarico_include_cf_piva && cfPiva ? cfPiva.toUpperCase().replace(/\s/g, '') : '';
    return joinParts([prefix, nomepart, cfPart, String(next).padStart(3, '0')]);
  }

  if (formato === 'sequenziale_cliente') {
    if (!clienteId) return null;
    const { count } = await supabase
      .from('incarichi')
      .select('*', { count: 'exact', head: true })
      .eq('cliente_id', clienteId);
    const next = (count || 0) + imp.sequenziale_inizio_incarico;
    const cfPart = imp.incarico_include_cf_piva && cfPiva ? cfPiva.toUpperCase().replace(/\s/g, '') : '';
    return joinParts([prefix, nomepart, cfPart, String(next).padStart(3, '0')]);
  }

  if (formato === 'cf_piva') {
    if (!cfPiva) return null;
    return joinParts([prefix, nomepart, cfPiva.toUpperCase().replace(/\s/g, '')]);
  }

  if (formato === 'nome') {
    if (!nomeCliente) return null;
    return joinParts([prefix, cleanName(nomeCliente)]);
  }

  return null;
}
