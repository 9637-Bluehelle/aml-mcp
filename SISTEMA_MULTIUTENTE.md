# Sistema Multiutente - Documentazione

## 📋 Panoramica

La piattaforma AML-REV è stata configurata come **sistema multiutente** con isolamento completo dei dati tra utenti.

## 🔐 Sicurezza Implementata

### Row Level Security (RLS)
Ogni tabella del database utilizza **Row Level Security** di Supabase per garantire che:
- ✅ Ogni utente vede **SOLO i propri dati**
- ✅ Non può accedere, modificare o eliminare dati di altri utenti
- ✅ La sicurezza è applicata a livello database (non bypassabile dal frontend)

### Tabelle Protette
Le seguenti tabelle hanno isolamento per utente:
- `clienti` - Clienti
- `autovalutazioni` - RT1 Autovalutazioni
- `incarichi` - RT2 Incarichi
- `valutazioni_rischio` - RT2 Valutazioni di rischio
- `documenti` - RT3 Documenti
- `controlli_costanti` - RT4 Controlli costanti
- `segnalazioni_sos` - RT4 Segnalazioni SOS
- `alert` - Alert e notifiche
- `titolari_effettivi` - Titolari effettivi (collegati ai clienti)

## 🔧 Come Funziona

### 1. **Colonna `user_id`**
Ogni tabella ha una colonna `user_id` che:
- Si riferisce all'utente autenticato in `auth.users`
- Viene **automaticamente valorizzata** quando si inseriscono nuovi record
- **Non può essere modificata** dopo l'inserimento

### 2. **Default Automatico**
```sql
user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid()
```
Questo significa che quando il frontend inserisce un nuovo record, **non deve specificare user_id** - verrà automaticamente impostato all'ID dell'utente corrente.

### 3. **Policies RLS**
Esempio di policy per la tabella `clienti`:
```sql
CREATE POLICY "Users can view own clienti"
  ON clienti FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```
Questo garantisce che le query SELECT restituiscano solo i record dove `user_id` corrisponde all'utente autenticato.

## 💻 Impatto sul Codice Frontend

### ✅ Nessuna Modifica Necessaria!

Grazie al `DEFAULT auth.uid()`, il codice frontend **non necessita modifiche**:

```typescript
// PRIMA (senza multiutente)
const { data, error } = await supabase
  .from('clienti')
  .insert({ ragione_sociale: 'Acme', ... });

// DOPO (con multiutente)  
const { data, error } = await supabase
  .from('clienti')
  .insert({ ragione_sociale: 'Acme', ... });
// user_id viene aggiunto automaticamente dal database!
```

### 📊 Le Query Vengono Filtrate Automaticamente

```typescript
// Questa query restituisce SOLO i clienti dell'utente corrente
const { data } = await supabase
  .from('clienti')
  .select('*');
// RLS filtra automaticamente per user_id!
```

## 🧪 Testing Multi-Utente

### 1. Crea Due Utenti di Test

Nel pannello Supabase:
1. Vai su **Authentication** → **Users**
2. Crea **Utente A**: `utente-a@test.it` / `Password123!`
3. Crea **Utente B**: `utente-b@test.it` / `Password123!`
4. Per entrambi, attiva "Auto Confirm User"

### 2. Test Isolamento Dati

**Con Utente A:**
1. Fai login come `utente-a@test.it`
2. Crea un cliente (es. "Cliente A1")
3. Vai su RT1 e crea un'autovalutazione
4. Logout

**Con Utente B:**
1. Fai login come `utente-b@test.it`  
2. Vai nella lista clienti → **Non dovresti vedere "Cliente A1"**
3. Crea un cliente (es. "Cliente B1")
4. Vai su RT1 → Dovresti vedere solo le tue autovalutazioni

**Verifica Incrociata:**
1. Torna come Utente A
2. Controlla lista clienti → Dovresti vedere solo "Cliente A1", non "Cliente B1"

## 🔍 Verifica Database

### Query SQL per Ispezionare i Dati

