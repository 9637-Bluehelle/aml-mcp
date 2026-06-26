// Tab "Documenti da catalogare" (Design §7). L'utente carica qui i PDF UNA sola volta (anche in
// massa): finiscono nel bucket `documenti_staging` (chiavi studio_id/user_id) con stato
// 'da_catalogare'. L'AI (via MCP) li legge e propone la catalogazione → stato 'proposto'. Qui
// l'utente la **rivede e approva** (singola o "approva tutte"): il file viene spostato nella
// posizione definitiva, collegato in `documenti` e rimosso dallo staging. Pulizia manuale
// (singola / massiva) per i casi di errore o file sbagliati.

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { UploadCloud, FileText, Trash2, RefreshCw, AlertTriangle, Loader2, CheckCircle, XCircle, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { useStudio } from '../lib/StudioContext';
import { validatePdfFile } from '../lib/fileValidation';
import { finalizzaStaging, type StagingRecord, type PropostaCatalogazione } from '../lib/documentiStagingHelper';
import { getTipologia } from '../../api/_lib/documentoService';
import { DettaglioAzione } from './DettaglioAzione';
import { righeDocumento } from '../lib/dettaglioAzioni';

const BUCKET = 'documenti_staging';

interface StagingRow {
  id: string;
  studio_id: string;
  file_path: string;
  nome_file: string;
  cartella: string | null;
  dimensione: number | null;
  stato: 'da_catalogare' | 'proposto' | 'catalogato' | 'scartato';
  proposta: PropostaCatalogazione | null;
  created_at: string;
}

// Estrae ricorsivamente i File da una entry del drag-and-drop (FileSystemEntry). Per le cartelle
// scende nelle sottocartelle; il filtro PDF avviene poi in `uploadItems`. Best-effort: gli errori
// di lettura restituiscono semplicemente meno file.
function readEntryFiles(entry: any): Promise<File[]> {
  return new Promise((resolve) => {
    if (!entry) { resolve([]); return; }
    if (entry.isFile) {
      entry.file((f: File) => resolve([f]), () => resolve([]));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all: File[] = [];
      const readBatch = () => {
        reader.readEntries(async (entries: any[]) => {
          if (!entries.length) { resolve(all); return; }
          for (const e of entries) all.push(...(await readEntryFiles(e)));
          readBatch(); // readEntries restituisce a lotti: continua finché vuoto
        }, () => resolve(all));
      };
      readBatch();
    } else {
      resolve([]);
    }
  });
}

const STATO_BADGE: Record<StagingRow['stato'], { label: string; cls: string }> = {
  da_catalogare: { label: 'Da catalogare', cls: 'bg-amber-50 text-amber-700' },
  proposto:      { label: 'Proposta AI', cls: 'bg-blue-50 text-blue-700' },
  catalogato:    { label: 'Catalogato', cls: 'bg-green-50 text-green-700' },
  scartato:      { label: 'Scartato', cls: 'bg-gray-100 text-gray-500' },
};

function formatSize(b: number | null): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentiDaCatalogare() {
  const toast = useToast();
  const { activeStudioId } = useStudio();
  const [rows, setRows] = useState<StagingRow[]>([]);
  const [clientiMap, setClientiMap] = useState<Record<string, string>>({});
  const [personeMap, setPersoneMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [working, setWorking] = useState<Set<string>>(new Set());
  const [approvingAll, setApprovingAll] = useState(false);
  const [confirmSvuota, setConfirmSvuota] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<StagingRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from('documenti_staging')
      .select('id, studio_id, file_path, nome_file, cartella, dimensione, stato, proposta, created_at')
      .order('created_at', { ascending: false });
    if (error) { setTableMissing(true); setLoading(false); return; }
    setTableMissing(false);
    const list = (data as StagingRow[]) ?? [];
    setRows(list);
    // Risolvi i nomi di clienti/anagrafiche citati nelle proposte (per mostrarli leggibili).
    const cIds = [...new Set(list.map((r) => r.proposta?.cliente_id).filter(Boolean) as string[])];
    const pIds = [...new Set(list.map((r) => r.proposta?.persona_id).filter(Boolean) as string[])];
    const [cRes, pRes] = await Promise.all([
      cIds.length ? supabase.from('clienti').select('id, ragione_sociale').in('id', cIds) : Promise.resolve({ data: [] as any[] }),
      pIds.length ? supabase.from('anagrafica_soggetti').select('id, nome_cognome').in('id', pIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const cm: Record<string, string> = {}; (cRes.data ?? []).forEach((c: any) => { cm[c.id] = c.ragione_sociale; });
    const pm: Record<string, string> = {}; (pRes.data ?? []).forEach((p: any) => { pm[p.id] = p.nome_cognome; });
    setClientiMap(cm); setPersoneMap(pm);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Realtime: lo staging può cambiare anche da FUORI questa scheda — tipicamente quando l'utente
  // approva/scarta una proposta dalla modale globale (AzioniAiModale), che elimina/aggiorna le
  // righe `documenti_staging`. Senza questa sottoscrizione l'elenco qui resterebbe stale (file e
  // badge fantasma) fino a un refresh manuale. Reload silenzioso per non far lampeggiare la lista.
  useEffect(() => {
    const channel = supabase
      .channel('documenti-staging-tab')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documenti_staging' }, () => reload(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [reload]);

  // Uploader unico. Accetta file con l'eventuale cartella di provenienza. Dalla selezione di una
  // cartella prende SOLO i PDF: i non-PDF vengono ignorati e contati per un avviso riepilogativo,
  // invece di un errore per ciascun file.
  const uploadItems = useCallback(async (items: Array<{ file: File; cartella: string | null }>) => {
    if (!items.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Sessione scaduta.'); return; }
    if (!activeStudioId) { toast.error('Studio non disponibile: riprova tra poco.'); return; }

    // Separa per estensione: i non-PDF non sono idonei (li ignoriamo, con avviso).
    const pdfItems = items.filter((it) => it.file.name.toLowerCase().endsWith('.pdf'));
    const ignoratiNonPdf = items.length - pdfItems.length;

    setUploading(true);
    let ok = 0;
    let scartati = 0; // PDF per estensione ma non validi (corrotti, troppo grandi, upload fallito)
    for (let i = 0; i < pdfItems.length; i++) {
      const { file, cartella } = pdfItems[i];
      const v = await validatePdfFile(file);
      if (!v.ok) { scartati++; continue; }
      // Indice nel path per evitare collisioni quando più file condividono lo stesso millisecondo.
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, (m) => m.toLowerCase());
      const filePath = `${activeStudioId}/${user.id}/${Date.now()}_${i}_${safe}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, file, { contentType: 'application/pdf' });
      if (upErr) { scartati++; continue; }
      const { error: insErr } = await supabase.from('documenti_staging').insert({
        studio_id: activeStudioId, user_id: user.id, file_path: filePath,
        nome_file: file.name, cartella: cartella || null, dimensione: file.size, stato: 'da_catalogare',
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([filePath]).catch(() => {});
        scartati++;
        continue;
      }
      ok++;
    }
    setUploading(false);

    if (ok > 0) toast.success(`${ok} file caricati nello staging.`);
    const avvisi: string[] = [];
    if (ignoratiNonPdf > 0) avvisi.push(`${ignoratiNonPdf} non PDF`);
    if (scartati > 0) avvisi.push(`${scartati} non validi`);
    if (avvisi.length) toast.warning(`Ignorati: ${avvisi.join(' · ')}. Sono ammessi solo PDF.`);
    if (ok === 0 && avvisi.length === 0) toast.warning('Nessun file da caricare.');
    reload();
  }, [activeStudioId, reload, toast]);

  const eliminaUno = useCallback(async (r: StagingRow) => {
    setWorking((prev) => new Set(prev).add(r.id));
    await supabase.storage.from(BUCKET).remove([r.file_path]).catch(() => {});
    const { error } = await supabase.from('documenti_staging').delete().eq('id', r.id);
    setWorking((prev) => { const n = new Set(prev); n.delete(r.id); return n; });
    if (error) { toast.error(`Eliminazione fallita: ${error.message}`); return; }
    toast.success('File rimosso dallo staging.');
    reload();
  }, [reload, toast]);

  const approvaUno = useCallback(async (r: StagingRow) => {
    setWorking((prev) => new Set(prev).add(r.id));
    const res = await finalizzaStaging(r as StagingRecord);
    setWorking((prev) => { const n = new Set(prev); n.delete(r.id); return n; });
    if (!res.ok) { toast.error(`${r.nome_file}: ${res.error}`); return; }
    toast.success(`«${r.nome_file}» catalogato e collegato.`);
    reload();
  }, [reload, toast]);

  const approvaTutte = useCallback(async () => {
    const proposte = rows.filter((r) => r.stato === 'proposto');
    if (!proposte.length) return;
    setApprovingAll(true);
    let ok = 0;
    for (const r of proposte) {
      const res = await finalizzaStaging(r as StagingRecord);
      if (res.ok) ok++; else toast.error(`${r.nome_file}: ${res.error}`);
    }
    setApprovingAll(false);
    if (ok > 0) toast.success(`${ok} documenti catalogati e collegati.`);
    reload();
  }, [rows, reload, toast]);

  const scartaUno = useCallback(async (r: StagingRow) => {
    setWorking((prev) => new Set(prev).add(r.id));
    const { error } = await supabase.from('documenti_staging').update({ stato: 'da_catalogare', proposta: null }).eq('id', r.id);
    setWorking((prev) => { const n = new Set(prev); n.delete(r.id); return n; });
    if (error) { toast.error(`Operazione fallita: ${error.message}`); return; }
    toast.success('Proposta scartata: il file torna "da catalogare".');
    reload();
  }, [reload, toast]);

  const svuotaTutto = useCallback(async () => {
    setConfirmSvuota(false);
    const paths = rows.map((r) => r.file_path);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
    const ids = rows.map((r) => r.id);
    const { error } = await supabase.from('documenti_staging').delete().in('id', ids);
    if (error) { toast.error(`Svuotamento fallito: ${error.message}`); return; }
    toast.success('Staging svuotato.');
    reload();
  }, [rows, reload, toast]);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dt = e.dataTransfer;
    // Se il browser espone le entry (Chromium/WebKit), gestiamo anche le CARTELLE trascinate:
    // ogni cartella diventa la `cartella` di provenienza dei suoi file. webkitGetAsEntry va
    // chiamato in modo sincrono PRIMA di qualsiasi await (gli item vengono svuotati dopo).
    const items = dt.items;
    if (items?.length && typeof (items[0] as any).webkitGetAsEntry === 'function') {
      const entries = Array.from(items).map((it: any) => it.webkitGetAsEntry?.()).filter(Boolean);
      const collected: Array<{ file: File; cartella: string | null }> = [];
      for (const entry of entries) {
        const files = await readEntryFiles(entry);
        const cartella = entry.isDirectory ? entry.name : null;
        files.forEach((f) => collected.push({ file: f, cartella }));
      }
      if (collected.length) uploadItems(collected);
      return;
    }
    // Fallback: solo file sciolti (nessuna entry disponibile).
    if (dt.files?.length) uploadItems(Array.from(dt.files).map((f) => ({ file: f, cartella: null })));
  };

  const assocLabel = (p: PropostaCatalogazione): string => {
    if (p.persona_id) return personeMap[p.persona_id] || 'anagrafica';
    if (p.cliente_id) return (clientiMap[p.cliente_id] || 'cliente') + (p.incarico_id ? ' · incarico' : '');
    return '—';
  };

  const proposteCount = rows.filter((r) => r.stato === 'proposto').length;

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Carica qui i PDF (anche in blocco): l'assistente AI potrà leggerli e proporne la
        catalogazione (tipologia, cliente/anagrafica, scadenza). <strong>Carichi una volta sola</strong>:
        dopo la tua approvazione i file vengono collegati ai clienti e rimossi da qui.
      </p>

      {tableMissing ? (
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-lg p-4 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>Funzione non disponibile: applica la migrazione
            <code className="mx-1">20260618000500_documenti_staging.sql</code> al database.</span>
        </div>
      ) : (
        <>
          {/* Dropzone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) uploadItems(Array.from(e.target.files).map((f) => ({ file: f, cartella: null })));
                e.target.value = '';
              }}
            />
            {/* Input per selezionare una CARTELLA: prendiamo solo i PDF; la cartella di provenienza
                è il primo segmento di webkitRelativePath. `webkitdirectory` non è nei tipi React. */}
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              {...({ webkitdirectory: '', directory: '' } as any)}
              onChange={(e) => {
                if (e.target.files) {
                  uploadItems(Array.from(e.target.files).map((f) => ({
                    file: f,
                    cartella: ((f as any).webkitRelativePath || '').split('/')[0] || null,
                  })));
                }
                e.target.value = '';
              }}
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-2 text-blue-600">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm font-medium">Caricamento in corso…</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <UploadCloud className="w-8 h-8 text-gray-400" />
                {/*<span className="text-sm font-medium text-gray-700"></span>*/}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 underline underline-offset-2"
                > Trascina qui PDF o una cartella, o clicca per selezionare i file
                </button>
                <span className="text-xs">Solo PDF · da una cartella vengono presi solo i PDF (gli altri file sono ignorati)</span>
              </div>
            )}
          </div>

          {/* Toolbar elenco */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-700">
              In staging {rows.length > 0 && <span className="text-gray-400">({rows.length})</span>}
            </h3>
            <div className="flex items-center gap-2">
              {proposteCount > 0 && (
                <button
                  onClick={approvaTutte}
                  disabled={approvingAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {approvingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Approva tutte ({proposteCount})
                </button>
              )}
              {rows.length > 0 && (
                <button onClick={() => setConfirmSvuota(true)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100">
                  <Trash2 className="w-3.5 h-3.5" /> Svuota staging
                </button>
              )}
              <button onClick={() => reload()} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400" title="Aggiorna">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Elenco */}
          {loading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Caricamento…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg p-6 text-center">
              Nessun file in staging.
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const badge = STATO_BADGE[r.stato];
                const busy = working.has(r.id) || approvingAll;
                const p = r.proposta;
                const isProposto = r.stato === 'proposto' && p;
                return (
                  <div key={r.id} className={`border rounded-lg px-4 py-3 ${isProposto ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">
                            {r.cartella && <span className="text-gray-400 font-normal">{r.cartella} / </span>}
                            {r.nome_file}
                          </div>
                          <div className="text-xs text-gray-400">
                            {formatSize(r.dimensione)} · {new Date(r.created_at).toLocaleString('it-IT')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                        <button
                          onClick={() => setConfirmDelete(r)}
                          disabled={busy}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 disabled:opacity-50"
                          title="Rimuovi dallo staging"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Proposta AI da approvare */}
                    {isProposto && p && (
                      <div className="mt-3 pl-8">
                        <div className="flex items-start gap-2 text-sm text-gray-700">
                          <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="font-medium">{getTipologia(p.tipologia)?.label || p.tipologia}</span>
                            <span className="text-gray-500"> → {assocLabel(p)}</span>
                            {p.data_scadenza && <span className="text-gray-500"> · scad. {p.data_scadenza}</span>}
                            {p.descrizione && <div className="text-xs text-gray-400 mt-0.5">{p.descrizione}</div>}
                            <DettaglioAzione tinted righe={righeDocumento(
                              { nome_file: r.nome_file, cartella: r.cartella, data_scadenza: p.data_scadenza, descrizione: p.descrizione },
                              { tipologiaLabel: getTipologia(p.tipologia)?.label || p.tipologia, associazione: assocLabel(p) },
                            )} />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => approvaUno(r)}
                            disabled={busy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            {working.has(r.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            Approva e collega
                          </button>
                          <button
                            onClick={() => scartaUno(r)}
                            disabled={busy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Scarta proposta
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modale di conferma eliminazione (hard-delete: file + riga rimossi, non recuperabili). */}
      {confirmDelete && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900">Eliminare il file dallo staging?</h3>
                <p className="text-sm text-gray-500 mt-1 break-words">
                  «{confirmDelete.nome_file}» verrà rimosso definitivamente dallo staging.
                  L'operazione <strong>non è reversibile</strong>: per ricaricarlo dovrai trascinarlo di nuovo.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Annulla
              </button>
              <button
                onClick={() => { const r = confirmDelete; setConfirmDelete(null); eliminaUno(r); }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4" /> Elimina
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Modale di conferma svuotamento totale dello staging (hard-delete di tutti i file + righe). */}
      {confirmSvuota && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900">Svuotare tutto lo staging?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Verranno rimossi definitivamente <strong>{rows.length}</strong> file in staging
                  {' '}(comprese eventuali proposte AI non ancora approvate).
                  L'operazione <strong>non è reversibile</strong>.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmSvuota(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Annulla
              </button>
              <button
                onClick={svuotaTutto}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4" /> Svuota tutto
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
