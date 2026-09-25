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
  return classes.find(c => score >= c.from && score <= c.to) || classes[0];
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
