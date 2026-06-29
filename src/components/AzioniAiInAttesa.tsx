// Inbox "Azioni AI in attesa" (Fase 4c, §7.4): sezione persistente che elenca i piani proposti
// dall'AI via MCP. I piani `pending` sono azionabili (Approva/Rifiuta nel dettaglio); gli altri
// restano come storico di compliance. Il dettaglio per-azione + l'approvazione riusano
// `PianoApprovazione`. Il badge di notifica vive nell'header (Layout).

import { useState, useEffect, useCallback } from 'react';
import { Bot, RefreshCw, AlertTriangle, ChevronRight, Clock, FileText, CheckCircle, XCircle, FolderUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PianoApprovazione } from './PianoApprovazione';
import { DocumentiDaCatalogare } from './DocumentiDaCatalogare';
import { DettaglioAzione } from './DettaglioAzione';
import { useToast } from './Toast';
import { TIPOLOGIE_DOCUMENTO } from '../../api/_lib/documentoService';
import { righeDocumento } from '../lib/dettaglioAzioni';

interface Azione { tool: string; args?: Record<string, any> }

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

const tipologiaLabel = (v: string) => TIPOLOGIE_DOCUMENTO.find((t) => t.value === v)?.label || v;

interface PianoRow {
  id: string;
  titolo: string | null;
  azioni: unknown[];
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'executed' | 'expired' | 'failed';
  created_at: string;
  expires_at: string;
}

