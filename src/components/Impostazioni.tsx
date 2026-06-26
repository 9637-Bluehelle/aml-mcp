import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { Settings, Save, CheckCircle, ArrowLeft, Eye, AlertTriangle, Trash2 } from 'lucide-react';
import { loadImpostazioni, saveImpostazioni, type FormatoCodice, type ImpostazioniStudio } from '../lib/codiceGenerator';
import { Spinner } from '../components/cliente-wizard/modals/Spinner.tsx';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';
import { supabase } from '../lib/supabase';
import { getMyStudioId } from '../lib/studioHelper';
import { AccessoMcpSettings } from './AccessoMcpSettings';
import { useToast } from './Toast';

type FormatoOption = { value: FormatoCodice; label: string; desc: string };

const FORMATO_BASE_OPTIONS: FormatoOption[] = [
  { value: 'manuale', label: 'Manuale', desc: 'L\'utente inserisce il codice liberamente' },
  { value: 'sequenziale', label: 'Sequenziale', desc: 'Numerazione progressiva (001, 002, ...)' },
  { value: 'cf_piva', label: 'Codica Fiscale', desc: 'Usa il Codice Fiscale o la Partita IVA del cliente' },
  { value: 'nome', label: 'Nome cliente', desc: 'Derivato dal nome del cliente' },
];


function buildPreview(
  tipo: 'cliente' | 'incarico',
  imp: ImpostazioniStudio
): string {
  const isIncarico = tipo === 'incarico';
  const formato = isIncarico ? imp.formato_codice_incarico : imp.formato_codice_cliente;
  const prefissoAttivo = isIncarico ? imp.prefisso_incarico_attivo : imp.prefisso_cliente_attivo;
  const prefisso = isIncarico ? imp.prefisso_incarico : imp.prefisso_cliente;
  const inizioSeq = isIncarico ? imp.sequenziale_inizio_incarico : imp.sequenziale_inizio_cliente;
  const includeNome = isIncarico ? imp.incarico_include_nome : imp.cliente_include_nome;
  const includeCfPiva = isIncarico ? imp.incarico_include_cf_piva : imp.cliente_include_cf_piva;

  if (formato === 'manuale') return '(inserimento libero)';

  const parts: string[] = [];
  if (prefissoAttivo && prefisso) parts.push(prefisso);
  if (includeNome) parts.push('ROSSI');

  if (formato === 'sequenziale' || formato === 'sequenziale_cliente') {
    if (includeCfPiva) parts.push('RSSMRA85M01H501Z');
    parts.push(String(inizioSeq).padStart(3, '0'));
    if (formato === 'sequenziale_cliente') return parts.join('-') + '  (per cliente)';
  } else if (formato === 'cf_piva') {
    parts.push('RSSMRA85M01H501Z');
  } else if (formato === 'nome') {
    if (!includeNome) parts.push('ROSSI');
  }

  return parts.join('-') || '(nessun formato)';
}

