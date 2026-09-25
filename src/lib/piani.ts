import { supabase } from './supabase';

// ============================================================
// Piani di abbonamento — config condivisa
// La FONTE DI VERITÀ dei limiti è la tabella DB `piani`
// (migration 20260721040000_piani_base.sql). Qui c'è solo il typing + un
// fallback statico di resilienza. Per cambiare un limite si modifica il DB.
// ============================================================

export type PianoCodice = 'free' | 'singolo' | 'mini' | 'studio';

export interface Piano {
  codice: PianoCodice;
  nome: string;
  descrizione: string | null;
  prezzo_mensile: number;
  clienti_max: number | null;        // null = illimitati
  utenti_max: number;
  collaboratori: boolean;
  aml_lookup_mensili: number | null; // null = illimitate
  ordine: number;
  attivo: boolean;
  /** Piano non pubblico: lo vedono solo gli studi abilitati (RLS su `piani`). */
  riservato: boolean;
}

// Fallback statico allineato al seed della migration. Usato solo se il DB non è
// raggiungibile; il runtime normale legge i valori dalla tabella `piani`.
//
// ATTENZIONE: questa mappa ha DUE ruoli distinti. È la tabella dei limiti per
// `limitiDi()` — e lì i piani riservati devono esserci, altrimenti uno studio su
// Mini resterebbe senza limiti noti — ma è anche la sorgente del catalogo
// mostrato quando il DB non risponde, dove i riservati NON devono comparire.
// Per il catalogo si usa sempre `pianiPubbliciFallback()`, mai `Object.values`.
export const PIANI_FALLBACK: Record<PianoCodice, Piano> = {
  free: {
    codice: 'free', nome: 'Singolo Free', descrizione: 'Per iniziare senza impegno',
    prezzo_mensile: 0, clienti_max: 20, utenti_max: 1, collaboratori: false,
    aml_lookup_mensili: 3, ordine: 1, attivo: true, riservato: false,
  },
  singolo: {
    codice: 'singolo', nome: 'Singolo', descrizione: 'Per il professionista',
    prezzo_mensile: 25, clienti_max: null, utenti_max: 1, collaboratori: false,
    aml_lookup_mensili: null, ordine: 2, attivo: true, riservato: false,
  },
  mini: {
    codice: 'mini', nome: 'Mini Studio', descrizione: 'Per il professionista con un collaboratore',
    prezzo_mensile: 25, clienti_max: null, utenti_max: 2, collaboratori: true,
    aml_lookup_mensili: null, ordine: 3, attivo: true, riservato: true,
  },
  studio: {
    codice: 'studio', nome: 'Studio', descrizione: 'Per lo studio associato',
    prezzo_mensile: 75, clienti_max: null, utenti_max: 5, collaboratori: true,
    aml_lookup_mensili: null, ordine: 4, attivo: true, riservato: false,
  },
};

/** Catalogo di ripiego per la pricing page: i piani riservati restano fuori. */
export function pianiPubbliciFallback(): Piano[] {
  return Object.values(PIANI_FALLBACK)
    .filter((p) => !p.riservato)
    .sort((a, b) => a.ordine - b.ordine);
}

// Etichetta breve per il badge (il nome esteso "Singolo Free" è lungo per un badge).
export const PIANO_LABEL: Record<PianoCodice, string> = {
  free: 'Free',
  singolo: 'Singolo',
  mini: 'Mini',
  studio: 'Studio',
};

/**
 * Scala dei piani: governa cosa è upgrade (immediato, con conguaglio) e cosa è
 * downgrade (programmato a fine periodo). Mini sta SOPRA Singolo pur costando
 * uguale, perché aggiunge un posto utente: scendere da Mini a Singolo deve
 * passare dal controllo sui limiti come ogni altro downgrade.
 *
 * Deve restare allineata alla mappa gemella in `create-checkout-session`
 * (le Edge Function girano su Deno e non importano da `src/`).
 */
export const TIER: Record<PianoCodice, number> = {
  free: 0,
  singolo: 1,
  mini: 2,
  studio: 3,
};

/** true se il piano comporta un abbonamento a pagamento (quindi carta, fatture, disdetta). */
export function isPianoPagamento(codice: PianoCodice | null): boolean {
  return codice != null && codice !== 'free';
}

/** Carica i piani attivi dalla tabella DB (ordinati). Fallback statico su errore. */
export async function fetchPiani(): Promise<Piano[]> {
  const { data, error } = await supabase
    .from('piani')
    .select('*')
    .eq('attivo', true)
    .order('ordine');

  if (error || !data || data.length === 0) {
    return pianiPubbliciFallback();
  }
  return data as Piano[];
}

/** Restituisce la riga del piano dato il codice (dalla lista caricata o dal fallback). */
export function limitiDi(codice: PianoCodice | null, piani?: Piano[]): Piano | null {
  if (!codice) return null;
  const found = piani?.find(p => p.codice === codice);
  return found ?? PIANI_FALLBACK[codice] ?? PIANI_FALLBACK.free;
}

export const clientiIllimitati = (p: Piano | null): boolean => !!p && p.clienti_max === null;
export const lookupIllimitati = (p: Piano | null): boolean => !!p && p.aml_lookup_mensili === null;
