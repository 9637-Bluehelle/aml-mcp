import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from './supabase';
import { setActiveStudioIdHolder } from './studioHelper';
import { fetchPiani, limitiDi, Piano, PianoCodice } from './piani';
import { Spinner } from '../components/cliente-wizard/modals/Spinner';

/**
 * Fattura rimasta da saldare. L'abbonamento è ancora valido — l'accesso si
 * blocca solo a solleciti esauriti — quindi non è uno stato di `piano_stato`
 * ma un'informazione a parte, da mostrare senza sbarrare la strada.
 */
export interface Insoluto {
  fattura: string;
  /** 'pagamento_fallito' (carta da sistemare) | 'autenticazione' (3DS da completare). */
  motivo: string | null;
  /** Prossimo tentativo automatico di Stripe; null = tentativi esauriti. */
  prossimoTentativo: string | null;
  /** Pagina Stripe della fattura: serve sia per pagare sia per autenticare. */
  url: string | null;
}

interface StudioContextType {
  /**
   * Lo studio dell'utente, e non ce n'è un altro.
   *
   * Fino alla console superadmin questo valore era commutabile: il superadmin
   * sceglieva uno studio qualsiasi e l'applicazione intera si spostava lì. Ora
   * le operazioni cross-studio stanno nella console, che le fa con RPC
   * verificate e tracciate, e qui è rimasto solo il proprio.
   *
   * Resta `string | null` perché il profilo si legge in modo asincrono e prima
   * di allora non c'è ancora uno studio da nominare.
   */
  activeStudioId: string | null;
  // Piano dello studio
  piano: PianoCodice | null;
  pianoStato: string | null;
  /** Data ultimo giorno di abbonamento se è stata programmata una disdetta; altrimenti null. */
  disdettaAl: string | null;
  /** Piano di destinazione di un downgrade programmato; altrimenti null. */
  downgradeA: PianoCodice | null;
  /** Data in cui il downgrade programmato diventa effettivo; altrimenti null. */
  downgradeAl: string | null;
  /** Piano scelto in registrazione, da attivare automaticamente al primo accesso; altrimenti null. */
  pianoDesiderato: PianoCodice | null;
  /** Fine del periodo pagato: è la data del prossimo rinnovo. */
  pianoScadenza: string | null;
  /** Pagamento in sospeso, se c'è: alimenta il banner di sollecito. */
  insoluto: Insoluto | null;
  limiti: Piano | null;
  /**
   * Limiti del piano verso cui è programmato un cambio; null se non ce n'è uno.
   * Ricavato dal catalogo già in memoria, senza query aggiuntive: serve a
   * sapere in anticipo se un'operazione (creare un utente) manderebbe lo studio
   * fuori dal piano che sta per ricevere, e va saputo PRIMA di iniziarla.
   */
  limitiDowngrade: Piano | null;
  /** Lo studio è abilitato a vedere/attivare i piani riservati (es. Mini Studio). */
  pianiRiservati: boolean;
  isProprietario: boolean;
  /** Ricarica piano/stato/limiti dello studio attivo; risolve col piano ricaricato. */
  refreshPiano: () => Promise<PianoCodice | null>;
  /**
   * Contatore incrementato a ogni `refreshPiano()`, cioè a ogni "nell'abbonamento
   * può essere cambiato qualcosa": pagamenti, cambi piano, riscossione di un
   * insoluto, disdette.
   *
   * Serve a chi mostra dati che NASCONO da quegli eventi ma che questo provider
   * non carica — le fatture, che stanno su Stripe. Il caso concreto è il cambio
   * piano su un abbonamento attivo: avviene tutto in-app, senza redirect né
   * remount, quindi senza un segnale esplicito l'elenco delle fatture resta
   * quello di prima finché l'utente non ricarica la pagina.
   *
   * È volutamente un contatore e non un diff sui campi: il webhook di Stripe
   * arriva DOPO la rilettura, quindi al momento del bump la riga di `studi` può
   * essere ancora identica. Chi lo osserva deve mettere in conto qualche
   * incremento a vuoto e riprovare per qualche secondo.
   */
  billingVersion: number;
}

