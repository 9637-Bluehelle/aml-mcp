import { describe, it, expect } from 'vitest';
import {
  DATI_FATTURAZIONE_VUOTI,
  datiFatturazioneCompleti,
  normalizzaDatiFatturazione,
  validaDatiFatturazione,
  type DatiFatturazione,
} from '../fatturazione';

const COMPLETI: DatiFatturazione = {
  partita_iva: '12345678901',
  codice_fiscale: 'RSSMRA80A01H501X',
  pec: 'studio@pec.it',
  codice_sdi: 'ABC1234',
  intestazione_fattura: 'Studio Rossi',
  indirizzo_fatturazione: 'Via Roma, 1',
  cap_fatturazione: '00100',
  citta_fatturazione: 'Roma',
  provincia_fatturazione: 'RM',
};

describe('validaDatiFatturazione — modalità profilo (tutto opzionale)', () => {
  it('accetta dati completamente vuoti: nel profilo si può salvare a metà', () => {
    expect(validaDatiFatturazione(DATI_FATTURAZIONE_VUOTI)).toEqual({});
  });

  it('accetta dati completi', () => {
    expect(validaDatiFatturazione(COMPLETI)).toEqual({});
  });

  it('segnala i formati errati anche se i campi non sono obbligatori', () => {
    const errori = validaDatiFatturazione({
      ...DATI_FATTURAZIONE_VUOTI,
      partita_iva: '123',
      codice_fiscale: 'TROPPOCORTO',
      pec: 'non-una-email',
      codice_sdi: 'AB',
      cap_fatturazione: '1',
      provincia_fatturazione: 'ROMA',
    });
    expect(Object.keys(errori).sort()).toEqual([
      'cap_fatturazione', 'codice_fiscale', 'codice_sdi', 'partita_iva', 'pec', 'provincia_fatturazione',
    ]);
  });

  it('accetta il codice fiscale a 11 cifre delle persone giuridiche', () => {
    expect(validaDatiFatturazione({ ...DATI_FATTURAZIONE_VUOTI, codice_fiscale: '12345678901' })).toEqual({});
  });
});

describe('validaDatiFatturazione — modalità pre-pagamento (richiediCompleti)', () => {
  const conCompleti = (d: DatiFatturazione) => validaDatiFatturazione(d, { richiediCompleti: true });

  it('accetta un set completo', () => {
    expect(conCompleti(COMPLETI)).toEqual({});
  });

  it('pretende intestazione e indirizzo: sono ciò che compare in fattura', () => {
    const errori = conCompleti({ ...COMPLETI, intestazione_fattura: '  ', indirizzo_fatturazione: '' });
    expect(errori.intestazione_fattura).toBeTruthy();
    expect(errori.indirizzo_fatturazione).toBeTruthy();
  });

  it('pretende sia la P.IVA sia il Codice Fiscale', () => {
    expect(conCompleti({ ...COMPLETI, partita_iva: '' }).partita_iva).toBeTruthy();
    expect(conCompleti({ ...COMPLETI, codice_fiscale: '' }).codice_fiscale).toBeTruthy();
  });

  it('pretende CAP, città e provincia: la fattura vuole l’indirizzo completo', () => {
    const errori = conCompleti({
      ...COMPLETI, cap_fatturazione: '', citta_fatturazione: '', provincia_fatturazione: '',
    });
    expect(errori.cap_fatturazione).toBeTruthy();
    expect(errori.citta_fatturazione).toBeTruthy();
    expect(errori.provincia_fatturazione).toBeTruthy();
  });

  it('lascia facoltativi Codice SDI e PEC: sono il recapito, non l’intestazione', () => {
    expect(conCompleti({ ...COMPLETI, pec: '', codice_sdi: '' })).toEqual({});
  });

  it('controlla comunque il formato di SDI e PEC se valorizzati', () => {
    const errori = conCompleti({ ...COMPLETI, pec: 'non-una-email', codice_sdi: 'AB' });
    expect(errori.pec).toBeTruthy();
    expect(errori.codice_sdi).toBeTruthy();
  });
});

describe('datiFatturazioneCompleti', () => {
  it('è falso per dati assenti o parziali', () => {
    expect(datiFatturazioneCompleti(null)).toBe(false);
    expect(datiFatturazioneCompleti(DATI_FATTURAZIONE_VUOTI)).toBe(false);
    expect(datiFatturazioneCompleti({ ...COMPLETI, cap_fatturazione: '' })).toBe(false);
  });

  it('è vero per un set che basta a emettere la fattura', () => {
    expect(datiFatturazioneCompleti(COMPLETI)).toBe(true);
  });

  it('resta vero senza SDI né PEC: non concorrono all’intestazione', () => {
    expect(datiFatturazioneCompleti({ ...COMPLETI, codice_sdi: '', pec: '' })).toBe(true);
  });
});

describe('normalizzaDatiFatturazione', () => {
  it('ripulisce spazi, maiuscole e prefisso IT della partita IVA', () => {
    expect(normalizzaDatiFatturazione({
      ...DATI_FATTURAZIONE_VUOTI,
      partita_iva: ' IT 12345678901 ',
      codice_fiscale: ' rssmra80a01h501x ',
      pec: '  Studio@PEC.IT ',
      codice_sdi: ' abc1234 ',
      provincia_fatturazione: ' rm ',
      intestazione_fattura: '  Studio Rossi  ',
    })).toMatchObject({
      partita_iva: '12345678901',
      codice_fiscale: 'RSSMRA80A01H501X',
      pec: 'studio@pec.it',
      codice_sdi: 'ABC1234',
      provincia_fatturazione: 'RM',
      intestazione_fattura: 'Studio Rossi',
    });
  });

  it('una P.IVA normalizzata supera la validazione anche se digitata con "IT" e spazi', () => {
    const grezzi = { ...COMPLETI, partita_iva: 'IT 12345678901' };
    expect(validaDatiFatturazione(grezzi).partita_iva).toBeTruthy();
    expect(validaDatiFatturazione(normalizzaDatiFatturazione(grezzi))).toEqual({});
  });
});
