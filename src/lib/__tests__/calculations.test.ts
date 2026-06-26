import { describe, it, expect } from 'vitest';
import {
  calculateRT1Scores,
  calculateRT2Scores,
  createDefaultFattore,
  createDefaultTabellaA,
  createDefaultTabellaB,
  clampScore,
  isValidScore,
  classificaRischioEffettivo,
  daysBetween,
  addYears,
  addMonths,
  RT1Factors,
  RT2TabellaA,
  RT2TabellaB,
} from '../calculations';

// ==================== Utility functions ====================
describe('clampScore', () => {
  it('mantiene valori validi invariati', () => {
    expect(clampScore(1)).toBe(1);
    expect(clampScore(2)).toBe(2);
    expect(clampScore(3)).toBe(3);
    expect(clampScore(4)).toBe(4);
  });

  it('vincola valori sotto il minimo a 1', () => {
    expect(clampScore(0)).toBe(1);
    expect(clampScore(-1)).toBe(1);
  });

  it('vincola valori sopra il massimo a 4', () => {
    expect(clampScore(5)).toBe(4);
    expect(clampScore(100)).toBe(4);
  });

  it('arrotonda valori decimali', () => {
    expect(clampScore(1.4)).toBe(1);
    expect(clampScore(1.6)).toBe(2);
    expect(clampScore(3.5)).toBe(4);
  });
});

describe('isValidScore', () => {
  it('accetta valori 1-4', () => {
    expect(isValidScore(1)).toBe(true);
    expect(isValidScore(2.5)).toBe(true);
    expect(isValidScore(4)).toBe(true);
  });

  it('rifiuta valori fuori range', () => {
    expect(isValidScore(0)).toBe(false);
    expect(isValidScore(5)).toBe(false);
    expect(isValidScore(-1)).toBe(false);
  });

  it('rifiuta valori non finiti', () => {
    expect(isValidScore(NaN)).toBe(false);
    expect(isValidScore(Infinity)).toBe(false);
  });
});

// ==================== classificaRischioEffettivo ====================
describe('classificaRischioEffettivo', () => {
  it('classifica 1.0-1.5 come Non significativo / Semplificata', () => {
    expect(classificaRischioEffettivo(1.0).classe).toBe(1);
    expect(classificaRischioEffettivo(1.0).tipoVerifica).toBe('semplificata');
    expect(classificaRischioEffettivo(1.5).classe).toBe(1);
  });

  it('classifica 1.6-2.5 come Poco significativo / Semplificata', () => {
    expect(classificaRischioEffettivo(1.6).classe).toBe(2);
    expect(classificaRischioEffettivo(1.6).tipoVerifica).toBe('semplificata');
    expect(classificaRischioEffettivo(2.5).classe).toBe(2);
  });

  it('classifica 2.6-3.5 come Abbastanza significativo / Ordinaria', () => {
    expect(classificaRischioEffettivo(2.6).classe).toBe(3);
    expect(classificaRischioEffettivo(2.6).tipoVerifica).toBe('ordinaria');
    expect(classificaRischioEffettivo(3.5).classe).toBe(3);
  });

  it('classifica 3.6-4.0 come Molto significativo / Rafforzata', () => {
    expect(classificaRischioEffettivo(3.6).classe).toBe(4);
    expect(classificaRischioEffettivo(3.6).tipoVerifica).toBe('rafforzata');
    expect(classificaRischioEffettivo(4.0).classe).toBe(4);
  });

  it('assegna periodicità controllo corretta', () => {
    expect(classificaRischioEffettivo(1.0).periodicitaControlloMesi).toBe(36);
    expect(classificaRischioEffettivo(2.0).periodicitaControlloMesi).toBe(24);
    expect(classificaRischioEffettivo(3.0).periodicitaControlloMesi).toBe(12);
    expect(classificaRischioEffettivo(4.0).periodicitaControlloMesi).toBe(6);
  });
});

