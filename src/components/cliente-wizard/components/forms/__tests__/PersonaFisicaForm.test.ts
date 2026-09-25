import { describe, it, expect } from 'vitest';
import { normalizeDate } from '../PersonaFisicaForm';

describe('normalizeDate', () => {
  it('lascia invariato dd/mm/yyyy ben formato', () => {
    expect(normalizeDate('15/03/2025')).toBe('15/03/2025');
  });

  it('aggiunge zero-padding al formato italiano', () => {
    expect(normalizeDate('5/3/2025')).toBe('05/03/2025');
    expect(normalizeDate('5/03/2025')).toBe('05/03/2025');
    expect(normalizeDate('15/3/2025')).toBe('15/03/2025');
  });

  it('converte ISO yyyy-mm-dd in dd/mm/yyyy', () => {
    expect(normalizeDate('2025-03-15')).toBe('15/03/2025');
  });

  it('converte ISO yyyy-m-d senza padding in dd/mm/yyyy', () => {
    expect(normalizeDate('2025-3-5')).toBe('05/03/2025');
  });

  it('gestisce ISO con orario / timezone', () => {
    expect(normalizeDate('2025-03-15T00:00:00Z')).toBe('15/03/2025');
    expect(normalizeDate('2025-03-15T10:30:45.123+02:00')).toBe('15/03/2025');
    expect(normalizeDate('2025-03-15 10:30:45')).toBe('15/03/2025');
  });

  it('accetta separatori `-` o `.` nel formato italiano', () => {
    expect(normalizeDate('15-03-2025')).toBe('15/03/2025');
    expect(normalizeDate('15.03.2025')).toBe('15/03/2025');
  });

  it('rimuove spazi attorno al valore', () => {
    expect(normalizeDate('  15/03/2025  ')).toBe('15/03/2025');
  });

  it('ritorna stringa vuota su input vuoti / nulli', () => {
    expect(normalizeDate('')).toBe('');
    expect(normalizeDate('   ')).toBe('');
    expect(normalizeDate(null)).toBe('');
    expect(normalizeDate(undefined)).toBe('');
  });

  it('ritorna stringa vuota su input non riconoscibile come data', () => {
    expect(normalizeDate('non-una-data')).toBe('');
    expect(normalizeDate('2025/03/15')).toBe(''); // ordine YMD con `/` non supportato
    expect(normalizeDate('15/03/25')).toBe(''); // anno a 2 cifre non supportato
  });
});
