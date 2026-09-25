import { loadStripe, Stripe } from '@stripe/stripe-js';
import { supabase } from './supabase';
import { friendlyFnError } from './fnError';

// Publishable key Stripe (chiave pubblica, sicura lato client). Va messa in .env:
//   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...   (o pk_live_... in produzione)
const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

let stripePromise: Promise<Stripe | null> | null = null;

/** Carica Stripe.js una sola volta (lazy). Ritorna null se la chiave manca. */
export function getStripe(): Promise<Stripe | null> {
  if (!pk) {
    console.error('VITE_STRIPE_PUBLISHABLE_KEY mancante: Stripe.js non inizializzato.');
    return Promise.resolve(null);
  }
  if (!stripePromise) stripePromise = loadStripe(pk);
  return stripePromise;
}

export const ERRORE_PORTALE =
  'Non è stato possibile aprire la gestione del metodo di pagamento. '
  + 'Riprova; se il problema persiste contatta il supporto.';

/**
 * Apre il Customer Portal di Stripe sulla schermata di sostituzione della carta
 * e ci reindirizza (stessa scheda). Solleva con un messaggio leggibile se non
 * riesce; chi chiama decide come mostrarlo.
 *
 * Sta qui e non in un componente perché i punti da cui si cambia la carta sono
 * più d'uno (il riquadro in Piano & Fatturazione e l'avviso di carta in
 * scadenza), e il marcatore di rientro non va dimenticato in nessuno dei due.
 */
export async function apriPortalePagamento(): Promise<never | void> {
  const { data, error } = await supabase.functions.invoke('create-billing-portal-session', {
    body: { flow: 'payment_method_update' },
  });
  if (error) throw new Error(await friendlyFnError(error, ERRORE_PORTALE));
  if (data?.error) throw new Error(data.error);
  if (!data?.url) throw new Error(ERRORE_PORTALE);
  // Marcatore per il rientro: il pulsante "Torna indietro" di Stripe ci riporta
  // con ?billing=return, ma il tasto Indietro del browser no — e l'app
  // ripartirebbe dalla dashboard. Il flag copre entrambe le strade e viene
  // consumato da App al primo avvio utile.
  sessionStorage.setItem('billing_return', '1');
  window.location.href = data.url;
}
