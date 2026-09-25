import { useEffect, useMemo, useState } from 'react';
import { findCodiceFiscaleConflict, type CfConflictEsclusioni } from './personeHelper';

/**
 * Avviso non-bloccante: rileva se il codice fiscale inserito è già in uso da un altro
 * soggetto (anagrafica o cliente legacy) con un nome diverso da quello attualmente nel
 * form. Restituisce il nome del soggetto in conflitto, oppure null se nessun conflitto.
 * Debounce 400 ms sull'input per evitare query a ogni keystroke.
 *
 * In modifica passare `esclusioni` con gli id che rappresentano il soggetto stesso:
 * senza, correggere il nome del record aperto lo fa risultare in conflitto con la
 * propria versione salvata.
 */
export function useCfConflictCheck(
  cf: string | null | undefined,
  currentName: string | null | undefined,
  esclusioni?: CfConflictEsclusioni,
): string | null {
  const [conflict, setConflict] = useState<string | null>(null);

  // Gli id arrivano quasi sempre come oggetto letterale, nuovo a ogni render:
  // senza ridurli a una chiave stabile l'effect ripartirebbe di continuo,
  // riaprendo il debounce e non arrivando mai a interrogare il DB.
  const esclusioniKey = [
    esclusioni?.clienteId || '',
    ...(esclusioni?.personaIds || []).map(id => id || ''),
  ].join('|');

  const esclusioniStabili = useMemo(
    () => esclusioni,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [esclusioniKey],
  );

  useEffect(() => {
    const trimmed = (cf || '').trim();
    if (!trimmed) {
      setConflict(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await findCodiceFiscaleConflict(trimmed, currentName || '', esclusioniStabili);
      if (cancelled) return;
      setConflict(result ? result.nome : null);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cf, currentName, esclusioniStabili]);

  return conflict;
}
