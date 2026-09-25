import { supabase } from './supabase';

export interface LockoutStatus {
  locked: boolean;
  just_locked?: boolean;
  locked_at?: string;
  reason?: string;
  notification_sent?: boolean;
  attempts_remaining?: number;
  email?: string;
}

export async function checkAccountLockout(email: string): Promise<LockoutStatus> {
  const { data, error } = await supabase.rpc('check_account_lockout', {
    p_email: email,
  });

  if (error) {
    console.error('[loginSecurity] check_account_lockout failed', error);
    return { locked: false };
  }

  return (data ?? { locked: false }) as LockoutStatus;
}

/** Esito dell'accesso restituito dalla Edge Function `accedi`. */
export interface EsitoAccesso {
  ok: boolean;
  /** 'credenziali_errate' | 'account_bloccato' | 'email_non_confermata' | 'errore_temporaneo' */
  errore?: string;
  locked?: boolean;
  notification_sent?: boolean;
  attempts_remaining?: number | null;
  /** true se la function non era raggiungibile e si è acceduto direttamente. */
  fallback?: boolean;
}

/**
 * Esegue l'accesso passando dalla Edge Function `accedi`.
 *
 * PERCHÉ NON `signInWithPassword` DIRETTO. Il blocco per tentativi falliti deve
 * contare l'esito VERO, e il browser non è un testimone attendibile: quando era
 * lui a dichiararlo, chiunque poteva chiamare `record_login_attempt` con
 * l'email di un altro e bloccarne l'account. Ora l'accesso lo esegue il server,
 * che l'esito lo constata.
 *
 * FALLBACK. Se la function non risponde (rete, cold start, guasto) si accede
 * direttamente a GoTrue, senza conteggio. Non indebolisce nulla: chi attacca
 * può già colpire /auth/v1/token per conto suo, quindi il ripiego protegge solo
 * gli utenti legittimi durante un disservizio, invece di lasciarli fuori.
 */
export async function accedi(email: string, password: string): Promise<EsitoAccesso> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (url && anonKey) {
    try {
      const resp = await fetch(`${url}/functions/v1/accedi`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // La function è invocata senza sessione (siamo prima del login): il
          // gateway di Supabase accetta la anon key come bearer.
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ email, password }),
      });

      if (resp.ok) {
        const body = await resp.json().catch(() => ({}));
        if (body.access_token && body.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: body.access_token,
            refresh_token: body.refresh_token,
          });
          if (!error) return { ok: true };
          console.error('[loginSecurity] setSession non riuscita', error);
          // Sessione non installabile: si ritenta per la via diretta.
        }
      } else if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
        // Sono le uniche risposte "nel merito": credenziali errate, account
        // bloccato, email non confermata. Vanno riportate così come sono.
        //
        // Tutti gli altri codici — 404 compreso — significano che la function
        // non ha risposto nel merito e si deve ripiegare. Il 404 conta più di
        // quanto sembri: è ciò che si ottiene se il frontend viene pubblicato
        // prima che `accedi` sia stata deployata. Trattarlo come un rifiuto
        // lascerebbe fuori tutti.
        const body = await resp.json().catch(() => ({}));
        return {
          ok: false,
          errore: body.error,
          locked: body.locked,
          notification_sent: body.notification_sent,
          attempts_remaining: body.attempts_remaining ?? null,
        };
      }
    } catch (e) {
      console.warn('[loginSecurity] function `accedi` non raggiungibile, accesso diretto', e);
    }
  }

  // --- Ripiego: accesso diretto, senza conteggio dei tentativi ---------------
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('Email not confirmed')) return { ok: false, errore: 'email_non_confermata', fallback: true };
    if (msg.includes('Invalid login credentials')) return { ok: false, errore: 'credenziali_errate', fallback: true };
    return { ok: false, errore: 'errore_temporaneo', fallback: true };
  }
  return data.session ? { ok: true, fallback: true } : { ok: false, errore: 'errore_temporaneo', fallback: true };
}

/**
 * `recordLoginAttempt` è stata rimossa: il conteggio dei tentativi non passa
 * più dal client.
 *
 * Dichiarare l'esito di un login dal browser significava lasciarlo decidere a
 * chi chiama, e `record_login_attempt` era eseguibile da `anon`: bastava
 * invocarla cinque volte con l'email di qualcun altro per bloccarne l'account.
 * Nel verso opposto non serviva a niente — uno script che colpisce
 * `/auth/v1/token` direttamente non la chiamava affatto, e il blocco non
 * impediva comunque l'autenticazione.
 *
 * Ora conta l'Auth Hook `password_verification_attempt`, che GoTrue invoca con
 * l'esito reale della verifica (vedi la migration
 * 20260811050000_lockout_via_auth_hook.sql). Dopo un tentativo fallito basta
 * rileggere lo stato con `checkAccountLockout`, che è in sola lettura e
 * restituisce anche `attempts_remaining`.
 */

/**
 * `sendLockoutEmail` è stata rimossa: l'avviso di account bloccato lo manda la
 * Edge Function `accedi`.
 *
 * Spedirlo dal browser non funzionava, e per un motivo strutturale: il blocco
 * scatta al quinto tentativo SBAGLIATO, quindi il browser a cui si chiedeva di
 * spedire era quello di chi stava provando le password — non quello del
 * titolare dell'account. Bastava chiudere la scheda (e uno script il sito non
 * lo apre nemmeno) perché l'interessato non sapesse mai che qualcuno gli stava
 * forzando l'accesso, cioè proprio il caso in cui l'avviso serve.
 *
 * In più `mark_lockout_notified` era eseguibile da `anon`: chiunque poteva
 * marcare l'avviso di un altro come «già inviato» e sopprimerlo. Ora quella RPC
 * è riservata a `service_role` (migration 20260907000000).
 */

export async function adminUnlockAccount(email: string): Promise<boolean> {
  const { error } = await supabase.rpc('admin_unlock_account', { p_email: email });
  if (error) {
    console.error('[loginSecurity] admin_unlock_account failed', error);
    return false;
  }
  return true;
}

export async function selfUnlockAccount(): Promise<boolean> {
  const { error } = await supabase.rpc('self_unlock_account');
  if (error) {
    console.error('[loginSecurity] self_unlock_account failed', error);
    return false;
  }
  return true;
}
