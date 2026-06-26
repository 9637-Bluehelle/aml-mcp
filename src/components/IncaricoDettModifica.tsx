/**
 * IncaricoDettModifica - Componente condiviso per dettaglio e modifica incarico.
 * Usato sia da FascicoloCliente che da RT2AdeguataVerifica.
 */
import { useState, useEffect, Fragment } from 'react';
import { Save, Edit3, Check, ChevronDown, ChevronRight, ArrowLeft, FileClock, Plus, Calendar, Clock, Loader2, X, Download, AlertTriangle, Trash2 } from 'lucide-react';
import { ActionsMenu } from './ActionsMenu';
import { spostaNelCestino, clausolaRecuperoCestino } from '../lib/cestinoHelper';
import { useCestinaPermesso } from '../hooks/useCestinaPermesso';
import { useScrollLock } from '../hooks/useScrollLock';
import { amlData, getPrestazione } from '../lib/aml-data';
import { buildValueLabelMap } from '../lib/storicoFormat';
import { StoricoModificheDrawer } from './StoricoModificheDrawer';
import { Combobox } from '@headlessui/react';
import { formatDate as formatDateIT, formatDateInv } from './cliente-wizard/components/forms/PersonaFisicaForm';
import { supabase } from '../lib/supabase';
import { enrichClienteWithRappresentante, loadTitolariWithPersona } from '../lib/personeHelper';
import { addUserLog } from './LogUtente';
import { RiskBadge } from './RiskBadge';
import { DocumentiAllegati, TIPOLOGIE_DOCUMENTO } from './DocumentiAllegati';
import { generateAndDownloadDOCX_AV1, generateBlobDOCX_AV1, generateBlobDOCX_AV3, generateBlobDOCX_AV4, generateBlobDOCX_AV5, generateBlobDOCX_AV6, type DocumentoAllegato } from '../lib/docx-converter';
import { getMyStudio, getMyProfile } from '../lib/studioHelper';
import { useToast, useConfirm } from './Toast';
import { findPersoneIdByCliente } from '../lib/personeHelper';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// ==================== Types ====================

export interface IncaricoCompletoShared {
  id: string;
  codice_incarico: string;
  tipologia_prestazione_id: string;
  descrizione: string;
  scopo_natura?: string;
  data_inizio?: string;
  data_fine?: string;
  importo_stimato?: number;
  status?: string;
  cliente_id?: string;
  relazioni_cliente_te?: string;
  provenienza_fondi?: string;
  mezzi_pagamento?: string;
  conferma_fondi_leciti?: boolean;
  created_at?: string;
  updated_at?: string;
  cliente?: {
    id?: string;
    ragione_sociale?: string;
    codice_cliente?: string;
    [key: string]: any;
  } | null;
}

export interface EditFormData {
  codice_incarico: string;
  tipologia_prestazione_id: string;
  descrizione: string;
  scopo_natura: string;
  data_inizio: string;
  importo_stimato: number;
  relazioni_cliente_te: string;
  provenienza_fondi: string;
  mezzi_pagamento: string;
  conferma_fondi_leciti: boolean;
}

// ==================== Helpers ====================

const formatDateForDB = (displayDate: string): string => {
  if (!displayDate || displayDate.trim() === '') return '';
  try {
    const cleaned = displayDate.trim().replace(/\s+/g, '');
    const parts = cleaned.split('/');
    if (parts.length !== 3) return '';
    const [day, month, year] = parts;
    if (isNaN(parseInt(day)) || isNaN(parseInt(month)) || isNaN(parseInt(year))) return '';
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  } catch {
    return '';
  }
};