interface Props {
  ruolo?: string;
  onBack?: () => void;
  pendingNavigation?: string | null;
  onConfirmLeave?: () => void;
  onCancelLeave?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function Impostazioni({ ruolo, onBack, pendingNavigation, onConfirmLeave, onCancelLeave, onDirtyChange }: Props) {
  // Solo admin/superadmin modificano le impostazioni DI STUDIO (codice cliente/incarico, cestino).
  // Ogni altro ruolo (collaboratore) le vede in sola lettura. L'Accesso AI è invece personale e
  // resta pienamente utilizzabile da tutti (vedi più sotto, fuori dal gating).
  const canEdit = ruolo === 'admin' || ruolo === 'superadmin';
  const [impostazioni, setImpostazioni] = useState<ImpostazioniStudio>({
    formato_codice_cliente: 'manuale',
    formato_codice_incarico: 'manuale',
    prefisso_cliente_attivo: true,
    prefisso_cliente: 'CLI',
    prefisso_incarico_attivo: true,
    prefisso_incarico: 'INC',
    sequenziale_inizio_cliente: 1,
    sequenziale_inizio_incarico: 1,
    cliente_include_nome: false,
    incarico_include_nome: false,
    cliente_include_cf_piva: false,
    incarico_include_cf_piva: false,
  });
  const [savedSnapshot, setSavedSnapshot] = useState<ImpostazioniStudio | null>(null);
  const [cestino, setCestino] = useState<CestinoSettings>(CESTINO_DEFAULT);
  const [cestinoSnapshot, setCestinoSnapshot] = useState<CestinoSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const isDirty =
    (savedSnapshot !== null && JSON.stringify(impostazioni) !== JSON.stringify(savedSnapshot)) ||
    (cestinoSnapshot !== null && JSON.stringify(cestino) !== JSON.stringify(cestinoSnapshot));

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    Promise.all([loadImpostazioni(), loadCestinoSettings()]).then(([data, cest]) => {
      setImpostazioni(data);
      setSavedSnapshot(data);
      setCestino(cest);
      setCestinoSnapshot(cest);
      setLoading(false);
    });
  }, []);

  const updateCestino = (patch: Partial<CestinoSettings>) =>
    setCestino(prev => ({ ...prev, ...patch }));

  // Show modal when App signals a pending navigation while dirty
  useEffect(() => {
    if (pendingNavigation && isDirty) {
      setShowUnsavedModal(true);
    } else if (pendingNavigation && !isDirty) {
      // Not dirty, just let it go
      onConfirmLeave?.();
    }
  }, [pendingNavigation, isDirty]);

  const update = (patch: Partial<ImpostazioniStudio>) =>
    setImpostazioni(prev => ({ ...prev, ...patch }));

  const guardedNavigate = useCallback((action: () => void) => {
    if (isDirty) {
      pendingActionRef.current = action;
      setShowUnsavedModal(true);
    } else {
      action();
    }
  }, [isDirty]);

  async function handleSave() {
    setSaving(true);
    const r1 = await saveImpostazioni(impostazioni);
    const r2 = await saveCestinoSettings(cestino);
    setSaving(false);
    if (r1.error || r2.error) {
      // Niente falso "Salvato!": isDirty resta, l'utente non perde le modifiche.
      toast.error('Salvataggio impostazioni non riuscito: ' + (r1.error || r2.error));
      return;
    }
    setSavedSnapshot({ ...impostazioni });
    setCestinoSnapshot({ ...cestino });
    setSaved(true);
    if (onBack) {
      setTimeout(() => onBack(), 600);
    } else {
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function handleSaveAndLeave() {
    setSaving(true);
    const r1 = await saveImpostazioni(impostazioni);
    const r2 = await saveCestinoSettings(cestino);
    setSaving(false);
    if (r1.error || r2.error) {
      // Non lasciamo la pagina: le modifiche non sono state salvate.
      toast.error('Salvataggio impostazioni non riuscito: ' + (r1.error || r2.error));
      return;
    }
    setSavedSnapshot({ ...impostazioni });
    setCestinoSnapshot({ ...cestino });
    setShowUnsavedModal(false);
    // Execute pending action
    if (onConfirmLeave) {
      onConfirmLeave();
    } else if (pendingActionRef.current) {
      pendingActionRef.current();
      pendingActionRef.current = null;
    }
  }

  function handleDiscardAndLeave() {
    setShowUnsavedModal(false);
    if (onConfirmLeave) {
      onConfirmLeave();
    } else if (pendingActionRef.current) {
      pendingActionRef.current();
      pendingActionRef.current = null;
    }
  }

  function handleCancelLeave() {
    setShowUnsavedModal(false);
    pendingActionRef.current = null;
    onCancelLeave?.();
  }

  useScrollLock(showUnsavedModal);

  const ModalPortal = ({ children }: { children: ReactNode }) => {
    return createPortal(
      children,
      document.body 
    );
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={() => guardedNavigate(onBack)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
              title="Torna indietro"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6" />
            Impostazioni Studio
          </h2>
        </div>
        {canEdit && (
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium shadow-sm"
          >
            {saved ? (
              <><CheckCircle className="w-4 h-4" /> Salvato!</>
            ) : saving ? (
              <>Salvataggio...</>
            ) : (
              <><Save className="w-4 h-4" /> Salva Impostazioni</>
            )}
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 text-gray-500 rounded-lg p-3 text-sm">
          <Eye className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Le impostazioni dello studio (codice cliente, codice incarico, cestino) sono definite dagli
            amministratori e qui sono in <strong>sola lettura</strong>. Puoi comunque gestire il tuo
            <strong> Accesso AI</strong> in fondo alla pagina.
          </span>
        </div>
      )}

      {/* Codice Cliente */}
      <SezioneCodice
        disabled={!canEdit}
        titolo="Codice Cliente"
        descrizione="Configura come generare automaticamente il codice cliente."
        formato={impostazioni.formato_codice_cliente}
        onFormatoChange={v => update({ formato_codice_cliente: v })}
        prefissoAttivo={impostazioni.prefisso_cliente_attivo}
        onPrefissoAttivoChange={v => update({ prefisso_cliente_attivo: v })}
        prefisso={impostazioni.prefisso_cliente}
        onPrefissoChange={v => update({ prefisso_cliente: v.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6) })}
        prefissoDefault="CLI"
        inizioSequenziale={impostazioni.sequenziale_inizio_cliente}
        onInizioSequenzialeChange={v => update({ sequenziale_inizio_cliente: v })}
        includeNome={impostazioni.cliente_include_nome}
        onIncludeNomeChange={v => update({ cliente_include_nome: v })}
        includeCfPiva={impostazioni.cliente_include_cf_piva}
        onIncludeCfPivaChange={v => update({ cliente_include_cf_piva: v })}
        anteprima={buildPreview('cliente', impostazioni)}
      />

      {/* Codice Incarico */}
      <SezioneCodice
        disabled={!canEdit}
        titolo="Codice Incarico"
        descrizione="Configura come generare automaticamente il codice incarico. Il codice può essere composto da più parti."
        formato={impostazioni.formato_codice_incarico === 'sequenziale_cliente' ? 'sequenziale' : impostazioni.formato_codice_incarico}
        onFormatoChange={v => {
          // Se si cambia formato, resetta sequenziale_cliente
          if (v !== 'sequenziale') {
            update({ formato_codice_incarico: v });
          } else {
            // Mantieni sequenziale_cliente se era già attivo, altrimenti sequenziale
            update({ formato_codice_incarico: impostazioni.formato_codice_incarico === 'sequenziale_cliente' ? 'sequenziale_cliente' : 'sequenziale' });
          }
        }}
        prefissoAttivo={impostazioni.prefisso_incarico_attivo}
        onPrefissoAttivoChange={v => update({ prefisso_incarico_attivo: v })}
        prefisso={impostazioni.prefisso_incarico}
        onPrefissoChange={v => update({ prefisso_incarico: v.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6) })}
        prefissoDefault="INC"
        inizioSequenziale={impostazioni.sequenziale_inizio_incarico}
        onInizioSequenzialeChange={v => update({ sequenziale_inizio_incarico: v })}
        includeNome={impostazioni.incarico_include_nome}
        onIncludeNomeChange={v => {
          const isSeqCliente = impostazioni.formato_codice_incarico === 'sequenziale_cliente';
          // Se conta per cliente, non permettere di togliere nome se CF/PIVA non è attivo
          if (isSeqCliente && !v && !impostazioni.incarico_include_cf_piva) return;
          update({ incarico_include_nome: v });
        }}
        includeCfPiva={impostazioni.incarico_include_cf_piva}
        onIncludeCfPivaChange={v => {
          const isSeqCliente = impostazioni.formato_codice_incarico === 'sequenziale_cliente';
          // Se conta per cliente, non permettere di togliere CF/PIVA se nome non è attivo
          if (isSeqCliente && !v && !impostazioni.incarico_include_nome) return;
          update({ incarico_include_cf_piva: v });
        }}
        anteprima={buildPreview('incarico', impostazioni)}
        sequenzialePerCliente={impostazioni.formato_codice_incarico === 'sequenziale_cliente'}
        onSequenzialePerClienteChange={v => {
          if (v) {
            // Forza almeno uno tra nome e CF/PIVA
            const almenoUno = impostazioni.incarico_include_nome || impostazioni.incarico_include_cf_piva;
            update({
              formato_codice_incarico: 'sequenziale_cliente',
              incarico_include_nome: almenoUno ? impostazioni.incarico_include_nome : true,
            });
          } else {
            update({ formato_codice_incarico: 'sequenziale' });
          }
        }}
      />

      {/* Cestino */}
      <SezioneCestino settings={cestino} onChange={updateCestino} disabled={!canEdit} />

      {/* Accesso AI / MCP — gestione token (Fase 4) */}
      <AccessoMcpSettings />

      {/* Modale modifiche non salvate */}
      {showUnsavedModal && (
        <ModalPortal>
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      className="absolute inset-0 bg-slate-600/10 backdrop-blur-[2px] transition-opacity"
      onClick={handleCancelLeave}
    />
    
    <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100">
      <div className="p-6 pb-2">
        <div className='flex flex-row items-center '>
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 ml-5 pb-5">
            Modifiche non salvate
          </h3>
        </div>
        <p className="text-sm text-slate-500 mt-0 px-2 leading-relaxed">
          Sembra che tu abbia apportato dei cambiamenti. Vuoi salvarli prima di lasciare la pagina?
        </p>
      </div>

      <div className="p-6 pt-8 flex flex-col gap-3">
        <button
          onClick={handleSaveAndLeave}
          disabled={saving}
          className="w-full px-4 py-3 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 active:transform active:scale-[0.98] transition-all shadow-lg shadow-blue-200 disabled:opacity-50 disabled:shadow-none"
        >
          {saving ? 'Salvataggio in corso...' : 'Salva ed esci'}
        </button>

        <div className="flex gap-3">
          <button
            onClick={handleCancelLeave}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            Resta qui
          </button>

          <button
            onClick={handleDiscardAndLeave}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            Esci senza salvare
          </button>
        </div>
      </div>
    </div>
  </div>
  </ModalPortal>
)}
    </div>
  );
}

