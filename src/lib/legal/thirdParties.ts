// Registro delle terze parti che possono accedere o trattare dati personali
// tramite la piattaforma. Usato per popolare la sezione "Destinatari" della
// Privacy Policy e l'elenco di servizi nella Cookie Policy.

export interface ThirdParty {
  nome: string;
  finalita: string;
  categoriaDati: string;
  paese: string;
  baseGiuridica: string;
  privacyUrl: string;
}

export const THIRD_PARTIES: ThirdParty[] = [
  {
    nome: 'Supabase Inc.',
    finalita: 'Hosting database, autenticazione, storage documenti',
    categoriaDati: 'Tutti i dati applicativi e credenziali',
    paese: 'West UE (Ireland) eu-west-1',
    baseGiuridica: 'Responsabile del trattamento ex art. 28 GDPR',
    privacyUrl: 'https://supabase.com/privacy',
  },
  {
    nome: 'Vercel Inc.',
    finalita: 'Hosting frontend e funzioni serverless API',
    categoriaDati: 'Log di accesso, indirizzo IP, user-agent',
    paese: 'UE / USA (con SCC)',
    baseGiuridica: 'Responsabile del trattamento ex art. 28 GDPR',
    privacyUrl: 'https://vercel.com/legal/privacy-policy',
  },
];

// Cookie e tecnologie di archiviazione locale effettivamente usate dalla
// piattaforma. Tutti rientrano nella categoria "tecnici/necessari" ai sensi
// dell'art. 122 del Codice Privacy e non richiedono consenso.
export interface CookieEntry {
  etichetta: string;       // identificativo descrittivo in italiano (user-facing)
  nomeTecnico: string;     // nome interno della variabile (riferimento secondario)
  categoria: 'necessario';
  finalita: string;
  durata: string;
  fornitore: string;
  obbligatorio: string;
}

export const COOKIE_REGISTRY: CookieEntry[] = [
  {
    etichetta: 'Sessione di autenticazione',
    nomeTecnico: 'sb-<project>-auth-token (e, durante il login, sb-<project>-auth-token-code-verifier)',
    categoria: 'necessario',
    finalita: 'Mantenere la sessione utente autenticata e completare in sicurezza il flusso di login (PKCE)',
    durata: 'Durata della sessione, con rinnovo automatico; la chiave temporanea di login è cancellata subito dopo l\'autenticazione',
    fornitore: 'Supabase',
    obbligatorio: 'Senza questo cookie l\'utente non può rimanere autenticato e accedere ai dati protetti',
  },
  {
    etichetta: 'Presa visione dell\'informativa',
    nomeTecnico: 'aml_consent_v1',
    categoria: 'necessario',
    finalita: 'Memorizzare la presa visione dell\'informativa privacy/cookie',
    durata: 'Persistente, fino ad aggiornamento dei documenti legali',
    fornitore: 'AdeguataVerifica.Pro',
    obbligatorio: 'Necessario per non ripresentare l\'informativa ad ogni accesso',
  },
  {
    etichetta: 'Stato di navigazione tra le viste',
    nomeTecnico: 'alert_navigate_*, rt2_pending_incarico, rt2_pending_evaluate, rt2_return_fascicolo',
    categoria: 'necessario',
    finalita: 'Trasferire temporaneamente tra una vista e l\'altra l\'ID dell\'incarico o del fascicolo (es. apertura di un fascicolo o di un\'adeguata verifica da un alert)',
    durata: 'Cancellato alla chiusura della scheda del browser',
    fornitore: 'AdeguataVerifica.Pro',
    obbligatorio: 'Indispensabile per portare l\'utente alla sezione corretta durante la navigazione interna',
  },
  {
    etichetta: 'Notifica di errore di autenticazione',
    nomeTecnico: 'pkce_error, reset_password_error',
    categoria: 'necessario',
    finalita: 'Comunicare al form di login eventuali errori di autenticazione o di reimpostazione della password',
    durata: 'Cancellato alla chiusura della scheda del browser',
    fornitore: 'AdeguataVerifica.Pro',
    obbligatorio: 'Necessario per mostrare all\'utente l\'errore in caso di link di conferma o di reset scaduto',
  },
];
