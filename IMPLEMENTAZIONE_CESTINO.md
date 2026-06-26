# Implementazione Cestino (soft-delete + svuotamento)

> **Stato:** Piano approvato, in implementazione (Fase 0).
> **Obiettivo:** introdurre un cestino reversibile per i dati della piattaforma, con
> permessi configurabili per studio e svuotamento manuale (o automatico opzionale),
> gestendo correttamente tutte le connessioni tra le entità.

---

## 1. Contesto e principio

Oggi l'eliminazione è **hard e irreversibile**: `.delete()` su `clienti`/`incarichi`
([`EliminaClienteIncarico.tsx`](src/components/EliminaClienteIncarico.tsx)) e i CASCADE del DB
spazzano via tutto il fascicolo. Non esiste recupero. L'archiviazione (`archiviato`) è solo un
flag di conservazione, **non** un soft-delete.

Il cestino introduce uno stadio intermedio reversibile:

```
DATO VIVO  →  [Sposta nel cestino]  →  CESTINO (soft-delete, nascosto, reversibile)
                                          │
                          ┌───────────────┴────────────────┐
                   [Ripristina]                  [Svuota] / [auto-purge opzionale]
                          │                                 │
                      DATO VIVO                  HARD DELETE (CASCADE + file Storage)
```

- **Soft-delete** = `deleted_at` valorizzato: il record è nascosto ovunque ma le FK **non**
  vengono toccate (i CASCADE restano "armati" ma non scattano).
- **Hard-delete** (svuotamento o purge) = il `DELETE` vero → scattano i CASCADE esistenti **+**
  rimozione dei file da Storage (oggi non gestita dai CASCADE).

Il cestino riusa l'intera cascata FK già presente nel DB, toccandola solo al momento della
cancellazione definitiva.

---

## 2. Decisioni acquisite

1. **Ambito:** tutto, **anagrafiche incluse** — clienti, incarichi, documenti, valutazioni RT2,
   controlli RT3, segnalazioni SOS, titolari effettivi, catena di controllo, autovalutazioni RT1,
   anagrafica soggetti (con guardia "in uso", §6).
2. **Permessi:** **configurabili dal proprietario** per studio (chi cestina / ripristina /
   svuota), con default "tutti cestinano e ripristinano, solo admin svuota".
3. **Scadenza:** auto-purge **opzionale e per-studio**, **spento di default**. La cancellazione
   definitiva è normalmente un'azione esplicita dell'admin.
4. **Rapporto con Archiviati:** concetti **distinti**. Archiviato = conservazione a lungo termine
   (nessuna scadenza). Cestino = anticamera della cancellazione. Un record archiviato può poi
   essere cestinato; nessuna modifica al meccanismo di archiviazione esistente.

---

## 3. Modello dati

### 3.1 Soft-delete sulle entità cestinabili
`deleted_at TIMESTAMPTZ NULL` + `deleted_by UUID NULL` + indice parziale su:

`clienti`, `incarichi`, `documenti`, `valutazioni_rischio`, `controlli_costanti`,
`segnalazioni_sos`, `titolari_effettivi`, `catena_controllo_nodi`, `catena_controllo_archi`,
`autovalutazioni`, `anagrafica_soggetti`.

`deleted_at` è distinto da `archiviato`.

### 3.2 Tabella batch `cestino`
Registra ogni operazione di cestinamento come unità logica → ripristino e purge esatti.

```
cestino (
  id           uuid pk,
  studio_id    uuid → studi(id) on delete cascade,
  entity_type  text,        -- 'cliente'|'incarico'|'documento'|'anagrafica'|'autovalutazione'
  entity_id    uuid,        -- la radice cestinata
  etichetta    text,        -- es. "Cliente: Rossi SRL (CLI-001)"
  elementi     jsonb,       -- [{tabella,id,archiviato_precedente}] dei record toccati
  riepilogo    jsonb,       -- conteggi {incarichi:3, documenti:12, ...}
  file_paths   text[],      -- path Storage da rimuovere all'hard-delete
  deleted_by   uuid,
  deleted_at   timestamptz default now(),
  stato        text default 'in_cestino'  -- 'in_cestino'|'ripristinato'|'eliminato'
)
```

`elementi` rende il **ripristino esatto**: si ripristinano solo i record che *questo* batch ha
cestinato (senza riportare in vita un incarico cestinato a parte). `purge_at` non è memorizzato:
la soglia è calcolata dinamicamente dal cron in base all'impostazione corrente dello studio.

### 3.3 Impostazioni (colonne aggiunte a `impostazioni_studio`, già per-studio)

| Colonna | Valori | Default | Significato |
|---|---|---|---|
| `cestino_chi_cestina` | `'tutti'` \| `'solo_admin'` | `'tutti'` | chi può spostare nel cestino |
| `cestino_chi_ripristina` | `'tutti'` \| `'solo_admin'` | `'tutti'` | chi può ripristinare |
| `cestino_chi_svuota` | `'tutti'` \| `'solo_admin'` | `'solo_admin'` | chi può cancellare definitivamente |
| `cestino_auto_purge_giorni` | `integer` o `NULL` | `NULL` (spento) | giorni prima del purge automatico |

