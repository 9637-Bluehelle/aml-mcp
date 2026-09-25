// Estrae un messaggio d'errore leggibile da un errore di supabase.functions.invoke.
//
// - Errore applicativo (status 4xx/5xx con body { error }): restituisce quel messaggio.
// - Errore di rete/fetch (function irraggiungibile, offline, timeout): il body non
//   è leggibile → restituisce il `fallback` amichevole invece del messaggio tecnico
//   grezzo (es. "Failed to send a request to the Edge Function").
export async function friendlyFnError(err: any, fallback: string): Promise<string> {
  try {
    if (err?.context && typeof err.context.json === 'function') {
      const body = await err.context.json();
      if (body?.error) return body.error;
    }
  } catch {
    /* errore di rete/fetch: usa il fallback */
  }
  return fallback;
}
