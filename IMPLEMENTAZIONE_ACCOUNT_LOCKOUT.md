# Account Lockout - guida finale di integrazione

Implementazione di blocco account dopo 5 tentativi di login falliti, con
notifica email all'utente tramite EmailJS. Sblocco manuale a cura di admin.

## File creati / modificati

- `supabase/migrations/20260420000000_account_lockout.sql`        (nuovo)
- `supabase/migrations/20260420010000_self_unlock_account.sql`    (nuovo)
- `src/lib/loginSecurity.ts`                                       (nuovo)
- `documentazione/email-templates/lockout-template.html`           (nuovo, da incollare su EmailJS)
- `src/components/Login.tsx`                                       (modificato: handleLogin + self-unlock in handleVerifyOtp)
- `src/components/admin/UsersManagement.tsx`                       (modificato: pannello account bloccati + bottone Sblocca)
- `IMPLEMENTAZIONE_ACCOUNT_LOCKOUT.md`                             (questo file)

## Passi da completare manualmente

### 1. Applicare la migration su Supabase

```
supabase db push
```
(oppure copia/incolla il file SQL nel SQL Editor di Supabase.)

### 2. Configurare EmailJS

1. Crea un account su https://www.emailjs.com/ (free: 200 email/mese).
2. Aggiungi un "Email Service" (es. Gmail/Outlook/SMTP del tuo dominio).
3. Crea un "Email Template" incollando `documentazione/email-templates/lockout-template.html`
   nella sezione "Content" (tab HTML).
4. Imposta i campi del template:
   - **To Email**: `{{to_email}}`
   - **From Name**: `AdeguataVerifica.Pro`
   - **Reply To**: `{{support_email}}`
   - **Subject**: `[{{app_name}}] Il tuo account e' stato bloccato`
5. Annota `SERVICE_ID`, `TEMPLATE_ID`, `PUBLIC_KEY`.

### 3. Variabili d'ambiente

Aggiungi a `.env` (locale) e alle env vars di Vercel (produzione):

```
VITE_EMAILJS_SERVICE_ID=service_xxxxx
VITE_EMAILJS_TEMPLATE_ID_LOCKOUT=template_xxxxx
VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxx
VITE_SUPPORT_EMAIL=assistenza@tuodominio.it
```

Se le variabili non sono configurate il codice in `src/lib/loginSecurity.ts`
logga un warning e il blocco avviene comunque: solo l'email non parte.

### 4. Pannello admin: sblocco account

Gia' wired in `src/components/admin/UsersManagement.tsx`:

- Un riquadro rosso "Account bloccati (N)" appare sopra la lista utenti quando
  esiste almeno un lockout attivo (SELECT su `account_lockouts` dove
  `unlocked_at IS NULL`; la RLS gia' lo permette ad admin/superadmin).
- Ogni riga mostra email, timestamp e se la mail di notifica e' partita.
- Bottone "Sblocca" chiama `adminUnlockAccount(email)` (vedi
  `src/lib/loginSecurity.ts`) → RPC `admin_unlock_account`.

## Come funziona

### Lock
1. Prima di `signInWithPassword`, il client chiama `check_account_lockout`.
   Se l'account e' bloccato mostra subito il messaggio.
2. Se il login fallisce con "Invalid login credentials", chiama
   `record_login_attempt(email, false)`:
   - L'RPC inserisce un record in `login_attempts`.
   - Se l'email non esiste in `auth.users`, non crea lockout (evita DoS su
     account fake e riduce enumeration).
   - Se in `login_attempts` ci sono >= 5 fallimenti negli ultimi 15 minuti,
     crea una riga in `account_lockouts` e ritorna `just_locked: true`.
   - Errori diversi (5xx, rate limit, rete) non sono contati.
3. Al `just_locked: true`, il client chiama `sendLockoutEmail` (EmailJS) e al
   termine marca `notification_sent_at` tramite `mark_lockout_notified`.

### Unlock — tre percorsi possibili

**A. Self-unlock via reset password (no intervento assistenza)**
L'utente usa "Password dimenticata", riceve l'OTP, imposta nuova password.
In `handleVerifyOtp`, dopo `updateUser` riuscito, il client chiama
`selfUnlockAccount()` che invoca la RPC `self_unlock_account()`. La RPC deriva
l'email da `auth.uid()` (non accetta parametri), quindi l'utente puo' sbloccare
solo il proprio account.

**B. Unlock manuale admin dal pannello utenti**
Admin/superadmin apre "Gestione Utenti" e vede il riquadro "Account bloccati".
Click su "Sblocca" chiama `admin_unlock_account(email)` che richiede ruolo
`admin` o `superadmin` (verificato nella RPC stessa).

**C. Cleanup al login riuscito**
Se per qualche motivo una riga `account_lockouts` resta con `unlocked_at = NULL`
ma l'utente riesce a loggarsi (es. admin ha azzerato manualmente solo i
tentativi), `record_login_attempt(email, true)` chiude la riga.

## Limiti noti / trade-off

- **DoS sull'account altrui**: chiunque conosca l'email di un utente reale puo'
  bloccarla con 5 login errati. Mitigazione possibile: accoppiare il count
  per `(email, ip)` invece che solo `email`, oppure pretendere CAPTCHA dopo 2-3
  fallimenti. Rimandato.
- **Enumeration via timing**: la RPC risponde piu' velocemente per email
  inesistenti (salta la query sui lockout). Differenza nell'ordine dei ms,
  non materiale in HTTPS + Supabase. Non mitigato.
- **EmailJS public key**: esposto al client by design. Se un attaccante
  volesse abusare del servizio di invio email dovrebbe conoscere anche
  SERVICE_ID + TEMPLATE_ID e il template accetta solo `{{to_email}}` che
  finisce come destinatario: puo' inviare email di "blocco" a indirizzi
  arbitrari. Per evitarlo, il passaggio definitivo a **Resend + Edge
  Function** (server-side) e' consigliato.
- **Pulizia login_attempts**: la tabella cresce senza limite. Aggiungere un
  cron (pg_cron) che elimina righe piu' vecchie di 7 giorni, oppure un
  Supabase scheduled function.

## Test rapido

1. Dal browser, login con password sbagliata 5 volte sullo stesso email.
2. Al 5o tentativo dovrebbe apparire il messaggio di account bloccato e
   partire l'email (se EmailJS configurato).
3. Da SQL Editor di Supabase: `SELECT * FROM account_lockouts;` deve
   mostrare la riga.
4. Per sbloccare: `SELECT admin_unlock_account('utente@example.it');`
   (mentre sei loggato come admin/superadmin).
