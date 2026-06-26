import { describe, it, expect } from 'vitest';
import {
  normalizeVatOrCF,
  isValidPIva,
  isValidCF,
  isValidDate,
  formatDateToISO,
  formatDateForDB,
  formatDate,
  extractLocationParts,
  getLegalRepresentative,
} from '../utils';

// ==================== normalizeVatOrCF ====================
describe('normalizeVatOrCF', () => {
  it('estrae 11 cifre come P.IVA', () => {
    expect(normalizeVatOrCF('IT 012 345 678 90')).toBe('01234567890');
  });

  it('normalizza codice fiscale alfanumerico in uppercase', () => {
    expect(normalizeVatOrCF('rssmra80a01h501u')).toBe('RSSMRA80A01H501U');
  });

  it('gestisce stringa vuota', () => {
    expect(normalizeVatOrCF('')).toBe('');
  });

  it('rimuove spazi da codice fiscale', () => {
    expect(normalizeVatOrCF(' RSS MRA 80A01 H501U ')).toBe('RSSMRA80A01H501U');
  });

  it('riconosce P.IVA numerica pura', () => {
    expect(normalizeVatOrCF('01234567890')).toBe('01234567890');
  });
});

// ==================== isValidPIva ====================
describe('isValidPIva', () => {
  it('accetta P.IVA valida di 11 cifre', () => {
    expect(isValidPIva('01234567890')).toBe(true);
  });

  it('rifiuta meno di 11 cifre', () => {
    expect(isValidPIva('0123456789')).toBe(false);
  });

  it('rifiuta più di 11 cifre', () => {
    expect(isValidPIva('012345678901')).toBe(false);
  });

  it('rifiuta lettere', () => {
    expect(isValidPIva('0123456789A')).toBe(false);
  });
});

// ==================== isValidCF ====================
describe('isValidCF', () => {
  it('accetta CF di 16 caratteri alfanumerici', () => {
    expect(isValidCF('RSSMRA80A01H501U')).toBe(true);
  });

  it('accetta P.IVA come CF (11 cifre)', () => {
    expect(isValidCF('01234567890')).toBe(true);
  });

  it('rifiuta CF troppo corto', () => {
    expect(isValidCF('RSSMRA80')).toBe(false);
  });

  it('rifiuta CF con caratteri speciali', () => {
    expect(isValidCF('RSS-MRA-80A01H5')).toBe(false);
  });

  it('rifiuta CF lowercase', () => {
    expect(isValidCF('rssmra80a01h501u')).toBe(false);
  });
});

// ==================== isValidDate ====================
describe('isValidDate', () => {
  it('accetta data valida dd/mm/yyyy', () => {
    expect(isValidDate('15/03/2025')).toBe(true);
  });

  it('accetta stringa vuota (campo opzionale)', () => {
    expect(isValidDate('')).toBe(true);
  });

  it('rifiuta formato sbagliato', () => {
    expect(isValidDate('2025-03-15')).toBe(false);
    expect(isValidDate('15-03-2025')).toBe(false);
  });

  it('rifiuta mese non valido', () => {
    expect(isValidDate('15/13/2025')).toBe(false);
    expect(isValidDate('15/00/2025')).toBe(false);
  });

  it('rifiuta giorno non valido', () => {
    expect(isValidDate('32/01/2025')).toBe(false);
    expect(isValidDate('00/01/2025')).toBe(false);
  });

  it('rifiuta anno fuori range', () => {
    expect(isValidDate('01/01/1899')).toBe(false);
    expect(isValidDate('01/01/2101')).toBe(false);
  });

  it('valida correttamente febbraio (28/29 giorni)', () => {
    expect(isValidDate('29/02/2024')).toBe(true);  // anno bisestile
    expect(isValidDate('29/02/2025')).toBe(false); // non bisestile
    expect(isValidDate('28/02/2025')).toBe(true);
  });

  it('valida correttamente mesi con 30 giorni', () => {
    expect(isValidDate('30/04/2025')).toBe(true);
    expect(isValidDate('31/04/2025')).toBe(false);
  });
});

