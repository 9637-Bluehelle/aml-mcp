import { Archive, RotateCcw, Trash2, X, ListOrdered, Loader2, UserCheck } from 'lucide-react';
import { formatStoricoValue } from '../lib/storicoFormat';

// ---------------------------------------------------------------------------
// Drawer condiviso dello Storico Modifiche: entra da DESTRA (convenzione moderna
// per cronologia/ispettore) e mostra gli eventi come timeline verticale.
// Usato sia dal dettaglio cliente sia dal dettaglio incarico: la sola differenza
// è la funzione `labelForCampo` passata come prop.
// ---------------------------------------------------------------------------

export interface StoricoItem {
  id: string;
  created_at: string;
  campo: string;
  valore_precedente: string | null;
  valore_nuovo: string | null;
  user_id?: string | null;
}

interface Props {
  show: boolean;
  onClose: () => void;
  loading: boolean;
  modifiche: StoricoItem[];
  labelForCampo: (campo: string) => string;
  userNameMap?: Record<string, string>;
  valueMap?: Record<string, string>;
  creationInfo?: { created_at: string; ownerEmail: string } | null;
}

function fmtDataOra(iso: string): string {
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function StoricoModificheDrawer({
  show,
  onClose,
  loading,
  modifiche,
  labelForCampo,
  userNameMap = {},
  valueMap = {},
  creationInfo,
}: Props) {
  const vuoto = !loading && modifiche.length === 0 && !creationInfo?.created_at;

  return (
    <div className={`fixed inset-0 z-50 ${show ? 'visible' : 'invisible'}`}>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/10 transition-opacity duration-300 ease-in-out ${show ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Pannello: ancorato a destra, altezza piena (slide da destra) */}
      <div
        className={`fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${show ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <ListOrdered className="w-5 h-5 text-gray-500" />
            Storico Modifiche
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : vuoto ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ListOrdered className="w-8 h-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">Nessuna modifica registrata</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {modifiche.map((mod) => {
                const isCestinato = mod.campo === '__cestinato';
                const isRipristinato = mod.campo === '__ripristinato';
                const isArchiviazione = mod.campo === 'archiviato';
                const isArchiviato = isArchiviazione && mod.valore_nuovo === 'true';
                const isEvento = isCestinato || isRipristinato || isArchiviazione;
                const negativo = isCestinato || isArchiviato;

                const utente = mod.user_id ? userNameMap[mod.user_id] : null;
                const data = fmtDataOra(mod.created_at);

                if (isEvento) {
                  const eventoLabel = isCestinato ? 'Spostato nel cestino'
                    : isRipristinato ? 'Ripristinato dal cestino'
                    : isArchiviato ? 'Archiviato' : 'Ripristinato';
                  const EventoIcon = isCestinato ? Trash2 : isArchiviato ? Archive : RotateCcw;
                  return (
                    <div key={mod.id} className={`rounded-lg border px-3 py-2 ${negativo ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold flex items-center gap-1.5 ${negativo ? 'text-amber-700' : 'text-emerald-700'}`}>
                          <EventoIcon className="w-3.5 h-3.5" /> {eventoLabel}
                        </span>
                        <span className="text-[11px] text-gray-400 shrink-0">{data}</span>
                      </div>
                      {utente && <p className="text-[11px] text-gray-500 mt-0.5">da <span className="font-medium text-gray-700">{utente}</span></p>}
                    </div>
                  );
                }

                return (
                  <div key={mod.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-gray-700">{labelForCampo(mod.campo)}</span>
                      <span className="text-[11px] text-gray-400 shrink-0">{data}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 line-through decoration-red-300 break-words">
                        {formatStoricoValue(mod.valore_precedente, mod.campo, valueMap)}
                      </span>
                      <span className="text-gray-400 shrink-0">→</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium break-words">
                        {formatStoricoValue(mod.valore_nuovo, mod.campo, valueMap)}
                      </span>
                    </div>
                    {utente && <p className="text-[11px] text-gray-400 mt-1.5">da <span className="font-medium text-gray-600">{utente}</span></p>}
                  </div>
                );
              })}

              {creationInfo?.created_at && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="font-semibold text-blue-700">Creato da {creationInfo.ownerEmail}</span>
                  </div>
                  <p className="text-[11px] text-blue-500 mt-0.5 pl-6">{fmtDataOra(creationInfo.created_at)}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
