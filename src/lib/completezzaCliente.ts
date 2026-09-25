/**
 * Definizione unica di "cliente completo".
 *
 * Un cliente viene salvato come `active` se non manca nulla, altrimenti come
 * `draft` (vedi useClienteSave). Prima questa regola viveva solo dentro il
 * wizard: il fascicolo non poteva dire *cosa* mancasse senza riscriverla, e due
 * copie sarebbero divergite alla prima modifica. Qui sta una volta sola, e
 * restituisce l'elenco dei campi invece di un semplice sì/no — il booleano è
 * solo "elenco vuoto".
 *
 * Le etichette sono quelle che l'utente legge nel form, mai i nomi dei campi.
 */

export type SezioneCampo = 'anagrafica' | 'documento';

export interface CampoMancante {
  /** Identificatore stabile, per test e debug. Non mostrato all'utente. */
  chiave: string;
  /** Testo mostrato all'utente, uguale alla label del form. */
  label: string;
  sezione: SezioneCampo;
}

/** Il documento d'identità, nella forma comune a wizard e riga DB. */
export interface DocumentoCompletezza {
  tipo?: string | null;
  numero?: string | null;
  data_rilascio?: string | null;
  ente_rilascio?: string | null;
  data_scadenza?: string | null;
}

/**
 * Forma minima che serve al controllo. Wizard e riga `clienti` hanno strutture
 * diverse: ciascuno si normalizza qui tramite il proprio adattatore.
 */
export interface DatiCompletezzaCliente {
  tipo_cliente?: string | null;
  /** Ragione sociale (impresa) o nome e cognome (persona fisica / professionista). */
  nome?: string | null;
  codice_fiscale?: string | null;
  partita_iva?: string | null;
  codice_ateco?: string | null;
  data_nascita?: string | null;
  luogo_nascita?: string | null;
  nazionalita?: string | null;
  professione?: string | null;
  residenza?: string | null;
  /**
   * Documento del cliente per persona fisica e professionista; del
   * rappresentante legale per le imprese, che non hanno un documento proprio.
   */
  documento?: DocumentoCompletezza | null;
  /** Solo imprese. */
  rappresentante_nome?: string | null;
  rappresentante_codice_fiscale?: string | null;
}

/** Titolo della sezione nel riepilogo. Per le imprese il documento è del rappresentante. */
export function titoloSezione(sezione: SezioneCampo, tipoCliente?: string | null): string {
  if (sezione === 'anagrafica') return 'Dati anagrafici';
  return tipoCliente === 'impresa'
    ? "Documento d'identità del rappresentante legale"
    : "Documento d'identità";
}

const vuoto = (v: string | null | undefined): boolean => !String(v ?? '').trim();

/** Campi del documento d'identità, richiesti per tutti e tre i tipi cliente. */
function campiDocumento(doc: DocumentoCompletezza | null | undefined): CampoMancante[] {
  const attesi: [keyof DocumentoCompletezza, string][] = [
    ['tipo', 'Tipo Documento'],
    ['numero', 'Numero Documento'],
    ['data_rilascio', 'Data Rilascio'],
    ['ente_rilascio', 'Ente Rilascio'],
    ['data_scadenza', 'Data Scadenza'],
  ];
  return attesi
    .filter(([campo]) => vuoto(doc?.[campo]))
    .map(([campo, label]) => ({ chiave: `documento.${campo}`, label, sezione: 'documento' as const }));
}

/**
 * Elenco dei campi che mancano perché il cliente possa passare ad "Attivo".
 * Elenco vuoto = cliente completo.
 */