Asse collaboratori vs admin (`tutti`/`solo_admin`); `superadmin` sempre ammesso.

---

## 4. Logica server-side (RPC atomiche, RLS-scoped)

- **`cestino_puo(p_azione)`** — helper: legge `impostazioni_studio` + `user_profiles.role` →
  true/false. Usato da tutte le RPC.
- **`cestina(entity_type, entity_id)`** — verifica permesso + proprietà studio; calcola i
  discendenti via FK; setta `deleted_at`/`deleted_by` (solo dove `NULL`); salva il batch con
  `elementi`/`riepilogo`/`file_paths`; `check_alerts(studio_id)`.
- **`ripristina(cestino_id)`** — azzera `deleted_at` solo sugli `elementi` del batch ancora
  soft-deleted; ripristina `archiviato_precedente`; `stato='ripristinato'`; `check_alerts`.
- **`svuota_elemento(cestino_id)`** / **`svuota_cestino()`** — gate svuota; hard-delete delle
  radici (CASCADE fa il resto); `stato='eliminato'`. File Storage rimossi dal chiamante/cron.
- **`purge_cestino_scaduti()`** — usata dal cron: per ogni studio con `cestino_auto_purge_giorni`
  non NULL, purga i batch con `deleted_at + giorni ≤ now()`.

I gate vivono **dentro le RPC**, non solo nella UI.

---

## 5. File su Storage

I CASCADE **non** rimuovono i PDF dal bucket `file_allegati`. Quindi:
- al cestinamento i file restano (servono per il ripristino); i path si salvano in `file_paths`;
- all'hard-delete: prima `storage.remove(file_paths)`, poi `DELETE` DB;
- auto-purge: cron `api/purge-cestino.ts` (Vercel, `service_role`) che rimuove i file e chiama
  `purge_cestino_scaduti()`.

---

## 6. Anagrafiche condivise — guardia + cestinamento col cliente

`anagrafica_soggetti` è puntata da più clienti con FK `ON DELETE SET NULL`.

**Cestinamento diretto di un'anagrafica** (`cestina('anagrafica')`): **rifiuta** se la persona è
ancora referenziata da record **non cestinati** (`clienti.persona_id`/`rappresentante_persona_id`,
`titolari_effettivi.persona_id`, `catena_controllo_nodi.persona_id`, `documenti.persona_id`),
evitando SET NULL silenziosi.

**Cestinamento di un cliente** (`cestina('cliente', …, p_includi_anagrafiche)`): il cliente non
trascina automaticamente le anagrafiche (dati condivisi). La funzione
`anagrafiche_esclusive_cliente(cliente_id)` calcola le anagrafiche collegate **solo** a quel
cliente (nessun altro cliente vivo le referenzia). Il frontend mostra **una sola** conferma
elencandole; se l'utente accetta (`p_includi_anagrafiche = true`) finiscono nello **stesso batch**
del cliente (quindi ripristinabili insieme). Le anagrafiche collegate **a più clienti** non
vengono mai cestinate. Un cliente può avere più anagrafiche: il controllo è fatto su **tutte**, la
conferma è **unica**.

---

## 7. Nascondere i dati cestinati

Ogni query di lista aggiunge `deleted_at IS NULL` (come già si fa con `archiviato`). I figli
caricati per id della radice ereditano la sparizione; il filtro serve sulle query di primo livello
e dove un'entità è cestinabile singolarmente. File coinvolti: `FascicoloCliente`, `Dashboard`,
`RT2AdeguataVerifica`, `RT3Monitoraggio`, `DocumentiAllegati`, `IncaricoDettModifica`,
`AnagraficaPersone`, `personeHelper`, `RT1Autovalutazione`.

---

## 8. UI

- **Icona cestino** (`Trash2`) in [`Layout.tsx`](src/components/Layout.tsx) accanto al menu
  Assistenza, con **badge** = numero elementi nel cestino.
- **`Cestino.tsx`** (tab `cestino`): elenco batch con etichetta, data, autore, riepilogo
  contenuto; pulsanti **Ripristina** / **Svuota** abilitati secondo i permessi correnti;
  **Svuota cestino** globale con modale di conferma.
- **Sezione "Cestino" in [`Impostazioni.tsx`](src/components/Impostazioni.tsx)** (solo
  admin/proprietario/superadmin, gate `is_studio_admin()`): 3 select + toggle auto-purge.
- **Menu azioni `⋮` ([`ActionsMenu.tsx`](src/components/ActionsMenu.tsx))** per cliente e
  incarico: raccoglie **Storico Modifiche**, **Modifica** e **Sposta nel cestino** in un unico
  pulsante (in [`ClienteDettaglioShared`](src/components/ClienteDettaglioShared.tsx) e
  [`IncaricoDettModifica`](src/components/IncaricoDettModifica.tsx)).
