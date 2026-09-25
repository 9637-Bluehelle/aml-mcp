import { describe, it, expect, vi } from 'vitest';

// `personeHelper` importa `supabase` a livello di modulo (che esige env mancanti
// nei test): la funzione sotto esame è pura, quindi basta stubbarlo.
vi.mock('../supabase', () => ({ supabase: {} }));
vi.mock('../studioHelper', () => ({ getActiveStudioIdHolder: () => null }));

import { normalizeNomeForCompare } from '../personeHelper';

/** Due scritture che devono risultare lo stesso soggetto. */
const stesso = (a: string, b: string) =>
  expect([a, normalizeNomeForCompare(a)]).toEqual([a, normalizeNomeForCompare(b)]);

describe('normalizeNomeForCompare', () => {
  it('ignora l\'ordine delle parole', () => {
    // Il caso che produceva l'avviso: import Excel scrive "COGNOME NOME",
    // i dati da visura camerale arrivano come "Nome Cognome".
    stesso('Rossi Mario', 'Mario Rossi');
    stesso('DE LUCA GIUSEPPE MARIA', 'Giuseppe Maria De Luca');
  });

  it('ignora maiuscole e spaziatura', () => {
    stesso('  MARIO   ROSSI ', 'mario rossi');
  });

  it('ignora gli accenti', () => {
    stesso('Nicolò Bàrberi', 'Nicolo Barberi');
  });

  it('tratta punti e apostrofi come non separatori', () => {
    stesso('ACME S.R.L.', 'ACME SRL');
    stesso("D'Angelo Mario", 'Mario DAngelo');
  });

  it('tratta trattini e altri segni come separatori', () => {
    stesso('Rossi-Bianchi Mario', 'Mario Rossi Bianchi');
  });

  it('continua a distinguere soggetti con nomi diversi', () => {
    expect(normalizeNomeForCompare('Mario Rossi')).not.toBe(normalizeNomeForCompare('Mario Bianchi'));
    expect(normalizeNomeForCompare('Acme Srl')).not.toBe(normalizeNomeForCompare('Acme Spa'));
    // Un secondo nome in più resta una differenza: va segnalata, non nascosta.
    expect(normalizeNomeForCompare('Mario Rossi')).not.toBe(normalizeNomeForCompare('Mario Luigi Rossi'));
  });

  it('gestisce valori vuoti o assenti', () => {
    expect(normalizeNomeForCompare('')).toBe('');
    expect(normalizeNomeForCompare(null)).toBe('');
    expect(normalizeNomeForCompare(undefined)).toBe('');
    expect(normalizeNomeForCompare('   ')).toBe('');
    expect(normalizeNomeForCompare('...')).toBe('');
  });
});
