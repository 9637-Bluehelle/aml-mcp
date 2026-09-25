import { useEffect, useState } from 'react';
import { findCodiceFiscaleConflict } from './personeHelper';

/**
 * Avviso non-bloccante: rileva se il codice fiscale inserito è già in uso da un altro
 * soggetto (anagrafica o cliente legacy) con un nome diverso da quello attualmente nel
 * form. Restituisce il nome del soggetto in conflitto, oppure null se nessun conflitto.
 * Debounce 400 ms sull'input per evitare query a ogni keystroke.
 */
export function useCfConflictCheck(cf: string | null | undefined, currentName: string | null | undefined): string | null {
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = (cf || '').trim();
    if (!trimmed) {
      setConflict(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await findCodiceFiscaleConflict(trimmed, currentName || '');
      if (cancelled) return;
      setConflict(result ? result.nome : null);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cf, currentName]);

  return conflict;
}
