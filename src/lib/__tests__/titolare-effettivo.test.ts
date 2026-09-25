import { describe, it, expect } from 'vitest';
import {
  analizzaTitolareEffettivo,
  creaCatenaVuota,
  aggiungiNodo,
  aggiungiArco,
  generaId,
  CatenaControllo,
  NodoPartecipativo,
  ArcoPartecipativo,
} from '../titolare-effettivo';

// ==================== Helper ====================

function makeNodoPF(nome: string, overrides?: Partial<NodoPartecipativo>): NodoPartecipativo {
  return {
    id: `pf-${nome.toLowerCase().replace(/\s/g, '-')}`,
    tipo: 'persona_fisica',
    denominazione: nome,
    nome_cognome: nome,
    ...overrides,
  };
}

function makeNodoSocieta(nome: string, overrides?: Partial<NodoPartecipativo>): NodoPartecipativo {
  return {
    id: `soc-${nome.toLowerCase().replace(/\s/g, '-')}`,
    tipo: 'societa_capitali',
    denominazione: nome,
    natura_giuridica: 'SRL',
    ...overrides,
  };
}

function makeArco(
  daId: string, aId: string,
  percentuale: number,
  overrides?: Partial<ArcoPartecipativo>
): ArcoPartecipativo {
  return {
    id: `arco-${daId}-${aId}`,
    da_nodo_id: daId,
    a_nodo_id: aId,
    percentuale_capitale: percentuale,
    tipo_controllo: 'proprieta_diretta',
    ...overrides,
  };
}

// ==================== PERSONA FISICA ====================

describe('analizzaTitolareEffettivo - Persona Fisica', () => {
  it('persona fisica: TE coincide con il cliente', () => {
    const pf = makeNodoPF('Mario Rossi');
    const catena = creaCatenaVuota(pf);

    const result = analizzaTitolareEffettivo(catena);
    expect(result.titolari).toHaveLength(1);
    expect(result.titolari[0].nodo.id).toBe(pf.id);
    expect(result.titolari[0].percentuale_totale).toBe(100);
    expect(result.obbligoAstensione).toBe(false);
  });
});

// ==================== PROPRIETÀ DIRETTA (art. 20, co. 1) ====================

describe('analizzaTitolareEffettivo - Proprietà Diretta', () => {
  it('un socio al 100% è TE', () => {
    const societa = makeNodoSocieta('Alfa SRL');
    const socio = makeNodoPF('Mario Rossi');

    let catena = creaCatenaVuota(societa);
    catena = aggiungiNodo(catena, socio);
    catena = aggiungiArco(catena, makeArco(socio.id, societa.id, 100));

    const result = analizzaTitolareEffettivo(catena);
    expect(result.titolari).toHaveLength(1);
    expect(result.titolari[0].nodo.id).toBe(socio.id);
    expect(result.titolari[0].percentuale_diretta).toBe(100);
    expect(result.criterioApplicato).toBe('proprieta');
  });

  it('tre soci al 33/33/34% sono tutti TE (tutti > 25%)', () => {
    // Esempio dal documento CNDCEC par. 3.3.1
    const societa = makeNodoSocieta('Beta SRL');
    const socioA = makeNodoPF('Socio A');
    const socioB = makeNodoPF('Socio B');
    const socioC = makeNodoPF('Socio C');

    let catena = creaCatenaVuota(societa);
    catena = aggiungiNodo(catena, socioA);
    catena = aggiungiNodo(catena, socioB);
    catena = aggiungiNodo(catena, socioC);
    catena = aggiungiArco(catena, makeArco(socioA.id, societa.id, 33));
    catena = aggiungiArco(catena, makeArco(socioB.id, societa.id, 33));
    catena = aggiungiArco(catena, makeArco(socioC.id, societa.id, 34));

    const result = analizzaTitolareEffettivo(catena);
    expect(result.titolari).toHaveLength(3);
    expect(result.criterioApplicato).toBe('proprieta');
  });

  it('socio al 25% esatto NON è TE (soglia è > 25%, non >= 25%)', () => {
    const societa = makeNodoSocieta('Gamma SRL');
    const socioA = makeNodoPF('Socio A');
    const socioB = makeNodoPF('Socio B');
    const socioC = makeNodoPF('Socio C');
    const socioD = makeNodoPF('Socio D');

    let catena = creaCatenaVuota(societa);
    catena = aggiungiNodo(catena, socioA);
    catena = aggiungiNodo(catena, socioB);
    catena = aggiungiNodo(catena, socioC);
    catena = aggiungiNodo(catena, socioD);
    catena = aggiungiArco(catena, makeArco(socioA.id, societa.id, 25));
    catena = aggiungiArco(catena, makeArco(socioB.id, societa.id, 25));
    catena = aggiungiArco(catena, makeArco(socioC.id, societa.id, 25));
    catena = aggiungiArco(catena, makeArco(socioD.id, societa.id, 25));

    const result = analizzaTitolareEffettivo(catena);
    // Nessuno supera il 25%, si passa al criterio del controllo
    expect(result.titolari).toHaveLength(0);
    expect(result.criterioApplicato).not.toBe('proprieta');
  });

  it('socio al 26% è TE, socio al 24% no', () => {
    const societa = makeNodoSocieta('Delta SRL');
    const socioA = makeNodoPF('Socio A');
    const socioB = makeNodoPF('Socio B');

    let catena = creaCatenaVuota(societa);
    catena = aggiungiNodo(catena, socioA);
    catena = aggiungiNodo(catena, socioB);
    catena = aggiungiArco(catena, makeArco(socioA.id, societa.id, 26));
    catena = aggiungiArco(catena, makeArco(socioB.id, societa.id, 24));

    const result = analizzaTitolareEffettivo(catena);
    expect(result.titolari).toHaveLength(1);
    expect(result.titolari[0].nodo.id).toBe(socioA.id);
  });
});

