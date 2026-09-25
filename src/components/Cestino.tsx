import { useState, useEffect, useCallback } from 'react';
import {
  Trash2, RotateCcw, AlertTriangle, FileText, FolderOpen, Building2,
  User, FileCheck, Loader2, RefreshCw, ShieldCheck, Eye, Flag, ChevronRight,
  Clock, Paperclip,
} from 'lucide-react';
import { useToast, useConfirm } from './Toast';
import { useStudio } from '../lib/StudioContext';
import {
  caricaCestino, ripristinaDalCestino, svuotaElemento, svuotaCestino,
  leggiPermessiCestino, descriviRiepilogo, caricaDettaglioCestino,
  caricaNomiUtenti, leggiAutoPurgePerStudi, calcolaPurge, caricaContestoVoci,
  type CestinoEntry, type CestinoEntityType, type PermessiCestino,
  type DettaglioCestino,
} from '../lib/cestinoHelper';
 
const ICONA_TIPO: Record<CestinoEntityType, typeof FileText> = {
  cliente: Building2,
  incarico: FolderOpen,
  documento: FileText,
  anagrafica: User,
  autovalutazione: FileCheck,
  valutazione: ShieldCheck,
  controllo: Eye,
  segnalazione: Flag,
};
 
const ETICHETTA_TIPO: Record<CestinoEntityType, string> = {
  cliente: 'Cliente',
  incarico: 'Incarico',
  documento: 'Documento',
  anagrafica: 'Anagrafica',
  autovalutazione: 'Autovalutazione RT1',
  valutazione: 'Valutazione RT2',
  controllo: 'Controllo RT3',
  segnalazione: 'Segnalazione SOS',
};
 
/**
 * Nome da mostrare nel titolo: l'etichetta SENZA il prefisso di tipo
 * ("Cliente: ", "Incarico: ", …), già reso dal chip TIPO. Le entità prive di
 * nome proprio (es. "Autovalutazione RT1") non hanno prefisso con ":" e
 * restituiscono '' → in quel caso il tipo stesso fa da titolo e il chip viene
 * omesso, evitando di ripetere due volte la stessa parola.
 */
function nomeVoce(etichetta: string | null): string {
  const raw = (etichetta ?? '').trim();
  const idx = raw.indexOf(':');
  if (idx > 0) {
    const nome = raw.slice(idx + 1).trim();
    if (nome) return nome;
  }
  return '';
}

