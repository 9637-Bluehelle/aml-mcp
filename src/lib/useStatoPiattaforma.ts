import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface StatoPiattaforma {
  manutenzione: boolean;
  messaggio: string | null;
  fine_prevista: string | null;
}

const STATO_NORMALE: StatoPiattaforma = {
  manutenzione: false,
  messaggio: null,
  fine_prevista: null,
};

/** Ogni quanto rileggere lo stato se il realtime non è disponibile. */
const POLL_MS = 60_000;

/**
 * Legge l'interruttore di manutenzione (`stato_piattaforma`, riga id = 1).
 *
 * Fail-open: se la lettura fallisce — rete assente, tabella non ancora creata,
 * RLS — restituiamo lo stato normale. Un errore di trasporto non deve mai
 * chiudere fuori gli utenti; il rischio opposto (manutenzione non mostrata a chi
 * è offline) è innocuo, perché senza rete l'app non funziona comunque.
 */
export function useStatoPiattaforma(): StatoPiattaforma {
  const [stato, setStato] = useState<StatoPiattaforma>(STATO_NORMALE);

  useEffect(() => {
    let attivo = true;

    const leggi = async () => {
      const { data, error } = await supabase
        .from('stato_piattaforma')
        .select('manutenzione, messaggio, fine_prevista')
        .eq('id', 1)
        .maybeSingle();

      if (!attivo) return;
      if (error || !data) {
        setStato(STATO_NORMALE);
        return;
      }
      setStato({
        manutenzione: data.manutenzione === true,
        messaggio: data.messaggio ?? null,
        fine_prevista: data.fine_prevista ?? null,
      });
    };

    leggi();

    // Propagazione immediata del cambio di stato dalla dashboard.
    const channel = supabase
      .channel('stato-piattaforma')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stato_piattaforma' },
        () => { leggi(); }
      )
      .subscribe();

    // Rete di sicurezza: se il realtime non è attivo sulla tabella o la
    // connessione websocket cade, il polling riallinea comunque il client.
    const timer = setInterval(leggi, POLL_MS);

    // Al ritorno in primo piano ricontrolliamo: una scheda lasciata aperta
    // durante l'intervento deve accorgersene appena la si riprende in mano.
    const onVisibility = () => { if (document.visibilityState === 'visible') leggi(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      attivo = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      supabase.removeChannel(channel);
    };
  }, []);

  return stato;
}
