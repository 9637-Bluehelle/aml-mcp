// Dati di fatturazione dello studio (vivono su user_profiles del proprietario)
// e relative regole di validazione.
//
// Stanno qui e non dentro un componente perché ora sono richiesti in DUE punti:
//  - Profilo → Dati di Fatturazione (modifica a freddo, tutti i campi opzionali);
//  - lo step che precede il primo pagamento (DatiFatturazioneGate), dove invece
//    i campi che compaiono in fattura sono obbligatori.
// Regole duplicate nei due punti divergerebbero alla prima modifica.

export interface DatiFatturazione {
  partita_iva: string;
  codice_fiscale: string;
  pec: string;
  codice_sdi: string;
  intestazione_fattura: string;
  indirizzo_fatturazione: string;
  cap_fatturazione: string;
  citta_fatturazione: string;
  provincia_fatturazione: string;
}

export const DATI_FATTURAZIONE_VUOTI: DatiFatturazione = {
  partita_iva: '',
  codice_fiscale: '',
  pec: '',
  codice_sdi: '',
  intestazione_fattura: '',
  indirizzo_fatturazione: '',
  cap_fatturazione: '',
  citta_fatturazione: '',
  provincia_fatturazione: '',
};

export const validaPIva = (v: string): boolean => /^\d{11}$/.test(v);

/** Persona fisica: 16 caratteri alfanumerici. Persona giuridica: 11 cifre. */
export const validaCF = (v: string): boolean => /^[A-Z0-9]{16}$/i.test(v) || /^\d{11}$/.test(v);

export const validaEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const validaCap = (v: string): boolean => /^\d{5}$/.test(v);

/** Codice destinatario SDI: 7 caratteri (6 per la PA, ma qui sono privati). */
export const validaSdi = (v: string): boolean => /^[A-Z0-9]{6,7}$/i.test(v);

export interface OpzioniValidazione {
  /**
   * true → pretende i campi che finiscono materialmente in fattura
   * (intestazione, indirizzo completo e almeno un identificativo fiscale).
   * Usato prima del pagamento; a freddo, nel profilo, resta false.
   */
  richiediCompleti?: boolean;
}

/**
 * Ritorna gli errori per campo (vuoto = dati validi). I controlli di formato
 * valgono sempre, l'obbligatorietà solo con `richiediCompleti`.
 */
export function validaDatiFatturazione(
  d: DatiFatturazione,
  { richiediCompleti = false }: OpzioniValidazione = {},
): Record<string, string> {
  const e: Record<string, string> = {};
  const v = (s: string) => (s ?? '').trim();

  if (v(d.partita_iva) && !validaPIva(v(d.partita_iva))) {
    e.partita_iva = 'Partita IVA deve essere di 11 cifre';
  }
  if (v(d.codice_fiscale) && !validaCF(v(d.codice_fiscale))) {
    e.codice_fiscale = 'Codice Fiscale non valido: 16 caratteri alfanumerici (persona fisica) o 11 cifre (azienda)';
  }
  if (v(d.pec) && !validaEmail(v(d.pec))) {
    e.pec = 'Formato email PEC non valido';
  }
  if (v(d.codice_sdi) && !validaSdi(v(d.codice_sdi))) {
    e.codice_sdi = 'Codice SDI: 7 caratteri alfanumerici';
  }
  if (v(d.cap_fatturazione) && !validaCap(v(d.cap_fatturazione))) {
    e.cap_fatturazione = 'CAP deve essere di 5 cifre';
  }
  if (v(d.provincia_fatturazione) && !/^[A-Z]{2}$/i.test(v(d.provincia_fatturazione))) {
    e.provincia_fatturazione = 'Sigla di 2 lettere (es. RM)';
  }

  // Obbligatori solo i campi che compaiono materialmente in fattura. PEC e
  // Codice SDI restano facoltativi anche qui: servono al recapito della fattura
  // elettronica, non alla sua intestazione, e si possono aggiungere dopo.
  if (richiediCompleti) {
    if (!v(d.partita_iva)) e.partita_iva = 'Partita IVA obbligatoria';
    if (!v(d.codice_fiscale)) e.codice_fiscale = 'Codice Fiscale obbligatorio';
    if (!v(d.intestazione_fattura)) e.intestazione_fattura = 'Indica a chi intestare la fattura';
    if (!v(d.indirizzo_fatturazione)) e.indirizzo_fatturazione = 'Indirizzo obbligatorio';
    if (!v(d.cap_fatturazione)) e.cap_fatturazione = 'CAP obbligatorio';
    if (!v(d.citta_fatturazione)) e.citta_fatturazione = 'Città obbligatoria';
    if (!v(d.provincia_fatturazione)) e.provincia_fatturazione = 'Provincia obbligatoria';
  }

  return e;
}

/** true se i dati bastano a emettere una fattura intestata correttamente. */
export function datiFatturazioneCompleti(d: DatiFatturazione | null | undefined): boolean {
  if (!d) return false;
  return Object.keys(validaDatiFatturazione(d, { richiediCompleti: true })).length === 0;
}

/** Normalizza i valori così come vanno scritti su user_profiles. */
export function normalizzaDatiFatturazione(d: DatiFatturazione): DatiFatturazione {
  const t = (s: string) => (s ?? '').trim();
  return {
    partita_iva: t(d.partita_iva).replace(/\s+/g, '').replace(/^IT/i, ''),
    codice_fiscale: t(d.codice_fiscale).toUpperCase(),
    pec: t(d.pec).toLowerCase(),
    codice_sdi: t(d.codice_sdi).toUpperCase(),
    intestazione_fattura: t(d.intestazione_fattura),
    indirizzo_fatturazione: t(d.indirizzo_fatturazione),
    cap_fatturazione: t(d.cap_fatturazione),
    citta_fatturazione: t(d.citta_fatturazione),
    provincia_fatturazione: t(d.provincia_fatturazione).toUpperCase(),
  };
}