- **Azioni "Sposta nel cestino" puntuali** su: documento, anagrafica, RT1, **valutazione RT2**
  (ValutazioneCard), **controllo RT3** e **segnalazione SOS** (righe in
  [`RT3Monitoraggio`](src/components/RT3Monitoraggio.tsx)).
- **Wiring:** i bottoni "Elimina" attuali passano da hard-delete a chiamata `cestina`.

### Entità cestinabili (radici RPC)
`cliente`, `incarico`, `documento`, `anagrafica`, `autovalutazione` (RT1), `valutazione` (RT2),
`controllo` (RT3), `segnalazione` (SOS). Le prime due trascinano i discendenti; le altre sono
foglie. Cliente/incarico usano anche il piggyback `archiviato` (§12.1).

---

## 9. Audit & alert

`cestina`/`ripristina`/`svuota` loggano in `storico_modifiche` e via `addUserLog`.
`check_alerts(studio_id)` richiamata dopo ogni operazione.

---

## 10. Fasi

| Fase | Contenuto |
|---|---|
| **0 — Schema** | `deleted_at`/`deleted_by` (11 tabelle) + tabella `cestino` + 4 colonne impostazioni + indici + RLS |
| **1 — RPC** | `cestina`/`ripristina`/`svuota_*` + `cestino_puo()` + guardia anagrafiche + `check_alerts` |
| **2 — Nascondere** | Filtri `deleted_at IS NULL` nelle query di lista |
| **3 — UI** | `Cestino.tsx` + icona/badge + sezione Impostazioni + riconnessione bottoni elimina |
| **4 — Storage + auto-purge** | Rimozione file su hard-delete + cron per-studio |
| **5 — Rifiniture** | Guardia anagrafiche UI, RT1, test vitest, conferme |

---

## 11. Rischi

1. **Copertura filtri** (§7): un filtro dimenticato = dato cestinato che riappare.
2. **File orfani**: il cron deve rimuovere i file *prima* del DELETE.
3. **Ripristino esatto**: garantito dal tracciamento per-batch (`elementi`).
4. **Anagrafiche condivise**: guardia "in uso" obbligatoria.

---

## 12. Note di implementazione (stato attuale)

### 12.1 Piggyback su `archiviato` per clienti/incarichi
Al cestinamento, la RPC `cestina` imposta anche `archiviato = true` su clienti e incarichi
(oltre a `deleted_at`). Questo riusa il meccanismo esistente — già testato — che esclude gli
archiviati da **viste "attivi"** e dalla **logica alert** (`check_alerts` e trigger filtrano
`archiviato = false`), senza dover riscrivere quelle funzioni. `ripristina` riporta
`archiviato = false`.

> **Edge noto:** un elemento archiviato *manualmente prima* del cestinamento torna **non
> archiviato** dopo il ripristino (caso raro; l'utente può riarchiviarlo).

Conseguenze sui filtri frontend:
- viste "attivi" (`!archiviato`) → i cestinati spariscono gratis;
- viste/conteggi che **non** filtravano `archiviato` (es. liste documenti, anagrafiche,
  autovalutazioni, alcuni conteggi) → si è aggiunto `deleted_at IS NULL` esplicito;
- query "child" caricate per id di un genitore già nascosto → non serve filtro.

I generatori di codice (`codiceGenerator`) **non** filtrano `deleted_at`: devono contare anche i
record cestinati per non riusare un `codice_cliente`/`codice_incarico` ancora UNIQUE in tabella.

### 12.2 Limitazione nota: alert di scadenza su documenti / RT1 cestinati
La logica alert esclude i cestinati **solo** tramite `archiviato` (clienti/incarichi). Per
**documenti** (`DOC-SCADENZA`) e **autovalutazioni RT1** (`RT1-SCADENZA`) — che non hanno
`archiviato` — un alert di scadenza potrebbe **rimanere visibile** dopo il cestinamento del
singolo documento/RT1, finché l'elemento non viene eliminato definitivamente (purge), momento in
cui l'alert viene ripulito. Impatto: cosmetico (l'alert punta a un elemento non più visibile), non
c'è perdita dati. **Fix follow-up:** aggiungere `deleted_at IS NULL` alle sorgenti documenti/
autovalutazioni dentro `check_alerts` e nel trigger `_alert_generate_doc_scadenza`.

### 12.3 Auto-purge: scheduling
L'Edge Function `purge-cestino` esegue purge + pulizia Storage. Lo scheduling pg_cron va attivato
una volta con `SELECT schedule_cestino_purge('<function-url>', '<CRON_SECRET>')` (vedi
`20260609020000_cestino_cron.sql`). Resta comunque inerte finché un proprietario non imposta
`cestino_auto_purge_giorni` per il proprio studio.
