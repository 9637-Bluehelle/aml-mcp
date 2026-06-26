import { supabase } from './supabase';

// Holder a modulo per lo studio "attivo" (quello selezionato dal superadmin via Ctrl+Shift+S,
// altrimenti coincide con lo studio del proprio profilo). Sincronizzato da StudioProvider.
// Serve a moduli plain (es. personeHelper) che non hanno accesso al React context.
let _activeStudioId: string | null = null;

export function setActiveStudioIdHolder(id: string | null): void {
  _activeStudioId = id;
}

export function getActiveStudioIdHolder(): string | null {
  return _activeStudioId;
}

/**
 * Recupera lo studio_id dell'utente corrente dal suo profilo.
 * Restituisce null se l'utente non ha uno studio assegnato.
 */
export async function getMyStudioId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_profiles')
    .select('studio_id')
    .eq('user_id', user.id)
    .single();

  return data?.studio_id || null;
}

/**
 * Recupera lo studio_id di un utente specifico.
 */
export async function getStudioIdByUser(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('studio_id')
    .eq('user_id', userId)
    .single();

  return data?.studio_id || null;
}

/**
 * Recupera tutti i membri dello studio dell'utente corrente.
 * Restituisce un array di { user_id, email, role }.
 */
export async function getStudioMembers(): Promise<{ user_id: string; email: string; role: string }[]> {
  const studioId = await getMyStudioId();
  if (!studioId) return [];

  const { data } = await supabase
    .from('user_profiles')
    .select('user_id, email, role')
    .eq('studio_id', studioId);

  return data || [];
}

/**
 * Recupera tutti gli user_id dei membri dello studio dell'utente corrente.
 */
export async function getStudioMemberIds(): Promise<string[]> {
  const members = await getStudioMembers();
  return members.map(m => m.user_id);
}

/**
 * Recupera le info dello studio dell'utente corrente.
 */
export async function getMyStudio(): Promise<{
  id: string;
  nome: string;
  created_by: string | null;
  comune_sede: string | null;
  provincia_sede: string | null;
  via_piazza_sede: string | null;
  numero_civico_sede: string | null;
  nome_proprietario: string | null;
  cognome_proprietario: string | null;
  albo_sede: string | null;
  albo_numero: string | null;
  albo_sezione: string | null;
  delega_admin_av5: boolean | null;
} | null> {
  const studioId = await getMyStudioId();
  if (!studioId) return null;

  const { data } = await supabase
    .from('studi')
    .select('id, nome, created_by, comune_sede, provincia_sede, via_piazza_sede, numero_civico_sede, nome_proprietario, cognome_proprietario, albo_sede, albo_numero, albo_sezione, delega_admin_av5')
    .eq('id', studioId)
    .single();

  return data;
}

/**
 * Recupera nome/cognome del proprietario dello studio dato il suo studio_id.
 * Usato come fallback per precompilare i campi AV.5 quando i dedicati su
 * `studi.nome_proprietario`/`cognome_proprietario` non sono ancora stati valorizzati.
 * Identifica il proprietario via il flag `user_profiles.proprietario`.
 */
export async function getStudioProprietarioProfile(studioId: string): Promise<{ nome: string | null; cognome: string | null } | null> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('nome, cognome')
    .eq('studio_id', studioId)
    .eq('proprietario', true)
    .maybeSingle();

  return profile ?? null;
}

/**
 * Recupera nome, cognome, email dell'utente corrente dal suo profilo.
 * Restituisce null se il profilo non esiste.
 */
export async function getMyProfile(): Promise<{ nome: string; cognome: string; email: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_profiles')
    .select('nome, cognome, email')
    .eq('user_id', user.id)
    .single();

  return data;
}

/**
 * Recupera il nome dello studio dato uno studio_id.
 */
export async function getStudioNome(studioId: string): Promise<string> {
  const { data } = await supabase
    .from('studi')
    .select('nome')
    .eq('id', studioId)
    .single();

  return data?.nome || 'Studio sconosciuto';
}