/* --- Componente sezione codice riutilizzabile --- */

interface SezioneCodiceProps {
  titolo: string;
  descrizione: string;
  formato: FormatoCodice;
  onFormatoChange: (v: FormatoCodice) => void;
  prefissoAttivo: boolean;
  onPrefissoAttivoChange: (v: boolean) => void;
  prefisso: string;
  onPrefissoChange: (v: string) => void;
  prefissoDefault: string;
  inizioSequenziale: number;
  onInizioSequenzialeChange: (v: number) => void;
  includeNome?: boolean;
  onIncludeNomeChange?: (v: boolean) => void;
  includeCfPiva?: boolean;
  onIncludeCfPivaChange?: (v: boolean) => void;
  anteprima: string;
  sequenzialePerCliente?: boolean;
  onSequenzialePerClienteChange?: (v: boolean) => void;
  disabled?: boolean;
}

function SezioneCodice({
  titolo,
  descrizione,
  formato,
  onFormatoChange,
  prefissoAttivo,
  onPrefissoAttivoChange,
  prefisso,
  onPrefissoChange,
  prefissoDefault,
  inizioSequenziale,
  onInizioSequenzialeChange,
  includeNome,
  onIncludeNomeChange,
  includeCfPiva,
  onIncludeCfPivaChange,
  anteprima,
  sequenzialePerCliente,
  onSequenzialePerClienteChange,
  disabled = false,
}: SezioneCodiceProps) {
  const isAuto = formato !== 'manuale';

  return (
    <div className="bg-white border rounded-lg p-6 space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{titolo}</h3>
          <p className="text-sm text-gray-500 mt-1">{descrizione}</p>
        </div>
        {disabled && (
          <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Sola lettura</span>
        )}
      </div>

      {/* Controlli: in sola lettura il fieldset disabilita nativamente tutti gli input/bottoni
          interni; i valori mostrati restano quelli reali (impostati dagli amministratori). */}
      <fieldset disabled={disabled} className={`space-y-5 min-w-0 m-0 p-0 border-0 ${disabled ? 'opacity-60' : ''}`}>
      {/* Formato base */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">Modalità di generazione</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FORMATO_BASE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onFormatoChange(opt.value)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                formato === opt.value
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <p className={`text-sm font-medium ${formato === opt.value ? 'text-blue-700' : 'text-gray-800'}`}>
                {opt.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 leading-tight">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Opzioni avanzate (solo se non manuale) */}
      {isAuto && (
        <div className="border-t pt-4 space-y-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Composizione codice</p>

          {/* Prefisso */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={prefissoAttivo}
                onChange={e => onPrefissoAttivoChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Usa prefisso</span>
            </label>
            {prefissoAttivo && (
              <input
                type="text"
                value={prefisso}
                onChange={e => onPrefissoChange(e.target.value)}
                placeholder={prefissoDefault}
                maxLength={6}
                className="w-24 px-3 py-1.5 border rounded-md text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            )}
          </div>

          {/* Sequenziale per cliente (solo per incarico, solo se sequenziale) */}
          {onSequenzialePerClienteChange != null && formato === 'sequenziale' && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sequenzialePerCliente ?? false}
                onChange={e => onSequenzialePerClienteChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Conta per cliente</span>
              <span className="text-xs text-gray-400">(numera gli incarichi separatamente per ogni cliente)</span>
            </label>
          )}

          {sequenzialePerCliente && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Con "Conta per cliente" è necessario selezionare almeno una tra le opzioni "Nome cliente" o "Codice Fiscale" per identificare il cliente.
            </p>
          )}

          {/* Include nome cliente (sequenziale, non formato nome) */}
          {onIncludeNomeChange != null && formato === 'sequenziale' && (
            <label className={`flex items-center gap-2 select-none ${sequenzialePerCliente && includeNome && !includeCfPiva ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={includeNome ?? false}
                onChange={e => onIncludeNomeChange(e.target.checked)}
                disabled={!!(sequenzialePerCliente && includeNome && !includeCfPiva)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <span className="text-sm text-gray-700">Includi nome del cliente nel codice</span>
              {sequenzialePerCliente && includeNome && !includeCfPiva && <span className="text-xs text-blue-500">(obbligatorio con conta per cliente)</span>}
            </label>
          )}

          {/* Includi CF/P.IVA (solo se sequenziale) */}
          {onIncludeCfPivaChange != null && formato === 'sequenziale' && (
            <label className={`flex items-center gap-2 select-none ${sequenzialePerCliente && includeCfPiva && !includeNome ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={includeCfPiva ?? false}
                onChange={e => onIncludeCfPivaChange(e.target.checked)}
                disabled={!!(sequenzialePerCliente && includeCfPiva && !includeNome)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <span className="text-sm text-gray-700">Includi Codice Fiscale nel codice</span>
              {sequenzialePerCliente && includeCfPiva && !includeNome && <span className="text-xs text-blue-500">(obbligatorio con conta per cliente)</span>}
            </label>
          )}

          {/* Inizio sequenziale */}
          {formato === 'sequenziale' && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700">Parti da numero:</label>
              <input
                type="number"
                min={1}
                value={inizioSequenziale}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1) onInizioSequenzialeChange(v);
                }}
                className="w-24 px-3 py-1.5 border rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {/* Anteprima */}
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-4 py-3 border border-dashed border-gray-300">
            <Eye className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500">Anteprima:</span>
            <span className="font-mono text-sm font-semibold text-gray-800">{anteprima}</span>
          </div>
        </div>
      )}
      </fieldset>
    </div>
  );
}

/* --- Sezione impostazioni Cestino (chi può cestinare/ripristinare/svuotare + auto-purge) --- */

type RegolaCestino = 'tutti' | 'solo_admin';

interface CestinoSettings {
  cestino_chi_cestina: RegolaCestino;
  cestino_chi_ripristina: RegolaCestino;
  cestino_chi_svuota: RegolaCestino;
  cestino_auto_purge_giorni: number | null;
}

const CESTINO_DEFAULT: CestinoSettings = {
  cestino_chi_cestina: 'tutti',
  cestino_chi_ripristina: 'tutti',
  cestino_chi_svuota: 'solo_admin',
  cestino_auto_purge_giorni: null,
};

async function loadCestinoSettings(): Promise<CestinoSettings> {
  const studioId = await getMyStudioId();
  if (!studioId) return CESTINO_DEFAULT;
  const { data } = await supabase
    .from('impostazioni_studio')
    .select('cestino_chi_cestina, cestino_chi_ripristina, cestino_chi_svuota, cestino_auto_purge_giorni')
    .eq('studio_id', studioId)
    .maybeSingle();
  if (!data) return CESTINO_DEFAULT;
  return {
    cestino_chi_cestina: data.cestino_chi_cestina ?? 'tutti',
    cestino_chi_ripristina: data.cestino_chi_ripristina ?? 'tutti',
    cestino_chi_svuota: data.cestino_chi_svuota ?? 'solo_admin',
    cestino_auto_purge_giorni: data.cestino_auto_purge_giorni ?? null,
  };
}

async function saveCestinoSettings(settings: CestinoSettings): Promise<{ error: string | null }> {
  const studioId = await getMyStudioId();
  if (!studioId) return { error: 'Studio non determinato.' };
  // Upsert sulla stessa riga dei codici (onConflict studio_id): viene chiamata
  // dopo saveImpostazioni, quindi la riga esiste già e questo è di fatto un update.
  const { error } = await supabase
    .from('impostazioni_studio')
    .upsert({ studio_id: studioId, ...settings }, { onConflict: 'studio_id' });
  return { error: error ? error.message : null };
}

function SezioneCestino({
  settings,
  onChange,
  disabled = false,
}: { settings: CestinoSettings; onChange: (patch: Partial<CestinoSettings>) => void; disabled?: boolean }) {
  const update = onChange;

  return (
    <div className="bg-white border rounded-lg p-6 space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-gray-700" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Cestino</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Definisci chi può gestire il cestino e se cancellare automaticamente gli elementi dopo un periodo.
            </p>
          </div>
        </div>
        {disabled && (
          <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Sola lettura</span>
        )}
      </div>

      {/* In sola lettura il fieldset disabilita i controlli; i valori mostrati restano quelli reali. */}
      <fieldset disabled={disabled} className={`space-y-5 min-w-0 m-0 p-0 border-0 ${disabled ? 'opacity-60' : ''}`}>
      <div className="border-t pt-4 space-y-4">
        <RigaPermesso
          label="Chi può spostare nel cestino"
          value={settings.cestino_chi_cestina}
          onChange={v => update({ cestino_chi_cestina: v })}
        />
        <RigaPermesso
          label="Chi può ripristinare dal cestino"
          value={settings.cestino_chi_ripristina}
          onChange={v => update({ cestino_chi_ripristina: v })}
        />
        <RigaPermesso
          label="Chi può eliminare definitivamente"
          value={settings.cestino_chi_svuota}
          onChange={v => update({ cestino_chi_svuota: v })}
        />
      </div>

      <div className="border-t pt-4 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.cestino_auto_purge_giorni != null}
            onChange={e => update({ cestino_auto_purge_giorni: e.target.checked ? 30 : null })}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Cancellazione automatica</span>
          <span className="text-xs text-gray-400">(svuota il cestino dopo un certo numero di giorni)</span>
        </label>
        {settings.cestino_auto_purge_giorni != null && (
          <div className="flex items-center gap-3 pl-6">
            <label className="text-sm text-gray-700">Elimina dopo</label>
            <input
              type="number"
              min={1}
              value={settings.cestino_auto_purge_giorni}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1) update({ cestino_auto_purge_giorni: v });
              }}
              className="w-20 px-3 py-1.5 border rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <span className="text-sm text-gray-700">giorni</span>
          </div>
        )}
        {settings.cestino_auto_purge_giorni == null && (
          <p className="text-xs text-gray-400 pl-6">
            Disattivata: gli elementi restano nel cestino finché un amministratore non li elimina.
          </p>
        )}
      </div>
      </fieldset>
    </div>
  );
}

function RigaPermesso({
  label, value, onChange,
}: { label: string; value: RegolaCestino; onChange: (v: RegolaCestino) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
        {([['tutti', 'Tutti'], ['solo_admin', 'Solo admin']] as [RegolaCestino, string][]).map(([val, lbl]) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              value === val ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
