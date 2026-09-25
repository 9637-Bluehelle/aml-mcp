/**
 * Conversione di una data in stringa `YYYY-MM-DD` per il database.
 *
 * Esiste perché `toISOString().split('T')[0]` — la scorciatoia usata finora —
 * converte prima in UTC: in Italia (UTC+1/+2) una data delle prime ore della
 * notte arretra di un giorno. Le scadenze calcolate dall'applicazione
 * (validità dell'autovalutazione, prossimo controllo costante) risultavano
 * così di un giorno più corte per chi salvava dopo la mezzanotte.
 *
 * Qui la stringa è composta dai campi LOCALI, cioè dal giorno che l'utente
 * vede sul calendario, che è quello che intendiamo scrivere.
 */
export function toISODateLocale(data: Date): string {
  const anno = data.getFullYear();
  const mese = String(data.getMonth() + 1).padStart(2, '0');
  const giorno = String(data.getDate()).padStart(2, '0');
  return `${anno}-${mese}-${giorno}`;
}

/**
 * Data odierna + `mesi`, già in formato `YYYY-MM-DD` locale.
 * Usata per le scadenze periodiche (controlli costanti, prossime verifiche).
 */
export function traMesiISO(mesi: number, da: Date = new Date()): string {
  const scadenza = new Date(da);
  scadenza.setMonth(scadenza.getMonth() + mesi);
  return toISODateLocale(scadenza);
}
