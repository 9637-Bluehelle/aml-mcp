import { describe, it, expect } from 'vitest';
import {
  PIANI_FALLBACK,
  PIANO_LABEL,
  TIER,
  isPianoPagamento,
  limitiDi,
  pianiPubbliciFallback,
  type PianoCodice,
} from '../piani';

/**
 * Il catalogo dei piani vive nel DB, ma queste mappe statiche gli corrono
 * accanto: aggiungere un piano e dimenticarne una non produce un errore di
 * compilazione dove conta (il codice arriva dal database come stringa), solo un
 * comportamento sbagliato in produzione. Qui si verifica che restino complete.
 */
const CODICI = Object.keys(PIANI_FALLBACK) as PianoCodice[];

describe('catalogo piani', () => {
  it('ha una posizione in scala per ogni piano', () => {
    // Un piano fuori da TIER renderebbe `undefined` ogni confronto di livello:
    // un upgrade verrebbe scambiato per un downgrade e programmato a fine
    // periodo senza che nessuno paghi il conguaglio.
    for (const codice of CODICI) {
      expect(TIER[codice], `TIER non copre il piano ${codice}`).toBeTypeOf('number');
    }
  });

  it('ha un\'etichetta per ogni piano', () => {
    for (const codice of CODICI) {
      expect(PIANO_LABEL[codice], `PIANO_LABEL non copre il piano ${codice}`).toBeTruthy();
    }
  });

  it('ordina Mini sopra Singolo e sotto Studio', () => {
    // Mini costa quanto Singolo ma aggiunge un posto utente: scendere da Mini a
    // Singolo deve restare un downgrade, quindi soggetto al controllo limiti.
    expect(TIER.singolo).toBeLessThan(TIER.mini);
    expect(TIER.mini).toBeLessThan(TIER.studio);
  });
});

describe('pianiPubbliciFallback', () => {
  it('non espone i piani riservati', () => {
    // È il catalogo mostrato quando il DB non risponde: se lasciasse passare un
    // piano riservato lo vedrebbe chiunque, anche un utente anonimo sulla
    // pagina di registrazione, scavalcando la RLS che lo nasconde.
    expect(pianiPubbliciFallback().some((p) => p.riservato)).toBe(false);
  });

  it('resta ordinato come la pricing page', () => {
    const ordini = pianiPubbliciFallback().map((p) => p.ordine);
    expect(ordini).toEqual([...ordini].sort((a, b) => a - b));
  });
});

describe('limitiDi', () => {
  it('conosce i limiti anche dei piani riservati', () => {
    // Uno studio SU un piano riservato deve poterne leggere i limiti anche
    // quando il catalogo caricato non lo contiene (flag revocato, DB muto).
    expect(limitiDi('mini')?.utenti_max).toBe(2);
    expect(limitiDi('mini')?.collaboratori).toBe(true);
  });
});

describe('isPianoPagamento', () => {
  it('riconosce i piani con abbonamento', () => {
    expect(isPianoPagamento('mini')).toBe(true);
    expect(isPianoPagamento('singolo')).toBe(true);
    expect(isPianoPagamento('studio')).toBe(true);
  });

  it('esclude Free e il piano non ancora noto', () => {
    expect(isPianoPagamento('free')).toBe(false);
    expect(isPianoPagamento(null)).toBe(false);
  });
});
