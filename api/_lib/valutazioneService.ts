// Servizio valutazione del rischio RT2 condiviso UI ↔ MCP. Replica neutra (no React/singleton)
// del calcolo di src/lib/calculations.calculateRT2Scores + del salvataggio di ValutazioneRischioForm.
//
// L'AI fornisce i punteggi 1-4 dei fattori (Tabella A: 4 voci; Tabella B: 6 voci, salvo prestazioni
// onlyTabA); il server calcola rischio specifico/effettivo, classe, misure e prossimo controllo —
// la stessa fonte di verità della UI — e scrive in `valutazioni_rischio`. Come l'incarico, è un
// record vivo (chiude l'alert RT2 via trigger DB): si crea SOLO via proponi_piano → approvazione
// umana → esegui_piano (§7.2), mai come tool diretto.
//
// `studio_id` lo riempie il default DB `get_my_studio_id()` (come clienti/incarichi).

import type { SupabaseClient } from '@supabase/supabase-js';
import { getPrestazione } from './incaricoService.js';

const SCORE_MIN = 1;
const SCORE_MAX = 4;
function clampScore(score: number): number {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(score)));
}

// Misure per classe RT2 (copia neutra delle label da regole_tecniche[RT2].misure_per_classe nel
// JSON amlData): è ciò che la UI salva in `misure_applicate`. Modificare qui se cambia il JSON.
const MISURE_PER_CLASSE: Record<number, string> = {
  1: 'Regole di condotta / Semplificate minime',
  2: 'Semplificate',
  3: 'Ordinarie',
  4: 'Rafforzate',
};

/** Punteggi della Tabella A (4 voci, 1-4). Chiavi allineate alla struttura salvata in DB. */
export interface TabellaAInput {
  naturaGiuridica: number;
  attivitaPrevalente: number;
  comportamentoConferimento: number;
  areaClienteControparte: number;
}
/** Punteggi della Tabella B (6 voci, 1-4). Richiesta salvo prestazioni onlyTabA. */
export interface TabellaBInput {
  tipologia: number;
  modalita: number;
  ammontare: number;
  frequenzaVolumeDurata: number;
  ragionevolezza: number;
  areaDestinazione: number;
}

export interface ValutazioneArgs {
  incarico_id: string;
  tabella_a: TabellaAInput;
  tabella_b?: TabellaBInput;
  note?: string;
}

// Costruisce la struttura jsonb salvata in DB per un fattore (stessa shape della UI:
// score + fattoriSelezionati + altro). L'AI passa solo lo score; gli altri campi restano vuoti.
function fattore(score: number) {
  return { score: clampScore(score), fattoriSelezionati: [] as string[], altro: '' };
}

/**
 * Crea una valutazione del rischio RT2 per un incarico dello studio. Valida incarico e tipologia,
 * pretende la Tabella B se la prestazione non è onlyTabA, calcola rischio/classe/misure/scadenza
 * (PEP → rischio effettivo forzato a 4, come la UI) e inserisce in `valutazioni_rischio`.
 */
