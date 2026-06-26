import { getPrestazione, getScoreClass } from './aml-data';

// Scala rischio: 1-4 (D.Lgs. 231/2007, Linee Guida CNDCEC par. 1.3)
// Il rischio non può mai essere nullo (parere CSF)
const SCORE_MIN = 1;
const SCORE_MAX = 4;

/** Vincola un punteggio all'intervallo valido 1-4 */
export function clampScore(score: number): number {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(score)));
}

/** Validazione: verifica che un punteggio sia nell'intervallo 1-4 */
export function isValidScore(score: number): boolean {
  return Number.isFinite(score) && score >= SCORE_MIN && score <= SCORE_MAX;
}

/**
 * Classificazione del rischio effettivo (Linee Guida CNDCEC par. 2.3)
 * Restituisce il tipo di adeguata verifica da adottare.
 */
export type TipoAdeguataVerifica = 'semplificata' | 'ordinaria' | 'rafforzata';
export type ClasseRischio = 1 | 2 | 3 | 4;

export interface ClassificazioneRischio {
  classe: ClasseRischio;
  label: string;
  tipoVerifica: TipoAdeguataVerifica;
  /** Periodicità controllo costante in mesi */
  periodicitaControlloMesi: number;
}

export function classificaRischioEffettivo(rischioEffettivo: number): ClassificazioneRischio {
  const sc = getScoreClass(rischioEffettivo);
  const classe = sc.grade as ClasseRischio;

  const tipoVerifica: TipoAdeguataVerifica =
    classe <= 2 ? 'semplificata' : classe === 3 ? 'ordinaria' : 'rafforzata';

  const periodicitaControlloMesi =
    classe >= 4 ? 6 : classe === 3 ? 12 : classe === 2 ? 24 : 36;

  return { classe, label: sc.label, tipoVerifica, periodicitaControlloMesi };
}

export interface RT1Factors {
  clientTypes: number;
  geography: number;
  channels: number;
  services: number;
  training: number;
  kycOrg: number;
  retentionOrg: number;
  sosCashControls: number;
}

/**
 * RT1 - Autovalutazione del rischio (Linee Guida CNDCEC Parte I, par. 4)
 * Formula: R_residuo = 0.40 × R_inerente + 0.60 × R_vulnerabilità
 */
export function calculateRT1Scores(factors: RT1Factors) {
  const inerente = (
    clampScore(factors.clientTypes) +
    clampScore(factors.geography) +
    clampScore(factors.channels) +
    clampScore(factors.services)
  ) / 4;

  const vulnerabilita = (
    clampScore(factors.training) +
    clampScore(factors.kycOrg) +
    clampScore(factors.retentionOrg) +
    clampScore(factors.sosCashControls)
  ) / 4;

  const residuo = 0.4 * inerente + 0.6 * vulnerabilita;

  return {
    inerente: Number(inerente.toFixed(2)),
    vulnerabilita: Number(vulnerabilita.toFixed(2)),
    residuo: Number(residuo.toFixed(2)),
    classificazione: classificaRischioEffettivo(Number(residuo.toFixed(2)))
  };
}

export interface RT2FattoreRischio {
  score: number;              // Punteggio 1-4 assegnato dall'utente
  fattoriSelezionati: string[]; // ID dei fattori checkbox selezionati
  altro: string;              // Testo libero "Altro"
}

export interface RT2TabellaA {
  naturaGiuridica: RT2FattoreRischio;
  attivitaPrevalente: RT2FattoreRischio;
  comportamentoConferimento: RT2FattoreRischio;
  areaClienteControparte: RT2FattoreRischio;
}

export interface RT2TabellaB {
  tipologia: RT2FattoreRischio;
  modalita: RT2FattoreRischio;
  ammontare: RT2FattoreRischio;
  frequenzaVolumeDurata: RT2FattoreRischio;
  ragionevolezza: RT2FattoreRischio;
  areaDestinazione: RT2FattoreRischio;
}

export function createDefaultFattore(score: number = 1): RT2FattoreRischio {
  return { score, fattoriSelezionati: [], altro: '' };
}

export function createDefaultTabellaA(): RT2TabellaA {
  return {
    naturaGiuridica: createDefaultFattore(),
    attivitaPrevalente: createDefaultFattore(),
    comportamentoConferimento: createDefaultFattore(),
    areaClienteControparte: createDefaultFattore()
  };
}

export function createDefaultTabellaB(): RT2TabellaB {
  return {
    tipologia: createDefaultFattore(),
    modalita: createDefaultFattore(),
    ammontare: createDefaultFattore(),
    frequenzaVolumeDurata: createDefaultFattore(),
    ragionevolezza: createDefaultFattore(),
    areaDestinazione: createDefaultFattore()
  };
}