const parseCurrency = (value: string): number => {
  if (!value || value.trim() === '') return 0;
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

const formatCurrency = (value: number | string): string => {
  if (!value && value !== 0) return '';
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '';
  return numValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export function incaricoToEditForm(inc: IncaricoCompletoShared): EditFormData {
  return {
    codice_incarico: inc.codice_incarico || '',
    tipologia_prestazione_id: inc.tipologia_prestazione_id || '',
    descrizione: inc.descrizione || '',
    scopo_natura: inc.scopo_natura || '',
    data_inizio: inc.data_inizio || '',
    importo_stimato: inc.importo_stimato || 0,
    relazioni_cliente_te: inc.relazioni_cliente_te || '',
    provenienza_fondi: inc.provenienza_fondi || '',
    mezzi_pagamento: inc.mezzi_pagamento || '',
    conferma_fondi_leciti: inc.conferma_fondi_leciti ?? true,
  };
}

// ==================== Salvataggio ====================

export async function saveIncaricoChanges(
  incarico: IncaricoCompletoShared,
  editForm: EditFormData,
  clienteNome?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // [DEPRECATED 2026-05-07] Diff e scrittura storico ora a carico del trigger
    // log_storico_clienti_incarichi sull'UPDATE di incarichi.
    // Vedi migrazione 20260508000000_audit_storico_db_triggers.sql.
    /*
    const campiDaConfrontare = [
      { key: 'codice_incarico', vecchio: incarico.codice_incarico, nuovo: editForm.codice_incarico },
      { key: 'tipologia_prestazione_id', vecchio: incarico.tipologia_prestazione_id, nuovo: editForm.tipologia_prestazione_id },
      { key: 'descrizione', vecchio: incarico.descrizione, nuovo: editForm.descrizione },
      { key: 'scopo_natura', vecchio: incarico.scopo_natura || '', nuovo: editForm.scopo_natura },
      { key: 'data_inizio', vecchio: incarico.data_inizio || '', nuovo: editForm.data_inizio.includes('/') ? formatDateForDB(editForm.data_inizio) : editForm.data_inizio },
      { key: 'importo_stimato', vecchio: String(incarico.importo_stimato || 0), nuovo: String(editForm.importo_stimato || 0) },
      { key: 'relazioni_cliente_te', vecchio: incarico.relazioni_cliente_te || '', nuovo: editForm.relazioni_cliente_te },
      { key: 'provenienza_fondi', vecchio: incarico.provenienza_fondi || '', nuovo: editForm.provenienza_fondi },
      { key: 'mezzi_pagamento', vecchio: incarico.mezzi_pagamento || '', nuovo: editForm.mezzi_pagamento },
      { key: 'conferma_fondi_leciti', vecchio: String(incarico.conferma_fondi_leciti), nuovo: String(editForm.conferma_fondi_leciti) },
    ];
    const modifiche = campiDaConfrontare
      .filter(c => String(c.vecchio || '') !== String(c.nuovo || ''))
      .map(c => ({ campo: c.key, vecchio: String(c.vecchio || ''), nuovo: String(c.nuovo || '') }));

    if (modifiche.length > 0) {
      const rows = modifiche.map(m => ({
        entity_type: 'incarico' as const,
        entity_id: incarico.id,
        campo: m.campo,
        valore_precedente: m.vecchio,
        valore_nuovo: m.nuovo,
      }));
      await supabase.from('storico_modifiche').insert(rows);
    }
    */

    const { error } = await supabase
      .from('incarichi')
      .update({
        codice_incarico: editForm.codice_incarico,
        data_inizio: editForm.data_inizio.includes('/') ? formatDateForDB(editForm.data_inizio) : editForm.data_inizio,
        tipologia_prestazione_id: editForm.tipologia_prestazione_id,
        descrizione: editForm.descrizione,
        scopo_natura: editForm.scopo_natura,
        importo_stimato: editForm.importo_stimato,
        relazioni_cliente_te: editForm.relazioni_cliente_te,
        provenienza_fondi: editForm.provenienza_fondi,
        mezzi_pagamento: editForm.mezzi_pagamento,
        conferma_fondi_leciti: editForm.conferma_fondi_leciti,
      })
      .eq('id', incarico.id);

    if (error) throw error;

    addUserLog(`Modificato incarico ${editForm.codice_incarico} per cliente ${clienteNome || ''}.`);
    return { success: true };
  } catch (err) {
    console.error('Errore aggiornamento incarico:', err);
    return { success: false, error: "Errore durante l'aggiornamento dell'incarico" };
  }
}

// ==================== PrestazioniSelect ====================

export function PrestazioniSelect({ value, onChange }: { value: string; onChange: (v: string | null) => void }) {
  const prestazioniOrdinate = [...amlData.prestazioni_catalog].sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const [query, setQuery] = useState('');

  const filtered = query === ''
    ? prestazioniOrdinate
    : prestazioniOrdinate.filter(p => p.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <Combobox value={value} onChange={onChange}>
      <div className="relative">
        <Combobox.Button as="div" className="relative w-full cursor-pointer">
          <Combobox.Input
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
            displayValue={(id: string) => {
              const found = prestazioniOrdinate.find(p => p.id === id);
              return found ? `${found.label} (Rischio: ${found.inherentRisk})` : '';
            }}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Seleziona prestazione..."
          />
          <span className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
            <ChevronDown className="w-4 h-4 text-black" strokeWidth={3} />
          </span>
        </Combobox.Button>
        {filtered.length > 0 && (
          <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg border border-gray-200">
            {filtered.map((prest, index) => (
              <Fragment key={prest.id}>
                <Combobox.Option
                  value={prest.id}
                  className={({ active }) => `cursor-pointer select-none px-4 py-2 ${active ? 'bg-blue-100' : ''}`}
                >
                  {({ selected }) => (
                    <div className="flex items-center justify-between">
                      <span>{prest.label} (Rischio: {prest.inherentRisk})</span>
                      {selected && <Check className="w-4 h-4 text-blue-600" />}
                    </div>
                  )}
                </Combobox.Option>
                {index < filtered.length - 1 && <div className="border-t border-gray-200 mx-2" />}
              </Fragment>
            ))}
          </Combobox.Options>
        )}
      </div>
    </Combobox>
  );
}

// ==================== DettaglioIncaricoView ====================

interface DettaglioProps {
  incarico: IncaricoCompletoShared;
  /** Contenuto extra da mostrare prima dei dettagli (es. pulsanti DOCX in RT2) */
  headerExtra?: React.ReactNode;
}

export function DettaglioIncaricoView({ incarico, headerExtra }: DettaglioProps) {
  const prestazione = getPrestazione(incarico.tipologia_prestazione_id);

  return (
    <div className="border rounded-lg p-4 bg-white space-y-4">
      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Dettagli Incarico</h4>
      {headerExtra}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b">
        <div>
          <p className="text-xs text-gray-500 mb-1">Cliente</p>
          <p className="text-sm font-semibold">{incarico.cliente?.ragione_sociale || 'N/A'}</p>
          <p className="text-xs text-gray-500">{incarico.cliente?.codice_cliente || ''}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Codice Incarico</p>
          <p className="text-sm font-semibold">{incarico.codice_incarico}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Tipologia Prestazione</p>
          <p className="text-sm">{prestazione?.label || 'N/A'}</p>
          <p className="text-xs text-gray-500">Rischio Inerente: {prestazione?.inherentRisk ?? 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Data Inizio</p>
          <p className="text-sm">{incarico.data_inizio ? new Date(incarico.data_inizio).toLocaleDateString('it-IT') : 'N/A'}</p>
        </div>
        {incarico.data_fine && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Data Fine</p>
            <p className="text-sm">{new Date(incarico.data_fine).toLocaleDateString('it-IT')}</p>
          </div>
        )}
        {incarico.importo_stimato != null && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Importo Stimato</p>
            <p className="text-sm font-semibold">€ {incarico.importo_stimato.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
          </div>
        )}
      </div>
      {incarico.descrizione && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Descrizione</p>
          <p className="text-sm">{incarico.descrizione}</p>
        </div>
      )}
      {incarico.scopo_natura && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Scopo e Natura</p>
          <p className="text-sm whitespace-pre-wrap">{incarico.scopo_natura}</p>
        </div>
      )}
      {(incarico.relazioni_cliente_te || incarico.provenienza_fondi || incarico.mezzi_pagamento) && (
        <div className="pt-4 border-t space-y-3">
          <h5 className="text-sm font-semibold text-gray-700">Dati Dichiarazione Cliente (AV.4)</h5>
          {incarico.relazioni_cliente_te && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Relazioni tra Cliente e Titolari Effettivi</p>
              <p className="text-sm whitespace-pre-wrap">{incarico.relazioni_cliente_te}</p>
            </div>
          )}
          {incarico.provenienza_fondi && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Provenienza dei Fondi</p>
              <p className="text-sm">{incarico.provenienza_fondi}</p>
            </div>
          )}
          {incarico.mezzi_pagamento && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Mezzi di Pagamento Previsti</p>
              <p className="text-sm">{incarico.mezzi_pagamento}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== ModificaIncaricoForm ====================

interface ModificaProps {
  incarico: IncaricoCompletoShared;
  onSaved: () => void;
  onCancel: () => void;
  clienteNome?: string;
}

export function ModificaIncaricoForm({ incarico, onSaved, onCancel, clienteNome }: ModificaProps) {
  const toast = useToast();
  const [editForm, setEditForm] = useState<EditFormData>(() => incaricoToEditForm(incarico));
  const [importoFormattato, setImportoFormattato] = useState(() =>
    incarico.importo_stimato ? formatCurrency(incarico.importo_stimato) : ''
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await saveIncaricoChanges(incarico, editForm, clienteNome);
    setSaving(false);
    if (result.success) {
      onSaved();
    } else {
      toast.error(String(result.error));
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-white space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Modifica Dati Incarico</h4>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvataggio...' : 'Salva Modifiche'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Codice Incarico *</label>
          <input
            type="text"
            value={editForm.codice_incarico}
            onChange={(e) => setEditForm({ ...editForm, codice_incarico: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data Inizio * (gg/mm/aaaa)</label>
          <input
            type="date"
            onClick={(e) => (e.target as HTMLInputElement).showPicker()}
            value={editForm.data_inizio.includes('/') && editForm.data_inizio.length === 10 ? formatDateInv(editForm.data_inizio) : editForm.data_inizio}
            onChange={(e) => {
              const data = formatDateIT(e.target.value);
              setEditForm({ ...editForm, data_inizio: data });
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tipologia Prestazione *</label>
        <PrestazioniSelect
          value={editForm.tipologia_prestazione_id}
          onChange={(v) => setEditForm({ ...editForm, tipologia_prestazione_id: v ?? '' })}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
        <input
          type="text"
          value={editForm.descrizione}
          onChange={(e) => setEditForm({ ...editForm, descrizione: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Breve descrizione dell'incarico"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Scopo e Natura dell'Incarico</label>
        <textarea
          value={editForm.scopo_natura}
          onChange={(e) => setEditForm({ ...editForm, scopo_natura: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Descrivere scopo e natura della prestazione professionale..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Importo Stimato (€)</label>
        <input
          type="text"
          value={importoFormattato}
          onChange={(e) => {
            setImportoFormattato(e.target.value);
            setEditForm({ ...editForm, importo_stimato: parseCurrency(e.target.value) });
          }}
          onBlur={(e) => {
            const num = parseCurrency(e.target.value);
            setImportoFormattato(num > 0 ? formatCurrency(num) : '');
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="10.000,00"
        />
        <p className="text-xs text-gray-500 mt-1">Formato: 10.000,00 (punto per migliaia, virgola per decimali)</p>
      </div>

      {/* Campi AV.4 */}
      <div className="border-t pt-4 mt-4 space-y-4">
        <h5 className="text-sm font-semibold text-gray-700">Dati Dichiarazione Cliente (AV.4)</h5>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Relazioni tra Cliente e Titolari Effettivi</label>
          <textarea
            value={editForm.relazioni_cliente_te}
            onChange={(e) => setEditForm({ ...editForm, relazioni_cliente_te: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Descrivere i rapporti tra il cliente e i titolari effettivi..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Provenienza dei Fondi</label>
          <input
            type="text"
            value={editForm.provenienza_fondi}
            onChange={(e) => setEditForm({ ...editForm, provenienza_fondi: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Es: Reddito da lavoro, attività imprenditoriale, patrimonio familiare..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mezzi di Pagamento Previsti</label>
          <input
            type="text"
            value={editForm.mezzi_pagamento}
            onChange={(e) => setEditForm({ ...editForm, mezzi_pagamento: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Es: Bonifico bancario, assegno, contanti..."
          />
        </div>

        <div className="flex items-start">
          <input
            type="checkbox"
            id="edit_conferma_fondi"
            checked={editForm.conferma_fondi_leciti}
            onChange={(e) => setEditForm({ ...editForm, conferma_fondi_leciti: e.target.checked })}
            className="mt-1 mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="edit_conferma_fondi" className="text-sm text-gray-700">
            <span className="font-medium">Conferma Provenienza Lecita dei Fondi</span>
            <p className="text-xs text-gray-500 mt-0.5">Il cliente dichiara che i fondi provengono da attività lecite</p>
          </label>
        </div>
      </div>
    </div>
  );
}

// ==================== Valutazione shared interface ====================

export interface ValutazioneShared {
  id: string;
  incarico_id: string;
  created_at: string;
  data_valutazione: string;
  rischio_inerente_prestazione: number;
  rischio_specifico: number;
  rischio_effettivo: number;
  classe_rischio: number;
  misure_applicate: string;
  tabella_a_scores: any;
  tabella_b_scores: any;
  note?: string;
  prossimo_controllo?: string;
}

// ==================== Storico Modifiche Panel ====================

interface StoricoModificaItem {
  id: string;
  created_at: string;
  campo: string;
  valore_precedente: string | null;
  valore_nuovo: string | null;
  user_id?: string;
}

const LABEL_CAMPI_SHARED: Record<string, string> = {
  codice_incarico: 'Codice Incarico',
  tipologia_prestazione_id: 'Tipologia Prestazione',
  descrizione: 'Descrizione',
  scopo_natura: 'Scopo/Natura',
  data_inizio: 'Data Inizio',
  importo_stimato: 'Importo Stimato',
  relazioni_cliente_te: 'Relazioni Cliente/TE',
  provenienza_fondi: 'Provenienza Fondi',
  mezzi_pagamento: 'Mezzi di Pagamento',
  conferma_fondi_leciti: 'Conferma Fondi Leciti',
  archiviato: 'Stato Archiviazione',
};

function StoricoModifichePanel({
  show,
  onClose,
  loading,
  modifiche,
  creationInfo,
  userNameMap = {},
  valueMap = {},
}: {
  show: boolean;
  onClose: () => void;
  loading: boolean;
  modifiche: StoricoModificaItem[];
  creationInfo?: { created_at: string; ownerEmail: string } | null;
  userNameMap?: Record<string, string>;
  valueMap?: Record<string, string>;
}) {
  return (
    <StoricoModificheDrawer
      show={show}
      onClose={onClose}
      loading={loading}
      modifiche={modifiche}
      labelForCampo={(campo) => LABEL_CAMPI_SHARED[campo] || campo}
      userNameMap={userNameMap}
      valueMap={valueMap}
      creationInfo={creationInfo}
    />
  );
}

// ==================== ValutazioneCard ====================

function ValutazioneCard({ val, index, total, onDownloadAV1, isGeneratingAV1, onCestina }: { val: ValutazioneShared; index: number; total: number; onDownloadAV1?: (val: ValutazioneShared) => void; isGeneratingAV1?: boolean; onCestina?: (val: ValutazioneShared) => void }) {
  const [dettagliOpen, setDettagliOpen] = useState(false);
  const getScore = (v: any) => typeof v === 'number' ? v : v?.score ?? 0;

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-white">
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-medium text-gray-700">
          Valutazione #{total - index} — {new Date(val.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </h5>
        <div className="flex items-center gap-2">
          {onDownloadAV1 && (
            <button
              onClick={() => onDownloadAV1(val)}
              disabled={isGeneratingAV1}
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors text-xs font-medium"
            >
              {isGeneratingAV1 ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              AV.1
            </button>
          )}
          {onCestina && (
            <button
              onClick={() => onCestina(val)}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Sposta nel cestino"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Rischio Inerente Prestazione</span>
          <RiskBadge score={val.rischio_inerente_prestazione} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Rischio Specifico</span>
          <RiskBadge score={val.rischio_specifico} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Rischio Effettivo</span>
          <RiskBadge score={val.rischio_effettivo} />
        </div>
      </div>
      <div className="pt-3 border-t flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900">Classe Rischio:</span>
        <span className={`px-2 py-1 rounded text-xs font-semibold ${
          val.classe_rischio === 4 ? 'bg-red-100 text-red-800' :
          val.classe_rischio === 3 ? 'bg-orange-100 text-orange-800' :
          val.classe_rischio === 2 ? 'bg-yellow-100 text-yellow-800' :
          'bg-green-100 text-green-800'
        }`}>
          Classe {val.classe_rischio}
        </span>
      </div>
      {val.misure_applicate && (
        <p className="text-sm text-gray-700">
          <span className="font-medium">Misure Applicate:</span> {val.misure_applicate}
        </p>
      )}
      {val.prossimo_controllo && (() => {
        const scad = new Date(val.prossimo_controllo);
        const today = new Date();
        scad.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((scad.getTime() - today.getTime()) / (1000 * 3600 * 24));
        const isScaduta = diffDays <= 0;
        const isInScadenza = !isScaduta && diffDays <= 30;
        const colorClass = isScaduta ? 'text-red-600' : isInScadenza ? 'text-orange-600' : 'text-gray-500';
        const Icon = (isScaduta || isInScadenza) ? Clock : Calendar;
        return (
          <p className={`text-sm ${colorClass} flex items-center gap-1`}>
            <Icon className="w-3 h-3" />
            Prossimo controllo: {scad.toLocaleDateString('it-IT')}
          </p>
        );
      })()}

      {/* Dettagli Tabelle A/B */}
      <div className="pt-3 border-t">
        <button
          onClick={() => setDettagliOpen(!dettagliOpen)}
          className="flex items-center gap-1 text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600"
        >
          <ChevronRight className={`w-4 h-4 transition-transform ${dettagliOpen ? 'rotate-90' : ''}`} />
          Dettagli Valutazione
        </button>
        {dettagliOpen && (
          <div className="mt-4 space-y-4">
            {val.tabella_a_scores && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Tabella A - Fattori Cliente</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Natura Giuridica: <span className="font-semibold">{getScore(val.tabella_a_scores.naturaGiuridica)}</span></div>
                  <div>Attività Prevalente: <span className="font-semibold">{getScore(val.tabella_a_scores.attivitaPrevalente)}</span></div>
                  <div>Comportamento Conferimento: <span className="font-semibold">{getScore(val.tabella_a_scores.comportamentoConferimento)}</span></div>
                  <div>Area Cliente/Controparte: <span className="font-semibold">{getScore(val.tabella_a_scores.areaClienteControparte)}</span></div>
                </div>
              </div>
            )}
            {val.tabella_b_scores && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Tabella B - Fattori Operazione</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Tipologia: <span className="font-semibold">{getScore(val.tabella_b_scores.tipologia)}</span></div>
                  <div>Modalità: <span className="font-semibold">{getScore(val.tabella_b_scores.modalita)}</span></div>
                  <div>Ammontare: <span className="font-semibold">{getScore(val.tabella_b_scores.ammontare)}</span></div>
                  <div>Frequenza/Volume/Durata: <span className="font-semibold">{getScore(val.tabella_b_scores.frequenzaVolumeDurata)}</span></div>
                  <div>Ragionevolezza: <span className="font-semibold">{getScore(val.tabella_b_scores.ragionevolezza)}</span></div>
                  <div>Area Destinazione: <span className="font-semibold">{getScore(val.tabella_b_scores.areaDestinazione)}</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== DettaglioIncaricoPage ====================
// Componente full-page condiviso: header + dettaglio/modifica + documenti + valutazioni + storico

interface DettaglioIncaricoPageProps {
  incarico: IncaricoCompletoShared;
  valutazioni: ValutazioneShared[];
  onBack: () => void;
  onSaved: () => void;
  clienteNome?: string;
  /** Nome/email di chi ha creato l'incarico */
  ownerEmail?: string;
  /** Bottone "Aggiungi Valutazione" - se fornito, viene mostrato */
  onAggiungiValutazione?: () => void;
  /** When true, hides edit/add buttons but keeps storico, download, and read-only view */
  readOnly?: boolean;
}

export function DettaglioIncaricoPage({
  incarico,
  valutazioni,
  onBack,
  onSaved,
  clienteNome,
  ownerEmail,
  onAggiungiValutazione,
  readOnly = false,
}: DettaglioIncaricoPageProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [personaIds, setPersonaIds] = useState<string[]>([]);

  // Carica persona IDs associate al cliente per i documenti persona
  useEffect(() => {
    if (incarico.cliente_id) {
      findPersoneIdByCliente(String(incarico.cliente_id)).then(ids => setPersonaIds(ids));
    }
  }, [incarico.cliente_id]);

  // Storico modifiche
  const [showStorico, setShowStorico] = useState(false);
  const [storicoData, setStoricoData] = useState<StoricoModificaItem[]>([]);
  const [loadingStorico, setLoadingStorico] = useState(false);
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({});
  const [valueMap, setValueMap] = useState<Record<string, string>>({});
  const [resolvedOwnerEmail, setResolvedOwnerEmail] = useState<string | undefined>(ownerEmail);
  const puoCestina = useCestinaPermesso();

  // Generazione DOCX
  const [isGeneratingDOCX, setIsGeneratingDOCX] = useState(false);
  const [docxGenerationType, setDocxGenerationType] = useState<'av1' | 'av3' | 'av4' | 'av5' | 'av6' | null>(null);
  const [showNoValutazioneModal, setShowNoValutazioneModal] = useState(false);
  const [generatingAV1ForValId, setGeneratingAV1ForValId] = useState<string | null>(null);

  // Modale allegati per AV.3/AV.4/AV.5/AV.6
  interface AllegatoDownload { id: string; tipologia: string; nome_file: string; file_path: string; }
  const [attachModalType, setAttachModalType] = useState<'av3' | 'av4' | 'av5' | 'av6' | null>(null);
  const [attachAllegati, setAttachAllegati] = useState<AllegatoDownload[]>([]);
  const [attachIncludeAll, setAttachIncludeAll] = useState(true);
  const [attachSelectedIds, setAttachSelectedIds] = useState<Set<string>>(new Set());
  const [attachLoading, setAttachLoading] = useState(false);
  useScrollLock(showStorico || showNoValutazioneModal || !!attachModalType);

  const prestazione = getPrestazione(incarico.tipologia_prestazione_id);

  async function handleOpenStorico() {
    setLoadingStorico(true);
    setShowStorico(true);
    const { data } = await supabase
      .from('storico_modifiche')
      .select('*')
      .eq('entity_type', 'incarico')
      .eq('entity_id', incarico.id)
      .order('created_at', { ascending: false });
    const items: StoricoModificaItem[] = data ?? [];
    setStoricoData(items);

    // Risolvi gli UUID nei valori (persone, ecc.) in etichette leggibili.
    setValueMap(await buildValueLabelMap(items));

    // Resolve user names
    const allUserIds = items.map(m => m.user_id).filter(Boolean) as string[];
    if ((incarico as any).user_id) allUserIds.push((incarico as any).user_id);
    if (allUserIds.length > 0) {
      const unique = [...new Set(allUserIds)];
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, email, nome, cognome')
        .in('user_id', unique);
      const nameMap: Record<string, string> = {};
      profiles?.forEach(m => {
        const fullName = [m.nome, m.cognome].filter(Boolean).join(' ');
        nameMap[m.user_id] = fullName || m.email || 'Utente';
      });
      setUserNameMap(nameMap);
      // Resolve creator name
      if ((incarico as any).user_id && nameMap[(incarico as any).user_id]) {
        setResolvedOwnerEmail(nameMap[(incarico as any).user_id]);
      }
    }
    setLoadingStorico(false);
  }

  async function fetchDocxData() {
    const { data: clienteRaw, error: clienteError } = await supabase
      .from('clienti').select('*').eq('id', incarico.cliente_id).single();
    if (clienteError) throw clienteError;
    const clienteData = await enrichClienteWithRappresentante(clienteRaw);

    const titolariData = await loadTitolariWithPersona(String(incarico.cliente_id));

    const { data: valutazioneData } = await supabase
      .from('valutazioni_rischio').select('*').eq('incarico_id', incarico.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    const { data: clienteDocs } = await supabase
      .from('documenti').select('tipologia, nome_file')
      .eq('cliente_id', incarico.cliente_id)
      .or(`incarico_id.is.null,incarico_id.eq.${incarico.id}`);

    const pIds = await findPersoneIdByCliente(String(incarico.cliente_id));
    let personaDocs: DocumentoAllegato[] = [];
    if (pIds.length > 0) {
      const { data: pDocs } = await supabase
        .from('documenti').select('tipologia, nome_file')
        .in('persona_id', pIds)
        .or(`incarico_id.is.null,incarico_id.eq.${incarico.id}`);
      personaDocs = pDocs || [];
    }
    const documentiData: DocumentoAllegato[] = [...(clienteDocs || []), ...personaDocs];

    const [studioInfo, profileInfo] = await Promise.all([getMyStudio(), getMyProfile()]);

    // Conta gli incarichi totali del cliente per spuntare automaticamente "Nuovo Cliente"
    // (=1 incarico) o "Cliente già identificato" (>1) nel modulo AV.3
    const { count: countIncarichi } = await supabase
      .from('incarichi')
      .select('*', { count: 'exact', head: true })
      .eq('cliente_id', incarico.cliente_id);

    return {
      cliente: clienteData,
      titolari_effettivi: titolariData || [],
      incarico: {
        ...incarico,
        scopo_natura: incarico.scopo_natura ?? null,
        relazioni_cliente_te: incarico.relazioni_cliente_te ?? null,
        provenienza_fondi: incarico.provenienza_fondi ?? null,
        mezzi_pagamento: incarico.mezzi_pagamento ?? null,
        importo_stimato: incarico.importo_stimato ?? null,
      },
      valutazione: valutazioneData || undefined,
      documenti: documentiData || undefined,
      nome_studio: studioInfo?.nome || undefined,
      studio_comune_sede: studioInfo?.comune_sede ?? null,
      studio_provincia_sede: studioInfo?.provincia_sede ?? null,
      studio_via_piazza_sede: studioInfo?.via_piazza_sede ?? null,
      studio_numero_civico_sede: studioInfo?.numero_civico_sede ?? null,
      studio_nome_proprietario: studioInfo?.nome_proprietario ?? null,
      studio_cognome_proprietario: studioInfo?.cognome_proprietario ?? null,
      studio_albo_sede: studioInfo?.albo_sede ?? null,
      studio_albo_numero: studioInfo?.albo_numero ?? null,
      studio_albo_sezione: studioInfo?.albo_sezione ?? null,
      responsabile_nome: profileInfo?.nome ?? null,
      responsabile_cognome: profileInfo?.cognome ?? null,
      numero_incarichi_cliente: countIncarichi ?? 0,
    };
  }

  async function handleGenerateDOCX(type: 'av1' | 'av3' | 'av4' | 'av5' | 'av6') {
    if (!incarico.cliente_id) {
      toast.warning('Dati incarico non completi');
      return;
    }
    // AV.1 non ha allegati: scarica direttamente
    if (type === 'av1') {
      setIsGeneratingDOCX(true);
      setDocxGenerationType(type);
      try {
        const docxData = await fetchDocxData();
        if (!docxData.valutazione) {
          setShowNoValutazioneModal(true);
          return;
        }
        await generateAndDownloadDOCX_AV1(docxData);
        addUserLog(`Esportazione documento AV.1 per incarico ${incarico.codice_incarico}`);
      } catch (error) {
        console.error('Errore generazione DOCX:', error);
        toast.error('Impossibile generare il DOCX. Riprovare o contattare il supporto.');
      } finally {
        setIsGeneratingDOCX(false);
        setDocxGenerationType(null);
      }
      return;
    }
    // AV.3/AV.4/AV.5/AV.6: apri modale selezione allegati
    openAttachModal(type);
  }

  function isCartaceo(doc: { file_path: string }): boolean {
    return !doc.file_path || doc.file_path.startsWith('*');
  }

  async function openAttachModal(type: 'av3' | 'av4' | 'av5' | 'av6') {
    setAttachModalType(type);
    setAttachIncludeAll(true);
    setAttachSelectedIds(new Set());
    setAttachLoading(true);
    try {
      const { data: docs } = await supabase
        .from('documenti').select('id, tipologia, nome_file, file_path')
        .eq('cliente_id', incarico.cliente_id)
        .or(`incarico_id.is.null,incarico_id.eq.${incarico.id}`);
      const pIds = await findPersoneIdByCliente(String(incarico.cliente_id));
      let personaDocs: AllegatoDownload[] = [];
      if (pIds.length > 0) {
        const { data: pDocs } = await supabase
          .from('documenti').select('id, tipologia, nome_file, file_path')
          .in('persona_id', pIds)
          .or(`incarico_id.is.null,incarico_id.eq.${incarico.id}`);
        personaDocs = pDocs || [];
      }
      const all = [...(docs || []), ...personaDocs];
      const unique = Array.from(new Map(all.map(d => [d.id, d])).values());
      setAttachAllegati(unique);
      setAttachSelectedIds(new Set(unique.map(d => d.id)));
    } catch {
      setAttachAllegati([]);
    } finally {
      setAttachLoading(false);
    }
  }

  async function handleDownloadWithAttachments() {
    const type = attachModalType;
    if (!type) return;
    setIsGeneratingDOCX(true);
    setDocxGenerationType(type);
    try {
      const docxData = await fetchDocxData();

      const attachIds = attachIncludeAll
        ? attachAllegati.map(d => d.id)
        : attachAllegati.filter(d => attachSelectedIds.has(d.id)).map(d => d.id);

      // Per AV.5 ci sono due allegati obbligatori: la "Dichiarazione del cliente ex art. 22"
      // (AV.4) e il "documento di identità del cliente". Se esistono versioni DIGITALI nel
      // fascicolo ma non sono state selezionate, chiediamo conferma prima di aggiungerle.
      // Per la Dichiarazione AV.4:
      //   - se esiste (anche solo cartacea) la elenchiamo sempre nell'AV.5, col file se digitale;
      //   - se non esiste in alcuna forma, chiediamo se includere il modello precompilato "DA_FIRMARE_".
      const LABEL_DICHIARAZIONE = 'Dichiarazione del cliente ex art. 22 d.lgs. 231/2007';
      let daFirmareAv4: { name: string; blob: Blob } | null = null;
      if (type === 'av5') {
        const MANDATORY_AV5 = [
          { tipologia: 'dichiarazione_av4', label: LABEL_DICHIARAZIONE },
          { tipologia: 'documento_identita', label: 'Documento di identità del cliente' },
        ];

        const missingDigital = MANDATORY_AV5.flatMap(m => {
          const digital = attachAllegati.find(d => d.tipologia === m.tipologia && !isCartaceo(d));
          if (digital && !attachIds.includes(digital.id)) {
            return [{ id: digital.id, label: m.label }];
          }
          return [];
        });

        if (missingDigital.length > 0) {
          const listStr = missingDigital.map(m => `• ${m.label}`).join('\n');
          const ok = await confirm({
            title: 'Allegati obbligatori per l\'AV.5',
            message: `I seguenti allegati sono richiesti dall'Attestazione AV.5 e sono presenti nel fascicolo ma non selezionati:\n\n${listStr}\n\nVuoi aggiungerli a questo download?`,
            confirmText: 'Sì, aggiungi',
            cancelText: 'No, procedi senza',
            variant: 'warning',
          });
          if (ok) {
            for (const m of missingDigital) {
              if (!attachIds.includes(m.id)) attachIds.push(m.id);
            }
          }
        }

        const av4Docs = attachAllegati.filter(d => d.tipologia === 'dichiarazione_av4');
        if (av4Docs.length === 0) {
          const ok = await confirm({
            title: 'Dichiarazione AV.4 mancante',
            message: 'La "Dichiarazione del cliente ex art. 22 d.lgs. 231/2007" (modulo AV.4) è obbligatoria per l\'Attestazione AV.5 ma non è presente nel fascicolo.\n\nVuoi includere il modello AV.4 precompilato da firmare come allegato?',
            confirmText: 'Sì, allega il modello',
            cancelText: 'No, procedi senza',
            variant: 'warning',
          });
          if (ok) {
            const av4Template = await generateBlobDOCX_AV4(docxData);
            const daFirmareName = `DA_FIRMARE_${av4Template.filename}`;
            daFirmareAv4 = { name: daFirmareName, blob: av4Template.blob };
          }
        }
      }

      // Sovrascrivi documenti nel DOCX con la selezione utente (per AV.3 che li elenca)
      const selectedDocs = attachAllegati.filter(d => attachIds.includes(d.id));
      docxData.documenti = selectedDocs.map<DocumentoAllegato>(d => ({ tipologia: d.tipologia, nome_file: d.nome_file }));

      if (type === 'av5') {
        // Il label "Dichiarazione del cliente ex art. 22 d.lgs. 231/2007" deve SEMPRE comparire
        // nell'elenco allegati dell'AV.5, anche se il file non è presente / non è stato scaricato.
        docxData.documenti = (docxData.documenti || []).filter(d => d.tipologia !== 'dichiarazione_av4');
        const av4Entry = selectedDocs.find(d => d.tipologia === 'dichiarazione_av4')
          || attachAllegati.find(d => d.tipologia === 'dichiarazione_av4');
        const av4NomeFile = daFirmareAv4?.name ?? av4Entry?.nome_file;
        docxData.documenti.push({
          tipologia: 'dichiarazione_av4',
          nome_file: av4NomeFile,
          label: LABEL_DICHIARAZIONE,
        });
      }

      let moduleBlob: { blob: Blob; filename: string };
      if (type === 'av3') moduleBlob = await generateBlobDOCX_AV3(docxData);
      else if (type === 'av4') moduleBlob = await generateBlobDOCX_AV4(docxData);
      else if (type === 'av5') moduleBlob = await generateBlobDOCX_AV5(docxData);
      else moduleBlob = await generateBlobDOCX_AV6(docxData);

      // Solo i digitali finiscono nello ZIP
      const digitalIds = attachIds.filter(id => {
        const d = attachAllegati.find(x => x.id === id);
        return d && !isCartaceo(d);
      });

      if (digitalIds.length > 0 || daFirmareAv4) {
        const toDownload = attachAllegati.filter(d => digitalIds.includes(d.id));
        const attachments: { name: string; blob: Blob }[] = [];
        for (const doc of toDownload) {
          try {
            const { data, error } = await supabase.storage.from('file_allegati').download(doc.file_path);
            if (!error && data) attachments.push({ name: doc.nome_file, blob: data });
          } catch { /* skip */ }
        }
        if (daFirmareAv4) attachments.push(daFirmareAv4);
        const zip = new JSZip();
        zip.folder('Moduli')!.file(moduleBlob.filename, moduleBlob.blob);
        if (attachments.length > 0) {
          const allegatiFolder = zip.folder('Allegati')!;
          for (const a of attachments) allegatiFolder.file(a.name, a.blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `AV${type.replace('av', '')}_${incarico.codice_incarico}.zip`);
      } else {
        saveAs(moduleBlob.blob, moduleBlob.filename);
      }

      addUserLog(`Esportazione documento AV.${type.replace('av', '')} per incarico ${incarico.codice_incarico}`);
    } catch (error) {
      console.error('Errore generazione DOCX:', error);
      toast.error('Impossibile generare il DOCX. Riprovare o contattare il supporto.');
    } finally {
      setIsGeneratingDOCX(false);
      setDocxGenerationType(null);
      setAttachModalType(null);
    }
  }


  async function handleDownloadBlankAV1() {
    setShowNoValutazioneModal(false);
    setIsGeneratingDOCX(true);
    setDocxGenerationType('av1');
    try {
      const docxData = await fetchDocxData();
      await generateAndDownloadDOCX_AV1(docxData, { blank: true });
      addUserLog(`Esportazione documento AV.1 (vuoto) per incarico ${incarico.codice_incarico}`);
    } catch (error) {
      console.error('Errore generazione DOCX vuoto:', error);
      toast.error('Impossibile generare il DOCX. Riprovare o contattare il supporto.');
    } finally {
      setIsGeneratingDOCX(false);
      setDocxGenerationType(null);
    }
  }

  async function handleGenerateDOCX_AV1ForValutazione(val: ValutazioneShared) {
    if (!incarico.cliente_id) {
      toast.warning('Dati incarico non completi');
      return;
    }
    setGeneratingAV1ForValId(val.id);
    try {
      const docxData = await fetchDocxData();
      // Override valutazione with the specific one selected
      docxData.valutazione = val;
      await generateAndDownloadDOCX_AV1(docxData);
      addUserLog(`Esportazione documento AV.1 per incarico ${incarico.codice_incarico}`);
    } catch (error) {
      console.error('Errore generazione DOCX AV1:', error);
      toast.error('Impossibile generare il DOCX. Riprovare o contattare il supporto.');
    } finally {
      setGeneratingAV1ForValId(null);
    }
  }

  const valIncarico = valutazioni.filter(v => v.incarico_id === incarico.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 mr-5">
          <button
            onClick={() => editing ? setEditing(false) : onBack()}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            title={editing ? 'Annulla modifica' : 'Torna alla lista'}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className='max-w-[700px]'>
            <h2 className="text-xl font-bold text-gray-900">
              {editing ? 'Modifica Incarico' : 'Dettaglio Incarico e Valutazioni'}
            </h2>
            <p className="text-gray-600 mt-1">
              {incarico.codice_incarico} — {prestazione?.label || incarico.descrizione}
            </p>
          </div>
        </div>
        {!editing && (
          <div className="flex items-center">
            <ActionsMenu
              items={[
                { label: 'Storico Modifiche', icon: FileClock, onClick: handleOpenStorico },
                { label: 'Modifica Incarico', icon: Edit3, onClick: () => setEditing(true), hidden: readOnly },
                {
                  label: 'Sposta nel cestino',
                  icon: Trash2,
                  variant: 'danger',
                  hidden: !puoCestina,
                  onClick: async () => {
                    const clausola = await clausolaRecuperoCestino();
                    const ok = await confirm({
                      message: `Spostare l'incarico "${incarico.codice_incarico}" nel cestino? ${clausola}`,
                      variant: 'danger',
                      confirmText: 'Sposta nel cestino',
                    });
                    if (!ok) return;
                    try {
                      await spostaNelCestino('incarico', incarico.id);
                      toast.success('Incarico spostato nel cestino');
                      onSaved();
                      onBack();
                    } catch (err: any) {
                      toast.error(err?.message || 'Errore nello spostamento nel cestino');
                    }
                  },
                },
              ]}
            />
          </div>
        )}
      </div>

      {editing ? (
        <ModificaIncaricoForm
          incarico={incarico}
          clienteNome={clienteNome}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          {/* Dettaglio incarico */}
          <DettaglioIncaricoView incarico={incarico} headerExtra={
            <div className="mb-4 flex gap-4 items-start">
              {/* Adeguata Verifica */}
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Adeguata Verifica</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleGenerateDOCX('av3')}
                    disabled={isGeneratingDOCX}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors text-xs font-medium"
                  >
                    {isGeneratingDOCX && docxGenerationType === 'av3' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    AV.3
                  </button>
                  <button
                    onClick={() => handleGenerateDOCX('av4')}
                    disabled={isGeneratingDOCX}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-violet-300 text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 disabled:opacity-50 transition-colors text-xs font-medium"
                  >
                    {isGeneratingDOCX && docxGenerationType === 'av4' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    AV.4
                  </button>
                </div>
              </div>
              <div className="w-px h-10 bg-gray-200 self-center" />
              {/* Attestazione / Astensione */}
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Attestazione / Astensione</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleGenerateDOCX('av5')}
                    disabled={isGeneratingDOCX}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-teal-300 text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 disabled:opacity-50 transition-colors text-xs font-medium"
                  >
                    {isGeneratingDOCX && docxGenerationType === 'av5' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    AV.5
                  </button>
                  <button
                    onClick={() => handleGenerateDOCX('av6')}
                    disabled={isGeneratingDOCX}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors text-xs font-medium"
                  >
                    {isGeneratingDOCX && docxGenerationType === 'av6' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    AV.6
                  </button>
                </div>
              </div>
            </div>
          } />

          {/* Documenti allegati */}
          {incarico.cliente_id && (
            <div className="border rounded-lg bg-white p-4">
              <DocumentiAllegati
                clienteId={String(incarico.cliente_id)}
                incaricoId={incarico.id}
                titolo="Documenti Allegati"
                readOnly={readOnly}
                personaIds={personaIds}
              />
            </div>
          )}

          {/* Storico valutazioni */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-bold text-gray-900">Storico Valutazioni</h3>
              {onAggiungiValutazione && !readOnly && (
                <button
                  onClick={onAggiungiValutazione}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Aggiungi Valutazione
                </button>
              )}
            </div>
            {valIncarico.length === 0 ? (
              <div className="border rounded-lg p-6 text-center bg-white text-gray-500 space-y-3">
                <p>Non sono state effettuate valutazioni per questo incarico.</p>
                <button
                  onClick={() => handleGenerateDOCX('av1')}
                  disabled={isGeneratingDOCX}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors text-xs font-medium"
                >
                  {isGeneratingDOCX && docxGenerationType === 'av1' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  AV.1
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {valIncarico.map((val, index) => (
                  <ValutazioneCard
                    key={val.id}
                    val={val}
                    index={index}
                    total={valIncarico.length}
                    onDownloadAV1={handleGenerateDOCX_AV1ForValutazione}
                    isGeneratingAV1={generatingAV1ForValId === val.id}
                    onCestina={(readOnly || !puoCestina) ? undefined : async (v) => {
                      const clausola = await clausolaRecuperoCestino();
                      const ok = await confirm({
                        message: `Spostare questa valutazione del rischio nel cestino? ${clausola}`,
                        variant: 'danger',
                        confirmText: 'Sposta nel cestino',
                      });
                      if (!ok) return;
                      try {
                        await spostaNelCestino('valutazione', v.id);
                        toast.success('Valutazione spostata nel cestino');
                        onSaved();
                      } catch (err: any) {
                        toast.error(err?.message || 'Errore nello spostamento nel cestino');
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Pannello Storico Modifiche */}
      <StoricoModifichePanel
        show={showStorico}
        onClose={() => setShowStorico(false)}
        loading={loadingStorico}
        modifiche={storicoData}
        creationInfo={incarico.created_at ? { created_at: incarico.created_at, ownerEmail: resolvedOwnerEmail || ownerEmail || 'Utente sconosciuto' } : null}
        userNameMap={userNameMap}
        valueMap={valueMap}
      />

      {/* Modale valutazione mancante per AV1 */}
      {showNoValutazioneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black bg-opacity-30" onClick={() => setShowNoValutazioneModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Valutazione non presente</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Per questo incarico non è ancora stata effettuata una valutazione del rischio.
                  Puoi comunque scaricare il modulo AV.1 da modificare successivamente su Word.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowNoValutazioneModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Chiudi
              </button>
              <button
                onClick={handleDownloadBlankAV1}
                disabled={isGeneratingDOCX}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
              >
                {isGeneratingDOCX ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Scarica modulo vuoto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale selezione allegati per AV.3/AV.4/AV.5/AV.6 */}
      {attachModalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black bg-opacity-30" onClick={() => !isGeneratingDOCX && setAttachModalType(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Scarica AV.{attachModalType.replace('av', '')}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{incarico.codice_incarico}</p>
              </div>
              <button
                onClick={() => setAttachModalType(null)}
                disabled={isGeneratingDOCX}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-3">
              <p className="text-sm font-semibold text-gray-700 mb-1">Documenti allegati <span className="text-gray-400 font-normal">(opzionale)</span></p>
              <div className="text-xs text-gray-500 mb-3">
                <p className="mb-1">Cosa succede ai documenti selezionati:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>Vengono elencati come allegati nei moduli che lo prevedono (<span className="font-semibold text-gray-700">AV.3</span>, <span className="font-semibold text-gray-700">AV.5</span>, <span className="font-semibold text-gray-700">AV.6</span>).</li>
                  <li>Se in formato digitale, vengono inclusi in un archivio <span className="font-semibold text-gray-700">.zip</span> insieme al modulo.</li>
                  <li>I documenti contrassegnati come <span className="font-semibold text-gray-700">Cartaceo</span> vengono solo citati nell'elenco del modulo: non essendo in formato digitale, non possono essere inclusi nell'archivio .zip.</li>
                </ul>
              </div>
              {attachLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento allegati...
                </div>
              ) : attachAllegati.length === 0 ? (
                <p className="text-sm text-gray-400 py-1">Nessun documento allegato disponibile per questo incarico.</p>
              ) : (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attachIncludeAll}
                      onChange={(e) => {
                        setAttachIncludeAll(e.target.checked);
                        setAttachSelectedIds(e.target.checked ? new Set(attachAllegati.map(d => d.id)) : new Set());
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Includi tutti i documenti allegati ({attachAllegati.length})
                      {(() => {
                        const cart = attachAllegati.filter(d => isCartaceo(d)).length;
                        return cart > 0 ? (
                          <span className="ml-1 text-xs font-normal text-amber-700">
                            · di cui {cart} cartace{cart === 1 ? 'o' : 'i'}
                          </span>
                        ) : null;
                      })()}
                    </span>
                  </label>
                  <p className="text-xs text-gray-400 ml-6 -mt-1">
                    {attachIncludeAll ? 'Tutti gli allegati verranno inclusi nello ZIP (i cartacei solo in elenco).' : 'Seleziona qui sotto i documenti da includere.'}
                  </p>
                  {!attachIncludeAll && (
                    <div className="ml-1 space-y-1.5 max-h-40 overflow-y-auto border-l-2 border-gray-100 pl-2 pr-1">
                      {attachAllegati.map(doc => {
                        const tipLabel = TIPOLOGIE_DOCUMENTO.find(t => t.value === doc.tipologia)?.label || doc.tipologia;
                        const cartaceo = isCartaceo(doc);
                        return (
                          <label key={doc.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={attachSelectedIds.has(doc.id)}
                              onChange={(e) => {
                                const next = new Set(attachSelectedIds);
                                if (e.target.checked) next.add(doc.id); else next.delete(doc.id);
                                setAttachSelectedIds(next);
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-600 truncate flex-1" title={`${tipLabel} — ${doc.nome_file}`}>
                              {tipLabel} — {doc.nome_file}
                            </span>
                            {cartaceo && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded flex-shrink-0" title="Documento cartaceo: apparirà solo nell'elenco del modulo DOCX, non nello ZIP">
                                Cartaceo
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 pt-2 flex-shrink-0 border-t border-gray-100 bg-white">
              <button
                onClick={handleDownloadWithAttachments}
                disabled={isGeneratingDOCX}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isGeneratingDOCX ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isGeneratingDOCX ? 'Generazione in corso...' : `Scarica AV.${attachModalType.replace('av', '')}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