// ==================== PROPRIETÀ INDIRETTA (art. 20, co. 2) ====================

describe('analizzaTitolareEffettivo - Proprietà Indiretta', () => {
  it('catena semplice: A controlla X (60%), X detiene 40% del cliente', () => {
    // A(PF) → 60% → X(SRL) → 40% → Cliente(SRL)
    const cliente = makeNodoSocieta('Cliente SRL');
    const socX = makeNodoSocieta('Holding X SRL');
    const socioA = makeNodoPF('Socio A');

    let catena = creaCatenaVuota(cliente);
    catena = aggiungiNodo(catena, socX);
    catena = aggiungiNodo(catena, socioA);
    catena = aggiungiArco(catena, makeArco(socX.id, cliente.id, 40));
    catena = aggiungiArco(catena, makeArco(socioA.id, socX.id, 60, {
      tipo_controllo: 'proprieta_diretta',
    }));

    const result = analizzaTitolareEffettivo(catena);
    expect(result.titolari).toHaveLength(1);
    expect(result.titolari[0].nodo.id).toBe(socioA.id);
    expect(result.titolari[0].percentuale_indiretta).toBe(40);
    expect(result.titolari[0].criterio).toBe('proprieta');
  });

  it('catena: A NON controlla X (30%), X detiene 40% → A non è TE via proprietà', () => {
    const cliente = makeNodoSocieta('Cliente SRL');
    const socX = makeNodoSocieta('Holding X SRL');
    const socioA = makeNodoPF('Socio A');

    let catena = creaCatenaVuota(cliente);
    catena = aggiungiNodo(catena, socX);
    catena = aggiungiNodo(catena, socioA);
    catena = aggiungiArco(catena, makeArco(socX.id, cliente.id, 40));
    catena = aggiungiArco(catena, makeArco(socioA.id, socX.id, 30, {
      tipo_controllo: 'proprieta_diretta',
    }));

    const result = analizzaTitolareEffettivo(catena);
    // A non controlla X (30% < 50%), non si propaga la partecipazione
    const teA = result.titolari.find(t => t.nodo.id === socioA.id && t.criterio === 'proprieta');
    expect(teA).toBeUndefined();
  });

  it('proprietà mista diretta + indiretta che supera 25%', () => {
    // A detiene 15% diretto nel cliente + controlla X(60%) che detiene 15% del cliente
    // Totale A = 15% diretta + 15% indiretta = 30% > 25%
    const cliente = makeNodoSocieta('Cliente SRL');
    const socX = makeNodoSocieta('Holding X SRL');
    const socioA = makeNodoPF('Socio A');

    let catena = creaCatenaVuota(cliente);
    catena = aggiungiNodo(catena, socX);
    catena = aggiungiNodo(catena, socioA);
    catena = aggiungiArco(catena, makeArco(socioA.id, cliente.id, 15)); // diretta
    catena = aggiungiArco(catena, makeArco(socX.id, cliente.id, 15)); // X detiene 15%
    catena = aggiungiArco(catena, makeArco(socioA.id, socX.id, 60)); // A controlla X

    const result = analizzaTitolareEffettivo(catena);
    expect(result.titolari).toHaveLength(1);
    expect(result.titolari[0].nodo.id).toBe(socioA.id);
    expect(result.titolari[0].percentuale_diretta).toBe(15);
    expect(result.titolari[0].percentuale_indiretta).toBe(15);
    expect(result.titolari[0].percentuale_totale).toBe(30);
  });
});

// ==================== CONTROLLO (art. 20, co. 3) ====================

