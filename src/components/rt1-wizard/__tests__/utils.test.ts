import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateRT1Scores,
  validateStep1,
  validateSezione,
  validateComplete,
  getRiskLevel,
  getRiskLabel,
  incrementVersion,
  getValidUntilDate,
  formatDate,
  isExpired,
  getDaysUntilExpiry,
  calculateCompletionPercentage,
  getLastCompletedStep,
  convertLegacyData,
} from '../utils';
import type { RisposteDettagliate, DescrizioneStudio, RT1WizardData } from '../types';

// ==================== Helper: crea risposte con valori specifici ====================
function makeRisposte(values: Record<string, number | null> = {}): RisposteDettagliate {
  const get = (key: string): number | null => key in values ? values[key] : 2;
  return {
    tipologia_clientela: { scelta_valore: get('tipologia_clientela'), note: '' },
    area_geografica_operativita: { scelta_valore: get('area_geografica_operativita'), note: '' },
    canali_distributivi: { scelta_valore: get('canali_distributivi'), note: '' },
    servizi_professionali_offerti: { scelta_valore: get('servizi_professionali_offerti'), note: '' },
    formazione: { scelta_valore: get('formazione'), note: '' },
    organizzazione_adeguata_verifica: { scelta_valore: get('organizzazione_adeguata_verifica'), note: '' },
    organizzazione_conservazione: { scelta_valore: get('organizzazione_conservazione'), note: '' },
    organizzazione_segnalazione_sos: { scelta_valore: get('organizzazione_segnalazione_sos'), note: '' },
  };
}

function makeDescrizione(overrides: Partial<DescrizioneStudio> = {}): DescrizioneStudio {
  return {
    tipologia_giuridica: 'Studio associato',
    anno_inizio_attivita: '2010',
    sedi: 'Roma',
    organizzazione_interna: '3 professionisti',
    peculiarita_e_specializzazioni: '',
    tipologia_prevalente_clientela: '',
    principali_prestazioni_professionali: '',
    ...overrides,
  };
}

function makeWizardData(overrides: Partial<RT1WizardData> = {}): RT1WizardData {
  return {
    version: '1.0',
    created_by: 'Test User',
    descrizione_studio: makeDescrizione(),
    risposte_dettagliate: makeRisposte(),
    piano_mitigazione: 'Piano di mitigazione test',
    ...overrides,
  };
}

// ==================== calculateRT1Scores (wizard version) ====================
describe('calculateRT1Scores (wizard)', () => {
  it('calcola media inerente dai 4 fattori inerenti', () => {
    const risposte = makeRisposte({
      tipologia_clientela: 1,
      area_geografica_operativita: 2,
      canali_distributivi: 3,
      servizi_professionali_offerti: 4,
    });
    const result = calculateRT1Scores(risposte);
    // (1+2+3+4)/4 = 2.5
    expect(result.inerente).toBe(2.5);
  });

  it('calcola media vulnerabilità dai 4 fattori vulnerabilità', () => {
    const risposte = makeRisposte({
      formazione: 1,
      organizzazione_adeguata_verifica: 3,
      organizzazione_conservazione: 3,
      organizzazione_segnalazione_sos: 1,
    });
    const result = calculateRT1Scores(risposte);
    // (1+3+3+1)/4 = 2
    expect(result.vulnerabilita).toBe(2);
  });

  it('calcola residuo come 40% inerente + 60% vulnerabilità', () => {
    const risposte = makeRisposte({
      tipologia_clientela: 4, area_geografica_operativita: 4,
      canali_distributivi: 4, servizi_professionali_offerti: 4, // inerente = 4
      formazione: 1, organizzazione_adeguata_verifica: 1,
      organizzazione_conservazione: 1, organizzazione_segnalazione_sos: 1, // vuln = 1
    });
    const result = calculateRT1Scores(risposte);
    // 0.4*4 + 0.6*1 = 2.2
    expect(result.residuo).toBe(2.2);
  });

  it('tratta scelta_valore null come 0', () => {
    const risposte = makeRisposte({
      tipologia_clientela: null,
      area_geografica_operativita: null,
      canali_distributivi: null,
      servizi_professionali_offerti: null,
    });
    const result = calculateRT1Scores(risposte);
    // (0+0+0+0)/4 = 0
    expect(result.inerente).toBe(0);
  });
});