// ==================== formatDateToISO ====================
describe('formatDateToISO', () => {
  it('converte dd/mm/yyyy → yyyy-mm-dd', () => {
    expect(formatDateToISO('15/03/2025')).toBe('2025-03-15');
  });

  it('gestisce giorno/mese a singola cifra con padding', () => {
    expect(formatDateToISO('1/3/2025')).toBe('2025-03-01');
  });

  it('restituisce stringa vuota per input vuoto', () => {
    expect(formatDateToISO('')).toBe('');
  });

  it('restituisce stringa vuota per formato non valido', () => {
    expect(formatDateToISO('2025-03-15')).toBe('');
  });
});

// ==================== formatDateForDB ====================
describe('formatDateForDB', () => {
  it('converte data per il database', () => {
    expect(formatDateForDB('15/03/2025')).toBe('2025-03-15');
  });

  it('restituisce null per stringa vuota', () => {
    expect(formatDateForDB('')).toBeNull();
  });

  it('restituisce null per input non valido', () => {
    expect(formatDateForDB('non-una-data')).toBeNull();
  });
});

// ==================== formatDate (cliente-wizard) ====================
describe('formatDate (cliente-wizard)', () => {
  it('converte yyyy-mm-dd → dd/mm/yyyy', () => {
    expect(formatDate('2025-03-15')).toBe('15/03/2025');
  });

  it('gestisce formato con timestamp ISO', () => {
    expect(formatDate('2025-03-15T10:30:00Z')).toBe('15/03/2025');
  });

  it('restituisce stringa vuota per input vuoto', () => {
    expect(formatDate('')).toBe('');
  });
});

// ==================== extractLocationParts ====================
describe('extractLocationParts', () => {
  it('estrae città e provincia da "Roma (RM)"', () => {
    const result = extractLocationParts('Roma (RM)');
    expect(result.city).toBe('Roma');
    expect(result.province).toBe('RM');
  });

  it('gestisce solo città senza provincia', () => {
    const result = extractLocationParts('Milano');
    expect(result.city).toBe('Milano');
    expect(result.province).toBe('');
  });

  it('gestisce stringa vuota', () => {
    const result = extractLocationParts('');
    expect(result.city).toBe('');
    expect(result.province).toBe('');
  });

  it('gestisce spazi extra', () => {
    const result = extractLocationParts('  Napoli  (NA)');
    expect(result.city).toBe('Napoli');
    expect(result.province).toBe('NA');
  });
});

// ==================== getLegalRepresentative ====================
describe('getLegalRepresentative', () => {
  it('restituisce il rappresentante legale se presente', () => {
    const managers = [
      { name: 'Mario Rossi', isLegalRepresentative: false },
      { name: 'Luigi Bianchi', isLegalRepresentative: true },
    ];
    const result = getLegalRepresentative(managers);
    expect(result.name).toBe('Luigi Bianchi');
  });

  it('restituisce il primo manager con nome se nessun rappresentante legale', () => {
    const managers = [
      { name: '', isLegalRepresentative: false },
      { name: 'Mario Rossi', isLegalRepresentative: false },
    ];
    const result = getLegalRepresentative(managers);
    expect(result.name).toBe('Mario Rossi');
  });

  it('restituisce null per array vuoto', () => {
    expect(getLegalRepresentative([])).toBeNull();
  });

  it('restituisce null per null/undefined', () => {
    expect(getLegalRepresentative(null as any)).toBeNull();
    expect(getLegalRepresentative(undefined as any)).toBeNull();
  });

  it('preferisce rappresentante legale anche se non è primo', () => {
    const managers = [
      { name: 'Primo', isLegalRepresentative: false },
      { name: 'Secondo', isLegalRepresentative: false },
      { name: 'Terzo', isLegalRepresentative: true },
    ];
    const result = getLegalRepresentative(managers);
    expect(result.name).toBe('Terzo');
  });
});
