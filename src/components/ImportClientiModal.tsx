import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Combobox, ComboboxInput, ComboboxButton, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Copy, X, Loader2, ArrowLeft, ArrowRight, Columns, Info, ChevronDown, ChevronLeft, ChevronRight, Check, Minus } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import {
  analyzeWorkbookBuffer,
  parseClientiBuffer,
  importClienti,
  CANONICAL_FIELDS,
  getFieldDef,
  type WorkbookAnalysis,
  type ColumnMapping,
  type CanonicalField,
  type CanonicalFieldDef,
  type ParseResult,
  type RowReport,
  type RowStatus,
  type ImportOutcome,
} from '../lib/clienteImport';
import { useToast } from './Toast';

interface ImportClientiModalProps {
  onClose: () => void;
  /** Invocato dopo un import andato (anche solo parzialmente) a buon fine,
   *  così la lista chiamante può ricaricare i clienti. */
  onImported: () => void;
}

const STATUS_META: Record<RowStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: 'Pronto', cls: 'text-green-700 bg-green-50 border-green-200', Icon: CheckCircle2 },
  warning: { label: 'Da rivedere', cls: 'text-amber-700 bg-amber-50 border-amber-200', Icon: AlertTriangle },
  duplicate: { label: 'Duplicato', cls: 'text-gray-600 bg-gray-100 border-gray-200', Icon: Copy },
  error: { label: 'Errore', cls: 'text-red-700 bg-red-50 border-red-200', Icon: XCircle },
};

const FIELD_GROUPS = [...new Set(CANONICAL_FIELDS.map(f => f.group))];

// Oltre questa soglia l'import (inserimenti sequenziali) può richiedere tempo:
// avvisiamo l'utente e ricordiamo che è annullabile.
const LARGE_IMPORT_THRESHOLD = 300;

// Estensioni accettate: usate sia dall'<input accept> sia come guardia del
// drag&drop (che altrimenti accetterebbe qualunque file).
const ACCEPTED_EXTENSIONS = ['.xls', '.xlsx', '.csv'] as const;

// Limite di dimensione: i file anagrafici tipici sono ben sotto. Oltre questa
// soglia rifiutiamo per evitare di bloccare il browser (parsing sincrono) o di
// dare in pasto a SheetJS input potenzialmente ostili (file enormi / "zip bomb").
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

type Phase = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

