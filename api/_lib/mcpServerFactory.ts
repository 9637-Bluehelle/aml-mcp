// MCP — Factory dei tool whitelisted, condivisa tra il server stdio (Fase 2/3) e l'endpoint
// remoto `api/mcp.ts` (Fase 4). Dato un client Supabase autenticato, lo studio appuntato e il
// tier del token, costruisce un McpServer con la whitelist corrente.
//
// Whitelist (Fase 4): tool di LETTURA + create SICURI (bozza cliente, crea_soggetto che non
// sovrascrive). I tool che creano record `active` (incarichi, valutazioni), gli update di record
// vivi, i documenti e i piani restano FUORI finché non esistono le sotto-fasi 4b (conferma in
// blocco) e 4d (documenti): esporli ora violerebbe la regola di conferma del piano (§7.2).
//
// Sicurezza superadmin (§8.4): ogni LETTURA filtra esplicitamente su studio_id = <pinned>, in
// aggiunta alla RLS, così un eventuale superadmin via MCP vede solo il proprio studio.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { salvaCliente } from './clienteService.js';
import { creaSoggettoWithClient } from './personeService.js';
import { tierAllows, type McpTier } from './mcpAuth.js';
import { creaBozzaClienteSchema, creaSoggettoSchema, creaIncaricoSchema, creaValutazioneSchema, mapArgsToWizardData, mapArgsToPersona } from './mcpTools.js';
import { proponiPiano, aggiornaPiano, eseguiPiano, statoPiano, type AzionePiano } from './mcpPlans.js';
import { descriviTipologie, preparaUploadDocumento, confermaUploadDocumento, caricaDocumentoBase64 } from './documentoService.js';
import { descriviTipologiePrestazione, descriviImpostazioniIncarico } from './incaricoService.js';
import { listaStaging, leggiStaging, proponiCatalogazione } from './documentiStagingService.js';

function jsonResult(obj: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }] };
}
function errorResult(msg: string) {
  return { isError: true, content: [{ type: 'text' as const, text: msg }] };
}

const ALERT_AZIONE: Record<string, string> = {
  RT1: "Autovalutazione del rischio dello studio mancante o scaduta: compila/aggiorna l'autovalutazione RT1.",
  RT2: "Incarico senza valutazione del rischio: crea la valutazione RT2 per l'incarico indicato in riferimento_id.",
  RT3: 'Monitoraggio/controllo costante mancante o in scadenza per l\'incarico.',
  RT4: 'Cliente senza incarico (o incarico in scadenza): crea/aggiorna un incarico per il cliente in riferimento_id.',
};

// Istruzioni globali del server (initialize → il client le aggiunge al contesto del modello).
// Regola di presentazione/privacy: gli identificativi tecnici servono SOLO per chiamare i tool,
// non sono dati utili all'utente; vanno tenuti fuori dal testo visibile della chat. CF e P.IVA
// invece sono dati di business legittimi e possono essere mostrati.
const SERVER_INSTRUCTIONS = [
  'Assistente di compliance antiriciclaggio sui dati dello studio dell\'utente.',
  '',
  'REGOLE DI PRESENTAZIONE (privacy in chat):',
  '- Nelle risposte visibili all\'utente NON mostrare mai identificativi tecnici: gli UUID (cliente_id, incarico_id, persona_id, plan_id, doc_id, staging_id, ecc.) né i nomi tecnici dei campi/parametri dei tool.',
  '- Non usare gergo da programmatore (nomi di variabili o parametri): parla in linguaggio naturale di business.',
  '- Riferisciti alle entità con i loro dati leggibili: ragione sociale / nome del cliente e, quando utile, il codice cliente o il codice incarico. Il codice fiscale e la P.IVA SONO mostrabili (sono dati utili all\'utente).',
  '- Gli UUID servono solo internamente per chiamare i tool (incluse le scritture): tienili negli argomenti delle chiamate, mai nel testo della risposta.',
  '- Se in via eccezionale devi citare un identificativo tecnico in chat, mostralo mascherato (solo le ultime 4 cifre/caratteri, es. «…a1b2»), mai il valore completo.',
  '',
  'REGOLE DI ACCURATEZZA (no associazioni a caso):',
  '- Per trovare un cliente/soggetto/incarico SPECIFICO usa la ricerca per nome con "query"; non limitarti alla prima pagina di lista_clienti — usa "totale"/"troncato" e pagina con "offset" finché serve.',
  '- La ricerca è tollerante a punteggiatura e spaziatura e scarta da sé le forme giuridiche (S.r.l., S.p.A., …): cerca con la parte DISTINTIVA del nome (es. "LOGISTICA", non "D.N. LOGISTICA S.R.L."). Se un primo tentativo non trova nulla, RIPROVA con varianti (solo il cognome, solo la parola chiave della ragione sociale) PRIMA di concludere che il cliente non esiste.',
  '- Non assegnare mai un documento (o altra entità) a un cliente diverso da quello indicato solo perché "somiglia": se il cliente richiesto non si trova con certezza, NON procedere su quell\'elemento, lascialo non catalogato e dillo all\'utente.',
  '',
  'REGOLE DOCUMENTI DA CATALOGARE:',
  '- Prima di proporre la catalogazione LEGGI il contenuto di ogni documento con leggi_documento_staging: il nome file serve come indizio, non come unica fonte. Tipologia, soggetto e DATE si ricavano dal testo del documento.',
  '- Quando la tipologia ha scadenza_obbligatoria (es. visura, procura, contratto, documento di identità) la data di scadenza è quasi sempre DENTRO il documento: leggine il testo e ricavala da lì. NON scartare un file solo perché la data non è nel nome: scartalo (o chiedi la data all\'utente) SOLO se, dopo aver letto il testo, la data non è davvero ricavabile.',
].join('\n');

