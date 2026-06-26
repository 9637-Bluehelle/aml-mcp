# Collaudo integrazione MCP — piano di test e punti aperti

> Documento di lavoro per il collaudo end-to-end dell'integrazione MCP (AI ↔ gestionale AML)
> tramite connettore claude.ai. Raccoglie: cosa è stato sistemato, cosa funziona, il piano di
> test e i **rilievi aperti** da ri-osservare / rivalutare / eventualmente correggere.
>
> Regola di lavoro: durante il primo collaudo **si annota, non si corregge subito**. Le modifiche
> si fanno dopo aver raccolto abbastanza osservazioni, per evitare aggiustamenti affrettati.

---

## 1. Obiettivo

Verificare che un'AI (Claude, via connettore MCP remoto) possa **leggere** i dati dello studio e
**proporre scritture** che l'utente conferma tramite la **modale globale** in tempo reale, nel
rispetto di RLS, tier e del checkpoint umano (nulla scritto senza approvazione).

Endpoint: `https://aml-mcp.vercel.app/api/mcp` — collegamento via connettore personalizzato di
claude.ai (OAuth 2.1).

---

## 2. Cosa è stato sistemato per arrivare al collaudo (storico)

Catena di blocchi risolti per far funzionare il connettore (tutti verificati):

1. **`jsonwebtoken` → `jose`** — `jsonwebtoken` (CommonJS) crashava al load sul runtime ESM di
   Vercel (`FUNCTION_INVOCATION_FAILED`). Sostituito con `jose` (ESM-native).
2. **Estensioni `.js` sugli import relativi** — le function `api/` su Vercel sono ESM
   (`moduleResolution: node16`), che esige l'estensione `.js` (errori `TS2835`).