// ==================== validateStep1 ====================
describe('validateStep1', () => {
  it('valida OK con tutti i campi obbligatori compilati', () => {
    const desc = makeDescrizione();
    const result = validateStep1(desc);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it('rileva campo tipologia_giuridica mancante', () => {
    const desc = makeDescrizione({ tipologia_giuridica: '' });
    const result = validateStep1(desc);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('Tipologia Giuridica');
  });

  it('rileva campo anno_inizio_attivita mancante', () => {
    const desc = makeDescrizione({ anno_inizio_attivita: '  ' });
    const result = validateStep1(desc);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('Anno Inizio Attività');
  });

  it('rileva tutti i 4 campi obbligatori mancanti', () => {
    const desc = makeDescrizione({
      tipologia_giuridica: '',
      anno_inizio_attivita: '',
      sedi: '',
      organizzazione_interna: '',
    });
    const result = validateStep1(desc);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toHaveLength(4);
  });
});

// ==================== validateSezione ====================
describe('validateSezione', () => {
  it('valida OK con valore numerico > 0', () => {
    const result = validateSezione(2.5, 'Test');
    expect(result.valid).toBe(true);
  });

  it('invalida con valore null', () => {
    const result = validateSezione(null, 'Tipologia Clientela');
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('Tipologia Clientela');
  });

  it('invalida con valore 0', () => {
    const result = validateSezione(0, 'Test');
    expect(result.valid).toBe(false);
  });
});

// ==================== validateComplete ====================
describe('validateComplete', () => {
  it('valida OK con tutti i dati compilati', () => {
    const data = makeWizardData();
    const result = validateComplete(data);
    expect(result.valid).toBe(true);
  });

  it('rileva version mancante', () => {
    const data = makeWizardData({ version: '' });
    const result = validateComplete(data);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('Versione');
  });

  it('rileva created_by mancante', () => {
    const data = makeWizardData({ created_by: '' });
    const result = validateComplete(data);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('Valutatore');
  });

  it('rileva piano_mitigazione mancante', () => {
    const data = makeWizardData({ piano_mitigazione: '' });
    const result = validateComplete(data);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('Piano di Mitigazione');
  });

  it('rileva sezioni con scelta_valore null', () => {
    const data = makeWizardData({
      risposte_dettagliate: makeRisposte({ tipologia_clientela: null }),
    });
    const result = validateComplete(data);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('Tipologia Clientela');
  });
});

// ==================== getRiskLevel / getRiskLabel ====================
describe('getRiskLevel', () => {
  it('restituisce "low" per score <= 1.5', () => {
    expect(getRiskLevel(1.0)).toBe('low');
    expect(getRiskLevel(1.5)).toBe('low');
  });

  it('restituisce "medium" per score 1.6–2.5', () => {
    expect(getRiskLevel(1.6)).toBe('medium');
    expect(getRiskLevel(2.5)).toBe('medium');
  });

  it('restituisce "high" per score 2.6–3.5', () => {
    expect(getRiskLevel(2.6)).toBe('high');
    expect(getRiskLevel(3.5)).toBe('high');
  });

  it('restituisce "critical" per score > 3.5', () => {
    expect(getRiskLevel(3.6)).toBe('critical');
    expect(getRiskLevel(4.0)).toBe('critical');
  });
});

describe('getRiskLabel', () => {
  it('restituisce etichetta italiana corretta', () => {
    expect(getRiskLabel(1.0)).toBe('Basso');
    expect(getRiskLabel(2.0)).toBe('Medio');
    expect(getRiskLabel(3.0)).toBe('Alto');
    expect(getRiskLabel(4.0)).toBe('Critico');
  });
});

// ==================== incrementVersion ====================
describe('incrementVersion', () => {
  it('incrementa versione minore', () => {
    expect(incrementVersion('1.0')).toBe('1.1');
    expect(incrementVersion('1.5')).toBe('1.6');
    expect(incrementVersion('2.3')).toBe('2.4');
  });

  it('incrementa major quando minor = 9', () => {
    expect(incrementVersion('1.9')).toBe('2.0');
    expect(incrementVersion('3.9')).toBe('4.0');
  });

  it('gestisce versione senza punto', () => {
    expect(incrementVersion('1')).toBe('1.1');
  });

  it('gestisce input non valido (parseInt non lancia eccezione)', () => {
    // parseInt('abc') = NaN, NaN >= 9 è false → 'NaN.1'
    expect(incrementVersion('abc')).toBe('NaN.1');
  });
});

// ==================== getValidUntilDate ====================
describe('getValidUntilDate', () => {
  it('restituisce data + 3 anni in formato YYYY-MM-DD', () => {
    const d = new Date(2025, 0, 15); // Jan 15 2025
    const result = getValidUntilDate(d);
    expect(result).toBe('2028-01-15');
  });
});

// ==================== formatDate ====================
describe('formatDate (rt1-wizard)', () => {
  it('formatta data ISO in formato italiano dd/mm/yyyy', () => {
    const result = formatDate('2025-03-15');
    expect(result).toBe('15/03/2025');
  });

  it('restituisce "-" per null', () => {
    expect(formatDate(null)).toBe('-');
  });

  it('restituisce "-" per undefined', () => {
    expect(formatDate(undefined)).toBe('-');
  });

  it('restituisce "-" per stringa vuota', () => {
    expect(formatDate('')).toBe('-');
  });
});

// ==================== isExpired ====================
describe('isExpired', () => {
  it('restituisce true per data passata', () => {
    expect(isExpired('2020-01-01')).toBe(true);
  });

  it('restituisce false per data futura', () => {
    expect(isExpired('2099-01-01')).toBe(false);
  });

  it('restituisce false per null/undefined', () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired(undefined)).toBe(false);
  });
});