function formatData(iso: string): string {
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
 
export function Cestino() {
  const toast = useToast();
  const confirm = useConfirm();
  const { activeStudioId } = useStudio();
 
  const [voci, setVoci] = useState<CestinoEntry[]>([]);
  const [permessi, setPermessi] = useState<PermessiCestino>({
    cestina: false, ripristina: false, svuota: false,
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [svuotando, setSvuotando] = useState(false);
  const [espansoId, setEspansoId] = useState<string | null>(null);
  const [dettagli, setDettagli] = useState<Record<string, DettaglioCestino>>({});
  const [dettaglioLoadingId, setDettaglioLoadingId] = useState<string | null>(null);
  // Nome utente che ha cestinato (per deleted_by) e giorni di auto-purge per studio.
  const [nomiUtenti, setNomiUtenti] = useState<Record<string, string>>({});
  const [autoPurge, setAutoPurge] = useState<Record<string, number>>({});
  // Contesto di appartenenza (incarico/cliente/anagrafica) per voce.
  const [contestoVoci, setContestoVoci] = useState<Record<string, string>>({});
 
  const toggleEspansione = async (voce: CestinoEntry) => {
    if (espansoId === voce.id) { setEspansoId(null); return; }
    setEspansoId(voce.id);
    if (!dettagli[voce.id]) {
      setDettaglioLoadingId(voce.id);
      try {
        const det = await caricaDettaglioCestino(voce);
        setDettagli(prev => ({ ...prev, [voce.id]: det }));
      } catch {
        setDettagli(prev => ({ ...prev, [voce.id]: { gruppi: [], conservate: [] } }));
      } finally {
        setDettaglioLoadingId(null);
      }
    }
  };
 
  const ricarica = useCallback(async () => {
    setLoading(true);
    try {
      const [v, p] = await Promise.all([
        caricaCestino(activeStudioId),
        leggiPermessiCestino(),
      ]);
      setVoci(v);
      setPermessi(p);
      // Arricchimenti best-effort: nomi degli autori e retention auto-purge.
      // Non bloccano la lista e, se falliscono, l'informazione resta solo nascosta.
      const [nomi, purge, contesto] = await Promise.all([
        caricaNomiUtenti(v.map(x => x.deleted_by)),
        leggiAutoPurgePerStudi(v.map(x => x.studio_id)),
        caricaContestoVoci(v),
      ]);
      setNomiUtenti(nomi);
      setAutoPurge(purge);
      setContestoVoci(contesto);
    } catch (err: any) {
      toast.error(err?.message || 'Errore nel caricamento del cestino');
    } finally {
      setLoading(false);
    }
  }, [activeStudioId, toast]);
 
  useEffect(() => { ricarica(); }, [ricarica]);
 
  const handleRipristina = async (voce: CestinoEntry) => {
    const ok = await confirm({
      message: `Ripristinare "${voce.etichetta ?? ETICHETTA_TIPO[voce.entity_type]}"? Tornerà visibile nell'applicazione.`,
      confirmText: 'Ripristina',
    });
    if (!ok) return;
    setBusyId(voce.id);
    try {
      await ripristinaDalCestino(voce.id);
      toast.success('Elemento ripristinato');
      setVoci(prev => prev.filter(v => v.id !== voce.id));
    } catch (err: any) {
      toast.error(err?.message || 'Errore nel ripristino');
    } finally {
      setBusyId(null);
    }
  };
 
  const handleElimina = async (voce: CestinoEntry) => {
    const ok = await confirm({
      message: `Eliminare DEFINITIVAMENTE "${voce.etichetta ?? ETICHETTA_TIPO[voce.entity_type]}"? L'operazione è irreversibile e cancella anche tutti i dati e i documenti collegati.`,
      variant: 'danger',
      confirmText: 'Elimina definitivamente',
    });
    if (!ok) return;
    setBusyId(voce.id);
    try {
      await svuotaElemento(voce.id);
      toast.success('Elemento eliminato definitivamente');
      setVoci(prev => prev.filter(v => v.id !== voce.id));
    } catch (err: any) {
      toast.error(err?.message || 'Errore nell\'eliminazione');
    } finally {
      setBusyId(null);
    }
  };
 
  const handleSvuotaTutto = async () => {
    const ok = await confirm({
      message: `Svuotare l'intero cestino (${voci.length} element${voci.length === 1 ? 'o' : 'i'})? Tutti i dati e i documenti collegati verranno cancellati DEFINITIVAMENTE. Operazione irreversibile.`,
      variant: 'danger',
      confirmText: 'Svuota cestino',
    });
    if (!ok) return;
    setSvuotando(true);
    try {
      const n = await svuotaCestino();
      toast.success(`Cestino svuotato (${n} element${n === 1 ? 'o' : 'i'} eliminat${n === 1 ? 'o' : 'i'})`);
      setVoci([]);
    } catch (err: any) {
      toast.error(err?.message || 'Errore nello svuotamento');
    } finally {
      setSvuotando(false);
    }
  };
 
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trash2 className="w-7 h-7 text-gray-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cestino</h1>
            <p className="text-sm text-gray-500">
              Gli elementi qui sono nascosti dall'applicazione e possono essere ripristinati o eliminati definitivamente.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={ricarica}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="Aggiorna"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {permessi.svuota && voci.length > 0 && (
            <button
              onClick={handleSvuotaTutto}
              disabled={svuotando}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {svuotando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Svuota cestino
            </button>
          )}
        </div>
      </div>
 
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : voci.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Trash2 className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium">Il cestino è vuoto</p>
          <p className="text-gray-400 text-sm mt-1">Gli elementi che elimini compaiono qui.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {voci.map(voce => {
            const Icona = ICONA_TIPO[voce.entity_type] ?? FileText;
            const riepilogo = descriviRiepilogo(voce.riepilogo);
            const busy = busyId === voce.id;
            const espanso = espansoId === voce.id;
            const det = dettagli[voce.id];
            const gruppi = det?.gruppi;
            const conservate = det?.conservate ?? [];
            const caricandoDettaglio = dettaglioLoadingId === voce.id;
            const nome = nomeVoce(voce.etichetta);
            const contestoLabel = contestoVoci[voce.id];
            const eliminatoDa = voce.deleted_by ? nomiUtenti[voce.deleted_by] : null;
            const purge = calcolaPurge(voce.deleted_at, autoPurge[voce.studio_id]);
            const numFile = voce.file_paths?.length ?? 0;
            // I file allegati si mostrano solo se il numero NON coincide col
            // conteggio documenti: altrimenti è un doppione (ogni documento è il
            // suo file). Se differiscono, alcuni documenti sono cartacei/senza file
            // e l'informazione è utile.
            const numDoc = voce.riepilogo?.documenti ?? 0;
            const mostraFile = numFile > 0 && numFile !== numDoc;
            return (
              <div
                key={voce.id}
                className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
              >
                <div className="flex items-center gap-3 p-4">
                  <button
                    onClick={() => toggleEspansione(voce)}
                    className="p-1 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors shrink-0"
                    title={espanso ? 'Chiudi dettaglio' : 'Mostra cosa contiene'}
                    aria-expanded={espanso}
                  >
                    <ChevronRight className={`w-4 h-4 transition-transform ${espanso ? 'rotate-90' : ''}`} />
                  </button>
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <Icona className="w-5 h-5 text-gray-600" />
                  </div>
                  <button
                    onClick={() => toggleEspansione(voce)}
                    className="flex-1 min-w-0 text-left"
                  >
                    {nome && (
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                        {ETICHETTA_TIPO[voce.entity_type]}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {nome || ETICHETTA_TIPO[voce.entity_type]}
                      {contestoLabel && (
                        <span className="font-normal text-gray-500"> — {contestoLabel}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Eliminato il {formatData(voce.deleted_at)}
                      {eliminatoDa && <span> da {eliminatoDa}</span>}
                      {riepilogo && <span className="text-gray-400"> · contiene {riepilogo}</span>}
                      {mostraFile && (
                        <span className="text-gray-400 inline-flex items-center gap-0.5">
                          {' · '}<Paperclip className="w-3 h-3" />{numFile} file allegat{numFile === 1 ? 'o' : 'i'}
                        </span>
                      )}
                    </p>
                    {purge && (
                      <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="w-3 h-3" />
                        {purge.giorniRimanenti === 0
                          ? 'Eliminazione automatica imminente'
                          : `Eliminazione automatica tra ${purge.giorniRimanenti} giorn${purge.giorniRimanenti === 1 ? 'o' : 'i'} (${formatData(purge.data.toISOString())})`}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {permessi.ripristina && (
                      <button
                        onClick={() => handleRipristina(voce)}
                        disabled={busy}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        Ripristina
                      </button>
                    )}
                    {permessi.svuota && (
                      <button
                        onClick={() => handleElimina(voce)}
                        disabled={busy}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Elimina
                      </button>
                    )}
                  </div>
                </div>
 
                {espanso && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    {caricandoDettaglio ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Caricamento contenuto…
                      </div>
                    ) : (!gruppi || gruppi.length === 0) && conservate.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">Nessun dato di dettaglio da mostrare.</p>
                    ) : (
                      <div className="space-y-3">
                        {(gruppi ?? []).map(g => (
                          <div key={g.tabella}>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                              {g.etichetta} ({g.items.length})
                            </p>
                            <ul className="space-y-0.5">
                              {g.items.map(it => (
                                <li key={it.id} className="text-sm text-gray-700 flex items-start gap-2">
                                  <span className="text-gray-300 mt-2 w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                                  <span className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                    <span className="text-gray-700">{it.label}</span>
                                    {it.meta?.map((m, i) => (
                                      <span
                                        key={i}
                                        className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-900 text-[11px] font-medium leading-none"
                                      >
                                        {m}
                                      </span>
                                    ))}
                                    {it.nota && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-900 text-[11px] font-medium leading-none">
                                        {it.nota}
                                      </span>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
 
                        {conservate.length > 0 && (
                          <div className="pt-2 mt-1 border-t border-dashed border-gray-200">
                            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Anagrafiche conservate ({conservate.length}) — collegate anche ad altri clienti, non eliminate
                            </p>
                            <ul className="space-y-0.5">
                              {conservate.map(c => (
                                <li key={c.id} className="text-sm text-gray-600 flex items-start gap-2">
                                  <span className="text-amber-300 mt-2 w-1 h-1 rounded-full bg-amber-300 shrink-0" />
                                  <span className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                    <span>{c.nome_cognome}</span>
                                    {(c.num_documenti ?? 0) > 0 && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                        <ShieldCheck className="w-3 h-3" />
                                        {c.num_documenti} document{c.num_documenti === 1 ? 'o' : 'i'} conservat{c.num_documenti === 1 ? 'o' : 'i'}
                                      </span>
                                    )}
                                    {c.altri_clienti && (
                                      <span className="text-gray-400">· collegato anche a: {c.altri_clienti}</span>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
 
      {!loading && !permessi.svuota && voci.length > 0 && (
        <div className="flex items-start gap-2 mt-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Solo un amministratore può eliminare definitivamente gli elementi dal cestino.</span>
        </div>
      )}
    </div>
  );
}