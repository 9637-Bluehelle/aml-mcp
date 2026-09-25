// ==================== RT1 WIZARD EXPORTS ====================

// Main component
export { RT1Wizard } from './RT1Wizard';

// Types
export type {
  RT1WizardData,
  RT1WizardProps,
  DescrizioneStudio,
  RisposteDettagliate,
  RispostaSezione,
  RT1Scores,
  AutovalutazioneDB,
  ValidationResult,
  SezioneWizard,
  CriterioRischio
} from './types';

// Constants
export {
  SEZIONI_WIZARD,
  FATTORI_INERENTI_KEYS,
  FATTORI_VULNERABILITA_KEYS,
  SLIDER_CONFIG,
  TOTAL_STEPS,
  STEP_LABELS,
  emptyDescrizioneStudio,
  emptyRisposteDettagliate
} from './constants';

// Utils
export {
  calculateRT1Scores,
  validateStep1,
  validateSezione,
  validateComplete,
  getRiskLevel,
  getRiskLabel,
  incrementVersion,
  getValidUntilDate,
  formatDate,
  isExpired,
  getDaysUntilExpiry,
  calculateCompletionPercentage,
  getLastCompletedStep,
  convertLegacyData
} from './utils';

// Hooks
export { useRT1Form } from './hooks/useRT1Form';
export { useRT1Save } from './hooks/useRT1Save';

// Components
export { StepIndicator } from './components/StepIndicator';

// Modals
export { LoadDraftModal } from './modals/LoadDraftModal';
