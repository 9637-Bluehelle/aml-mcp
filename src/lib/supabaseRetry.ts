/**
 * Retry sugli errori transitori di Supabase/PostgREST.
 *
 * Il DB che si risveglia (piano free in pausa) o PostgREST che ricarica lo
 * schema cache (tipico subito dopo l'applicazione di migrazioni) rispondono con
 * 503 e code `PGRST002` — "Could not query the database for the schema cache.
 * Retrying." — oppure falliscono a livello di rete. Sono errori temporanei: un
 * paio di tentativi con backoff esponenziale li assorbe senza che l'utente
 * debba ricaricare la pagina.
 */

/** True se l'errore è verosimilmente transitorio (vale la pena riprovare). */
export function isTransientError(err: any): boolean {
  if (!err) return false;

  const code = err.code ?? err?.error?.code;
  // PGRST002/PGRST001: schema cache non disponibile. PGRST000: connessione al DB persa.
  if (code === 'PGRST002' || code === 'PGRST001' || code === 'PGRST000') return true;

  const status = err.status ?? err.statusCode ?? err?.context?.status;
  if (status === 502 || status === 503 || status === 504) return true;

  const msg = String(err.message ?? err?.error?.message ?? '').toLowerCase();
  if (msg.includes('schema cache')) return true;
  // Errori di rete/fetch del browser.
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed')
  ) return true;

  return false;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * True solo quando il browser dichiara di essere SENZA rete.
 *
 * `navigator.onLine === true` non garantisce connettività (basta essere
 * attaccati a una LAN senza uscita), quindi non lo usiamo mai per decidere che
 * la rete c'è. Al contrario, un `false` è affidabile: ritentare in quel momento
 * è tempo sprecato, e ogni tentativo lascia in console una riga
 * `net::ERR_NAME_NOT_RESOLVED` scritta dal browser, che non possiamo sopprimere.
 */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export interface RetryOptions {
  /** Numero di tentativi aggiuntivi oltre il primo (default 3). */
  retries?: number;
  /** Ritardo base in ms, raddoppia a ogni tentativo (default 400). */
  baseDelayMs?: number;
  /** Callback prima di ogni ritentativo, per logging. */
  onRetry?: (attempt: number, err: any) => void;
}

/**
 * Esegue una query Supabase riprovando sugli errori transitori.
 *
 * Le query Supabase NON lanciano: risolvono con `{ data, error }`. Questo helper
 * ispeziona `result.error` e, se transitorio, ricostruisce ed esegue di nuovo la
 * query. Restituisce sempre lo stesso shape `{ data, error, ... }` — l'ultimo
 * risultato (con l'eventuale errore) se anche l'ultimo tentativo fallisce, così
 * il chiamante gestisce l'errore esattamente come farebbe senza retry.
 *
 * `factory` DEVE costruire una query NUOVA a ogni chiamata: un query builder
 * PostgREST è monouso (una volta atteso invia la richiesta e non è riutilizzabile).
 *
 * @example
 *   const { data, error } = await retryQuery(() =>
 *     supabase.from('alert').select('tipo_rt').eq('studio_id', id)
 *   );
 */
export async function retryQuery<R extends { error: any }>(
  factory: () => PromiseLike<R>,
  options: RetryOptions = {},
): Promise<R> {
  const { retries = 3, baseDelayMs = 400, onRetry } = options;
  let result!: R;

  for (let attempt = 0; attempt <= retries; attempt++) {
    result = await factory();
    if (!result.error || attempt === retries || !isTransientError(result.error)) {
      return result;
    }
    // Rete dichiaratamente assente: ritentare non può riuscire, e ogni tentativo
    // aggiunge una richiesta fallita nella console. Si esce subito restituendo
    // l'errore, che il chiamante riconosce già come transitorio.
    if (isOffline()) return result;
    onRetry?.(attempt + 1, result.error);
    // Backoff esponenziale + jitter per non sincronizzare i retry di più client.
    await sleep(baseDelayMs * 2 ** attempt + Math.random() * 150);
  }

  return result;
}
