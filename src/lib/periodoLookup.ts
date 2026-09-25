/**
 * Formattazione del periodo di conteggio delle compilazioni automatiche.
 *
 * La finestra di norma è il mese di calendario, ma riparte dall'ultimo cambio
 * piano (vedi `check_aml_lookup`): nel mese in cui il piano cambia, dire
 * "questo mese" sarebbe falso, perché le ricerche precedenti non sono contate.
 */

/** Inizio del mese corrente, ora locale. */
function inizioMeseCorrente(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * true se la finestra coincide col mese di calendario (o se la data manca,
 * ad esempio con la funzione DB non ancora aggiornata).
 */
export function periodoEMeseIntero(dal: string | null | undefined): boolean {
  if (!dal) return true;
  const d = new Date(dal);
  if (Number.isNaN(d.getTime())) return true;
  return d.getTime() <= inizioMeseCorrente().getTime();
}

/** "questo mese" oppure "dal 14/07", da usare in coda a una frase. */
export function periodoLabel(dal: string | null | undefined): string {
  if (periodoEMeseIntero(dal)) return 'questo mese';
  const d = new Date(dal as string);
  return `dal ${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}`;
}
