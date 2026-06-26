// Replica la presa visione dell'informativa su DB (tabella consent_log) per
// tenere traccia dei riscontri degli utenti. Best-effort: un fallimento non
// deve bloccare l'esperienza utente.

import { supabase } from '../supabase';
import { readAcknowledgment, type AcknowledgmentRecord } from './consentManager';

export async function persistAcknowledgmentToDb(record: AcknowledgmentRecord): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // utente non autenticato: resta solo il record in localStorage

    // upsert idempotente: se la riga (user_id, policy_version) esiste già
    // (vincolo UNIQUE consent_log_user_policy_unique) non viene duplicata.
    await supabase
      .from('consent_log')
      .upsert(
        {
          user_id: user.id,
          policy_version: record.version,
          decision: 'acknowledged',
          user_agent: navigator.userAgent,
        },
        { onConflict: 'user_id,policy_version', ignoreDuplicates: true },
      );
  } catch (err) {
    console.warn('consent_log: persist failed', err);
  }
}

// Riprova il persist se esiste un record di presa visione in localStorage
// (utente che ha cliccato "Ho capito" da non autenticato e si logga ora).
// Idempotente grazie al vincolo UNIQUE.
export async function retryConsentPersistIfNeeded(): Promise<void> {
  const record = readAcknowledgment();
  if (!record) return;
  await persistAcknowledgmentToDb(record);
}
