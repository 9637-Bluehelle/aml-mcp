import { describe, it, expect } from 'vitest';
import { getScoreClass, getClassColor, getPrestazione, getRegolaTecnica } from '../aml-data';

// ==================== getScoreClass ====================
describe('getScoreClass', () => {
  it('classifica 1.0 come "Non significativo" (grade 1)', () => {
    const c = getScoreClass(1.0);
    expect(c.label).toBe('Non significativo');
    expect(c.grade).toBe(1);
  });

  it('classifica 1.5 come "Non significativo"', () => {
    expect(getScoreClass(1.5).grade).toBe(1);
  });

  it('classifica 1.6 come "Poco significativo" (grade 2)', () => {
    const c = getScoreClass(1.6);
    expect(c.label).toBe('Poco significativo');
    expect(c.grade).toBe(2);
  });

  it('classifica 2.5 come "Poco significativo"', () => {
    expect(getScoreClass(2.5).grade).toBe(2);
  });

  it('classifica 2.6 come "Abbastanza significativo" (grade 3)', () => {
    const c = getScoreClass(2.6);
    expect(c.label).toBe('Abbastanza significativo');
    expect(c.grade).toBe(3);
  });

  it('classifica 3.5 come "Abbastanza significativo"', () => {
    expect(getScoreClass(3.5).grade).toBe(3);
  });

  it('classifica 3.6 come "Molto significativo" (grade 4)', () => {
    const c = getScoreClass(3.6);
    expect(c.label).toBe('Molto significativo');
    expect(c.grade).toBe(4);
  });

  it('classifica 4.0 come "Molto significativo"', () => {
    expect(getScoreClass(4.0).grade).toBe(4);
  });

  it('fallback a classe 1 per score fuori range', () => {
    const c = getScoreClass(0);
    expect(c.grade).toBe(1);
  });
});

// ==================== getClassColor ====================
describe('getClassColor', () => {
  it('restituisce verde per grade 1', () => {
    expect(getClassColor(1)).toBe('text-green-700 bg-green-50');
  });

  it('restituisce giallo per grade 2', () => {
    expect(getClassColor(2)).toBe('text-yellow-700 bg-yellow-50');
  });

  it('restituisce arancione per grade 3', () => {
    expect(getClassColor(3)).toBe('text-orange-700 bg-orange-50');
  });

  it('restituisce rosso per grade 4', () => {
    expect(getClassColor(4)).toBe('text-red-700 bg-red-50');
  });

  it('restituisce grigio per grade non valido', () => {
    expect(getClassColor(0)).toBe('text-gray-700 bg-gray-50');
    expect(getClassColor(5)).toBe('text-gray-700 bg-gray-50');
  });
});

// ==================== getPrestazione ====================
describe('getPrestazione', () => {
  it('trova prestazione esistente per ID', () => {
    const p = getPrestazione('visto-conformita');
    expect(p).toBeDefined();
    expect(p!.id).toBe('visto-conformita');
    expect(p!.inherentRisk).toBe(1);
  });

  it('trova prestazione con onlyTabA', () => {
    const p = getPrestazione('collegio-sindacale-no-revisione');
    expect(p).toBeDefined();
    expect(p!.onlyTabA).toBe(true);
  });

  it('restituisce undefined per ID inesistente', () => {
    expect(getPrestazione('non-esiste')).toBeUndefined();
  });
});

// ==================== getRegolaTecnica ====================
describe('getRegolaTecnica', () => {
  it('trova regola tecnica esistente per ID', () => {
    const rt = getRegolaTecnica('RT1');
    expect(rt).toBeDefined();
    expect(rt!.id).toBe('RT1');
  });

  it('restituisce undefined per ID inesistente', () => {
    expect(getRegolaTecnica('RT999')).toBeUndefined();
  });
});