// ==================== calculateRT1Scores ====================
describe('calculateRT1Scores', () => {
  it('calcola media inerente come media dei 4 fattori', () => {
    const factors: RT1Factors = {
      clientTypes: 1, geography: 2, channels: 3, services: 4,
      training: 1, kycOrg: 1, retentionOrg: 1, sosCashControls: 1,
    };
    const result = calculateRT1Scores(factors);
    expect(result.inerente).toBe(2.5);
  });

  it('calcola media vulnerabilità come media dei 4 fattori', () => {
    const factors: RT1Factors = {
      clientTypes: 1, geography: 1, channels: 1, services: 1,
      training: 2, kycOrg: 3, retentionOrg: 4, sosCashControls: 1,
    };
    const result = calculateRT1Scores(factors);
    expect(result.vulnerabilita).toBe(2.5);
  });

  it('calcola residuo come 40% inerente + 60% vulnerabilità', () => {
    const factors: RT1Factors = {
      clientTypes: 4, geography: 4, channels: 4, services: 4,
      training: 1, kycOrg: 1, retentionOrg: 1, sosCashControls: 1,
    };
    const result = calculateRT1Scores(factors);
    expect(result.inerente).toBe(4);
    expect(result.vulnerabilita).toBe(1);
    expect(result.residuo).toBe(2.2);
  });

  it('gestisce valori tutti uguali', () => {
    const factors: RT1Factors = {
      clientTypes: 3, geography: 3, channels: 3, services: 3,
      training: 3, kycOrg: 3, retentionOrg: 3, sosCashControls: 3,
    };
    const result = calculateRT1Scores(factors);
    expect(result.inerente).toBe(3);
    expect(result.vulnerabilita).toBe(3);
    expect(result.residuo).toBe(3);
  });

  it('arrotonda a 2 decimali', () => {
    const factors: RT1Factors = {
      clientTypes: 1, geography: 2, channels: 3, services: 1,
      training: 3, kycOrg: 2, retentionOrg: 1, sosCashControls: 4,
    };
    const result = calculateRT1Scores(factors);
    expect(result.inerente).toBe(1.75);
    expect(result.vulnerabilita).toBe(2.5);
    expect(result.residuo).toBe(2.2);
  });

  it('include classificazione del rischio residuo', () => {
    const factors: RT1Factors = {
      clientTypes: 4, geography: 4, channels: 4, services: 4,
      training: 4, kycOrg: 4, retentionOrg: 4, sosCashControls: 4,
    };
    const result = calculateRT1Scores(factors);
    expect(result.classificazione.classe).toBe(4);
    expect(result.classificazione.tipoVerifica).toBe('rafforzata');
  });

  it('vincola valori fuori range a 1-4', () => {
    const factors: RT1Factors = {
      clientTypes: 0, geography: 5, channels: -1, services: 10,
      training: 0, kycOrg: 0, retentionOrg: 0, sosCashControls: 0,
    };
    const result = calculateRT1Scores(factors);
    // clampScore(0)=1, clampScore(5)=4, clampScore(-1)=1, clampScore(10)=4
    // inerente = (1+4+1+4)/4 = 2.5
    expect(result.inerente).toBe(2.5);
    // vulnerabilità = (1+1+1+1)/4 = 1
    expect(result.vulnerabilita).toBe(1);
  });

  // Verifica matrice completa RT1 (Linee Guida par. 4, pag. 17)
  it('verifica matrice: inerente NS + vulnerabilità NS = residuo 1.0', () => {
    const factors: RT1Factors = {
      clientTypes: 1, geography: 1, channels: 1, services: 1,
      training: 1, kycOrg: 1, retentionOrg: 1, sosCashControls: 1,
    };
    const r = calculateRT1Scores(factors);
    expect(r.residuo).toBe(1); // 0.4*1 + 0.6*1 = 1.0
  });

  it('verifica matrice: inerente MS + vulnerabilità NS = residuo 2.2', () => {
    const factors: RT1Factors = {
      clientTypes: 4, geography: 4, channels: 4, services: 4,
      training: 1, kycOrg: 1, retentionOrg: 1, sosCashControls: 1,
    };
    const r = calculateRT1Scores(factors);
    expect(r.residuo).toBe(2.2); // 0.4*4 + 0.6*1 = 2.2
  });

  it('verifica matrice: inerente NS + vulnerabilità MS = residuo 2.8', () => {
    const factors: RT1Factors = {
      clientTypes: 1, geography: 1, channels: 1, services: 1,
      training: 4, kycOrg: 4, retentionOrg: 4, sosCashControls: 4,
    };
    const r = calculateRT1Scores(factors);
    expect(r.residuo).toBe(2.8); // 0.4*1 + 0.6*4 = 2.8
  });

  it('verifica matrice: inerente MS + vulnerabilità MS = residuo 4.0', () => {
    const factors: RT1Factors = {
      clientTypes: 4, geography: 4, channels: 4, services: 4,
      training: 4, kycOrg: 4, retentionOrg: 4, sosCashControls: 4,
    };
    const r = calculateRT1Scores(factors);
    expect(r.residuo).toBe(4); // 0.4*4 + 0.6*4 = 4.0
  });
});

