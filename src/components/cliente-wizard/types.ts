// ==================== TYPES & INTERFACES ====================

import type { CatenaControllo } from '../../lib/titolare-effettivo';

export interface TitolareEffettivo {
  id?: string;
  persona_id?: string;
  /** 'persona_fisica' (default) o 'azienda'. Per azienda i campi nascita/documento sono ignorati. */
  tipo_soggetto?: 'persona_fisica' | 'azienda';
  tipo_rapporto: 'in_proprio' | 'per_conto_persone' | 'societa_ente' | 'caso_residuale';
  nome_cognome: string;
  /** Professione anagrafica del soggetto (solo persone fisiche). Sincronizzata con anagrafica_soggetti. */
  professione: string;
  /** Ruolo specifico nel rapporto col cliente (es. "Socio al 30%", "Beneficiario"). Vive su titolari_effettivi. */
  ruolo: string;
  comune_nascita: string;
  provincia_nascita: string;
  data_nascita: string;
  nazionalita: string;
  residenza: string;
  residenza_estera?: boolean;
  codice_fiscale: string;
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
  pep_carica: string;
  pep_verificato?: boolean;
  pep_data_verifica?: string;
  pep_fonte_verifica?: string;
  sanzioni?: boolean;
  sanzioni_verificato?: boolean;
  sanzioni_data_verifica?: string;
  sanzioni_fonte_verifica?: string;
  note_quota: string;
  // Upload differito del documento d'identità (non serializzato su DB titolari_effettivi)
  documento_file?: File | null;
  documento_cartaceo?: boolean;
  documento_descrizione?: string;
  /** Popolato quando la persona è stata importata dall'anagrafica e ha già un documento a sistema */
  documento_esistente?: import('../../lib/documentUploadHelper').DocumentoIdentitaEsistente | null;
}

export interface DocumentoIdentita {
  tipo: string;
  numero: string;
  data_rilascio: string;
  data_scadenza: string;
  ente_rilascio: string;
  // Upload differito: il file resta in memoria fino al salvataggio finale
  file?: File | null;
  cartaceo?: boolean;
  descrizione?: string;
  /** Popolato quando la persona è stata importata dall'anagrafica e ha già un documento a sistema */
  esistente?: import('../../lib/documentUploadHelper').DocumentoIdentitaEsistente | null;
}

export interface WizardData {
  // Tipo cliente
  tipo_cliente: 'persona_fisica' | 'impresa' | 'professionista';
  
  // Codice cliente (comune a tutti)
  codice_cliente: string;
  
  // PERSONA FISICA
  nome_cognome_pf?: string;
  codice_fiscale_pf?: string;
  data_nascita_pf?: string;
  luogo_nascita_pf?: string;
  provincia_nascita_pf?: string;
  nazionalita_pf?: string;
  professione_pf?: string;
  residenza_pf?: string;
  residenza_estera_pf?: boolean;
  documento_pf?: DocumentoIdentita;
  pep_pf?: boolean;
  pep_verificato_pf?: boolean;
  pep_carica_pf?: string;
  pep_data_verifica_pf?: string;
  pep_fonte_verifica_pf?: string;
  sanzioni_pf?: boolean;
  sanzioni_verificato_pf?: boolean;
  sanzioni_data_verifica_pf?: string;
  sanzioni_fonte_verifica_pf?: string;
  note_verifica_pf?: string;
  
  // IMPRESA
  ragione_sociale?: string;
  natura_giuridica?: string;
  partita_iva_impresa?: string;
  codice_fiscale_impresa?: string;
  paese?: string;
  indirizzo?: string;
  sede_estera?: boolean;
  rappresentante_legale?: string;
  codice_fiscale_rappresentante?: string;
  data_nascita_rappresentante?: string;
  luogo_nascita_rappresentante?: string;
  provincia_nascita_rappresentante?: string;
  nazionalita_rappresentante?: string;
  residenza_rappresentante?: string;
  residenza_estera_rappresentante?: boolean;
  documento_rappresentante?: DocumentoIdentita;
  // Tipo del rappresentante legale: 'persona_fisica' (default) o 'azienda'.
  // Per azienda, i campi nascita/documento del rappresentante sono ignorati.
  tipo_soggetto_rappresentante?: 'persona_fisica' | 'azienda';
  partita_iva_rappresentante?: string;
  natura_giuridica_rappresentante?: string;
  codice_ateco_rappresentante?: string;
  pep_impresa?: boolean;
  pep_verificato_impresa?: boolean;
  pep_carica_impresa?: string;
  pep_data_verifica_impresa?: string;
  pep_fonte_verifica_impresa?: string;
  sanzioni_impresa?: boolean;
  sanzioni_verificato_impresa?: boolean;
  sanzioni_data_verifica_impresa?: string;
  sanzioni_fonte_verifica_impresa?: string;
  codice_ateco_impresa?: string;
  attivita_svolta_impresa?: string;
  rae_description?: string;
  codice_rae_impresa?: string;
  descrizione_rae_impresa?: string;
  note_verifica_impresa?: string;

  /**
   * UUID dell'anagrafica_soggetti importata esplicitamente per l'azienda cliente.
   * Quando valorizzato, useClienteSave userà questo come `clienti.id` al primo INSERT,
   * realizzando il bridge cliente↔anagrafica con UUID condiviso. Resettato se l'utente
   * cambia tipo cliente o ricarica i dati. Non viene persistito.
   */
  _importedClientePersonaId?: string;

  // PROFESSIONISTA
  nome_cognome_prof?: string;
  codice_fiscale_prof?: string;
  partita_iva_prof?: string;
  data_nascita_prof?: string;
  luogo_nascita_prof?: string;
  provincia_nascita_prof?: string;
  nazionalita_prof?: string;
  professione_prof?: string;
  residenza_prof?: string;
  residenza_estera_prof?: boolean;
  documento_prof?: DocumentoIdentita;
  codice_ateco_prof?: string;
  attivita_svolta_prof?: string;
  codice_rae_prof?: string;
  descrizione_rae_prof?: string;
  pep_prof?: boolean;
  pep_verificato_prof?: boolean;
  pep_carica_prof?: string;
  pep_data_verifica_prof?: string;
  pep_fonte_verifica_prof?: string;
  sanzioni_prof?: boolean;
  sanzioni_verificato_prof?: boolean;
  sanzioni_data_verifica_prof?: string;
  sanzioni_fonte_verifica_prof?: string;
  note_verifica_prof?: string;

  // Campi wizard (Step 2)
  titolari_effettivi: TitolareEffettivo[];

  // Catena di controllo per analisi titolare effettivo (solo imprese)
  catena_controllo?: CatenaControllo;
}

export interface APILog {
  timestamp: string;
  status: 'loading' | 'success' | 'error';
  requestUrl: string;
  responseStatus?: number;
  responseData?: any;
  errorMessage?: string;
}

export interface ClienteWizardProps {
  onComplete: () => void;
  onCancel: () => void;
  clienteId?: string; // ID del cliente da modificare (modalità edit)
  initialStep?: number; // Step iniziale (default: 1)
}
