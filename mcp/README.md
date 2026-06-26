# AML MCP — Fasi 2–5

Server MCP che espone una whitelist di tool (lettura + create sicuri) riusando la logica della UI
(`api/_lib/clienteService.ts`, `personeService.ts`), con autenticazione via **PAT + JWT utente
coniato**. Funziona sia in **locale (stdio)** sia come **endpoint remoto su Vercel** (`/api/mcp`),
condividendo la stessa factory di tool. Dimostra il flusso **client MCP → server → Supabase** senza
che l'AI guidi la UI "a screenshot".

> Fasi del piano [`IMPLEMENTAZIONE_MCP_DATA_ENTRY.md`](../IMPLEMENTAZIONE_MCP_DATA_ENTRY.md):
> **Fase 2** (PoC stdio), **Fase 3** (auth PAT/JWT, `mcp_access_tokens`, RPC `mcp_resolve_token`,
> audit `source='ai'`, gate ruolo), **Fase 4** (endpoint remoto `api/mcp.ts`, whitelist
> lettura+create sicuri, pagina gestione token), **Fase 4b** (conferma in blocco:
> `proponi_piano`/`esegui_piano`/`stato_piano` + pagina di approvazione + link breve) e
> **Fase 4c** (inbox persistente "Azioni AI in attesa" con badge e storico) e
> **Fase 4d** (documenti: `documentoService` condiviso, famiglia tool documenti + uploader locale
> `upload_file`) e **Fase 5** (OAuth 2.1 — Meccanismo D, in alternativa al PAT) sono implementate.
> **Deferiti per design**: i tool che creano record `active` (incarichi, valutazioni) e gli update
> di record vivi restano fuori finché non sono incanalati nella conferma in blocco (Fase 4b).

## Whitelist tool (Fase 4)

Definita in `api/_lib/mcpServerFactory.ts`, condivisa stdio ↔ remoto. Il **tier** del token filtra
le scritture: un token `read` vede solo le letture.

- **Lettura** (tier ≥ read): `lista_clienti`, `leggi_cliente`, `cerca_soggetto`, `lista_incarichi`,
  `lista_alert`, `spiega_alert`.
- **Scrittura sicura** (tier ≥ draft): `crea_bozza_cliente` (cliente in BOZZA), `crea_soggetto`
  (crea in anagrafica solo se il CF/P.IVA non esiste; non sovrascrive — §5.2).
- **Conferma in blocco** (Fase 4b): `proponi_piano` / `esegui_piano` (tier ≥ draft), `stato_piano`
  (lettura). Vedi sezione dedicata sotto.
- **Documenti** (Fase 4d): `descrivi_tipologie_documento` (lettura), `prepara_upload_documento` /
  `conferma_upload_documento` / `carica_documento` (tier ≥ **modify**). Vedi sezione dedicata.

Ogni lettura filtra esplicitamente su `studio_id` appuntato (oltre alla RLS) → un eventuale
superadmin via MCP vede solo il proprio studio (§8.4). Non attiva record, non cancella nulla, non
accede ad altri studi: ciò che non è esposto **non esiste** per l'AI.

## Modello di sicurezza (Meccanismo A, §8.2)

- Il client passa un **PAT** `aml_pat_…` (env `MCP_PAT`). Il server lo risolve via la RPC
  `mcp_resolve_token` (SECURITY DEFINER, chiamata con la sola anon key) → ottiene `user_id` + `tier`.
  In DB c'è **solo lo SHA-256** del PAT, mai il valore in chiaro.
- Il server **conia un JWT utente HS256** (firmato con `SUPABASE_JWT_SECRET`) a breve durata
  (~5 min) col claim custom `origine='ai'`, e parla a Supabase con quell'identità → **RLS piena,
  mai service_role** (§8.1). Il claim fa marcare le scritture come `source='ai'` nell'audit (§7.6).
- Il **tier** del token (`read` | `draft` | `modify`) filtra i tool: un token `read` non vede
  alcun tool di scrittura. `crea_bozza_cliente` richiede almeno `draft`.
- Lo `studio_id` è **risolto server-side** dal profilo dell'utente, mai dal client (§8.4).
- Si creano **solo bozze incomplete** (esecuzione diretta ammessa, §7.2); attivazione e conferma
  in blocco sono Fase 4b.

## Prerequisiti

1. **Dipendenze** (già nel `package.json`): `@modelcontextprotocol/sdk`, `zod`, `jose` (JWT
   ESM-native, sostituisce `jsonwebtoken` che crashava sul runtime serverless ESM), `tsx` (dev).
   Se serve: `npm install`.
