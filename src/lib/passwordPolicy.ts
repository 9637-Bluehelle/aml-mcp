/**
 * Lunghezza minima di una password scelta dall'utente.
 *
 * Sta qui, e non in ciascuna schermata, perché il problema non era il numero:
 * erano DUE numeri diversi nella stessa applicazione — 6 al recupero password e
 * in Profilo → Sicurezza, 8 in registrazione. Una regola che cambia a seconda di
 * dove la si incontra non la ricorda nessuno, e l'utente la scopre solo quando
 * viene rifiutato.
 *
 * VALE PER LE PASSWORD NUOVE. I campi che chiedono la password ATTUALE per
 * confermare un'operazione delicata — chiusura account, disdetta, export dei
 * dati — non applicano nessun minimo: verificano una password che esiste già, e
 * che può essere più corta di quanto oggi accetteremmo.
 *
 * Fuori da qui c'è una copia gemella in `supabase/functions/signup-studio`
 * (`MIN_PASSWORD`): le Edge Function girano su Deno e non importano da `src/`.
 * Se questo valore cambia, va cambiata anche quella.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** Messaggio d'errore standard, così è identico ovunque venga mostrato. */
export const PASSWORD_TROPPO_CORTA =
  `La password deve avere almeno ${PASSWORD_MIN_LENGTH} caratteri.`;
