// Dati identificativi del Titolare del trattamento e del DPO.
// Riusati da: PrivacyBanner, CookiePolicy, TermsAndConditions, generatori PDF/DOCX.

export const STUDIO_INFO = {
  nome: 'VULKANO S.R.L.',
  indirizzo: 'Via Paolo Vasta 3, 95024 Acireale (CT)',
  pec: 'vulkanosrl@pec.it',
  email: 'dev@vulkano.ai',
  telefono: '+390950924023',
  partitaIva: '06204630872',
} as const;

export const DPO_INFO = {
  nome: 'Giuseppe Patanè',
  email: 'dev@vulkano.ai',
} as const;

// Versione dei documenti legali (privacy + cookie + T&C).
// Incrementare quando il contenuto cambia: forza il re-consent agli utenti
// che avevano già accettato la versione precedente.
export const POLICY_VERSION = '2026-04-28';