2. **Migrazioni** da applicare al progetto Supabase:
   - `supabase/migrations/20260618000000_mcp_access_tokens.sql` (tabella token + RPC)
   - `supabase/migrations/20260618000100_mcp_audit_source_ai.sql` (audit `source='ai'`)
   - `supabase/migrations/20260618000200_mcp_pending_plans.sql` (piani conferma in blocco, Fase 4b)
   - `supabase/migrations/20260618000300_documenti_mcp_stato.sql` (stato documenti MCP, Fase 4d)
   - `supabase/migrations/20260618000400_mcp_oauth.sql` (OAuth 2.1: client/codici/refresh, Fase 5)
   Applicale col tuo flusso abituale (Supabase CLI `db push`, oppure incolla nell'SQL editor).
3. **`SUPABASE_JWT_SECRET`**: il segreto JWT del progetto (Supabase → Project Settings → API →
   JWT Secret). Serve al server per coniare i JWT utente. Sta **solo** nelle env server.

## Variabili d'ambiente

**Server** (`npm run mcp:poc`):

| Variabile | Descrizione |
|---|---|
| `VITE_SUPABASE_URL` (o `MCP_SUPABASE_URL`) | URL del progetto Supabase |
| `VITE_SUPABASE_ANON_KEY` (o `MCP_SUPABASE_ANON_KEY`) | Anon key |
| `SUPABASE_JWT_SECRET` | Segreto HS256 per coniare il JWT utente |
| `MCP_PAT` | Il PAT `aml_pat_…` dell'utente come cui agire |

**Generatore PAT** (`mcp/genera-pat.ts`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`MCP_USER_EMAIL`, `MCP_USER_PASSWORD` (login per inserire il token sotto la propria RLS) +
opzionali `MCP_TOKEN_TIER` (default `draft`), `MCP_TOKEN_LABEL`, `MCP_TOKEN_TTL_DAYS`.

## 1) Generare un PAT

```bash
MCP_USER_EMAIL="utente@studio.it" \
MCP_USER_PASSWORD="..." \
VITE_SUPABASE_URL="https://xxxx.supabase.co" \
VITE_SUPABASE_ANON_KEY="ey..." \
MCP_TOKEN_TIER="draft" \
MCP_TOKEN_TTL_DAYS="30" \
npx tsx mcp/genera-pat.ts
```

Stampa il PAT **una sola volta** su stdout (i log diagnostici sono su stderr). Copialo: andrà in
`MCP_PAT`. In Fase 4 questo passaggio sarà sostituito dalla pagina *Impostazioni → "Accesso AI / MCP"*.

## 2) Avviare il server (test locale)

```bash
MCP_PAT="aml_pat_..." \
SUPABASE_JWT_SECRET="..." \
VITE_SUPABASE_URL="https://xxxx.supabase.co" \
VITE_SUPABASE_ANON_KEY="ey..." \
npm run mcp:poc
```

Il server parla **stdio**: i log diagnostici vanno su **stderr**, stdout è riservato al protocollo
MCP. Da terminale resta in attesa di un client. Type-check del lato server: `npm run typecheck:mcp`.

## 3) Collegarlo a un client MCP (es. Claude Desktop)

```jsonc
{
  "mcpServers": {
    // ① Il nostro server di scrittura (whitelisted, autenticato via PAT, RLS-scoped)
    "aml": {
      "command": "npx",
      "args": ["tsx", "C:/percorso/assoluto/al/repo/mcp/poc-stdio-server.ts"],
      "env": {
        "VITE_SUPABASE_URL": "https://xxxx.supabase.co",
        "VITE_SUPABASE_ANON_KEY": "ey...",
        "SUPABASE_JWT_SECRET": "il-jwt-secret-del-progetto",
        "MCP_PAT": "aml_pat_..."
      }
    },
    // ② Filesystem MCP ufficiale (read-only) puntato alla cartella dati di test
    "fs-dati": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/percorso/cartella/dati"]
    }
  }
}
```

Riavvia il client: comparirà il tool `crea_bozza_cliente` (se il tier del PAT è ≥ `draft`). Tipico
uso PoC: «leggi i clienti da questa cartella e creane le bozze» → l'AI legge i file col filesystem
MCP (read-only) e chiama `crea_bozza_cliente` sul nostro server. Il client mostrerà la sua conferma
per-chiamata (comodità, non la barriera di sicurezza — §7.5).

## Endpoint remoto su Vercel (Fase 4)

[`api/mcp.ts`](../api/mcp.ts) è l'endpoint **Streamable HTTP stateless**. Per ogni richiesta
autentica il PAT dall'header `Authorization`, conia il JWT utente, costruisce il server con la
stessa factory dello stdio e lo serve con un transport monouso.

- **URL**: `https://<dominio>/api/mcp`
- **Env su Vercel**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, e
  (opzionale) `MCP_APP_BASE_URL` per i link assoluti di approvazione piani (Fase 4b).
- **Runtime**: Node (usa `node:crypto` + `jose` per i JWT), **non** edge.
- **Auth**: il PAT viaggia nell'header `Authorization: Bearer aml_pat_…` (non in env, non nel body).

Config per un client MCP remoto (es. Claude Desktop):

```jsonc
{
  "mcpServers": {
    "aml": {
      "url": "https://<dominio>/api/mcp",
      "headers": { "Authorization": "Bearer aml_pat_..." }
    }
  }
}
```

## Pagina gestione token (UI)

Il componente [`AccessoMcpSettings.tsx`](../src/components/AccessoMcpSettings.tsx) è la superficie
*Impostazioni → "Accesso AI / MCP"* (§13.3): genera un PAT (mostrato **una sola volta**, salvato
solo come SHA-256), elenca/revoca i token, mostra l'URL endpoint e uno snippet di config pronto.
È innestato in [`Impostazioni.tsx`](../src/components/Impostazioni.tsx) dopo la sezione Cestino.
Richiede la migrazione `20260618000000_mcp_access_tokens.sql` applicata (altrimenti mostra un avviso).

## Conferma in blocco (Fase 4b)

Per le **scritture di massa** l'AI non scrive direttamente: propone un piano e aspetta
l'approvazione umana. Flusso a due fasi, garantito server-side (§7.3):

1. L'AI chiama **`proponi_piano({ titolo?, azioni })`** — `azioni` è una lista di
   `{ tool: 'crea_bozza_cliente' | 'crea_soggetto', args }`. Il server valida ogni azione, salva il
   piano in stato `pending` (tabella `mcp_pending_plans`) e restituisce un **link breve** alla
   pagina di approvazione (`/?mcp_plan=<id>`). **Nulla è ancora scritto.**
2. L'AI mostra il link all'utente. L'utente lo apre → **pagina di approvazione**
   ([`PianoApprovazione.tsx`](../src/components/PianoApprovazione.tsx)) → **Approva / Rifiuta**.
3. L'AI chiama **`esegui_piano(plan_id)`**: il server esegue **solo se** lo stato è `approved`
   (claim atomico approved→executing), poi salva l'esito per-azione (`executed`).
4. **`stato_piano(plan_id)`** permette all'AI di attendere/verificare lo stato.

La transizione ad `approved` avviene **solo dalla UI**: non esiste un tool MCP per approvare, quindi
l'AI — pur autenticata come lo stesso utente — non può auto-approvarsi. È il checkpoint umano (§7.4).

> **Env opzionale** `MCP_APP_BASE_URL` (es. `https://<dominio>`): se impostata, `proponi_piano`
> restituisce un link assoluto; altrimenti un path relativo `/?mcp_plan=<id>`.

## Inbox "Azioni AI in attesa" (Fase 4c)

Oltre al link breve, i piani sono raggiungibili da una **sezione persistente in-app**
([`AzioniAiInAttesa.tsx`](../src/components/AzioniAiInAttesa.tsx)), aperta dal pulsante 🤖
nell'header (con **badge** del numero di piani in attesa, aggiornato in realtime). Mostra i piani
**da approvare** e lo **storico** (approvati/rifiutati/eseguiti/scaduti); il dettaglio per-azione e
l'Approva/Rifiuta riusano la stessa pagina di approvazione. È la superficie UI #2 del piano (§13.3).

## Documenti (Fase 4d)

L'upload documenti non è un semplice trasferimento: ogni documento va **associato** (persona /
cliente / incarico, secondo il `level` della tipologia) e corredato di metadati. La logica
(enum tipologie, regola level→id, obbligatorietà `data_scadenza`, calcolo path) vive in
[`documentoService.ts`](../api/_lib/documentoService.ts), **condiviso con la UI**
([`DocumentiAllegati.tsx`](../src/components/DocumentiAllegati.tsx) importa l'enum da lì, §9).

Flusso (Opzione 1 estesa, §5.1.2) — il **byte del file non transita mai nel contesto dell'AI**:

1. `descrivi_tipologie_documento()` → enum con `level`, `id_obbligatorio`, `scadenza_obbligatoria`.
2. L'AI risolve l'associazione con `lista_clienti`/`lista_incarichi`/`cerca_soggetto`.
3. `prepara_upload_documento(metadata)` → valida (tipologia, id del level corretto appartenente allo
   studio, scadenza dove richiesta), crea la riga `documenti` in stato `pending` e restituisce
   `file_path` + `upload_token`.
4. `upload_file(path_locale, file_path, upload_token)` — **MCP locale**
   ([`upload-file-server.ts`](upload-file-server.ts)) — carica il PDF dal disco allo Storage via
   signed upload, senza leggerne i byte nel contesto.
5. **Approvazione umana** dell'associazione nell'inbox "Azioni AI in attesa" → `mcp_stato='approved'`.
6. `conferma_upload_documento(doc_id)` → finalizza (`confirmed`) **solo se** approvato e file presente.

> Fallback PoC: `carica_documento(metadata, contenuto_base64)` (≤ 1 MB) evita l'uploader locale ma
> fa transitare il file nel contesto → **solo PoC, non produzione** (§5.1.4).

Config del MCP locale di upload (accanto al filesystem MCP e al server AML):

```jsonc
{
  "mcpServers": {
    "aml-upload": {
      "command": "npx",
      "args": ["tsx", "C:/percorso/assoluto/al/repo/mcp/upload-file-server.ts"],
      "env": { "VITE_SUPABASE_URL": "https://xxxx.supabase.co", "VITE_SUPABASE_ANON_KEY": "ey..." }
    }
  }
}
```

## OAuth 2.1 (Fase 5, Meccanismo D)

Evoluzione del PAT: il client MCP ottiene l'identità con un flow OAuth standard (authorization code
+ PKCE), l'utente autorizza **loggandosi sulla piattaforma** (niente token da copia-incollare), il
client riceve access/refresh token e li rinnova da solo. Stesso core e stessa RLS del Meccanismo A:
l'**access token è un JWT Supabase coniato** (claim `origine='ai'` + `tier`), quindi `/api/mcp` lo
verifica e lo usa direttamente come identità. `/api/mcp` accetta **sia** un PAT `aml_pat_…` **sia**
un access token OAuth (rilevati dall'header `Authorization`).

Componenti:
- **Discovery**: `/.well-known/oauth-protected-resource` e `/.well-known/oauth-authorization-server`
  (via rewrite in [`vercel.json`](../vercel.json) → [`api/oauth-metadata.ts`](../api/oauth-metadata.ts)).
  `/api/mcp` risponde `401` con header `WWW-Authenticate` che punta alla resource metadata.
- **Endpoint**: [`api/oauth-register.ts`](../api/oauth-register.ts) (dynamic client registration),
  [`api/oauth-authorize.ts`](../api/oauth-authorize.ts) (valida + reindirizza al consenso),
  [`api/oauth-token.ts`](../api/oauth-token.ts) (code/refresh → token),
  [`api/oauth-revoke.ts`](../api/oauth-revoke.ts).
- **Consenso**: [`ConsensoMcp.tsx`](../src/components/ConsensoMcp.tsx) (atterraggio `?mcp_oauth=…`):
  l'utente loggato sceglie il tier e autorizza; il code è creato **nella sua sessione** (RLS), poi
  redirect al `redirect_uri` del client.
- **Persistenza** ([migrazione](../supabase/migrations/20260618000400_mcp_oauth.sql)): client, codici
  (single-use, PKCE verificato in SQL) e refresh token rotanti; gli scambi del token endpoint passano
  da RPC `SECURITY DEFINER` (path anon, niente `service_role`).

> **Env**: oltre a quelle del Meccanismo A, imposta `MCP_APP_BASE_URL` = origine pubblica del
> deployment (issuer OAuth + redirect di consenso). Config del client MCP: basta l'URL del server
> remoto (`https://<dominio>/api/mcp`) **senza** header `Authorization` — il client scopre l'OAuth
> dalla `WWW-Authenticate`/metadata e avvia il flow da solo.

## Gate di ruolo "app-only" (RT1)

`api/_lib/mcpTools.ts` espone `requireRole(client, userId, allowed[])`: i tool su domini gated
solo dalla UI (es. autovalutazione RT1, admin/superadmin — §4) devono richiamarlo prima di
scrivere, perché la RLS non impone quel confine. È pronto per i tool gated della Fase 4.

## Note tecniche

- Il PoC riusa il **core condiviso** `api/_lib/clienteService.ts` (+ `personeService.ts`): la
  stessa fonte di verità della UI. I moduli sono neutri (no React, no singleton) per caricarsi in Node.
- Auth: `api/_lib/mcpAuth.ts` (PAT → JWT) e `api/_lib/mcpTools.ts` (schema + tier + gate ruolo).
- `tsconfig.app.json` ha `ignoreDeprecations: "6.0"`, non valido per la versione di TypeScript
  installata (rompe `npm run typecheck`). `tsconfig.mcp.json` lo corregge a `"5.0"`. Conviene
  allineare anche la config dell'app.

## Limite di verifica

Il flusso end-to-end **reale** richiede credenziali Supabase valide, le migrazioni applicate e uno
studio di test: va eseguito nel tuo ambiente (non su dati AML reali da un altro contesto). Qui sono
verificati: type-check pulito del server e dei moduli condivisi, caricamento dell'intero grafo in
Node senza crash, e test unitari su hashing PAT / gerarchia tier / minting del JWT.