describe('analizzaTitolareEffettivo - Criterio del Controllo', () => {
  it('socio con >50% dei voti in assemblea ordinaria ma <=25% del capitale', () => {
    const cliente = makeNodoSocieta('Cliente SRL');
    const socioA = makeNodoPF('Socio A');
    const socioB = makeNodoPF('Socio B');
    const socioC = makeNodoPF('Socio C');
    const socioD = makeNodoPF('Socio D');
    const socioE = makeNodoPF('Socio E');

    let catena = creaCatenaVuota(cliente);
    catena = aggiungiNodo(catena, socioA);
    catena = aggiungiNodo(catena, socioB);
    catena = aggiungiNodo(catena, socioC);
    catena = aggiungiNodo(catena, socioD);
    catena = aggiungiNodo(catena, socioE);
    // 5 soci al 20% ciascuno, nessuno supera 25%
    catena = aggiungiArco(catena, makeArco(socioA.id, cliente.id, 20, {
      percentuale_voti: 60, // Voto triplo → influenza dominante
      tipo_controllo: 'maggioranza_voti',
    }));
    catena = aggiungiArco(catena, makeArco(socioB.id, cliente.id, 20, { percentuale_voti: 10 }));
    catena = aggiungiArco(catena, makeArco(socioC.id, cliente.id, 20, { percentuale_voti: 10 }));
    catena = aggiungiArco(catena, makeArco(socioD.id, cliente.id, 20, { percentuale_voti: 10 }));
    catena = aggiungiArco(catena, makeArco(socioE.id, cliente.id, 20, { percentuale_voti: 10 }));

    const result = analizzaTitolareEffettivo(catena);
    expect(result.criterioApplicato).toBe('controllo');
    expect(result.titolari).toHaveLength(1);
    expect(result.titolari[0].nodo.id).toBe(socioA.id);
  });

  it('patto parasociale: socio A (16%) controlla tramite sindacato di voto (30% totale)', () => {
    // Esempio dal documento CNDCEC par. 3.3.3
    const cliente = makeNodoSocieta('Cliente SRL');
    const socioA = makeNodoPF('Socio A');

    let catena = creaCatenaVuota(cliente);
    catena = aggiungiNodo(catena, socioA);
    catena = aggiungiArco(catena, makeArco(socioA.id, cliente.id, 16, {
      percentuale_voti: 30, // 16% diretto + 14% via sindacato
      tipo_controllo: 'patto_parasociale',
      note: 'Sindacato di voto con soci B(4%), C(4%), D(3%), E(3%)',
    }));

    const result = analizzaTitolareEffettivo(catena);
    expect(result.criterioApplicato).toBe('controllo');
    expect(result.titolari).toHaveLength(1);
    expect(result.titolari[0].nodo.id).toBe(socioA.id);
    expect(result.titolari[0].tipo_controllo).toBe('patto_parasociale');
  });
});

// ==================== CRITERIO RESIDUALE (art. 20, co. 5) ====================

describe('analizzaTitolareEffettivo - Criterio Residuale', () => {
  it('nessuna proprietà né controllo → TE è chi amministra', () => {
    const cliente = makeNodoSocieta('Cliente SRL');
    const admin = makeNodoPF('Amministratore Unico');

    let catena = creaCatenaVuota(cliente);
    catena = aggiungiNodo(catena, admin);
    catena = aggiungiArco(catena, makeArco(admin.id, cliente.id, 5, {
      tipo_controllo: 'residuale_amministrazione',
      note: 'Amministratore unico nominato dall\'assemblea',
    }));

    const result = analizzaTitolareEffettivo(catena);
    expect(result.criterioApplicato).toBe('residuale');
    expect(result.titolari).toHaveLength(1);
    expect(result.titolari[0].nodo.id).toBe(admin.id);
    expect(result.titolari[0].tipo_controllo).toBe('residuale_amministrazione');
  });
});

// ==================== OBBLIGO DI ASTENSIONE ====================

describe('analizzaTitolareEffettivo - Obbligo di Astensione', () => {
  it('nessun TE individuabile → obbligo di astensione', () => {
    const cliente = makeNodoSocieta('Cliente SRL');

    const catena = creaCatenaVuota(cliente);
    // Nessun nodo aggiuntivo, nessun arco

    const result = analizzaTitolareEffettivo(catena);
    expect(result.obbligoAstensione).toBe(true);
    expect(result.titolari).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ==================== PPE ====================

describe('analizzaTitolareEffettivo - PPE', () => {
  it('segnala warning se TE è PPE', () => {
    const societa = makeNodoSocieta('Epsilon SRL');
    const pep = makeNodoPF('On. Giovanni Bianchi', { is_pep: true, pep_carica: 'Parlamentare' });

    let catena = creaCatenaVuota(societa);
    catena = aggiungiNodo(catena, pep);
    catena = aggiungiArco(catena, makeArco(pep.id, societa.id, 60));

    const result = analizzaTitolareEffettivo(catena);
    expect(result.titolari).toHaveLength(1);
    expect(result.warnings.some(w => w.includes('PPE'))).toBe(true);
  });
});

// ==================== UTILITY ====================

describe('utility catena', () => {
  it('generaId produce stringhe uniche', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generaId()));
    expect(ids.size).toBe(100);
  });

  it('creaCatenaVuota inizializza correttamente', () => {
    const nodo = makeNodoSocieta('Test SRL');
    const catena = creaCatenaVuota(nodo);
    expect(catena.clienteNodoId).toBe(nodo.id);
    expect(catena.nodi).toHaveLength(1);
    expect(catena.archi).toHaveLength(0);
  });

  it('aggiungiNodo non duplica', () => {
    const nodo = makeNodoSocieta('Test SRL');
    let catena = creaCatenaVuota(nodo);
    catena = aggiungiNodo(catena, nodo);
    expect(catena.nodi).toHaveLength(1);
  });
});