const StudioContext = createContext<StudioContextType | undefined>(undefined);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [activeStudioId, setActiveStudioId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [isProprietario, setIsProprietario] = useState(false);
  const [pianiList, setPianiList] = useState<Piano[]>([]);
  const [piano, setPiano] = useState<PianoCodice | null>(null);
  // Copia sincrona del piano: la usa il ramo d'errore di `loadPiano` per
  // restituire l'ultimo valore buono senza doversi mettere `piano` fra le
  // dipendenze — che rigenererebbe la callback a ogni caricamento, e con essa
  // l'effetto che la richiama, per una query in più ogni volta.
  const pianoRef = useRef<PianoCodice | null>(null);
  const [pianoStato, setPianoStato] = useState<string | null>(null);
  const [disdettaAl, setDisdettaAl] = useState<string | null>(null);
  const [downgradeA, setDowngradeA] = useState<PianoCodice | null>(null);
  const [downgradeAl, setDowngradeAl] = useState<string | null>(null);
  const [pianoDesiderato, setPianoDesiderato] = useState<PianoCodice | null>(null);
  const [pianoScadenza, setPianoScadenza] = useState<string | null>(null);
  const [insoluto, setInsoluto] = useState<Insoluto | null>(null);
  const [limiti, setLimiti] = useState<Piano | null>(null);
  const [limitiDowngrade, setLimitiDowngrade] = useState<Piano | null>(null);
  const [pianiRiservati, setPianiRiservati] = useState(false);
  const [billingVersion, setBillingVersion] = useState(0);

  // Profilo dell'utente corrente: studio_id + flag proprietario (in una sola query)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('user_profiles')
          .select('studio_id, proprietario')
          .eq('user_id', user.id)
          .single();
        setActiveStudioId(data?.studio_id ?? null);
        setIsProprietario(!!data?.proprietario);
      }
      setReady(true);
    })();
  }, []);

  // Catalogo piani (fonte di verità dei limiti) — caricato una volta
  useEffect(() => {
    (async () => {
      setPianiList(await fetchPiani());
    })();
  }, []);

  // Carica piano/stato/limiti dello studio attivo
  const loadPiano = useCallback(async (studioId: string | null): Promise<PianoCodice | null> => {
    if (!studioId) {
      setPiano(null);
      pianoRef.current = null;
      setPianoStato(null);
      setDisdettaAl(null);
      setDowngradeA(null);
      setDowngradeAl(null);
      setPianoDesiderato(null);
      setPianoScadenza(null);
      setInsoluto(null);
      setLimiti(null);
      setLimitiDowngrade(null);
      setPianiRiservati(false);
      return null;
    }
    const { data: raw, error } = await supabase
      .from('studi')
      .select('piano, piano_stato, disdetta_al, downgrade_a, downgrade_al, piano_desiderato, piano_scadenza, insoluto_fattura, insoluto_motivo, insoluto_prossimo_tentativo, insoluto_url, piani_riservati')
      .eq('id', studioId)
      .single();
    // Una sola query porta TUTTO lo stato dell'abbonamento, quindi un suo
    // fallimento non è un dettaglio: azzerare `piano` fa sparire il badge in
    // testata e, con esso, i comandi di Piano & Fatturazione (metodo di
    // pagamento, disdetta, chiusura account), che sono tutti condizionati al
    // piano. Succederebbe in silenzio, ed è il tipo di guasto che si scambia
    // per un errore di logica altrove.
    //
    // Casi reali: una colonna della select assente sul database (migration
    // applicata a metà) o una rete che cade. In entrambi teniamo lo stato
    // precedente invece di svuotarlo — meglio un dato vecchio di un'interfaccia
    // che si smonta — e lasciamo una traccia in console.
    if (error) {
      console.error('StudioContext: lettura del piano non riuscita:', error.message);
      return pianoRef.current;
    }
    // supabase-js analizza la stringa di select a livello di tipi e oltre una
    // certa lunghezza rinuncia, restituendo un tipo d'errore al posto della riga.
    // Il client non è tipizzato sullo schema, quindi qui non si perde nulla.
    const data = raw as Record<string, any> | null;
    const codice = (data?.piano ?? null) as PianoCodice | null;
    setPiano(codice);
    pianoRef.current = codice;
    setPianoStato(data?.piano_stato ?? null);
    setDisdettaAl(data?.disdetta_al ?? null);
    setDowngradeA((data?.downgrade_a ?? null) as PianoCodice | null);
    setDowngradeAl(data?.downgrade_al ?? null);
    setPianoDesiderato((data?.piano_desiderato ?? null) as PianoCodice | null);
    setPianoScadenza(data?.piano_scadenza ?? null);
    setInsoluto(data?.insoluto_fattura
      ? {
          fattura: data.insoluto_fattura as string,
          motivo: data.insoluto_motivo ?? null,
          prossimoTentativo: data.insoluto_prossimo_tentativo ?? null,
          url: data.insoluto_url ?? null,
        }
      : null);
    setPianiRiservati(data?.piani_riservati === true);
    setLimiti(limitiDi(codice, pianiList));
    // `limitiDi` ripiega sul catalogo statico se il piano non è nella lista
    // caricata, quindi funziona anche per un piano riservato che l'utente non
    // vedrebbe nella pricing page ma su cui il suo studio sta per scendere.
    setLimitiDowngrade(limitiDi((data?.downgrade_a ?? null) as PianoCodice | null, pianiList));
    return codice;
  }, [pianiList]);

  useEffect(() => {
    loadPiano(activeStudioId);
  }, [activeStudioId, loadPiano]);

  const refreshPiano = useCallback(() => {
    // Il bump va PRIMA della rilettura, non dopo: chi ascolta deve sapere che
    // c'è stato un evento anche quando la query fallisce o non trova nulla di
    // nuovo (è la norma: il webhook di Stripe arriva dopo). L'aggiornamento
    // funzionale tiene la callback stabile, quindi non rigenera l'effetto che
    // la richiama.
    setBillingVersion((v) => v + 1);
    return loadPiano(activeStudioId);
  }, [activeStudioId, loadPiano]);

  // Sincronizza l'holder a modulo: serve a moduli plain (personeHelper, ecc.)
  // che devono filtrare per studio senza dipendere dal React context.
  useEffect(() => {
    setActiveStudioIdHolder(activeStudioId);
    return () => setActiveStudioIdHolder(null);
  }, [activeStudioId]);

  if (!ready) return <Spinner />;

  return (
    <StudioContext.Provider
      value={{
        activeStudioId,
        piano,
        pianoStato,
        disdettaAl,
        downgradeA,
        downgradeAl,
        pianoDesiderato,
        pianoScadenza,
        insoluto,
        limiti,
        limitiDowngrade,
        pianiRiservati,
        isProprietario,
        refreshPiano,
        billingVersion,
      }}
    >
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error('useStudio must be used within StudioProvider');
  return context;
}
