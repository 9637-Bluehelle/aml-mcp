/**
 * fetchAllInBatches — aggira il limite di 1000 righe per richiesta di PostgREST/Supabase.
 *
 * Supabase applica un cap di default (~1000 righe) a ogni singola query: superata quella
 * soglia le righe eccedenti vengono silenziosamente omesse. Per le liste che devono mostrare
 * l'intero dataset (con ricerca/filtri applicati lato client) scorriamo la tabella a blocchi
 * usando `.range()` finché non si esauriscono i risultati.
 *
 * `buildQuery` DEVE restituire un query builder NUOVO a ogni chiamata (un builder PostgREST è
 * monouso: una volta atteso invia la richiesta) e DEVE includere un `.order()` stabile, altrimenti
 * la paginazione tra un blocco e l'altro non è deterministica.
 *
 * Per un caricamento progressivo passare `onBatch`: viene invocato dopo ogni blocco con l'elenco
 * accumulato finora (copia fresca, sicura da mettere in stato React) e con il blocco appena arrivato.
 * Permette di mostrare subito i primi dati e continuare a caricare il resto in sottofondo.
 *
 * @example
 *   const clienti = await fetchAllInBatches<Cliente>(() =>
 *     supabase.from('clienti').select('*').is('deleted_at', null).order('ragione_sociale')
 *   );
 *
 * @example  // progressivo
 *   await fetchAllInBatches<Cliente>(buildQuery, {
 *     onBatch: (soFar) => setClienti(soFar),
 *   });
 */
export async function fetchAllInBatches<T>(
  buildQuery: () => PromiseLike<{ data: T[] | null; error: unknown }> & {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
  },
  options: {
    batchSize?: number;
    /** Invocato dopo ogni blocco: (accumulato finora, blocco corrente). */
    onBatch?: (all: T[], batch: T[]) => void;
  } = {},
): Promise<T[]> {
  const { batchSize = 1000, onBatch } = options;
  const all: T[] = [];
  let from = 0;

  for (;;) {
    const to = from + batchSize - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    // `all.slice()`: nuova reference così React rileva il cambiamento se il chiamante la mette in stato.
    onBatch?.(all.slice(), data);
    // Ultimo blocco: meno righe della dimensione richiesta → non c'è altro da caricare.
    if (data.length < batchSize) break;
    from += batchSize;
  }

  return all;
}