3. **Env var su Vercel** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`
   (+ `MCP_APP_BASE_URL`). Le function leggono `process.env`, non il `.env` locale.
4. **`search_path = public, extensions` sulle RPC pgcrypto** — `register_client`, `exchange_code`,
   `exchange_refresh` usano `gen_random_bytes`/`digest` (pgcrypto, schema `extensions`).
5. **Realtime** — aggiunte `mcp_pending_plans` **e** `documenti` alla pubblicazione
   `supabase_realtime`. Il canale della modale/badge si lega a entrambe: se `documenti` manca, il
   canale fallisce e non consegna eventi per nessuna delle due → la modale non compariva live.

---

## 3. Stato: cosa funziona già (verificato)

- ✅ Connessione + OAuth (consenso sulla piattaforma, scelta tier).
- ✅ Lettura: `lista_clienti` restituisce i clienti reali dello studio (RLS ok).
- ✅ Modale di conferma globale **in tempo reale** (compare appena l'AI propone un piano).
- ✅ Badge "Azioni AI" + scheda inbox/storico.

---

## 4. Piano di test (checklist)

Legenda esito: ☐ da fare · ✅ ok · ⚠️ ok con rilievi · ❌ da sistemare

### A) Lettura (tier `read`+)
- ⚠️ `lista_clienti` — *funziona ma vedi rilievo 5.1 (limite/paginazione)*
- ✅ `leggi_cliente` (dettaglio per id)
- ✅ `cerca_soggetto` (anagrafica, default 25 / max 100)
- ✅ `lista_incarichi` (default 50 / max 200)
- ✅ `lista_alert` + `spiega_alert`

### B) Scrittura via piano + modale (tier `draft`+) — ✅ OK
- ✅ `crea_bozza_cliente` via `proponi_piano` → modale → **Approva** → bozza nel Fascicolo
- ✅ `esegui_piano` scrive davvero dopo l'approvazione
- ✅ `crea_soggetto` (non sovrascrive se CF/P.IVA esiste già)

### C) Comportamenti della modale — ✅ OK
- ✅ "Più tardi" → piano resta nel badge/scheda
- ✅ Più piani insieme → coda "uno alla volta" + pill "+N in attesa"
- ✅ "Rifiuta" → stato *rifiutato*, **nulla scritto**
- ✅ La modale compare sopra qualsiasi scheda

### D) Documenti (solo tier `modify`)
- ✅ `descrivi_tipologie_documento` (Claude ha letto le tipologie e ha correttamente rifiutato un
  tipo non compatibile — comportamento desiderato)
- ❌ upload via `carica_documento` (fallback base64) → **si impianta, nessuna riga creata** — vedi
  rilievo 5.3
- ☐ flusso upload "produzione" (`prepara_upload_documento` + `upload_file`) → *non testabile dal
  connettore browser* — vedi 5.3

### E) Sicurezza — ✅ OK
- ✅ tier `read` → niente strumenti di scrittura
- ✅ accesso limitato al **proprio studio** (RLS)
- ✅ l'AI **non** può auto-approvare (nessun tool di approvazione)
- ✅ prima dell'approvazione il record **non esiste** nel Fascicolo

---

## 5. Osservazioni aperte / da rivalutare

### 5.1 — Limite e paginazione di `lista_clienti` (PRIMO RILIEVO)

**Cosa abbiamo visto.** Con ~246 clienti reali, chiedendo "elencami i clienti":
- Claude ha prima detto "primi 50", poi "tutti i 200", elencandone però solo una manciata.
- Numeri incoerenti e parzialmente "inventati" nel riepilogo.

**Comportamento attuale del codice** ([mcpServerFactory.ts:60-90](api/_lib/mcpServerFactory.ts#L60-L90)):
- `limit`: default **50**, massimo **200** (`z.number().min(1).max(200)`).
- Ordinamento: `updated_at` discendente.
- **Nessun offset / cursore** → impossibile scorrere oltre i primi `max` risultati.
- Restituisce `{ count, clienti }` dove `count` = **righe restituite**, *non* il totale dello
  studio → l'AI non conosce il numero reale (246) e tende a stimarlo male.

**Perché succede.** Il limite è una scelta di design (tenere le risposte piccole = meno token,
più sicurezza). Ma per uno studio con centinaia di clienti:
1. non si possono enumerare tutti in una chiamata (max 200 < 246);
2. manca il **totale**, quindi l'AI non può dire "ne hai 246, te ne mostro N";
3. la mancanza di metadati ("troncato", "ce ne sono altri") favorisce risposte allucinate.

**Cosa osservare ancora (prima di decidere):**
- Quanto spesso serve *davvero* l'elenco completo vs una **ricerca mirata** (`query`)? Per un AML
  assistant la ricerca per nome/CF è probabilmente il caso d'uso reale.
- Lo stesso limite vale anche per `lista_incarichi` (50/200) e `cerca_soggetto` (25/100):
  verificare se danno fastidio negli stessi scenari.
- Verificare il costo in token quando le liste sono grandi (impatto su contesto/latency).

**Opzioni di intervento (da valutare, NON ancora applicate):**
- **(A) Totale separato.** Aggiungere un conteggio reale (`count: 'exact', head: true`) e
  restituire `{ totale, mostrati, clienti }`. L'AI sa quanti sono in tutto. *Costo basso, alto
  valore.*
- **(B) Paginazione.** Aggiungere `offset` (o cursore su `updated_at`/`id`) per scorrere oltre il
  max. Abilita l'enumerazione completa. *Costo medio.*
- **(C) Alzare il `max`.** Es. 500/1000. *Semplice ma sconsigliato*: liste enormi = molti token e
  poco utili per l'AI.
- **(D) Spingere sul filtro `query`.** Migliorare la `description` del tool perché l'AI usi la
  ricerca mirata invece di elencare tutto; è il pattern corretto per un assistente.
- **(E) Metadati anti-allucinazione.** Restituire flag espliciti (`troncato: true`,
  `suggerimento: "usa query o limit/offset"`) così l'AI non inventa numeri nel riepilogo.

**Orientamento provvisorio (da confermare):** combinare **A + D + E** (totale reale + spinta sulla
ricerca + metadati chiari), ed eventualmente **B** se serve davvero l'enumerazione completa.
Evitare la sola **C**. — *Decisione da prendere dopo aver completato i blocchi A–E del test.*

**RISOLTO (collaudo 2° giro).** Caso reale: 246 clienti, l'AI vedeva solo i primi 200 e non
trovava il cliente più vecchio → assegnava i documenti a un cliente "simile". Applicati **A + B +
D + E** su `lista_clienti`, `lista_incarichi`, `cerca_soggetto`:
- **A — totale reale:** ogni risposta ora ha `totale` (count exact, stesso filtro), `mostrati`, `offset`.
- **B — paginazione:** nuovo parametro `offset` + `.range(offset, offset+limit-1)` → enumerazione completa.
- **D — spinta su query:** descrizioni che impongono la ricerca per nome con `query` per un cliente specifico.
- **E — anti-allucinazione:** flag `troncato` + `suggerimento`, e regola "non dedurre dati non presenti".
- **Anti-assegnazione errata:** regola in `proponi_catalogazione` + nelle `instructions` globali — se il
  cliente indicato non si trova con certezza, NON associare a uno simile: il documento resta "da
  catalogare" e l'AI lo segnala. (Decisione utente: meglio ignorare il file che sbagliare cliente.)

### 5.2 — Dati di test residui (da pulire più avanti)
In anagrafica risultano bozze di test create durante il debug (`CLI-TEST-00x`, `CLI-MARIO-ROSSI`,
`CLI-ACME-SRL`). Da rimuovere (via Cestino) a collaudo concluso, per non sporcare i dati reali.

### 5.3 — Upload documenti dal connettore browser (RILIEVO + nodo architetturale)

**Cosa abbiamo visto.** Chiesto a Claude di caricare un PDF (fattura di test) nell'anagrafica di
Luca Verdi:
- ✅ Bene: Claude ha letto le tipologie (`descrivi_tipologie_documento`) e **ha rifiutato** un tipo
  non compatibile (fattura ≠ tipologie AML) — esattamente il comportamento voluto. Forzato a
  procedere "per test" come documento d'identità, ha codificato il PDF in base64 e chiamato
  `carica_documento`.
- ❌ Male: l'operazione è rimasta **appesa oltre un minuto**, **nessuna richiesta** è comparsa nel
  gestionale (né riga `documenti` né modale). L'utente ha interrotto. Sembra che Claude abbia
  ritentato la chiamata più volte.

**Nodo architetturale (la causa di fondo).** Esistono due vie per l'upload documenti:
- **Produzione:** `prepara_upload_documento` (crea riga `pending` + signed upload URL) **+**
  `upload_file` → ma `upload_file` è un **MCP locale** (`mcp/upload-file-server.ts`) che legge il
  file dal disco. **Il connettore di claude.ai è puramente remoto: non può eseguire un MCP locale.**
  Quindi questa via **non è utilizzabile dal browser**.
- **Fallback PoC:** `carica_documento` (base64) — l'unico praticabile dal connettore browser, ma è
  dichiarato *"NON per la produzione"*: il file transita nel contesto, max 1 MB, e passa per
  l'upload Storage dentro la function Vercel ([documentoService.ts:242-279](api/_lib/documentoService.ts#L242-L279)).

**Causa confermata (non è un bug del server).** I Runtime Logs di Vercel sono **tutti 200**: la
function non erra e non va in timeout. Il "blocco" è **lato modello**: Claude deve **emettere
l'intero PDF in base64 come argomento del tool** (decine di migliaia di caratteri generati
token-per-token) → operazione lentissima e costosa in token. Il primo tentativo è stato interrotto
*prima* che il base64 fosse inviato completo → richiesta mai arrivata → nessuna riga creata. Lo ha
confermato anche Claude stesso ("passavo l'intero PDF in base64 nel corpo della chiamata, una
quantità enorme di testo").

→ È un **limite intrinseco** del fallback base64, non un difetto da correggere lato server: far
transitare i byte del file attraverso il contesto del modello è esattamente ciò che il design
voleva evitare (per questo esiste `upload_file`, che però è locale e non disponibile dal browser).

**Opzioni di intervento (da valutare, NON applicate):**
- **(A) Restituire errori più chiari / non far ritentare all'infinito** dal lato tool, così l'utente
  vede subito *perché* fallisce invece di un blocco.
- **(B) Verificare le policy Storage** del bucket `file_allegati` rispetto all'identità OAuth
  (`origine='ai'`): l'upload deve essere permesso come per l'utente UI.
- **(C) Alzare `maxDuration`** della function `api/mcp` in `vercel.json` se è un problema di tempo.
- **(D) Decisione di prodotto:** se l'upload documenti dal **browser** è un requisito, va consolidato
  il path base64 (limiti, errori, dimensioni). Se invece l'upload "serio" resta da client desktop
  (con `upload_file` locale), va **comunicato** che dal connettore web i documenti non si caricano
  (o solo file piccoli in PoC).

**DECISIONE PRESA:** i documenti **restano in scope** anche dal browser (un AI che non carica
documenti è monco; la parte tediosa — classificare tipologia, trovare l'associazione, compilare i
metadati — è proprio quella da delegare all'AI). Si **ottimizza** il flusso il più possibile e si
**avvisa sempre l'utente** quando una via resta costosa in token.

**Metodo ottimizzato proposto — "AI prepara, utente carica" (byte fuori dal modello).**
Idea chiave: il file **non passa mai dal contesto dell'AI**; ci pensa l'utente con un click, mentre
l'AI fa tutto il lavoro intellettuale.

1. L'AI raccoglie i metadati (tipologia, associazione via `lista_clienti`/`lista_incarichi`/
   `cerca_soggetto`) — pochi token.
2. L'AI chiama `prepara_upload_documento(metadata)` → crea la riga `pending` (con `file_path`
   calcolato, **file non ancora presente**).
3. La **modale documento** (che già compare in realtime) per una riga *pending senza file* mostra un
   **selettore file**: l'utente sceglie il PDF dal proprio computer → l'app lo carica direttamente su
   Storage con la **sessione dell'utente** (RLS già esistente, come `DocumentiAllegati`) → i byte non
   toccano mai il modello.
4. L'utente approva nella modale → `conferma_upload_documento` finalizza (o lo fa l'app stessa).

Costo in token: **quasi nullo** (solo i metadati). UX: l'AI fa la parte noiosa, l'utente fa due
click. Riusa la modale già costruita.

**Fallback `carica_documento` (base64):** si tiene **solo** per il caso in cui il file è già dentro
la chat di Claude (allegato dall'utente a Claude) e non sul disco. In quel caso il base64 è l'unica
via → **avvisare esplicitamente l'utente** che è lento e costoso in token, e tenere un cap di
dimensione basso.

**Lavoro necessario (da implementare dopo conferma):**
- Frontend: nella modale documento, per una riga `pending` **senza file**, aggiungere il selettore +
  upload su Storage (sessione utente) + transizione di stato.
- Verificare/usare `prepara_upload_documento` come "creazione richiesta" anche senza `upload_file`
  locale (oggi è pensato in coppia con l'uploader locale).
- Messaggistica: l'AI avvisa l'utente che per i documenti dovrà selezionare il file nell'app (via
  modale), e — nel ramo base64 — del costo in token.

### 5.4 — Dati tecnici in chiaro nella chat (privacy di presentazione)

**Cosa abbiamo visto.** Mentre progetta le modifiche, l'AI spesso cita nel testo gli identificativi
tecnici (UUID di un cliente/incarico, nomi dei campi/parametri). Sono dati che servono solo per le
chiamate ai tool: all'utente non servono e "sporcano" la chat.

**Decisione.** Mascherare/evitare **solo i dati tecnici** (UUID, nomi-campo). CF e P.IVA **restano
mostrabili** (dati di business legittimi).

**Intervento (implementato).**
- Istruzioni globali del server MCP (`instructions` nel costruttore `McpServer`,
  `api/_lib/mcpServerFactory.ts`): l'AI non mostra UUID/nomi-campo nelle risposte, si riferisce alle
  entità per ragione sociale/codice; se proprio deve citare un id tecnico, lo maschera (ultime 4
  cifre). CF/P.IVA mostrabili.
- Promemoria sintetico (`PRIVACY_HINT`) accodato alle descrizioni dei tool di lettura che
  restituiscono UUID (`lista_clienti`, `leggi_cliente`, `cerca_soggetto`, `lista_incarichi`), come
  rinforzo se il client non propagasse le `instructions`.

**Da collaudare.** ☐ Verificare che con il connettore claude.ai l'AI smetta di stampare UUID/nomi
tecnici in chat e usi ragione sociale + codice.

### 5.5 — (placeholder) Altri rilievi
_Da compilare man mano che proseguiamo._

---

## 6. Prossimi passi

1. ✅ Completati i blocchi di test **A → E** (documenti: vedi 5.3 + design §7).
2. Decidere e applicare gli aggiustamenti aperti: **5.1** (limite lista) e **§7** (documenti).
3. Pulire i dati di test (5.2).
4. Allineare repo (codice + migrazioni) e ridepoyare.

---

## 7. Design — Upload & catalogazione documenti via AI

> **Approccio approvato:** *"carica una volta nell'app, l'AI cataloga"*. L'utente carica i file
> **una sola volta** (anche un'intera cartella); l'AI li **legge** e propone la catalogazione
> (tipologia + associazione cliente/anagrafica/incarico + scadenza); l'utente approva; il file
> viene **collegato definitivamente**. I byte non vengono mai ri-emessi dal modello.

### 7.1 Principi
- **Path primario = upload dall'app.** L'AI **comunica all'utente** che questa è la via più rapida
  ed economica; ma se l'utente preferisce allegare il file **nel contesto di Claude**, glielo
  lasciamo fare (fallback base64, §5.3) — è una sua scelta, l'alternativa valida l'abbiamo data.
- **L'AI deve leggere il contenuto** (caso d'uso: "una cartella piena di file di un cliente da dare
  in pasto all'AI per selezionarli/catalogarli"). Il costo di *lettura* è in input ed è inevitabile;
  si elimina invece il costoso *ri-output* in base64.

### 7.2 Storage — area di staging ("due chiavi")
- Area dedicata ai file caricati ma **non ancora catalogati**, organizzata per **studio_id + user_id**
  (doppia chiave di sicurezza): es. `documenti_staging/<studio_id>/<user_id>/<ts>_<nome>.pdf`.
- RLS/policy: solo l'utente proprietario (nel suo studio) legge/scrive la propria area.
- **A catalogazione avvenuta:** il file viene **spostato** nella posizione definitiva (collegato al
  cliente/anagrafica/incarico) e la copia di staging **rimossa** → resta **una sola copia** del
  documento, al posto giusto. La staging si **svuota** a fine processo.
- *(Decisione aperta: bucket separato `documenti_staging` vs prefisso nel bucket `file_allegati`.)*

### 7.3 Dati — tabella `documenti_staging`
Campi previsti: `id`, `studio_id`, `user_id` (default `auth.uid()`), `file_path` (staging),
`nome_file`, `mime`, `dimensione`, `testo_estratto?`, `stato` (`da_catalogare` → `proposto` →
`catalogato` | `scartato`), `proposta` jsonb (tipologia/associazione/scadenza suggerite dall'AI),
`created_at`. RLS: own (studio + user).

### 7.4 Frontend — sezione dedicata
- **Zona upload di massa** (drag-and-drop di file/cartelle) → upload diretto a staging con la
  sessione utente. Lista dei file in staging con stato.
- **Revisione catalogazione:** per ogni file la proposta dell'AI (tipologia, cliente, scadenza) →
  **Approva / Modifica / Rifiuta**; in massa: "approva tutti" + revisione singola.
- *(Decisione aperta: scheda nuova vs dentro "Azioni AI in attesa".)*

### 7.5 Tool MCP (nuovi)
- `lista_documenti_staging()` → i file da catalogare dell'utente/studio.
- `leggi_documento_staging(id)` → contenuto per la classificazione (testo estratto; se
  scansione/immagine → immagine per la *vision* di Claude). **Costo input, inevitabile.**
- `proponi_catalogazione(items[])` → per ciascun file: tipologia + associazione + scadenza →
  crea la proposta in stato `proposto` (**checkpoint umano**: nessuno spostamento finché non
  approvato). Riusa il meccanismo piani/approvazione + la modale già esistente.

### 7.6 Flusso completo
1. **Utente:** drag-drop dei file → staging (un solo caricamento).
2. **AI:** `lista_documenti_staging` → `leggi_documento_staging` (legge) → `proponi_catalogazione`.
3. **Utente:** rivede e **approva** (file già presente, **nessun ri-upload**).
4. **Sistema:** sposta da staging → path definitivo + crea riga `documenti` collegata; rimuove la
   copia di staging.

### 7.7 Decisioni (CONFERMATE)
1. **Scansioni/immagini:** è una capacità del **modello** (Claude la fa via vision; con altri LLM
   dipende dalla loro efficacia). Lato nostro forniamo il contenuto: **estrazione testo dal PDF**;
   per i PDF scansionati la resa dipende dall'AI. *(OCR lato server: eventuale miglioria futura.)*
2. **Tipi file ammessi:** **solo PDF** (come nell'app).
3. **Dove vive la sezione upload:** **dentro "Azioni AI in attesa"**, aggiungendo lì una **tab**
   ("Documenti da catalogare").
4. **Approvazione:** **batch** ("approva tutti") **+ per-file**; la modale resta per i singoli.
5. **Storage:** **bucket separato** `documenti_staging`.
6. **Pulizia staging:** **automatica dopo approvazione + scrittura riuscita**. Se il piano non è
   approvato o la scrittura fallisce → i file **restano** in staging per il ritentativo. In più:
   **pulsante di pulizia massiva e singola** (per file sbagliati o errori imprevisti).

### 7.8 Impatto implementativo (stima)
- Migrazione: tabella `documenti_staging` + RLS + (eventuale) bucket/policy storage.
- Frontend: sezione upload di massa + schermata di revisione catalogazione.
- MCP: 3 nuovi tool + integrazione col flusso piani/approvazione esistente.
- AI: messaggistica (consiglia la via app; nel ramo base64 avvisa del costo).
- Lavoro non banale → conviene procedere **a tappe** (prima storage+tabella+upload, poi tool AI,
  poi revisione/approvazione, poi spostamento finale e pulizia).

### 7.9 Stato implementazione
- ✅ **Tappa 1 — Storage + tabella + upload UI.**
  - Migrazione `20260618000500_documenti_staging.sql` (tabella `documenti_staging` + RLS "due chiavi"
    + bucket `documenti_staging` + policy storage + solo-PDF).
  - Componente `DocumentiDaCatalogare.tsx`: dropzone PDF di massa → upload staging, elenco, pulizia
    singola + "svuota staging" (entrambe con modale di conferma). **Selezione di una CARTELLA**
    (pulsante + drag-and-drop): prende solo i PDF, ignora gli altri file con avviso riepilogativo, e
    registra la `cartella` di provenienza (colonna aggiunta da `20260619000000_documenti_staging_cartella.sql`)
    mostrata nel nome in elenco per distinguere più cartelle.
  - Tab "Documenti da catalogare" dentro `AzioniAiInAttesa.tsx`.
- ✅ **Tappa 2 — Tool MCP.**
  - `api/_lib/documentiStagingService.ts`: `listaStaging`, `leggiStaging` (download + estrazione
    testo con **`unpdf`**, ESM-native serverless; cache in `testo_estratto`), `proponiCatalogazione`
    (valida con `risolviAssociazione`, scrive `proposta` + stato `proposto`; niente in `documenti`).
  - `mcpServerFactory.ts`: 3 tool registrati nel tier `modify` (`lista_documenti_staging`,
    `leggi_documento_staging`, `proponi_catalogazione`).
  - `package.json`: dipendenza `unpdf@^1.6.2` (installata da Vercel al deploy).
- ✅ **Tappa 3 — Revisione/approvazione** (nella tab "Documenti da catalogare"). Le righe
  `proposto` mostrano la proposta AI (tipologia → cliente/anagrafica · scadenza) con **Approva e
  collega** / **Scarta proposta**, più **"Approva tutte (N)"**. Nomi cliente/anagrafica risolti.
  - **Modale globale** (`AzioniAiModale`): oltre alla tab, appena l'AI propone una catalogazione
    compare — **ovunque nell'app, in tempo reale** — una modale "Catalogazione documenti AI" che
    elenca tutte le proposte (tipologia → associazione · scadenza) con Approva/Scarta per riga +
    "Approva tutte" + "Più tardi". Realtime: `documenti_staging` aggiunta a `supabase_realtime`
    (`20260619000000_documenti_staging_cartella.sql`). Coda FIFO unificata con piani e documenti.
- ✅ **Tappa 4 — Spostamento finale + pulizia** (`src/lib/documentiStagingHelper.ts`):
  all'approvazione il PDF è spostato da `documenti_staging` → `file_allegati` (posizione definitiva),
  creata la riga `documenti` collegata, e lo staging (file + riga) ripulito. In caso di errore i
  file restano in staging per il ritentativo (niente pulizia parziale).

**Feature documenti "carica una volta, l'AI cataloga" — COMPLETA.** Restano da collaudare end-to-end.

---

## 8. Creazione incarichi e valutazioni del rischio (RT2) via AI

> **Stato: implementato, da collaudare.** Colma il buco "l'AI non può creare incarichi né
> valutazioni". Entrambi sono **record vivi** (un incarico nasce `active` e fa scattare l'alert
> RT2; una valutazione chiude quell'alert via trigger DB), quindi — a differenza della bozza
> cliente — **non** sono tool diretti: si creano SOLO via `proponi_piano` → modale di approvazione
> → `esegui_piano` (§7.2). Nessuna auto-approvazione possibile.

### 8.1 Nuovi tool
- **Lettura:** `descrivi_tipologie_prestazione()` → catalogo prestazioni (value/label/rischio
  inerente/solo_tabella_a) per scegliere un `tipologia_prestazione_id` valido.
- **Azioni di piano** (in `proponi_piano`, tier ≥ draft):
  - `crea_incarico` — valida cliente (scopato allo studio) + tipologia, genera `codice_incarico`
    dalle impostazioni studio (o lo esige se numerazione manuale), inserisce in `incarichi`
    (`api/_lib/incaricoService.ts`).
  - `crea_valutazione` — RT2: l'AI fornisce i punteggi 1-4 (Tabella A: 4 voci; Tabella B: 6 voci,
    salvo prestazioni `solo_tabella_a`); il server replica `calculateRT2Scores` (rischio
    specifico/effettivo, classe, misure, prossimo controllo; PEP → rischio effettivo 4) e inserisce
    in `valutazioni_rischio` (`api/_lib/valutazioneService.ts`).

### 8.2 Decisione di prodotto — punteggi RT2
I punteggi **di default li fornisce l'utente** (l'AI li chiede prima di proporre il piano). Lo
schema però **non restringe** l'origine: se l'utente chiede esplicitamente all'AI di generarli
(es. per un test), l'AI può compilarli. Il checkpoint umano (modale) resta comunque obbligatorio.

### 8.3 Da collaudare
- ☐ `proponi_piano` con `crea_incarico` → modale → Approva → incarico nel Fascicolo + alert RT2 generato.
- ☐ `proponi_piano` con `crea_valutazione` → Approva → valutazione salvata + alert RT2 chiuso dal trigger.
- ☐ Rischio/classe calcolati = identici a quelli della form UI (a parità di punteggi).
- ☐ Generazione `codice_incarico` coerente con le impostazioni studio (manuale → errore se assente).
- ☐ Errori chiari su: cliente di altro studio, tipologia inesistente, Tabella B mancante quando richiesta.
