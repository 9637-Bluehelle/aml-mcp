import data from '../data/aml_regole_tecniche_v1.json';

export const amlData = data;

export interface ScoringClass {
  from: number;
  to: number;
  label: string;
  grade: number;
}

export function getScoreClass(score: number): ScoringClass {
  const classes = amlData.meta.scoring_scale.classes;
  // Selezione per SOGLIA INFERIORE (intervalli contigui): si prende la classe con il `from` più
  // alto ancora <= score. Così i valori "di buco" tra una classe e l'altra (es. 2.56, 3.56) non
  // ricadono più erroneamente nella classe 1 (era: `score >= from && score <= to || classes[0]`,
  // che per i decimali tra 1.5 e 1.6 ecc. non matchava nulla → grade 1). Coerente col calcolo
  // server (`>= 3.6/2.6/1.6`) in api/_lib/valutazioneService.ts e ValutazioneRischioForm.
  const sorted = [...classes].sort((a, b) => a.from - b.from);
  let result = sorted[0];
  for (const c of sorted) {
    if (score >= c.from) result = c;
  }
  return result;
}

export function getClassColor(grade: number): string {
  switch (grade) {
    case 1: return 'text-green-700 bg-green-50';
    case 2: return 'text-yellow-700 bg-yellow-50';
    case 3: return 'text-orange-700 bg-orange-50';
    case 4: return 'text-red-700 bg-red-50';
    default: return 'text-gray-700 bg-gray-50';
  }
}

export function getPrestazione(id: string) {
  return amlData.prestazioni_catalog.find(p => p.id === id);
}

export function getRegolaTecnica(id: string) {
  return amlData.regole_tecniche.find(rt => rt.id === id);
}