export function campiMancantiCliente(d: DatiCompletezzaCliente): CampoMancante[] {
  const mancanti: CampoMancante[] = [];
  const anagrafica = (chiave: string, label: string, valore: string | null | undefined) => {
    if (vuoto(valore)) mancanti.push({ chiave, label, sezione: 'anagrafica' });
  };

  if (d.tipo_cliente === 'impresa') {
    anagrafica('nome', 'Ragione Sociale', d.nome);
    anagrafica('codice_fiscale', 'Codice Fiscale', d.codice_fiscale);
    anagrafica('codice_ateco', 'Principale Attività Svolta', d.codice_ateco);
    // Il documento richiesto è quello del rappresentante legale: pretenderlo
    // senza pretendere chi sia quel rappresentante lasciava elencare "Numero
    // Documento" su una persona mai nominata.
    anagrafica('rappresentante_nome', 'Rappresentante Legale', d.rappresentante_nome);
    anagrafica('rappresentante_codice_fiscale', 'CF Rappresentante Legale', d.rappresentante_codice_fiscale);
    return [...mancanti, ...campiDocumento(d.documento)];
  }

  if (d.tipo_cliente === 'persona_fisica' || d.tipo_cliente === 'professionista') {
    anagrafica('nome', 'Nome e Cognome', d.nome);
    anagrafica('codice_fiscale', 'Codice Fiscale', d.codice_fiscale);
    if (d.tipo_cliente === 'professionista') {
      anagrafica('partita_iva', 'Partita IVA', d.partita_iva);
      anagrafica('codice_ateco', 'Principale Attività Svolta', d.codice_ateco);
    }
    anagrafica('data_nascita', 'Data di Nascita', d.data_nascita);
    anagrafica('luogo_nascita', 'Luogo di Nascita', d.luogo_nascita);
    anagrafica('nazionalita', 'Nazionalità', d.nazionalita);
    anagrafica('professione', 'Professione', d.professione);
    anagrafica('residenza', 'Residenza', d.residenza);
    return [...mancanti, ...campiDocumento(d.documento)];
  }

  // Tipo cliente non riconosciuto: non sappiamo cosa chiedere, quindi non è
  // completo. Rispecchia il `return false` finale della regola precedente.
  return [{ chiave: 'tipo_cliente', label: 'Tipo Cliente', sezione: 'anagrafica' }];
}

/** true se non manca nulla per l'attivazione. */
export function clienteCompleto(d: DatiCompletezzaCliente): boolean {
  return campiMancantiCliente(d).length === 0;
}

/** I soli campi di una riga `clienti` (arricchita) che servono al controllo. */
export interface RigaClienteCompletezza {
  tipo_cliente?: string | null;
  ragione_sociale?: string | null;
  codice_fiscale?: string | null;
  partita_iva?: string | null;
  codice_ateco?: string | null;
  data_nascita?: string | null;
  luogo_nascita?: string | null;
  nazionalita?: string | null;
  professione?: string | null;
  residenza?: string | null;
  documento_identita?: DocumentoCompletezza | null;
  /** Aggiunto da `enrichClienteWithRappresentante`, non presente sulla riga nuda. */
  rappresentante_legale_documento?: DocumentoCompletezza | null;
  rappresentante_legale?: string | null;
  codice_fiscale_rappresentante?: string | null;
}

/**
 * Normalizza una riga `clienti`. Per le imprese il documento va letto da
 * `rappresentante_legale_documento`, che `enrichClienteWithRappresentante`
 * ricava da `anagrafica_soggetti`: su una riga non arricchita il documento
 * risulterebbe sempre mancante.
 */
export function datiCompletezzaDaCliente(cliente: RigaClienteCompletezza): DatiCompletezzaCliente {
  const isImpresa = cliente.tipo_cliente === 'impresa';
  return {
    tipo_cliente: cliente.tipo_cliente,
    nome: cliente.ragione_sociale,
    codice_fiscale: cliente.codice_fiscale,
    partita_iva: cliente.partita_iva,
    codice_ateco: cliente.codice_ateco,
    data_nascita: cliente.data_nascita,
    luogo_nascita: cliente.luogo_nascita,
    nazionalita: cliente.nazionalita,
    professione: cliente.professione,
    residenza: cliente.residenza,
    documento: isImpresa ? cliente.rappresentante_legale_documento : cliente.documento_identita,
    rappresentante_nome: cliente.rappresentante_legale,
    rappresentante_codice_fiscale: cliente.codice_fiscale_rappresentante,
  };
}
