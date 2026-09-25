import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Distingue un errore di autenticazione DEFINITIVO (token non più utilizzabile:
 * utente cancellato dal DB, sessione revocata, JWT malformato) da uno transiente
 * (rete assente, 5xx, timeout).
 *
 * Serve perché con un access token ancora non scaduto `getSession()` continua a
 * restituire la sessione dalla cache localStorage anche quando il server la
 * rifiuta: senza questo controllo l'app resta bloccata in loading a ciclare 403.
 */
export function isPermanentAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; status?: number; message?: string };

  const permanentCodes = [
    'user_not_found',
    'session_not_found',
    'refresh_token_not_found',
    'refresh_token_already_used',
    'bad_jwt',
    'user_banned',
  ];
  if (err.code && permanentCodes.includes(err.code)) return true;

  // Fallback per versioni/risposte che non popolano `code`
  if (err.status === 401 || err.status === 403) return true;

  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('user from sub claim') ||
    msg.includes('user not found') ||
    msg.includes('session not found') ||
    msg.includes('invalid jwt')
  );
}

/**
 * Chiude la sessione locale senza chiamare il server (la chiamata fallirebbe
 * comunque con un token già invalido) e ripulisce lo storage.
 */
export async function forceLocalSignOut(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Se anche signOut fallisce, rimuoviamo a mano le chiavi di sessione
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') && k.includes('-auth-token'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* storage non disponibile: nulla da fare */
    }
  }
}
