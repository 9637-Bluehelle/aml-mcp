// Div espandibile "Mostra dettagli" usato in tutte le modali di approvazione AI. Mostra una lista
// chiave→valore leggibile (niente UUID/JSON) e, per le valutazioni RT2, un box con l'anteprima
// calcolata (rischio/classe/prossimo controllo) prima dell'approvazione.

import { useState, Fragment } from 'react';
import { ChevronDown, ChevronRight, Gauge } from 'lucide-react';
import type { RigaDettaglio, AnteprimaRT2 } from '../lib/dettaglioAzioni';

const CLASSE_LABEL: Record<number, string> = {
  1: 'Non significativo',
  2: 'Poco significativo',
  3: 'Abbastanza significativo',
  4: 'Molto significativo',
};
const CLASSE_CLS: Record<number, string> = {
  1: 'bg-green-50 text-green-700 border-green-200',
  2: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  3: 'bg-orange-50 text-orange-700 border-orange-200',
  4: 'bg-red-50 text-red-700 border-red-200',
};

function dataTraMesi(mesi: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + mesi);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Contenuto del dettaglio (lista campi + box anteprima RT2), SENZA il toggle. Riusabile sia
 *  dentro un toggle (DettaglioAzione) sia "sempre aperto" (es. elenco azioni di un piano). */
export function ContenutoDettaglio({ righe, anteprima, tinted = false }: { righe: RigaDettaglio[]; anteprima?: AnteprimaRT2 | null; tinted?: boolean }) {
  if (righe.length === 0 && !anteprima) return null;
  return (
    <div className={`${tinted ? 'bg-white' : 'bg-gray-50'} rounded-lg p-3 border border-gray-200 space-y-3`}>
      {righe.length > 0 && (
        <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-xs">
          {righe.map((r, i) => {
            const nuovoGruppo = r.gruppo && r.gruppo !== righe[i - 1]?.gruppo;
            return (
              <Fragment key={i}>
                {nuovoGruppo && (
                  <dt className="col-span-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 mt-1 first:mt-0">
                    {r.gruppo}
                  </dt>
                )}
                <dt className="text-gray-500 break-words">{r.label}</dt>
                <dd className="text-gray-800 break-words">{r.value}</dd>
              </Fragment>
            );
          })}
        </dl>
      )}

      {anteprima && (
        <div className={`rounded-lg border px-3 py-2 ${CLASSE_CLS[anteprima.classe] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Gauge className="w-3.5 h-3.5" />
            Anteprima rischio (calcolata)
          </div>
          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <span className="opacity-70">Classe</span>
            <span className="font-medium">{anteprima.classe} — {CLASSE_LABEL[anteprima.classe]}</span>
            <span className="opacity-70">Rischio effettivo</span>
            <span className="font-medium">{anteprima.rischioEffettivo}{anteprima.isPep ? ' (PEP → forzato a 4)' : ''}</span>
            <span className="opacity-70">Rischio specifico</span>
            <span>{anteprima.rischioSpecifico}</span>
            <span className="opacity-70">Prossimo controllo</span>
            <span>tra {anteprima.periodicitaMesi} mesi (≈ {dataTraMesi(anteprima.periodicitaMesi)})</span>
          </div>
          <div className="mt-1 text-[11px] opacity-70">Anteprima indicativa: il valore definitivo è calcolato all'esecuzione.</div>
        </div>
      )}
    </div>
  );
}

export function DettaglioAzione({ righe, anteprima, tinted = false }: { righe: RigaDettaglio[]; anteprima?: AnteprimaRT2 | null; tinted?: boolean }) {
  const [open, setOpen] = useState(false);
  if (righe.length === 0 && !anteprima) return null;
  return (
    <div className="mt-1.5 border-t border-gray-100 pt-1.5">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {open ? 'Nascondi dettagli' : 'Mostra dettagli'}
      </button>
      {open && <div className="mt-2"><ContenutoDettaglio righe={righe} anteprima={anteprima} tinted={tinted} /></div>}
    </div>
  );
}
