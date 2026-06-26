# Configurazione Sistema di Autenticazione

## 📋 Panoramica

Il sistema di autenticazione è stato implementato utilizzando **Supabase Auth**, che gestisce automaticamente:
- ✅ Cifratura delle password (bcrypt)
- ✅ Gestione delle sessioni con JWT
- ✅ Persistenza del login ("Ricordati di me")
- ✅ Sicurezza e protezione contro attacchi comuni

## 🔧 Configurazione Supabase

### 1. Abilitare l'autenticazione Email/Password

1. Accedi al pannello di controllo Supabase: https://app.supabase.com
2. Seleziona il tuo progetto
3. Nel menu laterale, vai su **Authentication** → **Providers**
4. Abilita **Email** provider se non è già attivo
5. Configura le impostazioni:
   - **Enable Email provider**: ON
   - **Confirm email**: Puoi disabilitarlo per test (sconsigliato in produzione)
   - **Secure email change**: ON (consigliato)

### 2. Configurare le Email Templates (Opzionale)

In **Authentication** → **Email Templates** puoi personalizzare:
- Email di conferma registrazione
- Email di reset password
- Email di cambio indirizzo

### 3. Configurare le URL di Redirect

In **Authentication** → **URL Configuration**:
- **Site URL**: `http://localhost:5173` (per sviluppo)
- **Redirect URLs**: Aggiungi le URL della tua applicazione

## 👤 Creazione Utenti

### Metodo 1: Tramite Pannello Supabase (Consigliato per primi utenti)

1. Nel pannello Supabase, vai su **Authentication** → **Users**
2. Clicca su **Add user** → **Create new user**
3. Inserisci:
   - **Email**: l'indirizzo email dell'utente
   - **Password**: una password sicura (minimo 6 caratteri)
   - **Auto Confirm User**: Attiva questa opzione per bypassare la conferma email
4. Clicca su **Create user**

L'utente potrà ora accedere con queste credenziali.

### Metodo 2: Tramite API (Per registrazioni future)

Se vuoi implementare una pagina di registrazione, puoi usare:

```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'utente@esempio.it',
  password: 'password_sicura',
  options: {
    data: {
      // Dati aggiuntivi opzionali
      full_name: 'Nome Cognome',
      role: 'user'
    }
  }
});
```

### Metodo 3: Tramite SQL (Avanzato)

```sql
-- ATTENZIONE: Questo crea un utente nel sistema Auth di Supabase
-- Usa questo metodo solo se sai cosa stai facendo

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  email_change_token_current,
  email_change_confirm_status,
  recovery_token,
  raw_app_meta_data,
  raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@esempio.it',
  crypt('password123', gen_salt('bf')),  -- Password cifrata
  now(),
  now(),
  now(),
  '',
  '',
  0,
  '',
  '{"provider":"email","providers":["email"]}',
  '{}'
);
```

## 🔐 Sicurezza delle Password

Supabase utilizza **bcrypt** per cifrare le password, uno degli algoritmi più sicuri disponibili. Le password sono:
- ✅ Cifrate con salt unico per ogni utente
- ✅ Non reversibili (hash one-way)
- ✅ Protette contro attacchi rainbow table
- ✅ Conformi agli standard di sicurezza moderni

**Non c'è nessuna tabella personalizzata per le password** - tutto è gestito internamente da Supabase in modo sicuro.

## 📊 Tabella Profili (Opzionale)

Se vuoi memorizzare informazioni aggiuntive sugli utenti (es. nome completo, ruolo, avatar), crea una tabella `profiles`:

```sql
-- Crea tabella profili
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  role TEXT DEFAULT 'user',
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Abilita RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Gli utenti possono leggere solo il proprio profilo
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Policy: Gli utenti possono aggiornare solo il proprio profilo
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Trigger per creare automaticamente un profilo quando si crea un utente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## 🧪 Test del Sistema

### 1. Crea un utente di test

Usa il pannello Supabase per creare un utente con:
- Email: `test@esempio.it`
- Password: `Test123!`

### 2. Avvia l'applicazione

```bash
npm run dev
```

### 3. Testa il login

1. Apri http://localhost:5173
2. Dovresti vedere la schermata di login
3. Inserisci le credenziali create
4. Clicca su "ACCEDI"
5. Se tutto funziona, verrai reindirizzato alla Dashboard

### 4. Testa il logout

1. Clicca sul pulsante "Esci" in alto a destra
2. Verrai riportato alla schermata di login

### 5. Testa "Ricordati di me"

1. Fai login con la checkbox "Ricordati di me" selezionata
2. Chiudi il browser
3. Riapri l'applicazione
4. Dovresti essere ancora autenticato

## 🔍 Risoluzione Problemi

### Problema: "Invalid login credentials"

**Causa**: Email o password errati, oppure utente non confermato.

**Soluzione**:
1. Verifica che l'email e password siano corretti
2. Nel pannello Supabase, vai su Authentication → Users
3. Controlla che l'utente abbia `email_confirmed_at` valorizzato
4. Se necessario, clicca sull'utente e seleziona "Confirm email"

### Problema: L'applicazione non carica

**Causa**: Variabili d'ambiente mancanti.

**Soluzione**:
1. Verifica che il file `.env` contenga:
   ```
   VITE_SUPABASE_URL=tua_url_supabase
   VITE_SUPABASE_ANON_KEY=tua_chiave_anonima
   ```
2. Riavvia il server di sviluppo

### Problema: Il logout non funziona

**Causa**: Problema con la sessione Supabase.

**Soluzione**:
1. Apri la console del browser (F12)
2. Vai nella tab "Application" → "Local Storage"
3. Rimuovi tutti i dati relativi a Supabase
4. Ricarica la pagina

## 📚 Risorse Utili

- [Documentazione Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Gestione Utenti](https://supabase.com/docs/guides/auth/managing-user-data)

## 🚀 Prossimi Passi

1. ✅ Sistema di autenticazione implementato
2. ⏭️ (Opzionale) Implementare pagina di registrazione
3. ⏭️ (Opzionale) Implementare reset password
4. ⏭️ (Opzionale) Aggiungere gestione ruoli utenti
5. ⏭️ (Opzionale) Implementare verifica 2FA
