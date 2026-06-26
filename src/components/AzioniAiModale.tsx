// Modale globale di conferma azioni AI (MCP). Invece di costringere l'utente ad aprire la scheda
// "Azioni AI in attesa", questo componente vive accanto al Layout e — ovunque ti trovi nell'app —
// fa comparire in tempo reale una modale appena l'AI propone una scrittura (mcp_pending_plans) o
// carica un documento da associare (documenti.mcp_stato='pending'). Mostra una richiesta alla
// volta (coda FIFO); "Più tardi" rimanda senza decidere — il piano resta nel badge/scheda. La
// scheda AzioniAiInAttesa resta come storico di compliance.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Bot, FileText, CheckCircle, XCircle, X, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { PianoApprovazione } from './PianoApprovazione';
import { TIPOLOGIE_DOCUMENTO } from '../../api/_lib/documentoService';
import { finalizzaStaging, type StagingRecord, type PropostaCatalogazione } from '../lib/documentiStagingHelper';
import { DettaglioAzione } from './DettaglioAzione';
import { righeDocumento } from '../lib/dettaglioAzioni';
import { useScrollLock } from '../hooks/useScrollLock';

interface PianoRow {
  id: string;
  created_at: string;
}

interface DocPending {
  id: string;
  tipologia: string;
  nome_file: string;
  file_path: string;
  cliente_id: string | null;
  incarico_id: string | null;
  persona_id: string | null;
  data_scadenza: string | null;
  descrizione: string | null;
  dimensione: number | null;
  created_at: string;
}

interface StagingProposal {
  id: string;
  studio_id: string;
  file_path: string;
  nome_file: string;
  cartella: string | null;
  proposta: PropostaCatalogazione | null;
  created_at: string;
}

type QItem =
  | { kind: 'plan'; key: string; created_at: string; id: string }
  | { kind: 'doc'; key: string; created_at: string; doc: DocPending }
  // Le proposte di catalogazione (documenti_staging 'proposto') sono raggruppate in un'unica
  // voce di coda: una sola modale che elenca tutte le azioni proposte dall'AI.
  | { kind: 'staging'; key: string; created_at: string };

const tipologiaLabel = (v: string) => TIPOLOGIE_DOCUMENTO.find((t) => t.value === v)?.label || v;