export async function salvaValutazione(
  client: SupabaseClient,
  args: ValutazioneArgs,
  studioId: string | null,
): Promise<{
  valutazione_id: string;
  incarico_id: string;
  rischio_effettivo: number;
  classe_rischio: number;
  prossimo_controllo: string;
}> {
  if (!studioId) throw new Error('Studio non determinato: impossibile creare la valutazione.');
  if (!args.incarico_id) throw new Error('incarico_id obbligatorio.');
  if (!args.tabella_a) throw new Error('tabella_a obbligatoria (4 punteggi 1-4).');

  // Incarico dello studio (oltre alla RLS, filtro esplicito su studio_id — §8.4).
  const { data: incarico, error: incErr } = await client
    .from('incarichi')
    .select('id, cliente_id, tipologia_prestazione_id, codice_incarico')
    .eq('id', args.incarico_id)
    .eq('studio_id', studioId)
    .maybeSingle();
  if (incErr) throw new Error(incErr.message);
  if (!incarico) throw new Error('Incarico non trovato nello studio: verifica incarico_id con lista_incarichi.');

  const prest = getPrestazione(incarico.tipologia_prestazione_id);
  if (!prest) {
    throw new Error(`L'incarico ha una tipologia di prestazione non in catalogo ("${incarico.tipologia_prestazione_id}"): correggi l'incarico prima.`);
  }
  const onlyTabA = prest.onlyTabA ?? false;
  if (!onlyTabA && !args.tabella_b) {
    throw new Error('Questa prestazione richiede anche la Tabella B (6 punteggi 1-4): fornisci tabella_b.');
  }

  // PEP del cliente → rischio effettivo forzato a 4 (come ValutazioneRischioForm).
  const { data: cliente } = await client
    .from('clienti')
    .select('pep')
    .eq('id', incarico.cliente_id)
    .eq('studio_id', studioId)
    .maybeSingle();
  const isPep = cliente?.pep === true;

  // --- Calcolo RT2 (mirror di calculateRT2Scores) ---
  const inerentePrestazione = prest.inherentRisk;
  const a = args.tabella_a;
  const totaleA =
    clampScore(a.naturaGiuridica) +
    clampScore(a.attivitaPrevalente) +
    clampScore(a.comportamentoConferimento) +
    clampScore(a.areaClienteControparte);

  let rischioSpecifico: number;
  if (onlyTabA || !args.tabella_b) {
    rischioSpecifico = totaleA / 4;
  } else {
    const b = args.tabella_b;
    const totaleB =
      clampScore(b.tipologia) +
      clampScore(b.modalita) +
      clampScore(b.ammontare) +
      clampScore(b.frequenzaVolumeDurata) +
      clampScore(b.ragionevolezza) +
      clampScore(b.areaDestinazione);
    rischioSpecifico = (totaleA + totaleB) / 10;
  }

  const rischioEffettivoCalcolato = Number((0.3 * inerentePrestazione + 0.7 * rischioSpecifico).toFixed(2));
  const rischioEffettivo = isPep ? 4.0 : rischioEffettivoCalcolato;

  const classeRischio = rischioEffettivo >= 3.6 ? 4 : rischioEffettivo >= 2.6 ? 3 : rischioEffettivo >= 1.6 ? 2 : 1;
  const periodicitaMesi = classeRischio >= 4 ? 6 : classeRischio >= 3 ? 12 : classeRischio >= 2 ? 24 : 36;
  // Data-only senza timezone/overflow: oggi (componenti locali) + N mesi con clamping a fine mese
  // (es. 31/8 + 6 mesi → 28/2, non 3/3) e formattazione locale (no toISOString → UTC che sposta il giorno).
  const prossimo = new Date();
  const giornoTarget = prossimo.getDate();
  prossimo.setDate(1);
  prossimo.setMonth(prossimo.getMonth() + periodicitaMesi);
  const ultimoGiorno = new Date(prossimo.getFullYear(), prossimo.getMonth() + 1, 0).getDate();
  prossimo.setDate(Math.min(giornoTarget, ultimoGiorno));
  const prossimoControllo = `${prossimo.getFullYear()}-${String(prossimo.getMonth() + 1).padStart(2, '0')}-${String(prossimo.getDate()).padStart(2, '0')}`;

  const tabellaAJson = {
    naturaGiuridica: fattore(a.naturaGiuridica),
    attivitaPrevalente: fattore(a.attivitaPrevalente),
    comportamentoConferimento: fattore(a.comportamentoConferimento),
    areaClienteControparte: fattore(a.areaClienteControparte),
  };
  const tabellaBJson = onlyTabA || !args.tabella_b ? null : {
    tipologia: fattore(args.tabella_b.tipologia),
    modalita: fattore(args.tabella_b.modalita),
    ammontare: fattore(args.tabella_b.ammontare),
    frequenzaVolumeDurata: fattore(args.tabella_b.frequenzaVolumeDurata),
    ragionevolezza: fattore(args.tabella_b.ragionevolezza),
    areaDestinazione: fattore(args.tabella_b.areaDestinazione),
  };

  const { data, error } = await client
    .from('valutazioni_rischio')
    .insert({
      incarico_id: args.incarico_id,
      rischio_inerente_prestazione: inerentePrestazione,
      tabella_a_scores: tabellaAJson,
      tabella_b_scores: tabellaBJson,
      rischio_specifico: Number(rischioSpecifico.toFixed(2)),
      rischio_effettivo: rischioEffettivo,
      classe_rischio: classeRischio,
      misure_applicate: MISURE_PER_CLASSE[classeRischio] || '',
      note: args.note ?? '',
      prossimo_controllo: prossimoControllo,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  return {
    valutazione_id: data.id,
    incarico_id: args.incarico_id,
    rischio_effettivo: rischioEffettivo,
    classe_rischio: classeRischio,
    prossimo_controllo: prossimoControllo,
  };
}
