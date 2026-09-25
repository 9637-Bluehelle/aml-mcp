// ==================== RT1 WIZARD UTILS ====================

import { RT1WizardData, RT1Scores, ValidationResult, RisposteDettagliate, DescrizioneStudio } from './types';
import { FATTORI_INERENTI_KEYS, FATTORI_VULNERABILITA_KEYS, VALIDATION_MESSAGES } from './constants';

/**
 * Calcola gli score RT1 (inerente, vulnerabilità, residuo)
 */
export function calculateRT1Scores(risposte: RisposteDettagliate): RT1Scores {
  // Fattori inerenti (media dei 4 fattori)
  const inerentiValues = FATTORI_INERENTI_KEYS.map(key => risposte[key].scelta_valore || 0);
  const inerente = inerentiValues.reduce((sum, val) => sum + val, 0) / FATTORI_INERENTI_KEYS.length;
  
  // Fattori vulnerabilità (media dei 4 fattori)
  const vulnerabilitaValues = FATTORI_VULNERABILITA_KEYS.map(key => risposte[key].scelta_valore || 0);
  const vulnerabilita = vulnerabilitaValues.reduce((sum, val) => sum + val, 0) / FATTORI_VULNERABILITA_KEYS.length;
  
  // Rischio residuo: 40% inerente + 60% vulnerabilità
  const residuo = (0.4 * inerente) + (0.6 * vulnerabilita);
  
  return {
    inerente: parseFloat(inerente.toFixed(2)),
    vulnerabilita: parseFloat(vulnerabilita.toFixed(2)),
    residuo: parseFloat(residuo.toFixed(2))
  };
}

/**
 * Valida la completezza dei dati per Step 1
 */
export function validateStep1(descrizione: DescrizioneStudio): ValidationResult {
  const missingFields: string[] = [];
  
  if (!descrizione.tipologia_giuridica?.trim()) missingFields.push('Tipologia Giuridica');
  if (!descrizione.anno_inizio_attivita?.trim()) missingFields.push('Anno Inizio Attività');
  if (!descrizione.sedi?.trim()) missingFields.push('Sedi');
  if (!descrizione.organizzazione_interna?.trim()) missingFields.push('Organizzazione Interna');
  
  return {
    valid: missingFields.length === 0,
    missingFields,
    message: missingFields.length > 0 
      ? `Campi obbligatori mancanti: ${missingFields.join(', ')}`
      : ''
  };
}

/**
 * Valida una singola sezione (Step 2-7)
 */
export function validateSezione(scelta_valore: number | null, titolo: string): ValidationResult {
  if (scelta_valore === null || scelta_valore === 0) {
    return {
      valid: false,
      missingFields: [titolo],
      message: `${titolo}: ${VALIDATION_MESSAGES.VALORE_MANCANTE}`
    };
  }
  
  return {
    valid: true,
    missingFields: [],
    message: ''
  };
}

/**
 * Valida la completezza dell'intera autovalutazione
 */
export function validateComplete(data: RT1WizardData): ValidationResult {
  const missingFields: string[] = [];
  
  // Step 1: Descrizione Studio (solo campi essenziali)
  if (!data.descrizione_studio.tipologia_giuridica?.trim()) missingFields.push('Tipologia Giuridica');
  if (!data.descrizione_studio.anno_inizio_attivita?.trim()) missingFields.push('Anno Inizio Attività');
  
  // Step 2-7: Tutte le sezioni devono avere un valore
  Object.entries(data.risposte_dettagliate).forEach(([key, risposta]) => {
    if (risposta.scelta_valore === null || risposta.scelta_valore === 0) {
      missingFields.push(formatSezioneTitle(key));
    }
  });
  
  // Step 8: Piano mitigazione, version, created_by
  if (!data.piano_mitigazione?.trim()) missingFields.push('Piano di Mitigazione');
  if (!data.version?.trim()) missingFields.push('Versione');
  if (!data.created_by?.trim()) missingFields.push('Valutatore');
  
  return {
    valid: missingFields.length === 0,
    missingFields,
    message: missingFields.length > 0
      ? `Dati mancanti per completare l'autovalutazione:\n- ${missingFields.join('\n- ')}`
      : 'Autovalutazione completa'
  };
}

