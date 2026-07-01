// Pagina di approvazione di un piano MCP (Fase 4b, §7.3-7.4) — raggiunta dal "link breve"
// restituito da `proponi_piano` (`/?mcp_plan=<id>`). Mostra le azioni proposte dall'AI e permette
// all'umano di Approvare/Rifiutare. L'approvazione è l'UNICA via per portare il piano ad
// 'approved': solo allora `esegui_piano` (lato MCP) potrà eseguirlo. Versione minimale; l'inbox
// persistente con badge/storico è la Fase 4c.

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, Clock, AlertTriangle, ArrowLeft, Bot, X, Pencil, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { eseguiPiano } from '../../api/_lib/mcpPlans';
import { DettaglioAzione, ContenutoDettaglio } from './DettaglioAzione';
import { TOOL_LABEL, riassuntoArgs, buildDettaglioAzione, type ContestoNomi } from '../lib/dettaglioAzioni';
import { risolviNomiAzioni } from '../lib/risolviAzioni';
import { AzioneEditor, setArgPath, haCampiEditabili, campiEditabiliPresenti } from './AzioneEditor';

interface Azione { tool: string; args: Record<string, any>; }
interface Piano {
  id: string;
  titolo: string | null;
  azioni: Azione[];
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'executed' | 'expired' | 'failed';
  esito: any[] | null;
  created_at: string;
  expires_at: string;
}

const STATUS_BADGE: Record<Piano['status'], { label: string; cls: string }> = {
  pending: { label: 'In attesa di approvazione', cls: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approvato', cls: 'bg-green-50 text-green-700' },
  rejected: { label: 'Rifiutato', cls: 'bg-red-50 text-red-600' },
  executing: { label: 'In esecuzione', cls: 'bg-blue-50 text-blue-700' },
  executed: { label: 'Eseguito', cls: 'bg-green-50 text-green-700' },
  expired: { label: 'Scaduto', cls: 'bg-gray-100 text-gray-500' },
  // Approvato ed eseguito ma con almeno un'azione NON scritta (errore in esecuzione): arancione scuro.
  failed: { label: 'Errore esecuzione', cls: 'bg-orange-200 text-orange-900' },
};

// Contenitore della scheda piano. DEVE stare a livello di modulo (non dentro PianoApprovazione):
// se definito inline, ogni render — es. a ogni tasto durante la modifica — ne crea una nuova
// reference, React smonta/rimonta l'intero sottoalbero e il container scrollabile torna in cima,
// facendo "saltare" la modale via dall'entry che si sta scrivendo.
function PianoWrapper({
  variant,
  queueCount,
  onClose,
  backLabel,
  children,
}: {
  variant: 'page' | 'modal';
  queueCount: number;
  onClose: () => void;
  backLabel: string;
  children: React.ReactNode;
}) {
  if (variant === 'modal') {
    // Overlay globale: compare sopra qualsiasi scheda. "Più tardi" (X) rimanda senza decidere,
    // il piano resta nel badge/scheda "Azioni AI". z-[80] sta sotto la modale offline (z-[100]).
    return createPortal(
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            {queueCount > 0 ? (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                +{queueCount} {queueCount === 1 ? 'altra in attesa' : 'altre in attesa'}
              </span>
            ) : <span />}
            <button
              onClick={onClose}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700"
              title="Più tardi"
            >
              Più tardi <X className="w-4 h-4" />
            </button>
          </div>
          {children}
        </div>
      </div>,
      document.body,
    );
  }
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
        <button onClick={onClose} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </button>
        {children}
      </div>
    </div>
  );
}