// Promemoria sintetico, accodato alle descrizioni dei tool che restituiscono UUID: ribadisce la
// regola anche se il client non propagasse le `instructions` globali al modello.
const PRIVACY_HINT =
  ' PRIVACY: usa gli id solo per le chiamate ai tool; nel testo della risposta riferisciti alle entità per nome/ragione sociale o codice, mai con l\'UUID.';

// Sigle di forma giuridica: rumore per la ricerca per nome (e quasi sempre scritte con punteggiatura
// variabile: "S.r.l." / "Srl" / "S.R.L."). Scartate dai token così la ricerca si concentra sulla
// parte distintiva della ragione sociale.
const FORME_GIURIDICHE = new Set([
  'srl', 'srls', 'spa', 'snc', 'sas', 'sapa', 'scarl', 'scrl', 'ss', 'coop', 'onlus', 'sc',
]);

/**
 * Applica al query builder una ricerca testuale TOLLERANTE a punteggiatura/spaziatura.
 * Spezza la query in token alfanumerici significativi (lunghezza ≥ 3, niente forme giuridiche) e li
 * combina in AND: ogni token deve comparire in almeno uno dei `fields` (ilike). Così "D.N. LOGISTICA
 * S.R.L." trova "D.N. LOGISTICA Srl" perché cerca di fatto solo "logistica", senza dipendere dalla
 * punteggiatura. Se nessun token resta significativo, ricade sulla vecchia ricerca a substring
 * intera; no-op se la query è troppo corta (< 2 caratteri).
 */
function applyTokenSearch<T>(qb: T, query: string | undefined, fields: string[]): T {
  const raw = (query ?? '').trim();
  if (raw.length < 2) return qb;
  // Costruisce un gruppo OR `campo.ilike."%term%"` per ciascun campo. Il VALORE è racchiuso tra
  // doppi apici, con backslash/apici escapati: così i caratteri riservati di PostgREST (`.` `,` `(`
  // `)`) presenti nell'input utente restano LETTERALI e non possono alterare la struttura del filtro
  // `or` (niente filter-injection). I wildcard LIKE (`%` `_` `*`) sono rimossi dal termine, così
  // l'utente non può iniettare pattern di ricerca arbitrari.
  const orGroup = (term: string) => {
    const safe = term.replace(/[%_*]/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return fields.map((f) => `${f}.ilike."%${safe}%"`).join(',');
  };
  const tokens = raw
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 3 && !FORME_GIURIDICHE.has(t));
  if (tokens.length === 0) return (qb as any).or(orGroup(raw));
  // Ogni .or() è un filtro top-level: PostgREST li combina in AND → tutti i token devono matchare.
  let out: any = qb;
  for (const t of tokens) out = out.or(orGroup(t));
  return out;
}

/**
 * Metadati di paginazione coerenti e ANTI-ALLUCINAZIONE per le liste. Se il conteggio totale è
 * FALLITO o indisponibile, NON spaccia `mostrati` per totale (era il bug: count in errore →
 * `totale = mostrati`, `troncato = false` → l'AI conclude "ce ne sono solo N / non esiste"). In quel
 * caso restituisce `totale: null` + `totale_incerto: true` e deduce `troncato` dalla pagina piena
 * (`mostrati >= limit`), invitando esplicitamente a non dedurre il totale.
 */
function paginazione(
  totale: number | null | undefined,
  countErr: { message: string } | null | undefined,
  mostrati: number,
  offset: number,
  limit: number,
  suggerimentoTroncato: string,
): Record<string, any> {
  if (!countErr && typeof totale === 'number') {
    const troncato = totale > offset + mostrati;
    return {
      totale,
      mostrati,
      offset,
      troncato,
      ...(troncato ? { suggerimento: suggerimentoTroncato } : {}),
    };
  }
  // Totale ignoto (conteggio fallito): non inventare un totale; pagina piena ⇒ probabilmente altri.
  const troncato = mostrati >= limit;
  return {
    totale: null,
    totale_incerto: true,
    mostrati,
    offset,
    troncato,
    suggerimento:
      'Conteggio totale non disponibile: NON dedurre quanti record esistano in tutto né concludere ' +
      'che manchino. ' + suggerimentoTroncato,
  };
}

/**
 * Costruisce il McpServer con i tool consentiti dal tier. Le LETTURE sono sempre disponibili
 * (ogni tier ≥ read); le SCRITTURE sicure richiedono tier ≥ draft.
 */