// ==================== calculateRT2Scores ====================
describe('calculateRT2Scores', () => {
  const makeTabellaA = (scores: [number, number, number, number]): RT2TabellaA => ({
    naturaGiuridica: { score: scores[0], fattoriSelezionati: [], altro: '' },
    attivitaPrevalente: { score: scores[1], fattoriSelezionati: [], altro: '' },
    comportamentoConferimento: { score: scores[2], fattoriSelezionati: [], altro: '' },
    areaClienteControparte: { score: scores[3], fattoriSelezionati: [], altro: '' },
  });

  const makeTabellaB = (scores: [number, number, number, number, number, number]): RT2TabellaB => ({
    tipologia: { score: scores[0], fattoriSelezionati: [], altro: '' },
    modalita: { score: scores[1], fattoriSelezionati: [], altro: '' },
    ammontare: { score: scores[2], fattoriSelezionati: [], altro: '' },
    frequenzaVolumeDurata: { score: scores[3], fattoriSelezionati: [], altro: '' },
    ragionevolezza: { score: scores[4], fattoriSelezionati: [], altro: '' },
    areaDestinazione: { score: scores[5], fattoriSelezionati: [], altro: '' },
  });

  it('calcola rischio specifico standard con TabellaA + TabellaB', () => {
    const tabA = makeTabellaA([2, 2, 2, 2]);
    const tabB = makeTabellaB([3, 3, 3, 3, 3, 3]);
    const result = calculateRT2Scores('consulenza-tributaria', tabA, tabB);
    expect(result.inerentePrestazione).toBe(2);
    expect(result.rischioSpecifico).toBe(2.6);
    expect(result.rischioEffettivo).toBe(2.42);
    expect(result.isPepForced).toBe(false);
  });

  it('calcola rischio specifico solo TabellaA per prestazioni onlyTabA', () => {
    const tabA = makeTabellaA([2, 3, 2, 1]);
    const tabB = makeTabellaB([4, 4, 4, 4, 4, 4]);
    const result = calculateRT2Scores('collegio-sindacale-no-revisione', tabA, tabB);
    expect(result.inerentePrestazione).toBe(1);
    expect(result.rischioSpecifico).toBe(2);
    expect(result.rischioEffettivo).toBe(1.7);
  });

  it('calcola rischio specifico solo TabellaA quando tabellaB non fornita', () => {
    const tabA = makeTabellaA([1, 1, 1, 1]);
    const result = calculateRT2Scores('visto-conformita', tabA);
    expect(result.rischioSpecifico).toBe(1);
    expect(result.rischioEffettivo).toBe(1);
  });

  it('forza rischioEffettivo a 4.0 con flag PEP ma mantiene il calcolo', () => {
    const tabA = makeTabellaA([1, 1, 1, 1]);
    const result = calculateRT2Scores('visto-conformita', tabA, undefined, true);
    expect(result.rischioEffettivo).toBe(4.0);
    expect(result.rischioEffettivoCalcolato).toBe(1); // Il calcolo reale senza PPE
    expect(result.isPepForced).toBe(true);
    expect(result.classificazione.tipoVerifica).toBe('rafforzata');
  });

  it('lancia errore per prestazione non trovata', () => {
    const tabA = makeTabellaA([1, 1, 1, 1]);
    expect(() => calculateRT2Scores('non-esiste', tabA)).toThrowError('Prestazione non-esiste not found');
  });

  it('calcola correttamente con prestazione a rischio 4', () => {
    const tabA = makeTabellaA([4, 4, 4, 4]);
    const tabB = makeTabellaB([4, 4, 4, 4, 4, 4]);
    const result = calculateRT2Scores('finanza-straordinaria', tabA, tabB);
    expect(result.inerentePrestazione).toBe(4);
    expect(result.rischioSpecifico).toBe(4);
    expect(result.rischioEffettivo).toBe(4);
  });

  it('include classificazione del rischio', () => {
    const tabA = makeTabellaA([1, 1, 1, 1]);
    const result = calculateRT2Scores('visto-conformita', tabA);
    expect(result.classificazione).toBeDefined();
    expect(result.classificazione.classe).toBe(1);
    expect(result.classificazione.tipoVerifica).toBe('semplificata');
  });

  // Prestazioni multiple (Linee Guida par. 2.1, pag. 25)
  it('con prestazioni multiple usa il rischio inerente più alto', () => {
    const tabA = makeTabellaA([2, 2, 2, 2]);
    const tabB = makeTabellaB([2, 2, 2, 2, 2, 2]);
    // consulenza-tributaria = inherentRisk 2, finanza-straordinaria = inherentRisk 4
    const result = calculateRT2Scores(
      ['consulenza-tributaria', 'finanza-straordinaria'],
      tabA, tabB
    );
    expect(result.inerentePrestazione).toBe(4); // Max tra 2 e 4
    // rischioSpecifico = (8 + 12) / 10 = 2
    expect(result.rischioSpecifico).toBe(2);
    // rischioEffettivo = 0.3*4 + 0.7*2 = 1.2 + 1.4 = 2.6
    expect(result.rischioEffettivo).toBe(2.6);
  });

  it('lancia errore per lista prestazioni vuota', () => {
    const tabA = makeTabellaA([1, 1, 1, 1]);
    expect(() => calculateRT2Scores([], tabA)).toThrowError('Almeno una prestazione è richiesta');
  });

  it('vincola score fuori range 1-4', () => {
    const tabA = makeTabellaA([0, 5, -1, 10]); // → clamped a [1, 4, 1, 4] = totA=10
    const result = calculateRT2Scores('visto-conformita', tabA);
    // rischioSpecifico = 10/4 = 2.5
    expect(result.rischioSpecifico).toBe(2.5);
  });

  // Verifica matrice completa RT2 (Linee Guida par. 2.3, pag. 29)
  describe('matrice rischio effettivo RT2', () => {
    // Helper: crea scores per ottenere un rischio specifico target
    const makeScoresForSpecifico = (target: number): { tabA: RT2TabellaA; tabB: RT2TabellaB } => ({
      tabA: makeTabellaA([target, target, target, target]),
      tabB: makeTabellaB([target, target, target, target, target, target]),
    });

    it('R_in=1 R_sp=1 → 1.00', () => {
      const { tabA, tabB } = makeScoresForSpecifico(1);
      const r = calculateRT2Scores('visto-conformita', tabA, tabB);
      expect(r.rischioEffettivo).toBe(1);
    });

    it('R_in=2 R_sp=1 → 1.30', () => {
      const { tabA, tabB } = makeScoresForSpecifico(1);
      const r = calculateRT2Scores('consulenza-tributaria', tabA, tabB);
      expect(r.rischioEffettivo).toBe(1.3);
    });

    it('R_in=1 R_sp=4 → 3.10', () => {
      const { tabA, tabB } = makeScoresForSpecifico(4);
      const r = calculateRT2Scores('visto-conformita', tabA, tabB);
      expect(r.rischioEffettivo).toBe(3.1);
    });

    it('R_in=4 R_sp=4 → 4.00', () => {
      const { tabA, tabB } = makeScoresForSpecifico(4);
      const r = calculateRT2Scores('finanza-straordinaria', tabA, tabB);
      expect(r.rischioEffettivo).toBe(4);
    });

    it('R_in=3 R_sp=2 → 2.30', () => {
      const { tabA, tabB } = makeScoresForSpecifico(2);
      const r = calculateRT2Scores('tenuta-contabilita', tabA, tabB);
      // tenuta-contabilita ha inherentRisk=3 e onlyTabA=true
      // rischioSpecifico = 8/4 = 2 (solo TabellaA)
      // rischioEffettivo = 0.3*3 + 0.7*2 = 0.9 + 1.4 = 2.3
      expect(r.rischioEffettivo).toBe(2.3);
    });
  });
});