export function AzioniAiModale() {
  const toast = useToast();
  const [plans, setPlans] = useState<PianoRow[]>([]);
  const [docs, setDocs] = useState<DocPending[]>([]);
  const [staging, setStaging] = useState<StagingProposal[]>([]);
  const [clientiMap, setClientiMap] = useState<Record<string, string>>({});
  const [personeMap, setPersoneMap] = useState<Record<string, string>>({});
  const [incarichiMap, setIncarichiMap] = useState<Record<string, string>>({});
  // Richieste "rimandate" (Più tardi) in questa sessione: non vengono più riproposte
  // automaticamente, ma restano nel badge/scheda. Chiave: `plan:<id>` / `doc:<id>` / `staging:group`.
  const [snoozed, setSnoozed] = useState<Set<string>>(new Set());
  const [actingDoc, setActingDoc] = useState(false);
  const [stagingBusy, setStagingBusy] = useState<Set<string>>(new Set());
  const [approvingAllStaging, setApprovingAllStaging] = useState(false);
  const [scartandoTutte, setScartandoTutte] = useState(false);

  const reload = useCallback(async () => {
    const now = new Date().toISOString();
    const [{ data: planData, error }, { data: docData }, { data: stagingData }] = await Promise.all([
      supabase
        .from('mcp_pending_plans')
        .select('id, created_at')
        .eq('status', 'pending')
        .gt('expires_at', now)
        .order('created_at', { ascending: true }),
      supabase
        .from('documenti')
        .select('id, tipologia, nome_file, file_path, cliente_id, incarico_id, persona_id, data_scadenza, descrizione, dimensione, created_at')
        .eq('mcp_stato', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('documenti_staging')
        .select('id, studio_id, file_path, nome_file, cartella, proposta, created_at')
        .eq('stato', 'proposto')
        .order('created_at', { ascending: true }),
    ]);
    // Se la tabella MCP non esiste ancora (migrazione non applicata), non mostriamo nulla.
    if (error) { setPlans([]); } else { setPlans((planData as PianoRow[]) ?? []); }
    setDocs((docData as DocPending[]) ?? []);

    const docList = (docData as DocPending[]) ?? [];
    const stagingList = (stagingData as StagingProposal[]) ?? [];
    setStaging(stagingList);

    // Risolvi i nomi di clienti/anagrafiche/incarichi citati (privacy: mostriamo nomi, non UUID),
    // sia per i documenti pending sia per le proposte di catalogazione.
    const cIds = [...new Set([
      ...docList.map((d) => d.cliente_id),
      ...stagingList.map((s) => s.proposta?.cliente_id),
    ].filter(Boolean) as string[])];
    const pIds = [...new Set([
      ...docList.map((d) => d.persona_id),
      ...stagingList.map((s) => s.proposta?.persona_id),
    ].filter(Boolean) as string[])];
    const iIds = [...new Set([
      ...docList.map((d) => d.incarico_id),
      ...stagingList.map((s) => s.proposta?.incarico_id),
    ].filter(Boolean) as string[])];
    const [cRes, pRes, iRes] = await Promise.all([
      cIds.length ? supabase.from('clienti').select('id, ragione_sociale').in('id', cIds) : Promise.resolve({ data: [] as any[] }),
      pIds.length ? supabase.from('anagrafica_soggetti').select('id, nome_cognome').in('id', pIds) : Promise.resolve({ data: [] as any[] }),
      iIds.length ? supabase.from('incarichi').select('id, codice_incarico').in('id', iIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const cm: Record<string, string> = {}; (cRes.data ?? []).forEach((c: any) => { cm[c.id] = c.ragione_sociale; });
    const pm: Record<string, string> = {}; (pRes.data ?? []).forEach((p: any) => { pm[p.id] = p.nome_cognome; });
    const im: Record<string, string> = {}; (iRes.data ?? []).forEach((i: any) => { im[i.id] = i.codice_incarico; });
    setClientiMap(cm); setPersoneMap(pm); setIncarichiMap(im);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Realtime: appena l'AI propone un piano o carica un documento, la coda si aggiorna e la
  // modale compare senza bisogno di refresh.
  useEffect(() => {
    // Filtri server-side: ascoltiamo SOLO le righe che interessano la coda (documenti pending /
    // staging proposto), così un qualunque upload/modifica di documenti NON-MCP nell'app non scatena
    // un reload a cascata (questa modale è montata globalmente nel Layout). Evita anche il doppio
    // reload sull'azione propria: approvando, la riga esce dal filtro → niente evento realtime
    // ridondante (il reload manuale post-azione basta). I piani restano senza filtro: bassa frequenza
    // e così la rimozione resta visibile anche se l'approvazione avviene in un'altra scheda.
    const channel = supabase
      .channel('mcp-approval-modal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mcp_pending_plans' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documenti', filter: 'mcp_stato=eq.pending' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documenti_staging', filter: 'stato=eq.proposto' }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [reload]);

  // Coda unificata (piani + documenti) ordinata FIFO, esclusi i rimandati.
  const queue = useMemo<QItem[]>(() => {
    const items: QItem[] = [
      ...plans.map((p): QItem => ({ kind: 'plan', key: `plan:${p.id}`, created_at: p.created_at, id: p.id })),
      ...docs.map((d): QItem => ({ kind: 'doc', key: `doc:${d.id}`, created_at: d.created_at, doc: d })),
    ];
    // Le proposte di catalogazione (staging 'proposto') confluiscono in UNA sola voce di coda,
    // datata alla più vecchia, così l'utente vede tutte le azioni in un'unica modale.
    if (staging.length > 0) {
      const oldest = staging.reduce((min, s) => (s.created_at < min ? s.created_at : min), staging[0].created_at);
      items.push({ kind: 'staging', key: 'staging:group', created_at: oldest });
    }
    return items
      .filter((it) => !snoozed.has(it.key))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [plans, docs, staging, snoozed]);

  const current = queue[0];
  const restanti = queue.length - 1;

  // Come le altre modali: quando una richiesta AI è a schermo, blocca lo scroll dello sfondo.
  useScrollLock(!!current);

  const snoozeCurrent = useCallback(() => {
    if (!current) return;
    setSnoozed((prev) => new Set(prev).add(current.key));
  }, [current]);

  const approvaDoc = useCallback(async (d: DocPending) => {
    setActingDoc(true);
    const { error } = await supabase.from('documenti').update({ mcp_stato: 'approved' }).eq('id', d.id);
    setActingDoc(false);
    if (error) { toast.error(`Approvazione fallita: ${error.message}`); return; }
    toast.success('Associazione documento approvata. L\'AI può finalizzare l\'upload.');
    reload();
  }, [reload, toast]);

  const rifiutaDoc = useCallback(async (d: DocPending) => {
    setActingDoc(true);
    // Rimuove il file (best-effort) e la riga: il documento pending non viene mai finalizzato.
    if (d.file_path) await supabase.storage.from('file_allegati').remove([d.file_path]).catch(() => {});
    const { error } = await supabase.from('documenti').delete().eq('id', d.id);
    setActingDoc(false);
    if (error) { toast.error(`Rifiuto fallito: ${error.message}`); return; }
    toast.success('Documento rifiutato ed eliminato.');
    reload();
  }, [reload, toast]);

  // --- Proposte di catalogazione (staging 'proposto') ---
  // Etichetta leggibile dell'associazione (persona / cliente / incarico), risolta in nomi.
  // Usata sia dalle proposte di catalogazione sia dai documenti pending.
  const assocLabel = useCallback((p: { persona_id?: string | null; cliente_id?: string | null; incarico_id?: string | null } | null): string => {
    if (!p) return '—';
    if (p.persona_id) return personeMap[p.persona_id] || 'anagrafica';
    if (p.incarico_id) {
      const inc = incarichiMap[p.incarico_id] ? `incarico ${incarichiMap[p.incarico_id]}` : 'incarico';
      return p.cliente_id ? `${clientiMap[p.cliente_id] || 'cliente'} · ${inc}` : inc;
    }
    if (p.cliente_id) return clientiMap[p.cliente_id] || 'cliente';
    return '—';
  }, [clientiMap, personeMap, incarichiMap]);

  const approvaStaging = useCallback(async (s: StagingProposal) => {
    setStagingBusy((prev) => new Set(prev).add(s.id));
    const res = await finalizzaStaging(s as StagingRecord);
    setStagingBusy((prev) => { const n = new Set(prev); n.delete(s.id); return n; });
    if (!res.ok) { toast.error(`${s.nome_file}: ${res.error}`); return; }
    toast.success(`«${s.nome_file}» catalogato e collegato.`);
    reload();
  }, [reload, toast]);

  const scartaStaging = useCallback(async (s: StagingProposal) => {
    setStagingBusy((prev) => new Set(prev).add(s.id));
    // Scarta la proposta dell'AI: il file torna "da catalogare" (non viene eliminato).
    const { error } = await supabase.from('documenti_staging').update({ stato: 'da_catalogare', proposta: null }).eq('id', s.id);
    setStagingBusy((prev) => { const n = new Set(prev); n.delete(s.id); return n; });
    if (error) { toast.error(`Operazione fallita: ${error.message}`); return; }
    toast.success('Proposta scartata: il file torna "da catalogare".');
    reload();
  }, [reload, toast]);

  const approvaTutteStaging = useCallback(async () => {
    if (!staging.length) return;
    setApprovingAllStaging(true);
    let ok = 0;
    for (const s of staging) {
      const res = await finalizzaStaging(s as StagingRecord);
      if (res.ok) ok++; else toast.error(`${s.nome_file}: ${res.error}`);
    }
    setApprovingAllStaging(false);
    if (ok > 0) toast.success(`${ok} documenti catalogati e collegati.`);
    reload();
  }, [staging, reload, toast]);

  const scartaTutteStaging = useCallback(async () => {
    if (!staging.length) return;
    // Scarta in blocco: ogni file torna "da catalogare" (proposta azzerata). NON elimina i file.
    setScartandoTutte(true);
    const { error } = await supabase
      .from('documenti_staging')
      .update({ stato: 'da_catalogare', proposta: null })
      .in('id', staging.map((s) => s.id));
    setScartandoTutte(false);
    if (error) { toast.error(`Operazione fallita: ${error.message}`); return; }
    toast.success('Proposte scartate: i file tornano "da catalogare".');
    reload();
  }, [staging, reload, toast]);

  if (!current) return null;

  // I piani riusano la card di PianoApprovazione in variante modale (con backdrop e "Più tardi").
  if (current.kind === 'plan') {
    return (
      <PianoApprovazione
        planId={current.id}
        variant="modal"
        queueCount={restanti}
        onClose={snoozeCurrent}
        onDecided={reload}
      />
    );
  }

  // Le proposte di catalogazione: una card che elenca TUTTE le azioni proposte dall'AI, con
  // Approva/Scarta per riga e "Approva tutte". Stesso stile e proprietà globale delle altre.
  if (current.kind === 'staging') {
    const busyAll = approvingAllStaging || scartandoTutte;
    return createPortal(
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
        {/* Altezza fissa (~schermo): intestazione e pulsanti restano fermi, scorre solo la lista. */}
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col h-[90vh] max-h-[90vh]">
          <div className="p-6 pb-4 space-y-4 shrink-0">
            <div className="flex items-center justify-between">
              {restanti > 0 ? (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  +{restanti} {restanti === 1 ? 'altra in attesa' : 'altre in attesa'}
                </span>
              ) : <span />}
              <button onClick={snoozeCurrent} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700" title="Più tardi">
                Più tardi <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Bot className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-900">Catalogazione documenti AI</h2>
            </div>

            <p className="text-sm text-gray-500">
              Un assistente AI propone di catalogare e collegare i documenti qui sotto.
              <strong> Nulla viene collegato</strong> finché non approvi. Rivedi tipologia e associazione.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-6">
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {staging.map((s) => {
              const busy = stagingBusy.has(s.id) || busyAll;
              const p = s.proposta;
              return (
                <div key={s.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {s.cartella && <span className="text-gray-400 font-normal">{s.cartella} / </span>}
                        {s.nome_file}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 break-words">
                        {tipologiaLabel(p?.tipologia || '')} → {assocLabel(p)}
                        {p?.data_scadenza ? ` · scad. ${p.data_scadenza}` : ''}
                      </div>
                      <DettaglioAzione righe={righeDocumento(
                        { nome_file: s.nome_file, cartella: s.cartella, data_scadenza: p?.data_scadenza, descrizione: p?.descrizione },
                        { tipologiaLabel: tipologiaLabel(p?.tipologia || ''), associazione: assocLabel(p) },
                      )} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => approvaStaging(s)}
                      disabled={busy}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {stagingBusy.has(s.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Approva
                    </button>
                    <button
                      onClick={() => scartaStaging(s)}
                      disabled={busy}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Scarta
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          <div className="p-6 pt-4 shrink-0 flex justify-end gap-2">
            <button
              onClick={scartaTutteStaging}
              disabled={busyAll || staging.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm font-medium"
            >
              {scartandoTutte ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Scarta tutti
            </button>
            <button
              onClick={approvaTutteStaging}
              disabled={busyAll || staging.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
            >
              {approvingAllStaging ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Approva tutte ({staging.length})
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // I documenti hanno una card dedicata (conferma associazione), stesso stile della modale piano.
  const d = current.doc;
  const docAssoc = assocLabel(d);
  const dettagli = [
    docAssoc !== '—' ? docAssoc : null,
    d.data_scadenza ? `scad. ${d.data_scadenza}` : null,
  ].filter(Boolean).join(' · ');

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          {restanti > 0 ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
              +{restanti} {restanti === 1 ? 'altra in attesa' : 'altre in attesa'}
            </span>
          ) : <span />}
          <button
            onClick={snoozeCurrent}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700"
            title="Più tardi"
          >
            Più tardi <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Documento AI in attesa</h2>
        </div>

        <p className="text-sm text-gray-500">
          Un assistente AI ha caricato questo documento e chiede di confermarne l'associazione.
          <strong> Approva solo se</strong> tipologia e collegamento (cliente/incarico/persona) sono corretti.
        </p>

        <div className="border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3">
          <FileText className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-800">{tipologiaLabel(d.tipologia)}</div>
            <div className="text-xs text-gray-500 mt-0.5 break-words">
              {d.nome_file}{dettagli ? ` · ${dettagli}` : ''}
            </div>
            <DettaglioAzione righe={righeDocumento(
              { nome_file: d.nome_file, data_scadenza: d.data_scadenza, descrizione: d.descrizione, dimensione: d.dimensione },
              { tipologiaLabel: tipologiaLabel(d.tipologia), associazione: docAssoc !== '—' ? docAssoc : undefined },
            )} />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => approvaDoc(d)}
            disabled={actingDoc}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
          >
            <CheckCircle className="w-4 h-4" /> Approva
          </button>
          <button
            onClick={() => rifiutaDoc(d)}
            disabled={actingDoc}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-50 text-sm font-medium"
          >
            <XCircle className="w-4 h-4" /> Rifiuta
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