export function buildMcpServer(
  client: SupabaseClient,
  studioId: string | null,
  tier: McpTier,
): McpServer {
  const server = new McpServer(
    { name: 'aml-mcp', version: '0.1.0' },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );

  const requireStudio = (): string => {
    if (!studioId) {
      throw new Error('Studio non determinato per il token: impossibile eseguire l\'operazione.');
    }
    return studioId;
  };

  // ---------------------------------------------------------------- LETTURA

  server.registerTool(
    'lista_clienti',
    {
      title: 'Lista clienti',
      description:
        "Elenca i clienti dello studio. Per trovare un cliente SPECIFICO (es. nominato dall'utente) usa SEMPRE 'query' " +
        '(ricerca su ragione sociale, codice cliente, CF o P.IVA): è il modo affidabile e indipendente dal numero totale ' +
        "di clienti. La risposta include 'totale' (quanti clienti corrispondono in tutto) e 'troncato': se troncato=true " +
        "ce ne sono altri oltre quelli mostrati → richiama con 'offset' crescente per paginare. Non dedurre numeri o clienti " +
        'non presenti nella risposta.' + PRIVACY_HINT,
      inputSchema: {
        query: z.string().optional().describe('Testo di ricerca (ragione sociale / codice / CF / P.IVA). Usalo per trovare un cliente specifico.'),
        limit: z.number().int().min(1).max(200).optional().describe('Max risultati per pagina (default 50).'),
        offset: z.number().int().min(0).optional().describe('Salta i primi N risultati per paginare oltre la prima pagina (default 0).'),
      },
    },
    async (args) => {
      try {
        const sid = requireStudio();
        const limit = args.limit ?? 50;
        const offset = args.offset ?? 0;
        const fields = ['ragione_sociale', 'codice_cliente', 'codice_fiscale', 'partita_iva'];

        // Totale reale (stesso filtro) così l'AI sa quanti sono in tutto e non stima a caso.
        const cq = applyTokenSearch(
          client.from('clienti').select('id', { count: 'exact', head: true }).eq('studio_id', sid),
          args.query,
          fields,
        );
        const { count: totale, error: countErr } = await cq;

        const q = applyTokenSearch(
          client
            .from('clienti')
            .select('id, codice_cliente, ragione_sociale, tipo_cliente, status, codice_fiscale, partita_iva')
            .eq('studio_id', sid),
          args.query,
          fields,
        );
        const { data, error } = await q.order('updated_at', { ascending: false }).range(offset, offset + limit - 1);
        if (error) return errorResult(error.message);

        const mostrati = data?.length ?? 0;
        return jsonResult({
          ...paginazione(totale, countErr, mostrati, offset, limit,
            'Ci sono altri clienti oltre quelli mostrati: usa "query" per cercarne uno specifico, oppure richiama con "offset" maggiore per la pagina successiva.'),
          clienti: data ?? [],
        });
      } catch (e: any) {
        return errorResult(e?.message || String(e));
      }
    },
  );

  server.registerTool(
    'leggi_cliente',
    {
      title: 'Leggi cliente',
      description: 'Restituisce il dettaglio completo di un cliente dello studio dato il suo id.' + PRIVACY_HINT,
      inputSchema: { cliente_id: z.string().uuid().describe('UUID del cliente.') },
    },
    async (args) => {
      try {
        const sid = requireStudio();
        const { data, error } = await client
          .from('clienti')
          .select('*')
          .eq('id', args.cliente_id)
          .eq('studio_id', sid)
          .maybeSingle();
        if (error) return errorResult(error.message);
        if (!data) return errorResult('Cliente non trovato nello studio.');
        return jsonResult(data);
      } catch (e: any) {
        return errorResult(e?.message || String(e));
      }
    },
  );

  server.registerTool(
    'cerca_soggetto',
    {
      title: 'Cerca soggetto in anagrafica',
      description:
        'Cerca persone/aziende in anagrafica_soggetti per nome, codice fiscale o P.IVA. Utile prima di crea_soggetto per ' +
        "evitare duplicati e per risolvere l'associazione di un documento a una persona. La risposta include 'totale' e " +
        "'troncato': se troncato=true affina la 'query' o richiama con 'offset' maggiore. Non dedurre soggetti non presenti " +
        'nella risposta.' + PRIVACY_HINT,
      inputSchema: {
        query: z.string().min(2).describe('Testo di ricerca (nome / CF / P.IVA), min 2 caratteri.'),
        limit: z.number().int().min(1).max(100).optional().describe('Max risultati per pagina (default 25).'),
        offset: z.number().int().min(0).optional().describe('Salta i primi N risultati per paginare (default 0).'),
      },
    },
    async (args) => {
      try {
        const sid = requireStudio();
        const limit = args.limit ?? 25;
        const offset = args.offset ?? 0;
        const fields = ['nome_cognome', 'codice_fiscale', 'partita_iva'];

        const { count: totale, error: countErr } = await applyTokenSearch(
          client
            .from('anagrafica_soggetti')
            .select('id', { count: 'exact', head: true })
            .eq('studio_id', sid)
            .is('deleted_at', null),
          args.query,
          fields,
        );

        const { data, error } = await applyTokenSearch(
          client
            .from('anagrafica_soggetti')
            .select('id, tipo_soggetto, nome_cognome, codice_fiscale, partita_iva, nazionalita')
            .eq('studio_id', sid)
            .is('deleted_at', null),
          args.query,
          fields,
        )
          .order('nome_cognome', { ascending: true })
          .range(offset, offset + limit - 1);
        if (error) return errorResult(error.message);

        const mostrati = data?.length ?? 0;
        return jsonResult({
          ...paginazione(totale, countErr, mostrati, offset, limit,
            'Altri soggetti corrispondono: affina la "query" o richiama con "offset" maggiore.'),
          soggetti: data ?? [],
        });
      } catch (e: any) {
        return errorResult(e?.message || String(e));
      }
    },
  );

  server.registerTool(
    'lista_incarichi',
    {
      title: 'Lista incarichi',
      description:
        "Elenca gli incarichi dello studio. Filtro opzionale 'cliente_id' per limitarli a un cliente. La risposta include " +
        "'totale' e 'troncato': se troncato=true filtra per cliente_id o richiama con 'offset' maggiore. Non dedurre " +
        'incarichi non presenti nella risposta.' + PRIVACY_HINT,
      inputSchema: {
        cliente_id: z.string().uuid().optional().describe('UUID del cliente per filtrare i suoi incarichi.'),
        limit: z.number().int().min(1).max(200).optional().describe('Max risultati per pagina (default 50).'),
        offset: z.number().int().min(0).optional().describe('Salta i primi N risultati per paginare (default 0).'),
      },
    },
    async (args) => {
      try {
        const sid = requireStudio();
        const limit = args.limit ?? 50;
        const offset = args.offset ?? 0;

        let cq = client.from('incarichi').select('id', { count: 'exact', head: true }).eq('studio_id', sid);
        if (args.cliente_id) cq = cq.eq('cliente_id', args.cliente_id);
        const { count: totale, error: countErr } = await cq;

        let q = client
          .from('incarichi')
          .select('id, codice_incarico, cliente_id, tipologia_prestazione_id, descrizione, data_inizio, data_fine, status')
          .eq('studio_id', sid);
        if (args.cliente_id) q = q.eq('cliente_id', args.cliente_id);
        const { data, error } = await q.order('data_inizio', { ascending: false }).range(offset, offset + limit - 1);
        if (error) return errorResult(error.message);

        const mostrati = data?.length ?? 0;
        return jsonResult({
          ...paginazione(totale, countErr, mostrati, offset, limit,
            'Altri incarichi presenti: filtra per cliente_id o richiama con "offset" maggiore.'),
          incarichi: data ?? [],
        });
      } catch (e: any) {
        return errorResult(e?.message || String(e));
      }
    },
  );

  server.registerTool(
    'lista_alert',
    {
      title: 'Lista alert',
      description: 'Elenca gli alert dello studio (default solo quelli aperti). Sono la to-do list di compliance da risolvere.',
      inputSchema: {
        solo_aperti: z.boolean().optional().describe('Se true (default) mostra solo gli alert con status=open.'),
      },
    },
    async (args) => {
      try {
        const sid = requireStudio();
        let q = client
          .from('alert')
          .select('id, tipo_rt, alert_id, riferimento_id, messaggio, priorita, status, created_at')
          .eq('studio_id', sid)
          .order('created_at', { ascending: false });
        if (args.solo_aperti !== false) q = q.eq('status', 'open');
        const { data, error } = await q;
        if (error) return errorResult(error.message);
        return jsonResult({ count: data?.length ?? 0, alert: data ?? [] });
      } catch (e: any) {
        return errorResult(e?.message || String(e));
      }
    },
  );

  server.registerTool(
    'spiega_alert',
    {
      title: 'Spiega alert',
      description: "Dato l'id di un alert, spiega l'azione mancante che lo risolverebbe. Gli alert si chiudono da soli quando l'azione viene completata (trigger DB): non esiste un tool 'chiudi alert'.",
      inputSchema: { alert_id: z.string().uuid().describe("UUID dell'alert (campo id).") },
    },
    async (args) => {
      try {
        const sid = requireStudio();
        const { data, error } = await client
          .from('alert')
          .select('id, tipo_rt, alert_id, riferimento_id, messaggio, priorita, status')
          .eq('id', args.alert_id)
          .eq('studio_id', sid)
          .maybeSingle();
        if (error) return errorResult(error.message);
        if (!data) return errorResult('Alert non trovato nello studio.');
        return jsonResult({
          ...data,
          azione_suggerita: ALERT_AZIONE[data.tipo_rt] ?? 'Verifica manualmente: tipo alert non mappato.',
        });
      } catch (e: any) {
        return errorResult(e?.message || String(e));
      }
    },
  );

  server.registerTool(
    'stato_piano',
    {
      title: 'Stato di un piano',
      description:
        "Restituisce lo stato di un piano proposto (pending/approved/rejected/executing/executed/expired/failed) e, " +
        "una volta eseguito, l'esito per-azione [{ index, tool, ok, id?, error? }]. Dopo l'approvazione USA SEMPRE " +
        "questo per CONFERMARE cosa è stato scritto: NON dedurlo dalle liste (lista_incarichi, ecc.) né dare per " +
        "scontato il successo. status='executed' = tutte le azioni scritte; status='failed' = approvato ma almeno " +
        "un'azione NON scritta (leggi 'error' nell'esito): in tal caso il piano NON è rieseguibile, riproponi le " +
        "azioni mancanti in un nuovo piano. Utile anche per attendere l'approvazione umana.",
      inputSchema: { plan_id: z.string().uuid().describe('UUID del piano.') },
    },
    async (args) => {
      try {
        return jsonResult(await statoPiano(client, args.plan_id));
      } catch (e: any) {
        return errorResult(e?.message || String(e));
      }
    },
  );

  server.registerTool(
    'descrivi_tipologie_documento',
    {
      title: 'Tipologie di documento',
      description:
        "Elenca le tipologie di documento ammesse: per ognuna value, label, level (persona/cliente/incarico → " +
        "quale id serve in prepara_upload_documento) e se la data_scadenza è obbligatoria. Consulta SEMPRE questo " +
        'prima di preparare un upload, così non indovini tipologia né associazione.',
      inputSchema: {},
    },
    async () => {
      try {
        return jsonResult({ tipologie: descriviTipologie() });
      } catch (e: any) {
        return errorResult(e?.message || String(e));
      }
    },
  );

  server.registerTool(
    'descrivi_tipologie_prestazione',
    {
      title: 'Tipologie di prestazione (incarico)',
      description:
        "Elenca le tipologie di prestazione ammesse per un incarico: per ognuna value (l'id da usare " +
        'in crea_incarico come tipologia_prestazione_id), label, rischio_inerente (1-4) e solo_tabella_a. ' +
        'Consulta SEMPRE questo prima di proporre la creazione di un incarico, così non indovini l\'id.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return jsonResult({ tipologie: descriviTipologiePrestazione() });
      } catch (e: any) {
        return errorResult(e?.message || String(e));
      }
    },
  );

  server.registerTool(
    'descrivi_impostazioni_studio',
    {
      title: 'Impostazioni dello studio (numerazione incarichi)',
      description:
        "Restituisce le impostazioni dello studio rilevanti per le scritture: in particolare la numerazione del " +
        "codice_incarico (manuale vs automatica). Consultalo PRIMA di proporre un incarico: se la numerazione è " +
        "manuale devi fornire tu codice_incarico (seguendo la convenzione vista in lista_incarichi); se è " +
        "automatica ometti il codice e lo genera il sistema. Evita il fallimento 'codice_incarico mancante'.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const sid = requireStudio();
        return jsonResult(await descriviImpostazioniIncarico(client, sid));
      } catch (e: any) {
        return errorResult(e?.message || String(e));
      }
    },
  );

  // ---------------------------------------------------------------- SCRITTURA (tier ≥ draft)

  if (tierAllows(tier, 'draft')) {
    server.registerTool(
      'crea_bozza_cliente',
      {
        title: 'Crea bozza cliente',
        description:
          "Crea un nuovo cliente in stato BOZZA (draft) nello studio dell'utente. Usa i campi col suffisso del tipo " +
          '(_pf persona fisica, _impresa impresa, _prof professionista). Resta una bozza inerte finché un operatore ' +
          "non la completa/attiva nell'app. Le anagrafiche collegate sono create/deduplicate per CF. TITOLARI " +
          "EFFETTIVI (imprese): se sono noti, passali nell'array strutturato 'titolari_effettivi' (uno per ogni " +
          "titolare, con ruolo/quota, CF, PEP, ecc.) — NON descriverli a parole nelle note di verifica, altrimenti " +
          'non vengono registrati come veri titolari effettivi. Non attiva, non modifica record esistenti, non carica documenti.',
        inputSchema: creaBozzaClienteSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args) => {
        try {
          requireStudio(); // studio indeterminato → niente scrittura orfana (errore chiaro all'AI)
          const result = await salvaCliente(client, mapArgsToWizardData(args as Record<string, unknown>), {
            isComplete: false, // PoC/Fase4: sempre bozza (esecuzione diretta ammessa, §7.2)
            activeStudioId: studioId,
          });
          return jsonResult({
            ok: true,
            cliente_id: result.cliente?.id,
            status: result.clientStatus,
            anagrafica_id: result.clientePersonaId,
            rappresentante_id: result.rappresentantePersonaId,
            nota: "Bozza creata; va completata/attivata da un operatore nell'app.",
          });
        } catch (e: any) {
          return errorResult(`Creazione bozza cliente fallita: ${e?.message || String(e)}`);
        }
      },
    );

    server.registerTool(
      'crea_soggetto',
      {
        title: 'Crea soggetto in anagrafica',
        description:
          "Crea un soggetto (persona fisica o azienda) in anagrafica SOLO se non esiste già per codice fiscale/P.IVA. " +
          "Se esiste, NON lo sovrascrive: restituisce il match trovato (usa cerca_soggetto/quel match per gli aggiornamenti). " +
          'Pensato per popolare anagrafiche, non per modificarle.',
        inputSchema: creaSoggettoSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (args) => {
        try {
          requireStudio(); // studio indeterminato → niente scrittura orfana (errore chiaro all'AI)
          const res = await creaSoggettoWithClient(client, mapArgsToPersona(args as Record<string, any>), studioId);
          return jsonResult(
            res.created
              ? { ok: true, created: true, soggetto_id: res.id }
              : { ok: true, created: false, soggetto_id: res.id, trovato_in: res.foundIn, nota: 'Soggetto già esistente: non sovrascritto.' },
          );
        } catch (e: any) {
          return errorResult(`Creazione soggetto fallita: ${e?.message || String(e)}`);
        }
      },
    );

    // Un incarico nasce `active` (fa scattare l'alert RT2): non si scrive mai senza conferma umana.
    // Questi due tool NON scrivono subito — propongono un piano a una sola azione (riusa la modale
    // di approvazione + esegui_piano). Sono tool veri (compaiono in tools/list) così l'AI scopre la
    // funzionalità, invece di concludere che "non esiste" cercando un tool diretto.
    server.registerTool(
      'crea_incarico',
      {
        title: 'Crea incarico (proposta da approvare)',
        description:
          "Propone la creazione di UN incarico per un cliente dello studio. NON scrive subito: crea una proposta che " +
          "l'utente approva nella modale; dopo l'approvazione chiama esegui_piano(plan_id). Risolvi prima il cliente con " +
          'lista_clienti (cerca per nome con "query") e la tipologia con descrivi_tipologie_prestazione. Controlla con ' +
          'descrivi_impostazioni_studio se la numerazione è manuale: in tal caso fornisci codice_incarico. Per creare ' +
          'cliente+incarico (+valutazione) insieme, o più incarichi in blocco, usa proponi_piano (con i riferimenti "@passo:N").',
        inputSchema: creaIncaricoSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args) => {
        try {
          requireStudio(); // studio indeterminato → niente piano orfano (errore chiaro all'AI)
          const res = await proponiPiano(client, studioId, {
            titolo: 'Creazione incarico',
            azioni: [{ tool: 'crea_incarico', args: args as Record<string, any> }],
          });
          return jsonResult({
            ...res,
            messaggio: `Proposta creata. Mostra il link all'utente: all'approvazione l'app eseguirà da sé (non chiamare esegui_piano). Verifica l'esito con stato_piano("${res.plan_id}"). Niente è ancora stato scritto.`,
          });
        } catch (e: any) {
          return errorResult(`Proposta incarico fallita: ${e?.message || String(e)}`);
        }
      },
    );

    server.registerTool(
      'crea_valutazione',
      {
        title: 'Crea valutazione del rischio RT2 (proposta da approvare)',
        description:
          "Propone la creazione di UNA valutazione del rischio (RT2) per un incarico. NON scrive subito: crea una " +
          "proposta che l'utente approva nella modale; dopo l'approvazione chiama esegui_piano(plan_id). Fornisci i " +
          'punteggi 1-4 della Tabella A (e Tabella B salvo prestazioni solo_tabella_a). Di norma i punteggi li indica ' +
          "l'utente: chiedili prima di proporre, salvo l'utente chieda esplicitamente di generarli (es. per un test).",
        inputSchema: creaValutazioneSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args) => {
        try {
          requireStudio(); // studio indeterminato → niente piano orfano (errore chiaro all'AI)
          const res = await proponiPiano(client, studioId, {
            titolo: 'Creazione valutazione del rischio (RT2)',
            azioni: [{ tool: 'crea_valutazione', args: args as Record<string, any> }],
          });
          return jsonResult({
            ...res,
            messaggio: `Proposta creata. Mostra il link all'utente: all'approvazione l'app eseguirà da sé (non chiamare esegui_piano). Verifica l'esito con stato_piano("${res.plan_id}"). Niente è ancora stato scritto.`,
          });
        } catch (e: any) {
          return errorResult(`Proposta valutazione fallita: ${e?.message || String(e)}`);
        }
      },
    );

    server.registerTool(
      'proponi_piano',
      {
        title: 'Proponi piano (scrittura di massa)',
        description:
          'Prepara un piano di N azioni di scrittura (crea_bozza_cliente / crea_soggetto / crea_incarico / ' +
          "crea_valutazione) da approvare in blocco da un umano PRIMA dell'esecuzione. Usa questo (invece dei " +
          'singoli tool) per le scritture di massa E per la creazione di incarichi e valutazioni del rischio ' +
          '(record vivi che richiedono sempre la conferma umana). RIFERIMENTI TRA PASSI: quando un passo ha ' +
          "bisogno dell'UUID di un'entità creata in un passo PRECEDENTE dello STESSO piano (non ancora esistente), " +
          'usa il token "@passo:N" (N = numero del passo, 1-based) al posto dell\'UUID. Es. un solo piano: ' +
          '1) crea_bozza_cliente; 2) crea_incarico con cliente_id "@passo:1"; 3) crea_valutazione con incarico_id ' +
          '"@passo:2". Così cliente+incarico+valutazione si creano con UNA sola approvazione, senza attendere gli id. ' +
          "Restituisce un link alla pagina di approvazione: mostralo all'utente. All'approvazione l'app ESEGUE il " +
          "piano automaticamente (un solo passo 'Approva ed esegui'): NON devi chiamare esegui_piano. Verifica " +
          "l'esito con stato_piano. Nulla viene scritto finché l'utente non approva.",
        inputSchema: {
          titolo: z.string().optional().describe('Titolo descrittivo del piano (es. "Import 40 clienti di test").'),
          azioni: z.array(z.object({
            tool: z.enum(['crea_bozza_cliente', 'crea_soggetto', 'crea_incarico', 'crea_valutazione']).describe('Tool di scrittura da eseguire.'),
            args: z.record(z.string(), z.any()).describe('Argomenti del tool (stesso schema del tool singolo). Per crea_incarico vedi descrivi_tipologie_prestazione; per crea_valutazione i punteggi 1-4 della Tabella A (e B salvo solo_tabella_a).'),
          })).min(1).max(50).describe('Elenco ordinato delle azioni del piano (max 50: per import più grandi spezza in più piani).'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args) => {
        try {
          requireStudio(); // studio indeterminato → niente piano orfano (errore chiaro all'AI)
          const res = await proponiPiano(client, studioId, {
            titolo: args.titolo,
            azioni: args.azioni as AzionePiano[],
          });
          return jsonResult({
            ...res,
            messaggio: `Piano creato con ${res.n_azioni} azioni. Mostra il link all'utente: all'approvazione l'app eseguirà il piano da sé (non chiamare esegui_piano). Poi verifica l'esito con stato_piano("${res.plan_id}"). Niente è ancora stato scritto.`,
          });
        } catch (e: any) {
          return errorResult(`Proposta piano fallita: ${e?.message || String(e)}`);
        }
      },
    );

    server.registerTool(
      'aggiorna_piano',
      {
        title: 'Aggiorna un piano proposto (non ancora approvato)',
        description:
          "Modifica un piano GIÀ proposto e ANCORA in attesa di approvazione, invece di crearne uno nuovo. " +
          "Usalo quando l'utente chiede di correggere/ritoccare un piano appena proposto (es. cambiare una " +
          "descrizione, una data, i punteggi RT2). Sostituisce TUTTE le azioni del piano con quelle che passi: " +
          "fornisci sempre l'elenco COMPLETO e aggiornato, non solo le differenze (puoi rileggere quelle correnti " +
          "con stato_piano, che ora restituisce anche le 'azioni'). Consentito solo finché il piano è 'pending' " +
          "(non approvato/eseguito/scaduto). Non scrive sui dati: il piano resta da approvare, allo stesso link. " +
          "Se il piano non è più modificabile, proponine uno nuovo con proponi_piano.",
        inputSchema: {
          plan_id: z.string().uuid().describe('UUID del piano da aggiornare (da proponi_piano o stato_piano).'),
          titolo: z.string().optional().describe('Nuovo titolo del piano (opzionale).'),
          azioni: z.array(z.object({
            tool: z.enum(['crea_bozza_cliente', 'crea_soggetto', 'crea_incarico', 'crea_valutazione']).describe('Tool di scrittura da eseguire.'),
            args: z.record(z.string(), z.any()).describe('Argomenti del tool (stesso schema del tool singolo).'),
          })).min(1).max(50).describe('Elenco COMPLETO e aggiornato delle azioni (max 50): sostituisce interamente quelle attuali del piano.'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args) => {
        try {
          const res = await aggiornaPiano(client, args.plan_id, {
            titolo: args.titolo,
            azioni: args.azioni as AzionePiano[],
          });
          return jsonResult({
            ...res,
            messaggio: `Piano aggiornato (${res.n_azioni} azioni). Lo stesso link di approvazione resta valido: all'approvazione l'app eseguirà da sé. Verifica con stato_piano("${res.plan_id}"). Niente è ancora stato scritto.`,
          });
        } catch (e: any) {
          return errorResult(`Aggiornamento piano fallito: ${e?.message || String(e)}`);
        }
      },
    );

    server.registerTool(
      'esegui_piano',
      {
        title: 'Esegui piano approvato (di norma non serve)',
        description:
          "DI NORMA NON SERVE: l'app esegue il piano già al momento dell'approvazione (pulsante 'Approva ed " +
          "esegui'). Usa questo SOLO come fallback se un piano risulta 'approved' ma non ancora eseguito. Esegue " +
          "solo se lo stato è 'approved'; se è già 'executed' fallisce (già fatto). Per attendere/verificare usa stato_piano.",
        inputSchema: { plan_id: z.string().uuid().describe('UUID del piano da eseguire.') },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args) => {
        try {
          return jsonResult(await eseguiPiano(client, studioId, args.plan_id));
        } catch (e: any) {
          return errorResult(`Esecuzione piano fallita: ${e?.message || String(e)}`);
        }
      },
    );
  }

  // ------------------------------------------------ DOCUMENTI (tier ≥ modify, §5.1)
  // L'upload documenti è Modify-live: passa sempre dalla conferma umana per via dell'associazione
  // fragile. Il byte del file NON transita nel contesto AI (signed upload + uploader locale).
  if (tierAllows(tier, 'modify')) {
    const documentoMetaSchema = {
      tipologia: z.string().describe('Valore tipologia da descrivi_tipologie_documento.'),
      nome_file: z.string().min(1).describe('Nome file (verrà forzato a estensione .pdf).'),
      descrizione: z.string().optional().describe('Descrizione del documento.'),
      data_scadenza: z.string().optional().describe('Data scadenza (formato dd/mm/yyyy, es. 31/12/2026); obbligatoria per alcune tipologie.'),
      persona_id: z.string().optional().describe('UUID anagrafica (tipologie level persona).'),
      cliente_id: z.string().optional().describe('UUID cliente (tipologie level cliente).'),
      incarico_id: z.string().optional().describe('UUID incarico (tipologie level incarico).'),
    };

    server.registerTool(
      'prepara_upload_documento',
      {
        title: 'Prepara upload documento',
        description:
          'Valida tipologia/associazione/scadenza, crea la riga documento in stato pending e restituisce ' +
          'un upload_token per caricare il PDF sullo Storage via il tool locale upload_file. Risolvi prima ' +
          "l'associazione con lista_clienti/lista_incarichi/cerca_soggetto. Dopo l'upload, l'associazione va " +
          'APPROVATA da un umano (inbox "Azioni AI in attesa") e poi finalizzata con conferma_upload_documento.',
        inputSchema: documentoMetaSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args) => {
        try {
          const res = await preparaUploadDocumento(client, studioId, args as any, Date.now());
          return jsonResult({
            ...res,
            prossimo_passo: `Carica il PDF con il tool locale upload_file(path_locale, file_path="${res.file_path}", upload_token, bucket="${res.bucket}"), poi fai approvare l'associazione nell'inbox e chiama conferma_upload_documento("${res.doc_id}").`,
          });
        } catch (e: any) {
          return errorResult(`Preparazione upload fallita: ${e?.message || String(e)}`);
        }
      },
    );

    server.registerTool(
      'conferma_upload_documento',
      {
        title: 'Conferma upload documento',
        description:
          "Finalizza un documento: consentito SOLO se l'associazione è stata approvata da un umano e il file è " +
          'presente sullo Storage. Porta il documento allo stato definitivo (confirmed).',
        inputSchema: { doc_id: z.string().uuid().describe('UUID del documento (da prepara_upload_documento).') },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (args) => {
        try {
          return jsonResult(await confermaUploadDocumento(client, studioId, args.doc_id));
        } catch (e: any) {
          return errorResult(`Conferma documento fallita: ${e?.message || String(e)}`);
        }
      },
    );

    server.registerTool(
      'carica_documento',
      {
        title: 'Carica documento (fallback base64, PoC)',
        description:
          'FALLBACK PoC (max 1 MB): carica un PDF passando i byte in base64 — il file transita nel contesto, ' +
          'quindi NON per la produzione (preferisci prepara_upload_documento + upload_file). Crea la riga in ' +
          'pending: resta soggetta ad approvazione umana nell\'inbox.',
        inputSchema: { ...documentoMetaSchema, contenuto_base64: z.string().describe('PDF codificato base64 (≤ 1 MB).') },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args) => {
        try {
          const { contenuto_base64, ...meta } = args as any;
          return jsonResult(await caricaDocumentoBase64(client, studioId, meta, contenuto_base64, Date.now()));
        } catch (e: any) {
          return errorResult(`Caricamento documento fallito: ${e?.message || String(e)}`);
        }
      },
    );

    // ---- Staging documenti (Design §7): via consigliata. L'utente carica i PDF nell'app (tab
    // "Documenti da catalogare"), l'AI li legge e propone la catalogazione; l'utente approva e i
    // file vengono collegati. Il byte non torna mai indietro come base64.
    server.registerTool(
      'lista_documenti_staging',
      {
        title: 'Lista documenti da catalogare',
        description:
          'Elenca i PDF che l\'utente ha caricato nell\'app (tab "Documenti da catalogare") in attesa di ' +
          'catalogazione. È la VIA CONSIGLIATA per i documenti (l\'utente carica una volta sola). NB: questa ' +
          'lista NON contiene il testo dei PDF; "testo_in_cache": false NON significa che il documento sia ' +
          'senza testo, ma solo che non è ancora stato estratto. Per OGNI documento in cui serve un dato dal ' +
          'contenuto (sempre le tipologie con data di scadenza) chiama leggi_documento_staging e ricava ' +
          'tipologia/soggetto/scadenza dal CONTENUTO (il nome file è solo un indizio), infine proponi_catalogazione.',
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => {
        try {
          return jsonResult(await listaStaging(client));
        } catch (e: any) {
          return errorResult(`Lista staging fallita: ${e?.message || String(e)}`);
        }
      },
    );

    server.registerTool(
      'leggi_documento_staging',
      {
        title: 'Leggi documento da catalogare',
        description:
          'Restituisce il testo estratto da un PDF in staging, per dedurne tipologia/associazione/scadenza. ' +
          'Per i PDF scansionati (immagine) il testo può essere vuoto: in tal caso deduci dal nome file o chiedi all\'utente.',
        inputSchema: { staging_id: z.string().uuid().describe('UUID della riga di staging (da lista_documenti_staging).') },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (args) => {
        try {
          return jsonResult(await leggiStaging(client, args.staging_id));
        } catch (e: any) {
          return errorResult(`Lettura documento fallita: ${e?.message || String(e)}`);
        }
      },
    );

    server.registerTool(
      'proponi_catalogazione',
      {
        title: 'Proponi catalogazione documenti',
        description:
          'Registra la proposta di catalogazione per uno o più documenti in staging (tipologia + associazione ' +
          'cliente/persona/incarico + scadenza). NON scrive nulla nei documenti definitivi: la proposta va ' +
          'APPROVATA dall\'utente nell\'app; solo dopo i file vengono collegati. PRIMA leggi il contenuto con ' +
          'leggi_documento_staging (tipologia/soggetto/date dal testo, non solo dal nome) e risolvi le ' +
          'associazioni con lista_clienti/lista_incarichi/cerca_soggetto (cerca per NOME con "query", riprova ' +
          'con varianti, non fermarti alla prima pagina). SCADENZA: per le tipologie con scadenza obbligatoria ' +
          'ricava la data dal testo del documento; NON scartare il file perché la data non è nel nome — ' +
          'scartalo solo se davvero non ricavabile nemmeno dal testo. ASSOCIAZIONE: se un cliente indicato NON ' +
          'viene trovato con certezza, NON associare il documento a un cliente diverso o solo "simile": OMETTI ' +
          'quel documento (resterà "da catalogare") e segnalalo all\'utente.',
        inputSchema: {
          items: z.array(z.object({
            staging_id: z.string().uuid().describe('UUID della riga di staging.'),
            tipologia: z.string().describe('Valore tipologia (da descrivi_tipologie_documento).'),
            descrizione: z.string().optional(),
            data_scadenza: z.string().optional().describe('Formato dd/mm/yyyy (es. 31/12/2026); obbligatoria per alcune tipologie.'),
            persona_id: z.string().optional().describe('UUID anagrafica (level persona).'),
            cliente_id: z.string().optional().describe('UUID cliente (level cliente).'),
            incarico_id: z.string().optional().describe('UUID incarico (level incarico).'),
          })).min(1).describe('Documenti da catalogare, con la proposta per ciascuno.'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args) => {
        try {
          requireStudio(); // studio indeterminato → niente proposta orfana (errore chiaro all'AI)
          return jsonResult(await proponiCatalogazione(client, studioId, args.items as any));
        } catch (e: any) {
          return errorResult(`Proposta catalogazione fallita: ${e?.message || String(e)}`);
        }
      },
    );
  }

  return server;
}
