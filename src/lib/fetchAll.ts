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
 * @example
 *   const clienti = await fetchAllInBatches<Cliente>(() =>
 *     supabase.from('clienti').select('*').is('deleted_at', null).order('ragione_sociale')
 *   );
 */
export async function fetchAllInBatches<T>(
  buildQuery: () => PromiseLike<{ data: T[] | null; error: unknown }> & {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
  },
  batchSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  for (;;) {
    const to = from + batchSize - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    // Ultimo blocco: meno righe della dimensione richiesta → non c'è altro da caricare.
    if (data.length < batchSize) break;
    from += batchSize;
  }

  return all;
}
