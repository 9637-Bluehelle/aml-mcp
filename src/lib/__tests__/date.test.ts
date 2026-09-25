import { describe, it, expect } from 'vitest';
import { toISODateLocale, traMesiISO } from '../date';
import { addMonths } from '../calculations';

// Le date sono costruite dai componenti locali (new Date(anno, mese, giorno))
// e non da stringhe ISO: così le asserzioni valgono in qualunque fuso, qui e
// sul server di build che gira in UTC. Un test che passa in Italia e fallisce
// in fase di deploy bloccherebbe una pubblicazione senza un motivo vero.

describe('toISODateLocale', () => {
  it('scrive la data che l\'utente vede sul calendario', () => {
    expect(toISODateLocale(new Date(2025, 0, 15))).toBe('2025-01-15');
    expect(toISODateLocale(new Date(2025, 11, 31))).toBe('2025-12-31');
  });

  it('non arretra di un giorno a cavallo della mezzanotte', () => {
    // È il bug che sostituisce: con toISOString() questi tornavano il giorno
    // prima in tutti i fusi a est di Greenwich, Italia compresa.
    expect(toISODateLocale(new Date(2025, 0, 15, 0, 0))).toBe('2025-01-15');
    expect(toISODateLocale(new Date(2025, 0, 15, 0, 30))).toBe('2025-01-15');
    expect(toISODateLocale(new Date(2025, 0, 15, 23, 59))).toBe('2025-01-15');
  });

  it('mette lo zero davanti a mesi e giorni di una cifra', () => {
    expect(toISODateLocale(new Date(2025, 2, 5))).toBe('2025-03-05');
  });
});

describe('traMesiISO', () => {
  it('somma i mesi delle periodicità di controllo', () => {
    const da = new Date(2025, 0, 15);
    expect(traMesiISO(6, da)).toBe('2025-07-15');
    expect(traMesiISO(12, da)).toBe('2026-01-15');
    expect(traMesiISO(24, da)).toBe('2027-01-15');
    expect(traMesiISO(36, da)).toBe('2028-01-15');
  });

  it('resta sul giorno giusto anche partendo da mezzanotte', () => {
    expect(traMesiISO(12, new Date(2025, 0, 15, 0, 15))).toBe('2026-01-15');
  });

  it('non perde un giorno quando la scadenza cade nell\'ora legale', () => {
    // Caso reale di RT4: un controllo del 15 gennaio con periodicità 6 mesi
    // scade il 15 luglio. Con toISOString() diventava il 14, perché in Italia
    // nel frattempo si passa da UTC+1 a UTC+2.
    expect(toISODateLocale(addMonths(new Date(2025, 0, 15), 6))).toBe('2025-07-15');
    expect(toISODateLocale(addMonths(new Date(2025, 2, 20), 3))).toBe('2025-06-20');
  });

  it('trasloca in avanti quando il giorno non esiste nel mese di arrivo', () => {
    // 31 gennaio + 1 mese: febbraio non ha il 31, JavaScript riporta al 2 o 3
    // marzo. Comportamento accettabile per una scadenza, purché deterministico.
    expect(traMesiISO(1, new Date(2025, 0, 31))).toBe('2025-03-03');
  });
});
