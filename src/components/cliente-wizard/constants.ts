// ==================== CONSTANTS ====================

import { TitolareEffettivo } from './types';

// DEBUG_MODE è sempre true: la visibilità è controllata nel componente (solo superadmin)
export const DEBUG_MODE = true;

// Template titolare effettivo vuoto
export const emptyTitolare: TitolareEffettivo = {
  tipo_rapporto: 'in_proprio',
  nome_cognome: '',
  professione: '',
  ruolo: '',
  comune_nascita: '',
  provincia_nascita: '',
  data_nascita: '',
  nazionalita: 'Italiana',
  residenza: '',
  codice_fiscale: '',
  documento_tipo: '',
  documento_numero: '',
  documento_rilascio_ente: '',
  documento_rilascio_data: '',
  documento_scadenza: '',
  is_pep: false,
  pep_carica: '',
  note_quota: ''
};