// ==================== Factory functions ====================
describe('createDefaultFattore', () => {
  it('crea fattore con score default = 1', () => {
    const f = createDefaultFattore();
    expect(f.score).toBe(1);
    expect(f.fattoriSelezionati).toEqual([]);
    expect(f.altro).toBe('');
  });

  it('crea fattore con score personalizzato', () => {
    const f = createDefaultFattore(3);
    expect(f.score).toBe(3);
  });
});

describe('createDefaultTabellaA', () => {
  it('crea tabellaA con 4 fattori default', () => {
    const t = createDefaultTabellaA();
    expect(t.naturaGiuridica.score).toBe(1);
    expect(t.attivitaPrevalente.score).toBe(1);
    expect(t.comportamentoConferimento.score).toBe(1);
    expect(t.areaClienteControparte.score).toBe(1);
  });
});

describe('createDefaultTabellaB', () => {
  it('crea tabellaB con 6 fattori default', () => {
    const t = createDefaultTabellaB();
    expect(t.tipologia.score).toBe(1);
    expect(t.modalita.score).toBe(1);
    expect(t.ammontare.score).toBe(1);
    expect(t.frequenzaVolumeDurata.score).toBe(1);
    expect(t.ragionevolezza.score).toBe(1);
    expect(t.areaDestinazione.score).toBe(1);
  });
});