const STATUS_BADGE: Record<PianoRow['status'], { label: string; cls: string }> = {
  pending: { label: 'In attesa', cls: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approvato', cls: 'bg-green-50 text-green-700' },
  rejected: { label: 'Rifiutato', cls: 'bg-red-50 text-red-600' },
  executing: { label: 'In esecuzione', cls: 'bg-blue-50 text-blue-700' },
  executed: { label: 'Eseguito', cls: 'bg-green-50 text-green-700' },
  expired: { label: 'Scaduto', cls: 'bg-gray-100 text-gray-500' },
  // Approvato ma con azioni non scritte (errore in esecuzione): arancione scuro.
  failed: { label: 'Errore esecuzione', cls: 'bg-orange-200 text-orange-900' },
};

function isScaduto(p: PianoRow): boolean {
  return p.status === 'pending' && new Date(p.expires_at) < new Date();
}

// Riga di un piano nell'inbox: header cliccabile che apre la pagina di dettaglio/approvazione.
// I dettagli delle azioni vivono SOLO in quella pagina (PianoApprovazione), non qui: evita di
// ripetere lo stesso riquadro due volte (lista + dettaglio).
function PianoRiga({ p, onApri }: { p: PianoRow; onApri: () => void }) {
  const badge = STATUS_BADGE[p.status];
  const scaduto = isScaduto(p);
  const azioni = (p.azioni as Azione[]) ?? [];
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onApri} className="min-w-0 flex-1 text-left">
          <div className="text-sm font-medium text-gray-800 truncate">{p.titolo || 'Piano senza titolo'}</div>
          <div className="text-xs text-gray-400">
            {azioni.length} azioni · {new Date(p.created_at).toLocaleString('it-IT')}
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full ${scaduto ? STATUS_BADGE.expired.cls : badge.cls}`}>
            {scaduto ? 'Scaduto' : badge.label}
          </span>
          <button onClick={onApri} className="text-gray-300 hover:text-gray-500" title="Apri">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AzioniAiInAttesa() {
  const toast = useToast();
  const [piani, setPiani] = useState<PianoRow[]>([]);
  const [docs, setDocs] = useState<DocPending[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [actingDoc, setActingDoc] = useState<string | null>(null);
  const [tab, setTab] = useState<'azioni' | 'staging'>('azioni');
  // Nomi risolti per l'associazione dei documenti pending (privacy → nomi, non UUID).
  const [clientiMap, setClientiMap] = useState<Record<string, string>>({});
  const [personeMap, setPersoneMap] = useState<Record<string, string>>({});
  const [incarichiMap, setIncarichiMap] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: docData }] = await Promise.all([
      supabase
        .from('mcp_pending_plans')
        .select('id, titolo, azioni, status, created_at, expires_at')
        .order('created_at', { ascending: false }),
      // Documenti MCP in attesa di approvazione dell'associazione (§5.1.3).
      supabase
        .from('documenti')
        .select('id, tipologia, nome_file, file_path, cliente_id, incarico_id, persona_id, data_scadenza, descrizione, created_at')
        .eq('mcp_stato', 'pending')
        .order('created_at', { ascending: false }),
    ]);
    if (error) {
      setTableMissing(true);
    } else {
      setTableMissing(false);
      setPiani((data as PianoRow[]) ?? []);
    }
    const docList = (docData as DocPending[]) ?? [];
    setDocs(docList);

    // Nomi per l'associazione dei documenti pending.
    const cIds = [...new Set(docList.map((d) => d.cliente_id).filter(Boolean) as string[])];
    const pIds = [...new Set(docList.map((d) => d.persona_id).filter(Boolean) as string[])];
    const iIds = [...new Set(docList.map((d) => d.incarico_id).filter(Boolean) as string[])];
    const [cRes, pRes, iRes] = await Promise.all([
      cIds.length ? supabase.from('clienti').select('id, ragione_sociale').in('id', cIds) : Promise.resolve({ data: [] as any[] }),
      pIds.length ? supabase.from('anagrafica_soggetti').select('id, nome_cognome').in('id', pIds) : Promise.resolve({ data: [] as any[] }),
      iIds.length ? supabase.from('incarichi').select('id, codice_incarico').in('id', iIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const cm: Record<string, string> = {}; (cRes.data ?? []).forEach((c: any) => { cm[c.id] = c.ragione_sociale; });
    const pm: Record<string, string> = {}; (pRes.data ?? []).forEach((p: any) => { pm[p.id] = p.nome_cognome; });
    const im: Record<string, string> = {}; (iRes.data ?? []).forEach((i: any) => { im[i.id] = i.codice_incarico; });
    setClientiMap(cm); setPersoneMap(pm); setIncarichiMap(im);
    setLoading(false);
  }, []);

  // Associazione leggibile di un documento (persona / cliente / incarico) risolta in nomi.
  const docAssoc = useCallback((d: DocPending): string | undefined => {
    if (d.persona_id) return personeMap[d.persona_id] || 'anagrafica';
    if (d.incarico_id) {
      const inc = incarichiMap[d.incarico_id] ? `incarico ${incarichiMap[d.incarico_id]}` : 'incarico';
      return d.cliente_id ? `${clientiMap[d.cliente_id] || 'cliente'} · ${inc}` : inc;
    }
    if (d.cliente_id) return clientiMap[d.cliente_id] || 'cliente';
    return undefined;
  }, [clientiMap, personeMap, incarichiMap]);

  const approvaDoc = useCallback(async (id: string) => {
    setActingDoc(id);
    const { error } = await supabase.from('documenti').update({ mcp_stato: 'approved' }).eq('id', id);
    setActingDoc(null);
    if (error) { toast.error(`Approvazione fallita: ${error.message}`); return; }
    toast.success('Associazione documento approvata. L\'AI può finalizzare (conferma_upload_documento).');
    reload();
  }, [reload, toast]);

  const rifiutaDoc = useCallback(async (d: DocPending) => {
    setActingDoc(d.id);
    // Rimuove il file (best-effort) e la riga: il documento pending non viene mai finalizzato.
    if (d.file_path) await supabase.storage.from('file_allegati').remove([d.file_path]).catch(() => {});
    const { error } = await supabase.from('documenti').delete().eq('id', d.id);
    setActingDoc(null);
    if (error) { toast.error(`Rifiuto fallito: ${error.message}`); return; }
    toast.success('Documento rifiutato ed eliminato.');
    reload();
  }, [reload, toast]);

  useEffect(() => { reload(); }, [reload]);

  // Aggiornamento realtime quando l'AI propone nuovi piani o ne cambia lo stato.
  useEffect(() => {
    // I piani restano senza filtro: la scheda è lo STORICO (tutti gli stati), quindi serve
    // aggiornarsi a ogni transizione. I documenti invece si filtrano su mcp_stato=pending (l'unico
    // stato mostrato), così upload/modifiche di documenti non-MCP non scatenano reload inutili.
    const channel = supabase
      .channel('mcp-plans-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mcp_pending_plans' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documenti', filter: 'mcp_stato=eq.pending' }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [reload]);

  if (selected) {
    return (
      <PianoApprovazione
        planId={selected}
        backLabel="Torna alle azioni AI"
        onClose={() => { setSelected(null); reload(); }}
      />
    );
  }

  const pending = piani.filter((p) => p.status === 'pending' && !isScaduto(p));
  const storico = piani.filter((p) => !(p.status === 'pending' && !isScaduto(p)));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Azioni AI</h2>
        </div>
        {tab === 'azioni' && (
          <button onClick={reload} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400" title="Aggiorna">
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigazione a tab */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab('azioni')}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'azioni' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          In attesa di approvazione
        </button>
        <button
          onClick={() => setTab('staging')}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'staging' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <FolderUp className="w-4 h-4" /> Documenti da catalogare
        </button>
      </div>

      {tab === 'staging' ? (
        <DocumentiDaCatalogare />
      ) : (
      tableMissing ? (
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-lg p-4 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>Funzione non disponibile: applica la migrazione
            <code className="mx-1">20260618000200_mcp_pending_plans.sql</code> al database.</span>
        </div>
      ) : loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Caricamento…</div>
      ) : (piani.length === 0 && docs.length === 0) ? (
        /* Empty-state di onboarding: niente gergo, indirizza alla configurazione. */
        <div className="text-center py-10 px-6 border border-dashed border-gray-200 rounded-xl">
          <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
            <Bot className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800">Nessun assistente AI collegato</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            Qui rivedi e approvi le operazioni che un assistente AI (es. Claude) propone sui dati del tuo
            studio. Per iniziare, collega un'AI dalle <strong>Impostazioni → Accesso AI</strong>.
          </p>
          <p className="text-xs text-gray-400 mt-3">Vuoi saperne di più? Apri la Guida, sezione “Assistente AI”.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Qui atterrano le azioni proposte da un assistente AI. Rivedi e
            <strong> approva o rifiuta</strong>: nulla viene scritto finché non approvi.
          </p>
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> Da approvare
              {pending.length > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold text-white bg-red-500 rounded-full">{pending.length}</span>
              )}
            </h3>
            {pending.length === 0 ? (
              <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg p-4 text-center">
                Nessuna azione in attesa.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {pending.map((p) => <PianoRiga key={p.id} p={p} onApri={() => setSelected(p.id)} />)}
              </div>
            )}
          </section>

          {docs.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" /> Documenti in attesa
                <span className="px-2 py-0.5 text-xs font-semibold text-white bg-red-500 rounded-full">{docs.length}</span>
              </h3>
              <p className="text-xs text-gray-400 mb-2">
                L'AI ha caricato questi documenti e chiede di confermarne l'associazione. Approva solo se
                cliente/incarico/persona e tipologia sono corretti.
              </p>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {docs.map((d) => {
                  const assoc = docAssoc(d);
                  return (
                  <div key={d.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{tipologiaLabel(d.tipologia)}</div>
                        <div className="text-xs text-gray-400 truncate">
                          {d.nome_file}
                          {assoc ? ` · ${assoc}` : ''}
                          {d.data_scadenza ? ` · scad. ${d.data_scadenza}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => approvaDoc(d.id)}
                          disabled={actingDoc === d.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Approva
                        </button>
                        <button
                          onClick={() => rifiutaDoc(d)}
                          disabled={actingDoc === d.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Rifiuta
                        </button>
                      </div>
                    </div>
                    <DettaglioAzione righe={righeDocumento(
                      { nome_file: d.nome_file, data_scadenza: d.data_scadenza, descrizione: d.descrizione, dimensione: d.dimensione },
                      { tipologiaLabel: tipologiaLabel(d.tipologia), associazione: assoc },
                    )} />
                  </div>
                  );
                })}
              </div>
            </section>
          )}

          {storico.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Storico</h3>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {storico.map((p) => <PianoRiga key={p.id} p={p} onApri={() => setSelected(p.id)} />)}
              </div>
            </section>
          )}
        </>
      )
      )}
    </div>
  );
}