```sql
-- Vedi tutti i clienti con il loro proprietario
SELECT 
  c.id,
  c.ragione_sociale,
  c.codice_cliente,
  u.email as proprietario
FROM clienti c
LEFT JOIN auth.users u ON c.user_id = u.id
ORDER BY u.email, c.ragione_sociale;

-- Conta clienti per utente
SELECT 
  u.email,
  COUNT(c.id) as num_clienti
FROM auth.users u
LEFT JOIN clienti c ON u.id = c.user_id
GROUP BY u.email
ORDER BY num_clienti DESC;
```

### Verifica RLS Policies

```sql
-- Lista tutte le policies per una tabella
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'clienti';
```

## 🚨 Risoluzione Problemi

### Problema: Utente non vede i propri dati

**Causa possibile:** Record creati prima della migration senza `user_id`

**Soluzione:**
```sql
-- Assegna tutti i record orfani a un utente specifico
UPDATE clienti 
SET user_id = 'UUID_UTENTE_ADMIN' 
WHERE user_id IS NULL;
```

### Problema: Errore "new row violates row-level security policy"

**Causa:** L'utente sta cercando di inserire un record con un `user_id` diverso dal proprio

**Soluzione:** Non specificare `user_id` nell'INSERT - lascia che il DEFAULT lo gestisca

### Problema: Query restituisce dati vuoti dopo migration

**Causa:** RLS è attivo ma i dati esistenti non hanno `user_id`

**Soluzione:** La migration dovrebbe averli già assegnati, ma verifica con:
```sql
SELECT COUNT(*) FROM clienti WHERE user_id IS NULL;
```

## 📈 Statistiche e Monitoring

### Dashboard Admin (Future Enhancement)

Potrai creare una dashboard admin che:
- Mostra il numero di utenti registrati
- Conta i clienti per ogni utente
- Monitora l'attività della piattaforma

### Esempio Query per Stats:

```sql
-- Overview generale
SELECT 
  (SELECT COUNT(*) FROM auth.users) as totale_utenti,
  (SELECT COUNT(*) FROM clienti) as totale_clienti,
  (SELECT COUNT(*) FROM incarichi) as totale_incarichi,
  (SELECT COUNT(*) FROM autovalutazioni) as totale_autovalutazioni;

-- Utenti più attivi
SELECT 
  u.email,
  COUNT(DISTINCT c.id) as num_clienti,
  COUNT(DISTINCT i.id) as num_incarichi,
  COUNT(DISTINCT a.id) as num_autovalutazioni
FROM auth.users u
LEFT JOIN clienti c ON u.id = c.user_id
LEFT JOIN incarichi i ON u.id = i.user_id
LEFT JOIN autovalutazioni a ON u.id = a.user_id
GROUP BY u.email
ORDER BY num_clienti DESC;
```

## 🔄 Migrazione Dati Esistenti

I dati esistenti sono stati automaticamente assegnati al primo utente creato nella piattaforma.

Se vuoi riassegnarli a un utente specifico:

```sql
-- Trova l'ID dell'utente target
SELECT id, email FROM auth.users WHERE email = 'proprietario@esempio.it';

-- Riassegna tutti i dati a quell'utente
UPDATE clienti SET user_id = 'UUID_UTENTE_TARGET';
UPDATE autovalutazioni SET user_id = 'UUID_UTENTE_TARGET';
UPDATE incarichi SET user_id = 'UUID_UTENTE_TARGET';
-- etc...
```

## ✅ Checkpoint di Sicurezza

Prima di andare in produzione, verifica:

- [ ] RLS è abilitato su tutte le tabelle (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] Ogni tabella ha policies per SELECT, INSERT, UPDATE, DELETE
- [ ] Le policies usano `auth.uid() = user_id`
- [ ] La colonna `user_id` ha `DEFAULT auth.uid()`
- [ ] Nessun record ha `user_id = NULL`
- [ ] Test con 2+ utenti confermano l'isolamento

## 📚 Riferimenti

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- Migration applicata: `supabase/migrations/20251101000000_add_multiuser_support.sql`

---

**Ultimo aggiornamento:** 1 Novembre 2024
**Versione:** 1.0.0
