// Gestione della presa visione dell'informativa privacy/cookie.
// La piattaforma utilizza esclusivamente cookie tecnici/necessari (art. 122
// Codice Privacy), che non richiedono consenso: l'utente prende solo visione
// dell'informativa cliccando "Ho capito".
// Persistenza in localStorage; il log centralizzato su DB è gestito da consentLog.ts
// quando l'utente è autenticato.

import { POLICY_VERSION } from './studioInfo';

const STORAGE_KEY = 'aml_consent_v1';

export interface AcknowledgmentRecord {
  version: string;
  timestamp: string; // ISO 8601
  acknowledged: true;
}

export function readAcknowledgment(): AcknowledgmentRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AcknowledgmentRecord;
    if (!parsed.version || !parsed.acknowledged) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAcknowledgment(): AcknowledgmentRecord {
  const record: AcknowledgmentRecord = {
    version: POLICY_VERSION,
    timestamp: new Date().toISOString(),
    acknowledged: true,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  return record;
}

// True se l'utente non ha mai preso visione o se la versione delle policy
// è cambiata dall'ultima presa visione (informativa aggiornata).
export function needsAcknowledgment(): boolean {
  const record = readAcknowledgment();
  if (!record) return true;
  return record.version !== POLICY_VERSION;
}