/**
 * Formatta il titolo di una sezione per i messaggi
 */
function formatSezioneTitle(key: string): string {
  const titles: { [key: string]: string } = {
    tipologia_clientela: 'Tipologia Clientela',
    area_geografica_operativita: 'Area Geografica',
    canali_distributivi: 'Canali Distributivi',
    servizi_professionali_offerti: 'Servizi Professionali',
    formazione: 'Formazione',
    organizzazione_adeguata_verifica: 'Organizzazione Adeguata Verifica',
    organizzazione_conservazione: 'Organizzazione Conservazione',
    organizzazione_segnalazione_sos: 'Organizzazione Segnalazione SOS'
  };
  return titles[key] || key;
}

/**
 * Determina il livello di rischio in base allo score
 */
export function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score <= 1.5) return 'low';
  if (score <= 2.5) return 'medium';
  if (score <= 3.5) return 'high';
  return 'critical';
}

/**
 * Ottiene l'etichetta del rischio in italiano
 */
export function getRiskLabel(score: number): string {
  const level = getRiskLevel(score);
  const labels = {
    low: 'NON SIGNIFICATIVA',
    medium: 'POCO SIGNIFICATIVA',
    high: 'ABBASTANZA SIGNIFICATIVA',
    critical: 'MOLTO SIGNIFICATIVA'
  };
  return labels[level];
}

/**
 * Incrementa la versione (es. "1.0" → "1.1", "1.9" → "2.0")
 */
export function incrementVersion(currentVersion: string): string {
  try {
    const parts = currentVersion.split('.');
    const major = parseInt(parts[0] || '1');
    const minor = parseInt(parts[1] || '0');
    
    if (minor >= 9) {
      // Se minor è 9, incrementa major e resetta minor
      return `${major + 1}.0`;
    } else {
      // Altrimenti incrementa solo minor
      return `${major}.${minor + 1}`;
    }
  } catch (error) {
    // Se parsing fallisce, ritorna "1.0"
    return '1.0';
  }
}

/**
 * Ottiene la data di scadenza (created_at + 3 anni)
 */
export function getValidUntilDate(createdAt: Date = new Date()): string {
  const validUntil = new Date(createdAt);
  validUntil.setFullYear(validUntil.getFullYear() + 3);
  return validUntil.toISOString().split('T')[0]; // Format: YYYY-MM-DD
}

/**
 * Formatta una data per la visualizzazione
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
}

/**
 * Verifica se una data è scaduta
 */
export function isExpired(validUntil: string | null | undefined): boolean {
  if (!validUntil) return false;
  
  try {
    const expiryDate = new Date(validUntil);
    const today = new Date();
    return expiryDate < today;
  } catch (error) {
    return false;
  }
}

/**
 * Calcola i giorni mancanti alla scadenza
 */