// ==================== Date utilities ====================
describe('daysBetween', () => {
  it('calcola giorni tra due date', () => {
    const d1 = new Date(2025, 0, 1);
    const d2 = new Date(2025, 0, 11);
    expect(daysBetween(d1, d2)).toBe(10);
  });

  it('è simmetrico (ordine non conta)', () => {
    const d1 = new Date(2025, 0, 1);
    const d2 = new Date(2025, 0, 11);
    expect(daysBetween(d2, d1)).toBe(10);
  });

  it('restituisce 0 per la stessa data', () => {
    const d = new Date(2025, 5, 15);
    expect(daysBetween(d, d)).toBe(0);
  });
});

describe('addYears', () => {
  it('aggiunge anni a una data', () => {
    const d = new Date(2025, 0, 15);
    const result = addYears(d, 3);
    expect(result.getFullYear()).toBe(2028);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(15);
  });

  it('non modifica la data originale', () => {
    const d = new Date(2025, 0, 15);
    addYears(d, 3);
    expect(d.getFullYear()).toBe(2025);
  });
});

describe('addMonths', () => {
  it('aggiunge mesi a una data', () => {
    const d = new Date(2025, 0, 15);
    const result = addMonths(d, 6);
    expect(result.getMonth()).toBe(6);
    expect(result.getFullYear()).toBe(2025);
  });

  it('gestisce overflow anno', () => {
    const d = new Date(2025, 10, 15);
    const result = addMonths(d, 3);
    expect(result.getMonth()).toBe(1);
    expect(result.getFullYear()).toBe(2026);
  });

  it('non modifica la data originale', () => {
    const d = new Date(2025, 0, 15);
    addMonths(d, 6);
    expect(d.getMonth()).toBe(0);
  });
});
