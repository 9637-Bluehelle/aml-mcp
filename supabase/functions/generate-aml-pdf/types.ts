// Types per la generazione PDF AML

export interface ClienteData {
  id: string;
  codice_cliente: string;
  ragione_sociale: string;
  tipo_cliente?: 'persona_fisica' | 'societa' | 'professionista' | 'impresa';
  codice_fiscale?: string;
  partita_iva?: string;
  natura_giuridica?: string;
  indirizzo?: string;
  paese?: string;
  data_nascita?: string;
  luogo_nascita?: string;
  nazionalita?: string;
  professione?: string;
  residenza?: string;
  rappresentante_legale?: string;
  codice_fiscale_rappresentante?: string;
  data_nascita_rappresentante?: string;
  luogo_nascita_rappresentante?: string;
  provincia_nascita_rappresentante?: string;
  nazionalita_rappresentante?: string;
  residenza_rappresentante?: string;
  // Tipo del rappresentante: 'persona_fisica' (default) o 'azienda'.
  // Per azienda, i campi nascita/documento del rappresentante sono vuoti.
  tipo_soggetto_rappresentante?: 'persona_fisica' | 'azienda';
  partita_iva_rappresentante?: string;
  natura_giuridica_rappresentante?: string;
  codice_ateco_rappresentante?: string;
  pep?: boolean;
  pep_dettagli?: string;
  sanzioni?: boolean;
  documento_identita?: {
    tipo: string;
    numero: string;
    data_rilascio: string;
    data_scadenza: string;
    ente_rilascio: string;
  };
  rappresentante_legale_documento?: {
    tipo: string;
    numero: string;
    data_rilascio: string;
    data_scadenza: string;
    ente_rilascio: string;
  };
}

export interface TitolareEffettivo {
  id: string;
  cliente_id: string;
  /** 'persona_fisica' (default) o 'azienda'. Per azienda i campi nascita/documento sono vuoti. */
  tipo_soggetto?: 'persona_fisica' | 'azienda';
  tipo_rapporto: 'in_proprio' | 'per_conto_persone' | 'societa_ente' | 'caso_residuale';
  nome_cognome: string;
  codice_fiscale: string;
  professione: string;
  comune_nascita: string;
  provincia_nascita: string;
  data_nascita: string;
  nazionalita?: string;
  residenza?: string;
  comune_residenza?: string;
  via_residenza?: string;
  numero_civico?: string;
  // Campi azienda (popolati solo quando tipo_soggetto='azienda')
  partita_iva?: string;
  natura_giuridica?: string;
  codice_ateco?: string;
  documento_tipo: string;
  documento_numero: string;
  documento_rilascio_ente: string;
  documento_rilascio_data: string;
  documento_scadenza: string;
  is_pep: boolean;
  pep_carica?: string;
  note_quota?: string;
}

export interface IncaricoData {
  id: string;
  codice_incarico: string;
  tipologia_prestazione_id: string;
  descrizione: string;
  scopo_natura?: string;
  data_inizio?: string;
  importo_stimato?: number;
  cliente_id?: string;
  relazioni_cliente_te?: string;
  provenienza_fondi?: string;
  mezzi_pagamento?: string;
  conferma_fondi_leciti?: boolean;
}

export interface ValutazioneData {
  rischio_inerente_prestazione?: number;
  rischio_specifico?: number;
  rischio_effettivo?: number;
  classe_rischio?: number;
  misure_applicate?: string;
  note?: string;
  created_at?: string;
  prossimo_controllo?: string;
}

export interface AMLDataComplete {
  cliente: ClienteData;
  titolari_effettivi: TitolareEffettivo[];
  incarico: IncaricoData;
  valutazione?: ValutazioneData;
  nome_studio?: string;
  /** Numero totale di incarichi attivi/storici registrati per questo cliente (utile per
   * spuntare automaticamente "Nuovo Cliente" vs "Cliente già identificato"). */
  numero_incarichi_cliente?: number;
}

export type DocumentType = 'av3' | 'av4' | 'both';

export interface PDFRequest {
  clienteId: string;
  incaricoId: string;
  documentType: DocumentType;
}