export function getDaysUntilExpiry(validUntil: string | null | undefined): number | null {
  if (!validUntil) return null;
  
  try {
    const expiryDate = new Date(validUntil);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch (error) {
    return null;
  }
}

/**
 * Calcola la percentuale di completamento del wizard
 */
export function calculateCompletionPercentage(data: RT1WizardData): number {
  let completedFields = 0;
  let totalFields = 0;
  
  // Step 1: Descrizione Studio (7 campi)
  totalFields += 7;
  Object.values(data.descrizione_studio).forEach(value => {
    if (value?.trim()) completedFields++;
  });
  
  // Step 2-7: Risposte dettagliate (8 valori)
  totalFields += 8;
  Object.values(data.risposte_dettagliate).forEach(risposta => {
    if (risposta.scelta_valore !== null && risposta.scelta_valore > 0) {
      completedFields++;
    }
  });
  
  // Step 8: Piano mitigazione, version, created_by (3 campi)
  totalFields += 3;
  if (data.piano_mitigazione?.trim()) completedFields++;
  if (data.version?.trim()) completedFields++;
  if (data.created_by?.trim()) completedFields++;
  
  return Math.round((completedFields / totalFields) * 100);
}

/**
 * Determina l'ultimo step compilato
 */
export function getLastCompletedStep(data: RT1WizardData): number {
  // Step 1: Descrizione Studio
  const step1Complete = data.descrizione_studio.tipologia_giuridica?.trim() &&
                        data.descrizione_studio.anno_inizio_attivita?.trim();
  if (!step1Complete) return 1;
  
  // Step 2-5: Fattori Inerenti
  if (data.risposte_dettagliate.tipologia_clientela.scelta_valore === null) return 2;
  if (data.risposte_dettagliate.area_geografica_operativita.scelta_valore === null) return 3;
  if (data.risposte_dettagliate.canali_distributivi.scelta_valore === null) return 4;
  if (data.risposte_dettagliate.servizi_professionali_offerti.scelta_valore === null) return 5;
  
  // Step 6: Formazione
  if (data.risposte_dettagliate.formazione.scelta_valore === null) return 6;
  
  // Step 7: Organizzazione (3 sotto-sezioni)
  if (data.risposte_dettagliate.organizzazione_adeguata_verifica.scelta_valore === null ||
      data.risposte_dettagliate.organizzazione_conservazione.scelta_valore === null ||
      data.risposte_dettagliate.organizzazione_segnalazione_sos.scelta_valore === null) {
    return 7;
  }
  
  // Step 8: Riepilogo
  return 8;
}

/**
 * Converte i dati legacy (fattori_inerenti/vulnerabilita) al nuovo formato
 */
export function convertLegacyData(legacy: any): Partial<RisposteDettagliate> {
  const risposte: Partial<RisposteDettagliate> = {};
  
  if (legacy.fattori_inerenti) {
    if (legacy.fattori_inerenti.clientTypes) {
      risposte.tipologia_clientela = {
        scelta_valore: legacy.fattori_inerenti.clientTypes,
        note: ''
      };
    }
    if (legacy.fattori_inerenti.geography) {
      risposte.area_geografica_operativita = {
        scelta_valore: legacy.fattori_inerenti.geography,
        note: ''
      };
    }
    if (legacy.fattori_inerenti.channels) {
      risposte.canali_distributivi = {
        scelta_valore: legacy.fattori_inerenti.channels,
        note: ''
      };
    }
    if (legacy.fattori_inerenti.services) {
      risposte.servizi_professionali_offerti = {
        scelta_valore: legacy.fattori_inerenti.services,
        note: ''
      };
    }
  }
  
  if (legacy.fattori_vulnerabilita) {
    if (legacy.fattori_vulnerabilita.training) {
      risposte.formazione = {
        scelta_valore: legacy.fattori_vulnerabilita.training,
        note: ''
      };
    }
    if (legacy.fattori_vulnerabilita.kycOrg) {
      risposte.organizzazione_adeguata_verifica = {
        scelta_valore: legacy.fattori_vulnerabilita.kycOrg,
        note: ''
      };
    }
    if (legacy.fattori_vulnerabilita.retentionOrg) {
      risposte.organizzazione_conservazione = {
        scelta_valore: legacy.fattori_vulnerabilita.retentionOrg,
        note: ''
      };
    }
    if (legacy.fattori_vulnerabilita.sosCashControls) {
      risposte.organizzazione_segnalazione_sos = {
        scelta_valore: legacy.fattori_vulnerabilita.sosCashControls,
        note: ''
      };
    }
  }
  
  return risposte;
}