export function PianoApprovazione({
  planId,
  onClose,
  backLabel = "Torna all'app",
  variant = 'page',
  queueCount = 0,
  onDecided,
}: {
  planId: string;
  onClose: () => void;
  backLabel?: string;
  // 'page': pagina a tutto schermo (deep-link / inbox). 'modal': overlay globale che compare
  // sopra qualsiasi scheda quando l'AI propone una scrittura (con backdrop e "Più tardi").
  variant?: 'page' | 'modal';
  // Quanti altri piani/documenti restano in coda dopo questo (solo modale): mostra "+N in attesa".
  queueCount?: number;
  // Chiamata dopo Approva/Rifiuta andati a buon fine: il provider della modale avanza la coda.
  onDecided?: () => void;
}) {
  const toast = useToast();
  const [piano, setPiano] = useState<Piano | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [acting, setActing] = useState(false);
  // Modifica inline dei campi "sicuri" del piano (PRIMA di approvare). `draft` è la copia di lavoro
  // delle azioni; le associazioni (UUID) NON sono toccate qui (vedi AzioneEditor).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Azione[] | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  // Nomi risolti per il dettaglio (privacy: mostriamo nomi, non UUID).
  const [nomi, setNomi] = useState<ContestoNomi>({ clienteNomi: {}, incarichiInfo: {} });

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('mcp_pending_plans')
      .select('id, titolo, azioni, status, esito, created_at, expires_at')
      .eq('id', planId)
      .maybeSingle();
    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setPiano(data as Piano);
    setNomi(await risolviNomiAzioni((data.azioni as Azione[]) ?? []));
    setLoading(false);
  }, [planId]);

  useEffect(() => { reload(); }, [reload]);

  // Realtime: se l'AI ritocca il piano (aggiorna_piano) mentre l'utente lo guarda, la vista si
  // aggiorna in diretta — come per la catalogazione documenti. Salta il reload mentre l'utente sta
  // modificando a mano (per non scartargli la bozza); `editingRef` evita di ri-sottoscrivere.
  const editingRef = useRef(false);
  useEffect(() => {
    const channel = supabase
      .channel(`mcp-plan-${planId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mcp_pending_plans', filter: `id=eq.${planId}` }, () => {
        if (!editingRef.current) reload();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [planId, reload]);
  useEffect(() => { editingRef.current = editing; }, [editing]);

  const scaduto = piano ? new Date(piano.expires_at) < new Date() : false;

  async function decidi(approva: boolean) {
    setActing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Sessione scaduta.'); return; }
      const patch = approva
        ? { status: 'approved' as const, approved_by: user.id, approved_at: new Date().toISOString() }
        : { status: 'rejected' as const, approved_by: user.id, approved_at: new Date().toISOString() };
      const { error } = await supabase
        .from('mcp_pending_plans')
        .update(patch)
        .eq('id', planId)
        .eq('status', 'pending'); // solo se ancora in attesa (evita corse)
      if (error) { toast.error(`Operazione fallita: ${error.message}`); return; }

      // Approva ED esegui in un solo passo: niente più "dì all'AI di eseguire". L'esecuzione gira
      // sotto la sessione dell'utente che approva (RLS piena; le scritture risultano sue). Il claim
      // atomico in eseguiPiano (approved→executing) evita doppie esecuzioni se anche l'AI provasse.
      if (approva) {
        // Risolviamo lo studio direttamente dal profilo (questa pagina può vivere anche fuori
        // dallo StudioProvider, es. deep-link ?mcp_plan=…), così non dipende dal context.
        const { data: prof } = await supabase
          .from('user_profiles')
          .select('studio_id')
          .eq('user_id', user.id)
          .maybeSingle();
        const studioId = prof?.studio_id ?? null;
        if (!studioId) { toast.error('Studio non disponibile: riprova tra poco.'); return; }
        try {
          const res = await eseguiPiano(supabase, studioId, planId);
          const falliti = res.totali - res.eseguite;
          if (falliti > 0) toast.warning(`Piano eseguito: ${res.eseguite}/${res.totali} azioni riuscite (${falliti} con errori).`);
          else toast.success(`Piano approvato ed eseguito (${res.eseguite} ${res.eseguite === 1 ? 'azione' : 'azioni'}).`);
        } catch (e: any) {
          // Approvato ma esecuzione fallita: il piano resta 'approved', ritentabile.
          toast.error(`Esecuzione fallita: ${e?.message || String(e)}. Il piano resta approvato: riprova.`);
        }
      } else {
        toast.success('Piano rifiutato.');
      }
      // In modale avanziamo subito alla prossima richiesta della coda; in pagina mostriamo l'esito.
      if (variant === 'modal') { onDecided?.(); return; }
      await reload();
    } finally {
      setActing(false);
    }
  }

  // Azioni mostrate: la bozza in modifica oppure quelle salvate del piano.
  const azioniCorrenti: Azione[] = (editing && draft ? draft : piano?.azioni) ?? [];

  function avviaModifica() {
    if (!piano) return;
    // Copia profonda così le modifiche non toccano lo stato finché non si salva.
    setDraft(JSON.parse(JSON.stringify(piano.azioni ?? [])));
    setEditing(true);
  }
  function annullaModifica() {
    setEditing(false);
    setDraft(null);
  }
  function setCampo(i: number, path: string, value: any) {
    setDraft((prev) => (prev ?? []).map((a, idx) => (idx === i ? { ...a, args: setArgPath(a.args, path, value) } : a)));
  }
  async function salvaModifiche() {
    if (!draft) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('mcp_pending_plans')
        .update({ azioni: draft })
        .eq('id', planId)
        .eq('status', 'pending'); // solo finché è ancora in attesa (evita modifiche dopo l'approvazione)
      if (error) { toast.error(`Salvataggio modifiche fallito: ${error.message}`); return; }
      toast.success('Modifiche al piano salvate.');
      setEditing(false);
      setDraft(null);
      await reload();
    } finally {
      setSavingEdit(false);
    }
  }

  // Props del contenitore (estratto a livello di modulo per non rimontare a ogni render: vedi nota su PianoWrapper).
  const wrap = { variant, queueCount, onClose, backLabel };

  if (loading) return <PianoWrapper {...wrap}><div className="py-10 text-center text-gray-400">Caricamento piano…</div></PianoWrapper>;

  if (notFound || !piano) {
    return (
      <PianoWrapper {...wrap}>
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-lg p-4 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>Piano non trovato, non appartiene al tuo account, oppure la tabella non è ancora stata
            creata (migrazione <code>20260618000200_mcp_pending_plans.sql</code>).</span>
        </div>
      </PianoWrapper>
    );
  }

  const badge = STATUS_BADGE[piano.status];
  const decidibile = piano.status === 'pending' && !scaduto;

  // Righe di dettaglio + (per le RT2) anteprima rischio, per una singola azione del piano.
  return (
    <PianoWrapper {...wrap}>
      <div className="flex items-center gap-2">
        <Bot className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900">Azione AI in attesa</h2>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-800">{piano.titolo || 'Piano senza titolo'}</div>
          <div className="text-xs text-gray-400">
            {piano.azioni?.length ?? 0} azioni · creato {new Date(piano.created_at).toLocaleString('it-IT')} ·
            {scaduto ? ' scaduto' : ` scade ${new Date(piano.expires_at).toLocaleString('it-IT')}`}
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full ${badge.cls}`}>
          {scaduto && piano.status === 'pending' ? 'Scaduto' : badge.label}
        </span>
      </div>

      <p className="text-sm text-gray-500">
        Un assistente AI propone le azioni qui sotto. <strong>Nulla viene scritto</strong> finché non
        approvi. Rivedi cliente/anagrafica e conferma solo se corretto.
      </p>

      {/* Barra modifica: l'utente può correggere i dati proposti dall'AI prima di approvare. */}
      {decidibile && (
        <div className="flex items-start justify-between gap-3 bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2">
          <p className="text-xs text-blue-900/80">
            Puoi correggere qui i dati proposti (testi, date, importi, punteggi). Le associazioni
            cliente/incarico non si modificano a mano: per cambiarle, chiedi all'assistente AI di
            proporti un piano aggiornato.
          </p>
          {!editing ? (
            (piano.azioni ?? []).some((a) => haCampiEditabili(a.tool, a.args)) && (
              <button
                onClick={avviaModifica}
                disabled={acting}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50"
              >
                <Pencil className="w-3.5 h-3.5" /> Modifica
              </button>
            )
          ) : (
            <div className="shrink-0 flex items-center gap-2">
              <button
                onClick={salvaModifiche}
                disabled={savingEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" /> {savingEdit ? 'Salvataggio…' : 'Salva modifiche'}
              </button>
              <button
                onClick={annullaModifica}
                disabled={savingEdit}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Annulla
              </button>
            </div>
          )}
        </div>
      )}

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {azioniCorrenti.map((a, i) => {
          const esito = piano.esito?.find((e) => e.index === i);
          return (
            <div key={i} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{i + 1}. {TOOL_LABEL[a.tool] || a.tool}</div>
                  <div className="text-xs text-gray-500 mt-0.5 break-words">{riassuntoArgs(a.args, nomi)}</div>
                  {editing ? (
                    (() => {
                      const d = buildDettaglioAzione(a.tool, a.args, nomi);
                      const campiEditabili = new Set(campiEditabiliPresenti(a.tool, a.args).map((c) => c.label));
                      // Righe di SOLA contestualizzazione: quelle che AzioneEditor non gestisce (riferimento al
                      // record target, titolari effettivi). Restano visibili in lettura anche durante la modifica.
                      const righeSoloLettura = d.righe.filter((r) => !campiEditabili.has(r.label));
                      return (
                        <div className="mt-2 space-y-2">
                          {righeSoloLettura.length > 0 && <ContenutoDettaglio righe={righeSoloLettura} />}
                          <AzioneEditor tool={a.tool} args={a.args} onChange={(path, v) => setCampo(i, path, v)} />
                          {d.anteprima && <ContenutoDettaglio righe={[]} anteprima={d.anteprima} />}
                        </div>
                      );
                    })()
                  ) : (() => { const d = buildDettaglioAzione(a.tool, a.args, nomi); return <DettaglioAzione righe={d.righe} anteprima={d.anteprima} />; })()}
                </div>
                {/* Badge breve: solo l'esito. Il messaggio d'errore (può essere lungo) va a capo nel
                    blocco sotto — qui resterebbe su una riga con shrink-0 e sforerebbe il riquadro,
                    schiacciando la colonna di sinistra. */}
                {esito && !editing && (
                  <span className={`shrink-0 text-xs font-medium ${esito.ok ? 'text-green-600' : 'text-red-600'}`}>
                    {esito.ok ? '✓ ok' : '✗ errore'}
                  </span>
                )}
              </div>
              {esito && !editing && !esito.ok && esito.error && (
                <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5 whitespace-pre-wrap break-words">
                  {esito.error}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mentre si modifica i pulsanti decisionali sono nascosti: prima salva o annulla. */}
      {!editing && (decidibile ? (
        <div className="flex gap-3">
          <button
            onClick={() => decidi(true)}
            disabled={acting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
          >
            <CheckCircle className="w-4 h-4" /> Approva ed esegui
          </button>
          <button
            onClick={() => decidi(false)}
            disabled={acting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-50 text-sm font-medium"
          >
            <XCircle className="w-4 h-4" /> Rifiuta
          </button>
        </div>
      ) : piano.status === 'failed' ? (
        // Approvato ma NON scritto del tutto: avviso in arancione scuro. Il dettaglio per-azione
        // (✓/✗ + messaggio d'errore) è già mostrato sopra; qui spieghiamo la via d'uscita.
        <div className="flex items-start gap-2 text-sm text-orange-900 bg-orange-100 border border-orange-300 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Piano approvato ma <strong>non eseguito del tutto</strong>: una o più azioni non sono state
            scritte (vedi gli errori qui sopra). Un piano non è rieseguibile: per riprovare, chiedi
            all'assistente AI di riproporre le azioni mancanti in un nuovo piano.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
          <Clock className="w-4 h-4" />
          {piano.status === 'approved' && 'Piano approvato (esecuzione in corso o da completare).'}
          {piano.status === 'executed' && 'Piano approvato ed eseguito.'}
          {piano.status === 'rejected' && 'Piano rifiutato.'}
          {piano.status === 'executing' && 'Piano in esecuzione…'}
          {(piano.status === 'expired' || (scaduto && piano.status === 'pending')) && 'Piano scaduto: non più eseguibile.'}
        </div>
      ))}
    </PianoWrapper>
  );
}