export function ImportClientiModal({ onClose, onImported }: ImportClientiModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>('upload');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);

  const [buf, setBuf] = useState<ArrayBuffer | null>(null);
  const [analysis, setAnalysis] = useState<WorkbookAnalysis | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  // Indice della riga di intestazione scelta (l'utente può cambiarla per i file
  // che antepongono righe di titolo alle intestazioni vere).
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(-1);
  // Indice del foglio scelto (per i file Excel con più fogli).
  const [sheetIndex, setSheetIndex] = useState<number>(0);
  // Anteprima a scomparsa delle prime righe per scegliere la riga di intestazione.
  const [showHeaderPreview, setShowHeaderPreview] = useState(false);

  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  // Righe escluse manualmente dall'import (per `row.index`). Default: nessuna.
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  // Controller per annullare un import in corso.
  const abortRef = useRef<AbortController | null>(null);

  // Ad ogni cambio di fase riporta in cima lo scroll del corpo della modale,
  // altrimenti la nuova schermata eredita la posizione di scroll della precedente.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [phase]);

  // Se la modale viene smontata (es. l'utente chiude con la X) mentre un import è
  // in corso, annulliamo: niente inserimenti "fantasma" in background né update di
  // stato su un componente ormai smontato. Le righe già inserite restano.
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleFile = async (file: File) => {
    // Il drag&drop (a differenza dell'<input accept=…>) non filtra l'estensione:
    // intercettiamo qui i file non supportati con un messaggio chiaro.
    if (!ACCEPTED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
      toast.error('Formato non supportato. Carica un file Excel (.xls/.xlsx) o CSV.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`File troppo grande (max ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB). Esporta solo le righe da importare.`);
      return;
    }
    setBusy(true);
    setFileName(file.name);
    try {
      const ab = await file.arrayBuffer();
      const a = analyzeWorkbookBuffer(ab);
      if (a.columns.length === 0) {
        toast.warning('Nessuna colonna rilevata nel file.');
        return;
      }
      setBuf(ab);
      setAnalysis(a);
      setMapping({ ...a.autoMapping });
      setHeaderRowIndex(a.headerRowIndex);
      setSheetIndex(a.sheetIndex);
      setShowHeaderPreview(false);
      setPhase('mapping');
    } catch (e) {
      console.error('Errore lettura file import:', e);
      toast.error('Impossibile leggere il file. Verifica che sia un Excel (.xls/.xlsx) o CSV valido.');
    } finally {
      setBusy(false);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    // Azzera il valore così riselezionare lo STESSO file fa di nuovo scattare onChange.
    e.target.value = '';
  };

  /** Cambia la riga usata come intestazione: ri-analizza il foglio con l'indice
   *  scelto, rigenerando colonne, esempi e mapping automatico. */
  const changeHeaderRow = (idx: number) => {
    if (!buf) return;
    const a = analyzeWorkbookBuffer(buf, idx, sheetIndex);
    setAnalysis(a);
    setMapping({ ...a.autoMapping });
    setHeaderRowIndex(a.headerRowIndex);
    // Cambiare la riga di intestazione invalida colonne e righe: scartiamo
    // l'eventuale anteprima già calcolata e la relativa selezione.
    setParseResult(null);
    setExcluded(new Set());
  };

  /** Cambia il foglio da elaborare: ri-analizza dal nuovo foglio ri-rilevando
   *  l'intestazione e il mapping automatico. */
  const changeSheet = (idx: number) => {
    if (!buf || !analysis) return;
    // Non elaboriamo in automatico un foglio fuori elenco: avvisiamo e lasciamo
    // ri-scegliere (la selezione corrente resta invariata).
    if (!Number.isInteger(idx) || idx < 0 || idx >= analysis.sheetNames.length) {
      toast.warning('Foglio non valido: scegline uno dall\'elenco.');
      return;
    }
    const a = analyzeWorkbookBuffer(buf, undefined, idx);
    setAnalysis(a);
    setMapping({ ...a.autoMapping });
    setHeaderRowIndex(a.headerRowIndex);
    setSheetIndex(a.sheetIndex);
    setParseResult(null);
    setExcluded(new Set());
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  /** Assegna (o rimuove) un campo a una colonna. Più colonne POSSONO puntare
   *  allo stesso campo (es. sede + domicilio): in lettura `pick()` usa la prima
   *  colonna non vuota. I conflitti vengono evidenziati in giallo nella UI. */
  const assignField = (colIndex: number, field: CanonicalField | '') => {
    setMapping(prev => {
      const next: ColumnMapping = { ...prev };
      if (field) next[colIndex] = field;
      else delete next[colIndex];
      return next;
    });
  };

  const resetToUpload = () => {
    setBuf(null); setAnalysis(null); setMapping({}); setParseResult(null);
    setHeaderRowIndex(-1); setSheetIndex(0); setExcluded(new Set()); setShowHeaderPreview(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setPhase('upload');
  };

  const confirmMapping = async () => {
    if (!buf) return;
    setBusy(true);
    try {
      const result = await parseClientiBuffer(buf, mapping, headerRowIndex, sheetIndex);
      setParseResult(result);
      setExcluded(new Set()); // riparte la selezione: tutte le righe importabili sono incluse
      setPhase('preview');
      if (result.rows.length === 0) toast.warning('Nessuna riga dati trovata nel file.');
    } catch (e) {
      console.error('Errore parsing import:', e);
      toast.error('Errore durante la lettura delle righe. Riprova.');
    } finally {
      setBusy(false);
    }
  };

  /** Righe effettivamente importabili (ok/warning) e quelle selezionate dall'utente. */
  const importableRows = parseResult ? parseResult.rows.filter(r => r.status === 'ok' || r.status === 'warning') : [];
  const selectedRows = importableRows.filter(r => !excluded.has(r.index));
  const allSelected = importableRows.length > 0 && selectedRows.length === importableRows.length;

  const toggleRow = (index: number) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    // Se sono tutte selezionate → escludile tutte; altrimenti → reincludi tutto.
    setExcluded(allSelected ? new Set(importableRows.map(r => r.index)) : new Set());
  };

  const cancelImport = () => abortRef.current?.abort();

  const runImport = async () => {
    if (!parseResult) return;
    if (selectedRows.length === 0) {
      toast.warning('Nessuna riga selezionata da importare.');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('importing');
    setProgress({ done: 0, total: selectedRows.length });
    try {
      const res = await importClienti(selectedRows, (done, total) => setProgress({ done, total }), controller.signal);
      setOutcomes(res);
      setPhase('done');

      const created = res.filter(o => o.ok).length;
      const failed = res.filter(o => !o.ok).length;
      const cancelled = controller.signal.aborted;
      if (created > 0) {
        toast.success(`${created} cliente${created === 1 ? '' : 'i'} importat${created === 1 ? 'o' : 'i'}${failed ? `, ${failed} con errori` : ''}${cancelled ? ' (import interrotto)' : ''}.`);
        onImported();
      } else if (cancelled) {
        toast.warning('Import annullato: nessun cliente inserito.');
      } else {
        toast.error('Nessun cliente importato.');
      }
    } catch (e) {
      console.error('Errore durante import clienti:', e);
      toast.error('Errore imprevisto durante l\'importazione. Nessuna modifica completata.');
      setPhase('preview');
    } finally {
      abortRef.current = null;
    }
  };
 
  // Blocca lo scroll di sfondo mentre la modale è montata (come le altre modali).
  useScrollLock(true);

  const s = parseResult?.summary;
  const assignedFields = new Set(Object.values(mapping).filter(Boolean) as CanonicalField[]);
  // Serve almeno un campo identificativo: senza nominativo nessuna riga è importabile.
  const hasIdentifyingField = assignedFields.has('cognome') || assignedFields.has('nome') || assignedFields.has('ragioneSociale');
  // Conteggio colonne per campo: >1 = conflitto (due colonne sullo stesso dato).
  const fieldCounts = new Map<CanonicalField, number>();
  for (const f of Object.values(mapping)) if (f) fieldCounts.set(f, (fieldCounts.get(f) || 0) + 1);
  const conflictFields = CANONICAL_FIELDS.filter(d => (fieldCounts.get(d.key) || 0) > 1);

  // Navigazione compatta (stepper) della riga di intestazione fra le righe candidate.
  const headerOpts = analysis?.headerOptions ?? [];
  const selectedHeaderOption = headerOpts.find(o => o.index === headerRowIndex) ?? null;
  const displayedHeaderRowNumber = selectedHeaderOption ? selectedHeaderOption.index + 1 : (headerRowIndex >= 0 ? headerRowIndex + 1 : 0);
  const headerPos = headerOpts.findIndex(o => o.index === headerRowIndex);
  const headerPrev = headerPos > 0 ? headerOpts[headerPos - 1].index : null;
  const headerNext = headerPos >= 0 && headerPos < headerOpts.length - 1 ? headerOpts[headerPos + 1].index : null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Overlay bloccante durante il parsing sincrono: impedisce click e
            interazioni (inclusa la chiusura) finché l'elaborazione non termina. */}
        {busy && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-[1px] rounded-2xl cursor-wait">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-gray-600">Elaborazione del file in corso…</p>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            Importa clienti da file
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5">
          {/* ---- UPLOAD ---- */}
          {phase === 'upload' && (
            <div
              onDrop={onDrop}
              onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center hover:border-blue-400 transition-colors"
            >
              {busy ? (
                <div className="flex flex-col items-center gap-3 text-gray-600">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <p>Lettura di <span className="font-medium">{fileName}</span>…</p>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-700 font-medium">Trascina qui il file Excel/CSV</p>
                  <p className="text-sm text-gray-500 mt-1">oppure</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
                  >
                    Seleziona file
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={onInputChange}
                    className="hidden"
                  />
                  <p className="text-xs text-gray-400 mt-4">
                    Formati supportati: .xls, .xlsx, .csv — la prima riga deve contenere le intestazioni delle colonne.
                  </p>
                </>
              )}
            </div>
          )}

          {/* ---- MAPPING ---- */}
          {phase === 'mapping' && analysis && (
            <div className="space-y-5">
              <div className="flex items-start gap-2 text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-xl p-3">
                <Columns className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <p>
                  Abbiamo provato ad accoppiare automaticamente le colonne del file ai dati richiesti.<br/>
                  Controlla, poi correggi liberamente dove serve.
                </p>
              </div>

              {/* Scelta del foglio: i file Excel possono avere più fogli, ma ne
                  elaboriamo uno alla volta. */}
              {analysis.sheetNames.length > 1 && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <label htmlFor="sheet-select" className="font-medium text-gray-700 shrink-0">
                    Foglio da importare
                  </label>
                  <select
                    id="sheet-select"
                    value={sheetIndex}
                    onChange={e => changeSheet(Number(e.target.value))}
                    className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    {analysis.sheetNames.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-400 shrink-0">Elabora un foglio alla volta.</span>
                </div>
              )}

              {/* Riga delle intestazioni: stepper compatto (la riga è già auto-rilevata)
                  + anteprima a scomparsa delle prime righe, sullo stile degli importer
                  moderni. Mostrato sempre come conferma rassicurante.
                  Nota: il numero mostrato è il numero di riga reale del file (come appare
                  in Excel), non il numero ordine fra le righe dati. */}
              {headerOpts.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="flex items-center gap-3 flex-wrap px-3 py-2.5 text-sm">
                    <span className="font-medium text-gray-700">Intestazioni alla riga <span className="text-gray-500 font-normal">(numero nel file)</span></span>
                    <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden">
                      <button
                        type="button"
                        disabled={headerPrev === null}
                        onClick={() => headerPrev !== null && changeHeaderRow(headerPrev)}
                        className="px-1.5 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Riga di intestazione precedente"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="px-2.5 py-1 min-w-[2rem] text-center font-semibold text-gray-800 tabular-nums">{displayedHeaderRowNumber}</span>
                      <button
                        type="button"
                        disabled={headerNext === null}
                        onClick={() => headerNext !== null && changeHeaderRow(headerNext)}
                        className="px-1.5 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Riga di intestazione successiva"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    {headerOpts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setShowHeaderPreview(v => !v)}
                        className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        {showHeaderPreview ? 'nascondi anteprima' : 'mostra anteprima'}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showHeaderPreview ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>

                  {showHeaderPreview && headerOpts.length > 1 && (
                    <div className="border-t border-gray-200 max-h-40 overflow-y-auto divide-y divide-gray-100">
                      <div className="sticky top-0 bg-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-600 uppercase tracking-wide">
                        Righe disponibili nel file (numero / anteprima):
                      </div>
                      {headerOpts.map(opt => {
                        const role = opt.index === headerRowIndex ? 'header' : opt.index < headerRowIndex ? 'ignored' : 'data';
                        return (
                          <button
                            key={opt.index}
                            type="button"
                            onClick={() => changeHeaderRow(opt.index)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs ${role === 'header' ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                          >
                            <span className="w-6 shrink-0 text-right font-semibold text-gray-700 tabular-nums">{opt.index + 1}</span>
                            <span
                              className={`flex-1 min-w-0 truncate ${role === 'header' ? 'font-semibold text-blue-800' : 'text-gray-600'}`}
                              title={opt.preview}
                            >
                              {opt.preview}
                            </span>
                            <span className={`shrink-0 text-[10px] uppercase tracking-wide font-medium ${role === 'header' ? 'text-blue-600' : 'text-gray-400'}`}>
                              {role === 'header' ? 'intestazione' : role === 'ignored' ? 'ignorata' : 'dati'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Legenda dati necessari, raggruppati per sezione */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Dati richiesti</p>
                <div className="space-y-2">
                  {FIELD_GROUPS.map(g => {
                    const fields = CANONICAL_FIELDS.filter(f => f.group === g);
                    const mapped = fields.filter(f => assignedFields.has(f.key)).length;
                    return (
                      <div key={g}>
                        <div className="text-[11px] font-medium text-gray-400 mb-1">
                          {g} <span className="text-gray-300">· {mapped}/{fields.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {fields.map(f => {
                            const on = assignedFields.has(f.key);
                            return (
                              <span
                                key={f.key}
                                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs ${
                                  on ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'
                                }`}
                              >
                                <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                                  on ? 'bg-blue-600 text-white' : 'bg-gray-300 text-white'
                                }`}>{f.order}</span>
                                {f.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Senza un campo identificativo non si può procedere. */}
              {!hasIdentifyingField && (
                <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p>
                    Assegna almeno un campo identificativo — <b>Cognome</b>, <b>Nome</b> o
                    <b> Ragione sociale</b> — per continuare: senza nominativo nessuna riga è importabile.
                  </p>
                </div>
              )}

              {/* Avviso conflitti: più colonne sullo stesso dato. Non è sempre un
                  errore (colonne complementari per tipi diversi), ma va attenzionato. */}
              {conflictFields.length > 0 && (
                <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="space-y-1.5">
                    <p>
                      Più colonne puntano allo stesso dato: <b>{conflictFields.map(f => f.label).join(', ')}</b>.
                      Per ogni riga viene usata la <b>prima colonna non vuota</b>, le altre vengono ignorate.
                    </p>
                    <ul className="space-y-1">
                      <li className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                        <span>
                          <b>Spesso è voluto.</b> Con tipi misti (imprese e persone) colonne complementari
                          come «Nazione sede legale» e «Nazione residenza» riguardano soggetti diversi: in
                          ogni riga ne è valorizzata una sola, quindi vengono unite correttamente.
                        </span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <span>
                          <b>Da verificare</b> se nella <i>stessa</i> riga entrambe le colonne sono valorizzate
                          con valori diversi: ne verrebbe salvata solo una. In tal caso assegnale a campi
                          distinti oppure metti su «Ignora» quelle in eccesso.
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Tabella di abbinamento: colonna del file → dato necessario */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_minmax(13rem,1.1fr)] items-center gap-x-3 px-3 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase">
                  <span>Colonna del file «{analysis.sheetName}»</span>
                  <span />
                  <span>Dato necessario</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {analysis.columns.map(col => {
                    const field = mapping[col.index] || null;
                    const def = field ? getFieldDef(field) : null;
                    const conflict = !!field && (fieldCounts.get(field) || 0) > 1;
                    return (
                      <div
                        key={col.index}
                        className={`grid grid-cols-[1fr_auto_minmax(13rem,1.1fr)] items-center gap-x-3 px-3 py-2 ${conflict ? 'bg-amber-50' : ''}`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 text-sm truncate" title={col.name}>{col.name}</div>
                          {col.samples.length > 0 && (
                            <div className="text-xs text-gray-400 truncate" title={col.samples.join(' · ')}>
                              es: {col.samples.join(' · ')}
                            </div>
                          )}
                        </div>
                        <ArrowRight className={`w-4 h-4 shrink-0 ${def ? 'text-blue-400' : 'text-gray-300'}`} />
                        <div className="flex items-center gap-2 min-w-0">
                          <FieldPicker
                            value={field}
                            conflict={conflict}
                            onPick={f => assignField(col.index, f ?? '')}
                          />
                          <StatusDot def={!!def} conflict={conflict} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ---- PREVIEW ---- */}
          {phase === 'preview' && parseResult && (
            <div className="space-y-4">
              {/* Riepilogo */}
              <div className="flex flex-wrap gap-2 text-sm">
                <Chip cls="bg-blue-50 text-blue-700 border-blue-200">{s?.total} righe</Chip>
                <Chip cls="bg-green-50 text-green-700 border-green-200">{s?.ok} pronte</Chip>
                {!!s?.warning && <Chip cls="bg-amber-50 text-amber-700 border-amber-200">{s.warning} da rivedere</Chip>}
                {!!s?.duplicate && <Chip cls="bg-gray-100 text-gray-600 border-gray-200">{s.duplicate} duplicate</Chip>}
                {!!s?.error && <Chip cls="bg-red-50 text-red-700 border-red-200">{s.error} in errore</Chip>}
                <Chip cls="bg-blue-600 text-white border-blue-600">{selectedRows.length} selezionate</Chip>
              </div>

              {/* Avviso file grande: l'import è sequenziale e può essere lungo. */}
              {parseResult.rows.length > LARGE_IMPORT_THRESHOLD && (
                <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p>
                    File con molte righe (<b>{parseResult.rows.length}</b>): l'importazione viene eseguita
                    una riga alla volta e può richiedere qualche minuto. Potrai <b>annullarla</b> in
                    qualsiasi momento (le righe già inserite restano).
                  </p>
                </div>
              )}

              {/* Legenda: come viene dedotto il tipo e cosa significano gli stati */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 space-y-2.5">
                <div>
                  <span className="font-semibold text-gray-700">Tipo cliente</span> — dedotto in automatico:{' '}
                  <b>Persona fisica</b> (senza partita IVA) · <b>Professionista</b> = persona fisica <i>con</i> partita IVA ·{' '}
                  <b>Impresa</b> = persona giuridica (importata come bozza; titolari effettivi e catena di controllo da completare nel wizard).
                </div>
                <div className="space-y-1">
                  <span className="font-semibold text-gray-700">Stato riga</span>
                  <ul className="space-y-1">
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                      <span><b>Pronto</b> — dati a posto, verrà importato.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                      <span><b>Da rivedere</b> — <u>verrà comunque importato</u>, ma ci sono note da controllare: dati ricavati dal codice fiscale, campi incompleti o anomali, oppure (per le imprese) titolari/catena da completare. Passa il mouse sul badge della riga per leggere i dettagli.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <Copy className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
                      <span><b>Duplicato</b> — stesso codice fiscale e stesso tipo, già tra i clienti o ripetuto nel file: <u>saltato</u>. (Se invece lo stesso CF compare come persona <i>e</i> come azienda, vengono caricati entrambi con un'unica anagrafica condivisa.)</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <XCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
                      <span><b>Errore</b> — dati insufficienti (es. nominativo mancante): <u>saltato</u>.</span>
                    </li>
                  </ul>
                </div>
              </div>

              {parseResult.unmappedHeaders.length > 0 && (
                <p className="text-xs text-gray-500">
                  Colonne non mappate (ignorate): {parseResult.unmappedHeaders.join(', ')}
                </p>
              )}

              {/* Tabella anteprima */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="max-h-[44vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-xs uppercase sticky top-0 z-20">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          <input
                            type="checkbox"
                            aria-label="Seleziona tutte le righe importabili"
                            className="align-middle cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
                            checked={allSelected}
                            disabled={importableRows.length === 0}
                            onChange={toggleAll}
                          />
                        </th>
                        <th className="px-3 py-2 text-left font-medium" title="Numero di riga nel file originale">Riga</th>
                        <th className="px-3 py-2 text-left font-medium">Nominativo</th>
                        <th className="px-3 py-2 text-left font-medium">Tipo</th>
                        <th className="px-3 py-2 text-left font-medium">Cod. fiscale</th>
                        <th className="px-3 py-2 text-left font-medium">Nascita</th>
                        <th className="px-3 py-2 text-left font-medium">Stato</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parseResult.rows.map(row => {
                        const selectable = row.status === 'ok' || row.status === 'warning';
                        return (
                          <PreviewRow
                            key={row.index}
                            row={row}
                            selectable={selectable}
                            checked={selectable && !excluded.has(row.index)}
                            onToggle={() => toggleRow(row.index)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ---- IMPORTING ---- */}
          {phase === 'importing' && (
            <div className="flex flex-col items-center gap-4 py-12 text-gray-600">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p>Importazione in corso… {progress.done}/{progress.total}</p>
              <div className="w-64 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <button
                onClick={cancelImport}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50"
              >
                <X className="w-4 h-4" /> Annulla import
              </button>
              <p className="text-xs text-gray-400">Le righe già inserite verranno mantenute.</p>
            </div>
          )}

          {/* ---- DONE ---- */}
          {phase === 'done' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <Chip cls="bg-green-50 text-green-700 border-green-200">
                  {outcomes.filter(o => o.ok).length} creati
                </Chip>
                {outcomes.some(o => o.ok && o.warning) && (
                  <Chip cls="bg-amber-50 text-amber-700 border-amber-200">
                    {outcomes.filter(o => o.ok && o.warning).length} con avvisi
                  </Chip>
                )}
                {outcomes.some(o => !o.ok) && (
                  <Chip cls="bg-red-50 text-red-700 border-red-200">
                    {outcomes.filter(o => !o.ok).length} falliti
                  </Chip>
                )}
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[48vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {outcomes.map(o => (
                      <tr key={o.index}>
                        <td className="px-3 py-2 align-top">
                          {!o.ok
                            ? <XCircle className="w-4 h-4 text-red-600" />
                            : o.warning
                              ? <AlertTriangle className="w-4 h-4 text-amber-500" />
                              : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-800">{o.ragione_sociale}</td>
                        <td className="px-3 py-2 text-gray-500">
                          {o.ok
                            ? <>
                                {o.codice_cliente} · <span className="uppercase">{o.status}</span>
                                {o.warning && <span className="block text-amber-600 text-xs mt-0.5">{o.warning}</span>}
                              </>
                            : <span className="text-red-600">{o.error}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          <div>
            {phase === 'mapping' && (
              <button onClick={resetToUpload} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-4 h-4" /> Cambia file
              </button>
            )}
            {phase === 'preview' && (
              <button onClick={() => setPhase('mapping')} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-4 h-4" /> Modifica colonne
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {phase === 'upload' && (
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annulla</button>
            )}
            {phase === 'mapping' && (
              <button
                onClick={confirmMapping}
                disabled={busy || !hasIdentifyingField}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continua <ArrowRight className="w-4 h-4" /></>}
              </button>
            )}
            {phase === 'preview' && (
              <button
                onClick={runImport}
                disabled={selectedRows.length === 0}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Importa {selectedRows.length} client{selectedRows.length === 1 ? 'e' : 'i'}
              </button>
            )}
            {phase === 'done' && (
              <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
                Chiudi
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Chip({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full border font-medium ${cls}`}>{children}</span>;
}

/** Picker cercabile (Combobox) per assegnare un dato necessario a una colonna.
 *  Le opzioni sono renderizzate in un portale (anchor) per non essere ritagliate
 *  dal contenitore scrollabile della modale. */
function FieldPicker({ value, conflict, onPick }: {
  value: CanonicalField | null;
  conflict: boolean;
  onPick: (field: CanonicalField | null) => void;
}) {
  const [query, setQuery] = useState('');
  const selected = value ? getFieldDef(value) : null;
  const q = query.trim().toLowerCase();
  const filtered = q === ''
    ? CANONICAL_FIELDS
    : CANONICAL_FIELDS.filter(f => `${f.order} ${f.label} ${f.group}`.toLowerCase().includes(q));

  return (
    <Combobox<CanonicalFieldDef | null>
      value={selected}
      onChange={d => onPick(d ? d.key : null)}
      onClose={() => setQuery('')}
    >
      <div className="relative w-full min-w-0">
        <div className={`flex items-center rounded-lg border bg-white focus-within:ring-2 focus-within:ring-blue-200 ${
          conflict ? 'border-amber-300' : selected ? 'border-blue-200' : 'border-gray-200'
        }`}>
          {selected && (
            <span className={`ml-1.5 shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white ${conflict ? 'bg-amber-500' : 'bg-blue-600'}`}>
              {selected.order}
            </span>
          )}
          <ComboboxInput
            className="w-full min-w-0 text-sm px-2 py-1.5 bg-transparent focus:outline-none placeholder:text-gray-400"
            displayValue={(d: CanonicalFieldDef | null) => d ? d.label : ''}
            onChange={e => setQuery(e.target.value)}
            placeholder="— Ignora —"
          />
          <ComboboxButton className="px-1.5 text-gray-400">
            <ChevronDown className="w-4 h-4" />
          </ComboboxButton>
        </div>
        <ComboboxOptions
          anchor="bottom start"
          className="z-[60] w-[var(--input-width)] min-w-56 max-h-64 overflow-auto rounded-lg border border-gray-100 bg-white py-1 text-sm shadow-xl [--anchor-gap:4px] empty:hidden"
        >
          <ComboboxOption value={null} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-gray-500 data-[focus]:bg-gray-100">
            <Minus className="w-3.5 h-3.5" /> Ignora colonna
          </ComboboxOption>
          {filtered.map(f => (
            <ComboboxOption key={f.key} value={f} className="group flex items-center gap-2 px-3 py-1.5 cursor-pointer data-[focus]:bg-blue-50">
              <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold group-data-[selected]:bg-blue-600 group-data-[selected]:text-white">
                {f.order}
              </span>
              <span className="flex-1 text-gray-800 truncate">{f.label}</span>
              <span className="text-[10px] text-gray-400 shrink-0">{f.group}</span>
              <Check className="w-4 h-4 text-blue-600 opacity-0 group-data-[selected]:opacity-100" />
            </ComboboxOption>
          ))}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
}

/** Indicatore di stato dell'abbinamento di una colonna. */
function StatusDot({ def, conflict }: { def: boolean; conflict: boolean }) {
  if (conflict) return <span title="Più colonne sullo stesso dato: verifica" className="shrink-0"><AlertTriangle className="w-4 h-4 text-amber-500" /></span>;
  if (def) return <span title="Abbinata" className="shrink-0"><CheckCircle2 className="w-4 h-4 text-green-600" /></span>;
  return <span title="Colonna ignorata" className="shrink-0"><Minus className="w-4 h-4 text-gray-300" /></span>;
}

function PreviewRow({ row, selectable, checked, onToggle }: {
  row: RowReport;
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const meta = STATUS_META[row.status];
  const { Icon } = meta;
  const n = row.normalized;
  // Una riga importabile ma deselezionata va attenuata come quelle saltate.
  const dimmed = row.status === 'error' || row.status === 'duplicate' || (selectable && !checked);
  return (
    <tr className={dimmed ? 'opacity-60' : ''}>
      <td className="px-3 py-2">
        {selectable ? (
          <input
            type="checkbox"
            aria-label={`Includi la riga ${row.index} nell'import`}
            className="align-middle cursor-pointer accent-blue-600"
            checked={checked}
            onChange={onToggle}
          />
        ) : (
          <span title="Riga non importabile (saltata)"><Minus className="w-4 h-4 text-gray-300" /></span>
        )}
      </td>
      <td className="px-3 py-2 text-gray-400">{row.index}</td>
      <td className="px-3 py-2 font-medium text-gray-800">{n.ragione_sociale || <span className="text-red-500 italic">—</span>}</td>
      <td className="px-3 py-2 text-gray-500 capitalize">{n.tipo_cliente.replace('_', ' ')}</td>
      <td className="px-3 py-2 text-gray-500 font-mono text-xs">{n.codice_fiscale || '—'}</td>
      <td className="px-3 py-2 text-gray-500">{n.data_nascita || '—'}</td>
      <td className="px-3 py-2">
        {/* I dettagli usano il `title` nativo: non viene ritagliato dal
            contenitore scrollabile né coperto da header/altri badge. */}
        <span
          title={row.messages.length ? row.messages.join('\n') : undefined}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${meta.cls} ${row.messages.length ? 'cursor-help' : ''}`}
        >
          <Icon className="w-3.5 h-3.5" />
          {meta.label}
          {row.messages.length > 0 && <Info className="w-3 h-3 opacity-70" />}
        </span>
      </td>
    </tr>
  );
}