// ==================== getDaysUntilExpiry ====================
describe('getDaysUntilExpiry', () => {
  it('restituisce numero positivo per data futura', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const result = getDaysUntilExpiry(future.toISOString().split('T')[0]);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(31);
  });

  it('restituisce numero negativo per data passata', () => {
    const past = new Date();
    past.setDate(past.getDate() - 30);
    const result = getDaysUntilExpiry(past.toISOString().split('T')[0]);
    expect(result).toBeLessThan(0);
  });

  it('restituisce null per null/undefined', () => {
    expect(getDaysUntilExpiry(null)).toBeNull();
    expect(getDaysUntilExpiry(undefined)).toBeNull();
  });
});

// ==================== calculateCompletionPercentage ====================
describe('calculateCompletionPercentage', () => {
  it('restituisce 100% per dati completi', () => {
    const data = makeWizardData({
      descrizione_studio: makeDescrizione({
        peculiarita_e_specializzazioni: 'X',
        tipologia_prevalente_clientela: 'Y',
        principali_prestazioni_professionali: 'Z',
      }),
    });
    expect(calculateCompletionPercentage(data)).toBe(100);
  });

  it('restituisce percentuale intermedia per dati parziali', () => {
    const data = makeWizardData({
      descrizione_studio: makeDescrizione(), // 4/7 campi compilati
    });
    const pct = calculateCompletionPercentage(data);
    expect(pct).toBeGreaterThan(50);
    expect(pct).toBeLessThan(100);
  });

  it('restituisce percentuale bassa per dati minimi', () => {
    const data: RT1WizardData = {
      version: '',
      created_by: '',
      descrizione_studio: makeDescrizione({
        tipologia_giuridica: '',
        anno_inizio_attivita: '',
        sedi: '',
        organizzazione_interna: '',
      }),
      risposte_dettagliate: makeRisposte({
        tipologia_clientela: null,
        area_geografica_operativita: null,
        canali_distributivi: null,
        servizi_professionali_offerti: null,
        formazione: null,
        organizzazione_adeguata_verifica: null,
        organizzazione_conservazione: null,
        organizzazione_segnalazione_sos: null,
      }),
      piano_mitigazione: '',
    };
    expect(calculateCompletionPercentage(data)).toBe(0);
  });
});

// ==================== getLastCompletedStep ====================
describe('getLastCompletedStep', () => {
  it('restituisce 1 se step 1 incompleto', () => {
    const data = makeWizardData({
      descrizione_studio: makeDescrizione({ tipologia_giuridica: '' }),
    });
    expect(getLastCompletedStep(data)).toBe(1);
  });

  it('restituisce 8 se tutto completo', () => {
    const data = makeWizardData();
    expect(getLastCompletedStep(data)).toBe(8);
  });

  it('restituisce 2 se tipologia_clientela non compilata', () => {
    const data = makeWizardData({
      risposte_dettagliate: makeRisposte({ tipologia_clientela: null }),
    });
    expect(getLastCompletedStep(data)).toBe(2);
  });

  it('restituisce 7 se organizzazione incompleta', () => {
    const data = makeWizardData({
      risposte_dettagliate: makeRisposte({ organizzazione_segnalazione_sos: null }),
    });
    expect(getLastCompletedStep(data)).toBe(7);
  });
});

// ==================== convertLegacyData ====================
describe('convertLegacyData', () => {
  it('converte fattori inerenti legacy', () => {
    const legacy = {
      fattori_inerenti: { clientTypes: 3, geography: 2, channels: 1, services: 4 },
    };
    const result = convertLegacyData(legacy);
    expect(result.tipologia_clientela?.scelta_valore).toBe(3);
    expect(result.area_geografica_operativita?.scelta_valore).toBe(2);
    expect(result.canali_distributivi?.scelta_valore).toBe(1);
    expect(result.servizi_professionali_offerti?.scelta_valore).toBe(4);
  });

  it('converte fattori vulnerabilità legacy', () => {
    const legacy = {
      fattori_vulnerabilita: { training: 1, kycOrg: 2, retentionOrg: 3, sosCashControls: 4 },
    };
    const result = convertLegacyData(legacy);
    expect(result.formazione?.scelta_valore).toBe(1);
    expect(result.organizzazione_adeguata_verifica?.scelta_valore).toBe(2);
    expect(result.organizzazione_conservazione?.scelta_valore).toBe(3);
    expect(result.organizzazione_segnalazione_sos?.scelta_valore).toBe(4);
  });

  it('gestisce dati legacy vuoti', () => {
    const result = convertLegacyData({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('converte dati completi (inerenti + vulnerabilità)', () => {
    const legacy = {
      fattori_inerenti: { clientTypes: 2, geography: 3, channels: 1, services: 2 },
      fattori_vulnerabilita: { training: 1, kycOrg: 2, retentionOrg: 2, sosCashControls: 1 },
    };
    const result = convertLegacyData(legacy);
    expect(Object.keys(result)).toHaveLength(8);
  });
});