/**
 * RT2 - Adeguata Verifica: Calcolo rischio effettivo (Linee Guida CNDCEC Parte II, par. 2.3)
 * Formula: R_effettivo = 0.30 × R_inerente + 0.70 × R_specifico
 *
 * Soglie classificazione (par. 2.3):
 *   1.00-1.50 → Non significativo → Verifica semplificata
 *   1.60-2.50 → Poco significativo → Verifica semplificata
 *   2.60-3.50 → Abbastanza significativo → Verifica ordinaria
 *   3.60-4.00 → Molto significativo → Verifica rafforzata
 *
 * @param prestazioneIds - Uno o più ID prestazione. In caso di pluralità,
 *   il rischio inerente si allinea al grado più alto (Linee Guida par. 2.1, pag. 25)
 */
export function calculateRT2Scores(
  prestazioneId: string | string[],
  tabellaA: RT2TabellaA,
  tabellaB?: RT2TabellaB,
  isPep?: boolean
) {
  // Gestione prestazioni multiple: rischio inerente = max tra tutte
  const ids = Array.isArray(prestazioneId) ? prestazioneId : [prestazioneId];
  if (ids.length === 0) {
    throw new Error('Almeno una prestazione è richiesta');
  }

  let maxInerentePrestazione = 0;
  let effectiveOnlyTabA = true;

  for (const id of ids) {
    const prestazione = getPrestazione(id);
    if (!prestazione) {
      throw new Error(`Prestazione ${id} not found`);
    }
    if (prestazione.inherentRisk > maxInerentePrestazione) {
      maxInerentePrestazione = prestazione.inherentRisk;
    }
    // Se almeno una prestazione richiede TabellaB, non è onlyTabA
    if (!prestazione.onlyTabA) {
      effectiveOnlyTabA = false;
    }
  }

  const inerentePrestazione = maxInerentePrestazione;
  const onlyTabA = effectiveOnlyTabA;

  // Totale A = somma dei 4 punteggi (con validazione)
  const totaleA =
    clampScore(tabellaA.naturaGiuridica.score) +
    clampScore(tabellaA.attivitaPrevalente.score) +
    clampScore(tabellaA.comportamentoConferimento.score) +
    clampScore(tabellaA.areaClienteControparte.score);

  let rischioSpecifico: number;

  if (onlyTabA || !tabellaB) {
    // Eccezione (rev.legale, contabilità): R_Specifico = Totale_A / 4
    rischioSpecifico = totaleA / 4;
  } else {
    // Totale B = somma dei 6 punteggi (con validazione)
    const totaleB =
      clampScore(tabellaB.tipologia.score) +
      clampScore(tabellaB.modalita.score) +
      clampScore(tabellaB.ammontare.score) +
      clampScore(tabellaB.frequenzaVolumeDurata.score) +
      clampScore(tabellaB.ragionevolezza.score) +
      clampScore(tabellaB.areaDestinazione.score);

    // Standard: R_Specifico = (Totale_A + Totale_B) / 10
    rischioSpecifico = (totaleA + totaleB) / 10;
  }

  // R_effettivo = 30% inerente + 70% specifico
  const rischioEffettivoCalcolato = Number((0.3 * inerentePrestazione + 0.7 * rischioSpecifico).toFixed(2));

  // PPE: forza verifica rafforzata ma documenta comunque il calcolo
  const rischioEffettivo = isPep ? 4.0 : rischioEffettivoCalcolato;

  const classificazione = classificaRischioEffettivo(rischioEffettivo);

  return {
    inerentePrestazione,
    rischioSpecifico: Number(rischioSpecifico.toFixed(2)),
    /** Rischio effettivo calcolato dalla formula (prima della forzatura PPE) */
    rischioEffettivoCalcolato,
    /** Rischio effettivo finale (= 4.0 se PPE) */
    rischioEffettivo,
    isPepForced: isPep || false,
    classificazione
  };
}

export function daysBetween(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function daysToDate(targetDate: Date): number {
  return daysBetween(new Date(), targetDate);
}

export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  const targetDay = result.getDate();
  result.setDate(1); // evita l'overflow (29/2 di un anno non bisestile slitterebbe a 1/3)
  result.setFullYear(result.getFullYear() + years);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(targetDay, lastDay));
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const targetDay = result.getDate();
  result.setDate(1); // evita l'overflow di fine mese (es. 31/8 + 6 mesi non deve slittare a 3/3)
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(targetDay, lastDay));
  return result;
}

/** Formatta una Date in 'yyyy-mm-dd' usando le componenti LOCALI (no toISOString, che converte in
 *  UTC e la sera nei fusi a est sposta la data al giorno dopo). */
export function toLocalIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
