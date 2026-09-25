import { describe, it, expect } from 'vitest';
import {
  campiMancantiCliente,
  clienteCompleto,
  datiCompletezzaDaCliente,
  titoloSezione,
  type DatiCompletezzaCliente,
} from '../completezzaCliente';

const documentoCompleto = {
  tipo: 'carta-identita',
  numero: 'AB123456',
  data_rilascio: '01/01/2020',
  ente_rilascio: 'Comune di Roma',
  data_scadenza: '01/01/2030',
};

const personaFisicaCompleta: DatiCompletezzaCliente = {
  tipo_cliente: 'persona_fisica',
  nome: 'Mario Rossi',
  codice_fiscale: 'RSSMRA80A01H501X',
  data_nascita: '01/01/1980',
  luogo_nascita: 'Roma',
  nazionalita: 'Italiana',
  professione: 'Avvocato',
  residenza: 'Via Roma 1, 00100 Roma (RM)',
  documento: documentoCompleto,
};

const professionistaCompleto: DatiCompletezzaCliente = {
  ...personaFisicaCompleta,
  tipo_cliente: 'professionista',
  partita_iva: '12345678901',
  codice_ateco: '69.10.10',
};

const impresaCompleta: DatiCompletezzaCliente = {
  tipo_cliente: 'impresa',
  nome: 'Acme S.r.l.',
  codice_fiscale: '12345678901',
  codice_ateco: '62.01.00',
  rappresentante_nome: 'Mario Rossi',
  rappresentante_codice_fiscale: 'RSSMRA80A01H501X',
  documento: documentoCompleto,
};

const etichette = (d: DatiCompletezzaCliente) => campiMancantiCliente(d).map(c => c.label);

describe('completezzaCliente', () => {
  it('considera completi i tre tipi cliente con tutti i dati', () => {
    expect(clienteCompleto(personaFisicaCompleta)).toBe(true);
    expect(clienteCompleto(professionistaCompleto)).toBe(true);
    expect(clienteCompleto(impresaCompleta)).toBe(true);
  });

  it('elenca le etichette del form, non i nomi dei campi', () => {
    expect(etichette({ ...personaFisicaCompleta, luogo_nascita: '', professione: '' }))
      .toEqual(['Luogo di Nascita', 'Professione']);
  });

  it('tratta come mancante un campo con soli spazi', () => {
    expect(etichette({ ...personaFisicaCompleta, residenza: '   ' })).toEqual(['Residenza']);
  });

  it('richiede ogni campo del documento singolarmente', () => {
    const senzaScadenza = { ...personaFisicaCompleta, documento: { ...documentoCompleto, data_scadenza: '' } };
    expect(etichette(senzaScadenza)).toEqual(['Data Scadenza']);

    const senzaDocumento = { ...personaFisicaCompleta, documento: null };
    expect(etichette(senzaDocumento)).toEqual([
      'Tipo Documento', 'Numero Documento', 'Data Rilascio', 'Ente Rilascio', 'Data Scadenza',
    ]);
  });

  it('chiede a un professionista P.IVA e ATECO, a una persona fisica no', () => {
    const prof = { ...professionistaCompleto, partita_iva: '', codice_ateco: '' };
    expect(etichette(prof)).toEqual(['Partita IVA', 'Principale Attività Svolta']);
    // Gli stessi campi vuoti su una persona fisica non sono richiesti
    expect(clienteCompleto({ ...personaFisicaCompleta, partita_iva: '', codice_ateco: '' })).toBe(true);
  });

  it("all'impresa non chiede data e luogo di nascita", () => {
    expect(clienteCompleto({ ...impresaCompleta, data_nascita: '', luogo_nascita: '', residenza: '' })).toBe(true);
  });

  it('chiede a un impresa nome e CF del rappresentante legale', () => {
    expect(etichette({ ...impresaCompleta, rappresentante_nome: '', rappresentante_codice_fiscale: '' }))
      .toEqual(['Rappresentante Legale', 'CF Rappresentante Legale']);
  });

  it('non considera completo un tipo cliente non riconosciuto', () => {
    expect(clienteCompleto({ tipo_cliente: 'altro' })).toBe(false);
    expect(clienteCompleto({})).toBe(false);
  });

  it('separa i campi anagrafici da quelli del documento', () => {
    const campi = campiMancantiCliente({ tipo_cliente: 'persona_fisica' });
    expect(campi.filter(c => c.sezione === 'anagrafica')).toHaveLength(7);
    expect(campi.filter(c => c.sezione === 'documento')).toHaveLength(5);
  });

  it('intitola la sezione documento al rappresentante solo per le imprese', () => {
    expect(titoloSezione('documento', 'impresa')).toContain('rappresentante legale');
    expect(titoloSezione('documento', 'persona_fisica')).toBe("Documento d'identità");
    expect(titoloSezione('anagrafica', 'impresa')).toBe('Dati anagrafici');
  });

  describe('datiCompletezzaDaCliente', () => {
    it('mappa una riga persona fisica usando il suo documento', () => {
      const d = datiCompletezzaDaCliente({
        tipo_cliente: 'persona_fisica',
        ragione_sociale: 'Mario Rossi',
        codice_fiscale: 'RSSMRA80A01H501X',
        data_nascita: '1980-01-01',
        luogo_nascita: 'Roma',
        nazionalita: 'Italiana',
        professione: 'Avvocato',
        residenza: 'Via Roma 1',
        documento_identita: documentoCompleto,
      });
      expect(clienteCompleto(d)).toBe(true);
    });

    it("per un'impresa legge il documento del rappresentante, non quello del cliente", () => {
      const riga = {
        tipo_cliente: 'impresa',
        ragione_sociale: 'Acme S.r.l.',
        codice_fiscale: '12345678901',
        codice_ateco: '62.01.00',
        rappresentante_legale: 'Mario Rossi',
        codice_fiscale_rappresentante: 'RSSMRA80A01H501X',
        documento_identita: documentoCompleto, // non deve essere usato
      };
      // Riga non arricchita: manca `rappresentante_legale_documento`
      expect(etichette(datiCompletezzaDaCliente(riga))).toHaveLength(5);

      const arricchita = { ...riga, rappresentante_legale_documento: documentoCompleto };
      expect(clienteCompleto(datiCompletezzaDaCliente(arricchita))).toBe(true);
    });
  });
});
