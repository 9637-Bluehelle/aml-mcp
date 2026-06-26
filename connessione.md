# Connessione al Database da altra macchina via SSH Tunnel

## Prerequisiti
- VS Code installato sulla nuova macchina
- Il progetto AML-rev clonato sulla nuova macchina
- Node.js installato sulla nuova macchina

## Server (95.216.220.211)

### 1. Abilitare autenticazione SSH con password (una tantum)

```bash
sudo nano /etc/ssh/sshd_config
```

Trovare e modificare la riga:
```
#PasswordAuthentication yes
```
in:
```
PasswordAuthentication yes
```

Salvare (`Ctrl+O`, `Invio`, `Ctrl+X`) e riavviare SSH:

```bash
sudo systemctl restart ssh
```

### 2. Verificare che Supabase sia attivo

```bash
cd ~/claude/progetto-aml/AML-rev
npx supabase status
```

Se non è attivo:
```bash
npx supabase start
```

## Nuova macchina (VS Code)

### 1. Aprire il terminale integrato
`Ctrl + `` ` oppure menu **Terminal → New Terminal**

### 2. Creare il tunnel SSH
```bash
ssh -L 54321:127.0.0.1:54321 -L 54322:127.0.0.1:54322 -L 54323:127.0.0.1:54323 massimino@95.216.220.211
```

Inserire la password e **lasciare il terminale aperto**.

### 3. Aprire un secondo terminale
Cliccare il **+** nel pannello terminale

### 4. Installare le dipendenze e avviare il progetto
```bash
cd /percorso/del/progetto/AML-rev
npm install
npm run dev
```

### 5. Aprire il browser
- **App**: http://localhost:4200
- **Supabase Studio**: http://localhost:54323

## Porte utilizzate

| Servizio | Porta | Descrizione |
|----------|-------|-------------|
| API Supabase | 54321 | REST API, auth, storage |
| PostgreSQL | 54322 | Connessione diretta al DB |
| Studio | 54323 | Dashboard web Supabase |

## Note
- Il tunnel SSH deve restare aperto per tutta la durata della sessione di lavoro
- Se la connessione cade, rieseguire il comando SSH dello step 2
