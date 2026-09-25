// ==================== RT1 WIZARD TYPES & INTERFACES ====================

export interface DescrizioneStudio {
  tipologia_giuridica: string;
  anno_inizio_attivita: string;
  sedi: string;
  organizzazione_interna: string;
  peculiarita_e_specializzazioni: string;
  tipologia_prevalente_clientela: string;
  principali_prestazioni_professionali: string;
}

export interface RispostaSezione {
  scelta_valore: number | null; // 1.0 - 4.0
  note: string;
}

export interface RisposteDettagliate {
  tipologia_clientela: RispostaSezione;
  area_geografica_operativita: RispostaSezione;
  canali_distributivi: RispostaSezione;
  servizi_professionali_offerti: RispostaSezione;
  formazione: RispostaSezione;
  organizzazione_adeguata_verifica: RispostaSezione;
  organizzazione_conservazione: RispostaSezione;
  organizzazione_segnalazione_sos: RispostaSezione;
}

export interface RT1WizardData {
  // Metadati
  version: string;
  created_by: string;
  
  // Step 1: Descrizione Studio
  descrizione_studio: DescrizioneStudio;
  
  // Step 2-7: Risposte dettagliate
  risposte_dettagliate: RisposteDettagliate;
  
  // Step 8: Piano Mitigazione
  piano_mitigazione: string;
  
  // Score calcolati (readonly, calcolati dal sistema)
  inerente_score?: number;
  vulnerabilita_score?: number;
  residuo_score?: number;
}

export interface CriterioRischio {
  descrizione: string;
  indice_rischiosita: number;
}

export interface SezioneWizard {
  key: keyof RisposteDettagliate;
  titolo: string;
  istruzioni: string;
  criteri_rischio?: CriterioRischio[];
  note_campo?: string;
}

export interface RT1Scores {
  inerente: number;
  vulnerabilita: number;
  residuo: number;
}

export interface RT1WizardProps {
  onComplete: () => void;
  onCancel: () => void;
  autovalutazioneId?: string; // Per modalità view/duplicate
  mode?: 'new' | 'view' | 'draft'; // Modalità wizard
}

export interface AutovalutazioneDB {
  id: string;
  user_id: string;
  version: string;
  created_at: string;
  created_by: string;
  valid_until: string | null;
  status: 'draft' | 'current' | 'archived';
  descrizione_studio: DescrizioneStudio;
  risposte_dettagliate: RisposteDettagliate;
  fattori_inerenti: any; // Legacy, mantenuto per backward compatibility
  fattori_vulnerabilita: any; // Legacy, mantenuto per backward compatibility
  inerente_score: number;
  vulnerabilita_score: number;
  residuo_score: number;
  piano_mitigazione: string;
}

export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
  message: string;
}
