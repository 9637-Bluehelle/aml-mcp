// Registro delle terze parti che possono accedere o trattare dati personali
// tramite la piattaforma. Usato per popolare la sezione "Destinatari" della
// Privacy Policy e l'elenco di servizi nella Cookie Policy.

export interface ThirdParty {
  nome: string;
  finalita: string;
  categoriaDati: string;
  paese: string;
  /**
   * Ruolo privacy del fornitore. NON è uniforme: la maggior parte agisce da
   * responsabile su nostra istruzione, ma chi ha obblighi propri di legge sui
   * dati che riceve (tipicamente il prestatore di servizi di pagamento) è
   * titolare autonomo, e presentarlo come responsabile sarebbe scorretto.
   */
  ruolo: string;
  baseGiuridica: string;
  privacyUrl: string;
}

export const THIRD_PARTIES: ThirdParty[] = [
  {
    nome: 'Supabase Inc.',
    finalita: 'Hosting database, autenticazione, storage documenti',
    categoriaDati: 'Tutti i dati applicativi e credenziali',
    paese: 'West UE (Ireland) eu-west-1',
    ruolo: 'Responsabile ex art. 28 GDPR',
    baseGiuridica: 'Responsabile del trattamento ex art. 28 GDPR',
    privacyUrl: 'https://supabase.com/privacy',
  },
  {
    nome: 'Vercel Inc.',
    finalita: 'Hosting frontend e funzioni serverless API',
    categoriaDati: 'Log di accesso, indirizzo IP, user-agent',
    paese: 'UE / USA (con SCC)',
    ruolo: 'Responsabile ex art. 28 GDPR',
    baseGiuridica: 'Responsabile del trattamento ex art. 28 GDPR',
    privacyUrl: 'https://vercel.com/legal/privacy-policy',
  },
  {
    nome: 'Stripe Payments Europe Ltd',
    finalita: 'Incasso dei canoni di abbonamento, gestione del metodo di pagamento, emissione delle fatture',
    categoriaDati: 'Dati di fatturazione dello studio, estremi mascherati della carta (circuito, ultime 4 cifre, scadenza), storico delle transazioni',
    paese: 'Irlanda (UE); trasferimenti infragruppo verso gli USA con SCC',
    // Stripe non tratta i dati di pagamento su nostra istruzione: ha obblighi
    // propri (antifrode, antiriciclaggio, vigilanza sui servizi di pagamento)
    // che la rendono titolare autonoma per quella parte.
    ruolo: 'Titolare autonomo per i dati di pagamento; responsabile ex art. 28 per i trattamenti coperti dal DPA',
    baseGiuridica: 'Esecuzione del contratto di abbonamento (art. 6.1.b GDPR) e obbligo legale in capo al prestatore di servizi di pagamento (art. 6.1.c)',
    privacyUrl: 'https://stripe.com/privacy',
  },
  {
    nome: 'Sendinblue SAS (Brevo)',
    finalita: 'Invio delle email di servizio: credenziali di accesso, esiti dei pagamenti, ricevute, avvisi sull\'abbonamento',
    categoriaDati: 'Nome ed indirizzo e-mail del destinatario, contenuto del messaggio',
    paese: 'Francia (UE)',
    ruolo: 'Responsabile ex art. 28 GDPR',
    baseGiuridica: 'Esecuzione del contratto (art. 6.1.b GDPR)',
    privacyUrl: 'https://www.brevo.com/legal/privacypolicy/',
  },
  {
    nome: 'Openapi S.p.A.',
    finalita: 'Consultazione di banche dati pubbliche per la compilazione automatica dei dati identificativi di imprese e professionisti, a partire dalla partita IVA o dal codice fiscale',
    categoriaDati: 'Partita IVA o codice fiscale oggetto della ricerca',
    paese: 'Italia (UE)',
    ruolo: 'Responsabile ex art. 28 GDPR',
    baseGiuridica: 'Obbligo legale di adeguata verifica (art. 6.1.c GDPR, D.Lgs. 231/2007)',
    privacyUrl: 'https://privacy.openapi.com/?domain=openapi.it',
  },
];

// Cookie e tecnologie di archiviazione locale effettivamente usate dalla
// piattaforma. Tutti rientrano nella categoria "tecnici/necessari" ai sensi
// dell'art. 122 del Codice Privacy e non richiedono consenso.
//
// Va tenuto allineato al codice: una voce che sparisce dal registro ma resta
// nel software rende l'informativa falsa. Le chiavi in uso si trovano cercando
// `sessionStorage.` e `localStorage.` in src/.
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
  {
    etichetta: 'Rientro dalle pagine di pagamento',
    nomeTecnico: 'billing_return, checkout_return',
    categoria: 'necessario',
    finalita: 'Ricordare che l\'utente sta tornando dalle pagine di pagamento di Stripe, per riportarlo alla sezione da cui era partito invece che alla schermata iniziale',
    durata: 'Cancellato al rientro in piattaforma o alla chiusura della scheda del browser',
    fornitore: 'AdeguataVerifica.Pro',
    obbligatorio: 'Senza questo marcatore, chi rientra da Stripe con il tasto Indietro del browser perde il punto in cui si trovava',
  },
  {
    etichetta: 'Estremi della carta in uso',
    nomeTecnico: 'carta_in_uso, carta_avviso_ignorato',
    categoria: 'necessario',
    finalita: 'Mostrare quale carta è registrata per il rinnovo (circuito, ultime quattro cifre e scadenza) e avvisare quando sta per scadere, senza ripetere la richiesta al fornitore di pagamento ad ogni schermata. Il numero completo della carta non è mai presente',
    durata: 'Cancellato alla chiusura della scheda del browser',
    fornitore: 'AdeguataVerifica.Pro',
    obbligatorio: 'Necessario per segnalare in anticipo una carta in scadenza, che è la causa più comune di rinnovo non riuscito',
  },
  {
    etichetta: 'Sicurezza dei pagamenti (antifrode)',
    nomeTecnico: '__stripe_mid, __stripe_sid',
    categoria: 'necessario',
    finalita: 'Prevenzione delle frodi sui pagamenti e verifica di sicurezza della carta (autenticazione 3D Secure). Sono impostati dalla libreria Stripe.js, che viene caricata SOLO quando si avvia o si autentica un pagamento: chi non effettua pagamenti non li riceve',
    durata: 'Fino a 1 anno (__stripe_mid) e 30 minuti (__stripe_sid)',
    fornitore: 'Stripe',
    obbligatorio: 'Indispensabile per completare il pagamento in sicurezza: senza, il fornitore non può distinguere una transazione legittima da un tentativo di frode',
  },
];
