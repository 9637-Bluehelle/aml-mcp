import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';
import {
  Search, Plus, Edit3, Users, X, Save,
  UserCheck, FileText, ChevronDown, ChevronUp, Building2, User, Shield, AlertTriangle, ArrowUpDown, Trash2
} from 'lucide-react';
import { useConfirm, useToast } from './Toast';
import { spostaNelCestino, anagraficaInUso, clausolaRecuperoCestino } from '../lib/cestinoHelper';
import { useCestinaPermesso } from '../hooks/useCestinaPermesso';
import {
  listPersone, savePersona, findClientiAssociati, detectTipoSoggetto,
  type PersonaFisicaRecord, type ClienteAssociato, type TipoSoggetto
} from '../lib/personeHelper';
import { supabase } from '../lib/supabase';
import { addUserLog } from './LogUtente';
import { DocumentiAllegati, TIPOLOGIE_AZIENDA } from './DocumentiAllegati';
import { Spinner } from './cliente-wizard/modals/Spinner';
import { parseCodiceFiscale, formatDate, formatDateInv } from './cliente-wizard/components/forms/PersonaFisicaForm';
import { NAZIONALITA, getNazioneByNazionalita, isItaliana } from '../lib/nazionalitaHelper';
import { IndirizzoStructured } from './cliente-wizard/components/forms/IndirizzoStructured';
import { CodiceAtecoSearch } from './cliente-wizard/components/forms/CodiceAtecoSearch';
import { useStudio } from '../lib/StudioContext';

// ---------- Sotto-componente: badge ruolo ----------
function RuoloBadge({ ruolo }: { ruolo: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    cliente: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Cliente' },
    titolare_effettivo: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Titolare Effettivo' },
    rappresentante_legale: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Rapp. Legale' },
  };
  const c = config[ruolo] || { bg: 'bg-gray-100', text: 'text-gray-700', label: ruolo };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// ---------- Sotto-componente: riga clienti associati ----------
function ClientiAssociatiPanel({ persona, onCount }: { persona: PersonaFisicaRecord; onCount?: (n: number) => void }) {
  const [clienti, setClienti] = useState<ClienteAssociato[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await findClientiAssociati(persona);
      if (!cancelled) { setClienti(data); setLoading(false); onCount?.(data.length); }
    })();
    return () => { cancelled = true; };
  }, [persona.codice_fiscale]);

  if (loading) return <p className="text-xs text-gray-400 py-1">Caricamento associazioni...</p>;
  if (clienti.length === 0) return <p className="text-xs text-gray-400 py-1 italic">Nessun cliente associato</p>;

  return (
    <div className="space-y-1.5">
      {clienti.map((c) => (
        <div key={`${c.id}-${c.ruolo}`} className="flex items-center gap-2 text-sm">
          {c.tipo_cliente === 'impresa' ? (
            <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          ) : (
            <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          )}
          <span className="text-gray-700 font-medium">{c.ragione_sociale}</span>
          <span className="text-gray-400 text-xs">({c.codice_cliente})</span>
          <RuoloBadge ruolo={c.ruolo} />
        </div>
      ))}
    </div>
  );
}

// ---------- Form modale per creazione / modifica ----------
const emptyPersona: PersonaFisicaRecord = {
  tipo_soggetto: 'persona_fisica',
  nome_cognome: '', codice_fiscale: '', data_nascita: '', luogo_nascita: '',
  provincia_nascita: '', nazionalita: 'Italiana', professione: '', residenza: '',
  documento_tipo: '', documento_numero: '', documento_data_rilascio: '',
  documento_data_scadenza: '', documento_ente_rilascio: '',
  partita_iva: '', natura_giuridica: '', codice_ateco: '',
};

export function PersonaModal({
  persona,
  onClose,
  onSaved,
}: {
  persona: PersonaFisicaRecord | null; // null = nuova
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PersonaFisicaRecord>(() => {
    const base = persona || { ...emptyPersona };
    // Se ci sono campi nascita vuoti ma il CF è valido, recuperali dal codice fiscale
    if (base.codice_fiscale?.length === 16 &&
        (!base.data_nascita || !base.luogo_nascita || !base.provincia_nascita)) {
      const dati = parseCodiceFiscale(base.codice_fiscale);
      if (dati) {
        return {
          ...base,
          data_nascita: base.data_nascita || formatDate(dati.data_nascita),
          luogo_nascita: base.luogo_nascita || dati.comune || '',
          provincia_nascita: base.provincia_nascita || dati.provincia || '',
        };
      }
    }
    return base;
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [newDocCartaceo, setNewDocCartaceo] = useState(false);
  const [newDocScadenza, setNewDocScadenza] = useState('');
  const [newDocDescrizione, setNewDocDescrizione] = useState('');
  // Per azienda l'utente sceglie la tipologia; per PF resta sempre 'documento_identita'
  const [newDocTipologia, setNewDocTipologia] = useState<string>('documento_identita');
  // Riferimento alla funzione che forza il caricamento di un eventuale documento
  // pendente nel dialog di DocumentiAllegati (utente che inserisce un file/cartaceo
  // ma clicca "Salva Modifiche" senza premere "Carica").
  const flushDocUploadRef = useRef<(() => Promise<boolean>) | null>(null);
  const [residenzaEstera, setResidenzaEstera] = useState(() => {
    // Rileva se la residenza è estera (formato "NAZIONE | indirizzo")
    const res = (persona || emptyPersona).residenza || '';
    return res.includes(' | ') && !isItaliana((persona || emptyPersona).nazionalita);
  });
  const isNew = !persona?.id;
  // Tipo effettivo: usa quello salvato; per dati legacy/precompilati senza tipo_soggetto,
  // deduci dal CF (11 cifre numeriche → azienda, 16 alfanumerico → persona)
  const tipoEffettivo: TipoSoggetto =
    form.tipo_soggetto
      ?? detectTipoSoggetto(form.codice_fiscale)
      ?? 'persona_fisica';
  const isAzienda = tipoEffettivo === 'azienda';
  // Una volta che l'utente tocca il toggle, disattiviamo l'autodetect da CF
  const [tipoManuale, setTipoManuale] = useState(false);

  // Persiste sul form il tipo dedotto se mancante (al primo render)
  useEffect(() => {
    if (!form.tipo_soggetto && tipoEffettivo) {
      setForm(prev => ({ ...prev, tipo_soggetto: tipoEffettivo }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function upd(field: keyof PersonaFisicaRecord, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleTipoChange(nuovo: TipoSoggetto) {
    setTipoManuale(true);
    setForm(prev => ({ ...prev, tipo_soggetto: nuovo }));
  }

  function handleCodiceFiscaleChange(cf: string) {
    cf = cf.toUpperCase();

    // Autodetect: se l'utente non ha scelto manualmente il tipo, propaga dal CF
    const detected = detectTipoSoggetto(cf);
    const nextTipo: TipoSoggetto =
      !tipoManuale && detected ? detected : (form.tipo_soggetto || 'persona_fisica');

    // Per CF persona fisica di 16 char, popola anche data/luogo/provincia nascita
    if (nextTipo === 'persona_fisica') {
      const dati = parseCodiceFiscale(cf);
      if (dati) {
        setForm(prev => ({
          ...prev,
          tipo_soggetto: nextTipo,
          codice_fiscale: cf,
          data_nascita: formatDate(dati.data_nascita),
          luogo_nascita: dati.comune || '',
          provincia_nascita: dati.provincia || '',
        }));
        return;
      }
    }

    setForm(prev => ({
      ...prev,
      tipo_soggetto: nextTipo,
      codice_fiscale: cf,
      // Per azienda con CF a 11 cifre, ricopia su partita IVA se non è stata inserita manualmente
      ...(nextTipo === 'azienda' && /^\d{11}$/.test(cf) && !prev.partita_iva
        ? { partita_iva: cf }
        : {}),
    }));
  }

  async function handleSave() {
    if (saving) return; // guard doppio submit (doppio click / Enter): evita anagrafiche+documenti duplicati
    if (!form.nome_cognome.trim()) return;
    setSaving(true);
    const wasNew = isNew;
    const savedId = await savePersona(form);

    if (savedId) {
      const tipoLabel = isAzienda ? 'azienda' : 'persona';
      addUserLog(
        wasNew
          ? `Nuovo soggetto creato (${tipoLabel}): ${form.nome_cognome}`
          : `Soggetto aggiornato (${tipoLabel}): ${form.nome_cognome}`
      );
    }

    // Se è una nuova anagrafica e c'è un file/cartaceo, crea il documento associato
    if (isNew && savedId && (newDocFile || newDocCartaceo)) {
      let storagePath = '';
      let nomeFile = '';

      const tipologiaLabel = isAzienda
        ? (TIPOLOGIE_AZIENDA.find(t => t.value === newDocTipologia)?.label || 'Documento')
        : 'Documento di identità';

      if (newDocCartaceo) {
        storagePath = '*Non disponibile perchè acquisito in formato cartaceo*';
        nomeFile = `${tipologiaLabel} (cartaceo)`;
      } else if (newDocFile) {
        const timestamp = Date.now();
        const safeName = newDocFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, m => m.toLowerCase());
        // La storage policy richiede che il path inizi con un cliente_id valido.
        // Risaliamo al cliente associato alla persona.
        let folderId = savedId;
        const { data: associatedCliente } = await supabase
          .from('clienti')
          .select('id')
          .eq('persona_id', savedId)
          .limit(1)
          .maybeSingle();
        if (associatedCliente) folderId = associatedCliente.id;
        storagePath = `${folderId}/${timestamp}_${safeName}`;
        const { error: upErr } = await supabase.storage.from('file_allegati').upload(storagePath, newDocFile);
        if (upErr) {
          toast.error('Caricamento file fallito: ' + upErr.message);
          setSaving(false);
          return;
        }
        nomeFile = newDocFile.name;
      }

      const { error: docErr } = await supabase.from('documenti').insert({
        persona_id: savedId,
        cliente_id: null,
        incarico_id: null,
        tipologia: isAzienda ? newDocTipologia : 'documento_identita',
        nome_file: nomeFile,
        descrizione: newDocDescrizione,
        file_path: storagePath,
        data_scadenza: newDocScadenza || null,
      });
      if (docErr) {
        // Niente riga "fantasma": se l'insert fallisce dopo un upload riuscito, rimuovi il file.
        if (!newDocCartaceo && newDocFile && storagePath) {
          await supabase.storage.from('file_allegati').remove([storagePath]);
        }
        toast.error('Salvataggio documento fallito: ' + docErr.message);
        setSaving(false);
        return;
      }
    }

    // Modifica anagrafica: se l'utente ha compilato il dialog di upload documento
    // in DocumentiAllegati senza premere "Carica", salviamo comunque il file.
    if (!isNew && flushDocUploadRef.current) {
      const ok = await flushDocUploadRef.current();
      if (!ok) {
        // Campi obbligatori mancanti o upload fallito: l'utente è già stato avvisato
        // via toast dentro DocumentiAllegati. Non chiudiamo il modale.
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              {isNew ? <Plus className="w-5 h-5 text-blue-600" /> : <Edit3 className="w-5 h-5 text-blue-600" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {isNew ? 'Nuova Anagrafica' : 'Modifica Anagrafica'}
              </h2>
              <p className="text-xs text-gray-500">
                {isNew
                  ? (isAzienda ? 'Inserisci i dati dell\'azienda' : 'Inserisci i dati della persona fisica')
                  : form.nome_cognome}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Selettore tipo anagrafica */}
          <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => handleTipoChange('persona_fisica')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                !isAzienda ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <User className="w-4 h-4" />
              Persona fisica
            </button>
            <button
              type="button"
              onClick={() => handleTipoChange('azienda')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                isAzienda ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Azienda
            </button>
          </div>

          {/* Dati anagrafici */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              {isAzienda ? <Building2 className="w-4 h-4 text-blue-500" /> : <UserCheck className="w-4 h-4 text-blue-500" />}
              {isAzienda ? 'Dati Azienda' : 'Dati Anagrafici'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className={labelCls}>{isAzienda ? 'Ragione Sociale *' : 'Nome e Cognome *'}</label>
                <input
                  className={inputCls}
                  value={form.nome_cognome}
                  onChange={e => upd('nome_cognome', e.target.value)}
                  placeholder={isAzienda ? 'es. ALPHA S.R.L.' : 'es. Mario Rossi'}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>{isAzienda ? 'Codice Fiscale Azienda' : 'Codice Fiscale'}</label>
                <input
                  className={inputCls}
                  value={form.codice_fiscale}
                  onChange={e => handleCodiceFiscaleChange(e.target.value)}
                  placeholder={isAzienda ? 'es. 12345678901 (11 cifre)' : 'es. RSSMRA80A01H501Z'}
                  maxLength={isAzienda ? 11 : 16}
                />
              </div>

              {isAzienda ? (
                <>
                  <div>
                    <label className={labelCls}>Partita IVA</label>
                    <input
                      className={inputCls}
                      value={form.partita_iva || ''}
                      onChange={e => upd('partita_iva', e.target.value)}
                      placeholder="es. 12345678901"
                      maxLength={11}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Natura Giuridica</label>
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                      <select
                        className="w-full rounded-lg bg-white text-sm focus:outline-none focus:ring-0"
                        value={form.natura_giuridica || ''}
                        onChange={e => upd('natura_giuridica', e.target.value)}
                      >
                        <option value="">-- Seleziona --</option>
                        <option value="SRL">S.R.L.</option>
                        <option value="SPA">S.P.A.</option>
                        <option value="SAS">S.A.S.</option>
                        <option value="SNC">S.N.C.</option>
                        <option value="SS">Società Semplice</option>
                        <option value="cooperativa">Cooperativa</option>
                        <option value="ditta_individuale">Ditta Individuale</option>
                        <option value="altro">Altro</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={labelCls}>Data di Nascita (gg/mm/aaaa)</label>
                    <input
                      type="date"
                      className={inputCls}
                      onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                      value={formatDateInv(form.data_nascita || '')}
                      onChange={e => upd('data_nascita', formatDate(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Luogo di Nascita</label>
                    <input className={inputCls} value={form.luogo_nascita} onChange={e => upd('luogo_nascita', e.target.value)} placeholder="es. Roma" />
                  </div>
                  <div>
                    <label className={labelCls}>Provincia di Nascita</label>
                    <input className={inputCls} value={form.provincia_nascita} onChange={e => upd('provincia_nascita', e.target.value.toUpperCase())} placeholder="es. RM" maxLength={2} />
                  </div>
                </>
              )}

              {!isAzienda && (
                <div>
                  <label className={labelCls}>Professione</label>
                  <input
                    className={inputCls}
                    value={form.professione}
                    onChange={e => upd('professione', e.target.value)}
                    placeholder="es. Commercialista"
                  />
                </div>
              )}
              <div>
                <label className={labelCls}>Nazionalità</label>
                <div className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                  <select
                    className="w-full rounded-lg bg-white text-sm focus:outline-none focus:ring-0"
                    value={form.nazionalita || 'Italiana'}
                    onChange={e => {
                      upd('nazionalita', e.target.value);
                      if (isItaliana(e.target.value) && residenzaEstera) {
                        setResidenzaEstera(false);
                      }
                    }}
                  >
                    {NAZIONALITA.map(n => (
                      <option key={n.nazionalita} value={n.nazionalita}>{n.nazionalita}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {isAzienda && (
              <div className="mt-3">
                <CodiceAtecoSearch
                  codiceAteco={form.codice_ateco || ''}
                  attivitaSvolta=""
                  onSelect={(codice) => {
                    setForm(prev => ({ ...prev, codice_ateco: codice }));
                  }}
                />
              </div>
            )}
          </div>

          {/* Residenza / Sede legale con IndirizzoStructured */}
          <IndirizzoStructured
            label={isAzienda ? 'Sede Legale' : 'Residenza'}
            value={form.residenza || ''}
            onChange={(val) => upd('residenza', val)}
            nazionalitaEstera={!isItaliana(form.nazionalita)}
            nazione={getNazioneByNazionalita(form.nazionalita || '') || ''}
            residenzaEstera={residenzaEstera}
            onResidenzaEsteraChange={setResidenzaEstera}
          />

          {/* Documento — solo per persone fisiche */}
          {!isAzienda && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-500" />
              Documento di Identità
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Tipo Documento</label>
                <div className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                  <select className="w-full rounded-lg bg-white text-sm focus:outline-none focus:ring-0" value={form.documento_tipo || ''} onChange={e => upd('documento_tipo', e.target.value)}>
                    <option value="">-- Seleziona --</option>
                    <option value="carta-identita">Carta d'Identità</option>
                    <option value="passaporto">Passaporto</option>
                    <option value="patente">Patente di Guida</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Numero Documento</label>
                <input className={inputCls} value={form.documento_numero || ''} onChange={e => upd('documento_numero', e.target.value)} placeholder="es. AB123456" />
              </div>
              <div>
                <label className={labelCls}>Data Rilascio (gg/mm/aaaa)</label>
                <input
                  type="date"
                  className={inputCls}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                  value={formatDateInv(form.documento_data_rilascio || '')}
                  onChange={e => upd('documento_data_rilascio', formatDate(e.target.value))}
                />
              </div>
              <div>
                <label className={labelCls}>Data Scadenza (gg/mm/aaaa)</label>
                <input
                  type="date"
                  className={inputCls}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                  value={formatDateInv(form.documento_data_scadenza || '')}
                  onChange={e => {
                    upd('documento_data_scadenza', formatDate(e.target.value));
                    // Sincronizza la data anche nella card "Carica o Registra Documento"
                    // (per PF è lo stesso documento di identità).
                    if (isNew && !isAzienda) setNewDocScadenza(e.target.value);
                  }}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Ente di Rilascio</label>
                <input className={inputCls} value={form.documento_ente_rilascio || ''} onChange={e => upd('documento_ente_rilascio', e.target.value)} placeholder="es. Comune di Roma" />
              </div>

            </div>
          </div>
          )}

          {/* Upload documento — sia PF (documento identità) sia azienda (tipologia a scelta) */}
          {isNew && (
            <div className="space-y-2">
            <p className="text-xs text-gray-400 italic">
              Facoltativo — il documento può essere caricato anche in un secondo momento{isAzienda ? ' (potrai aggiungerne altri dopo il salvataggio)' : ''}.
            </p>
            <div className="border-2 border-blue-200 bg-blue-50 rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-900 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Carica o Registra Documento
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipologia *</label>
                  {isAzienda ? (
                    <div className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                      <select
                        value={newDocTipologia}
                        onChange={e => setNewDocTipologia(e.target.value)}
                        className="w-full rounded-lg bg-white text-sm focus:outline-none focus:ring-0"
                      >
                        {TIPOLOGIE_AZIENDA.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                      Documento di identità
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data scadenza {isAzienda ? '' : '*'} (gg/mm/aaaa)</label>
                  <input
                    type="date"
                    value={newDocScadenza}
                    onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                    onChange={e => setNewDocScadenza(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
                  <input
                    type="text"
                    value={newDocDescrizione}
                    onChange={e => setNewDocDescrizione(e.target.value)}
                    placeholder="Descrizione opzionale..."
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="new_doc_cartaceo"
                  checked={newDocCartaceo}
                  onChange={e => { setNewDocCartaceo(e.target.checked); if (e.target.checked) setNewDocFile(null); }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="new_doc_cartaceo" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Documento cartaceo (non disponibile digitalmente)
                </label>
              </div>

              {!newDocCartaceo && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
                  <p className="text-xs text-gray-500 mb-2">
                    Sono supportati esclusivamente file in formato <strong>PDF</strong> o <strong>PDF/A</strong>.
                  </p>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={e => setNewDocFile(e.target.files?.[0] || null)}
                    className="w-full text-sm border rounded-lg px-3 py-2 file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-blue-100 file:text-blue-700 file:text-sm file:cursor-pointer"
                  />
                </div>
              )}
            </div>
            </div>
          )}
          {/* Documenti allegati — solo per anagrafiche già salvate */}
          {!isNew && form.id && (
            <DocumentiAllegati
              personaId={form.id}
              titolo={isAzienda ? 'Documenti Azienda' : 'Documento di Identità'}
              tipologiaFilter={isAzienda ? undefined : 'documento_identita'}
              soggettoTipo={isAzienda ? 'azienda' : 'persona_fisica'}
              defaultDataScadenza={!isAzienda ? formatDateInv(form.documento_data_scadenza || '') : undefined}
              onFlushUploadRef={(fn) => { flushDocUploadRef.current = fn; }}
            />
          )}

          {/* Verifica PEP e Sanzioni — solo per persone fisiche */}
          {!isAzienda && (
          <div className='pt-5'>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-500" />
              Verifica PEP e Sanzioni
            </h3>
            <div className="space-y-4">
              {/* PEP */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-semibold text-blue-900">Verifica PPE (Persona Politicamente Esposta)</h4>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.pep_verificato || false}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        pep_verificato: e.target.checked,
                        pep_data_verifica: e.target.checked ? formatDate(new Date().toISOString().slice(0, 10)) : '',
                      }))}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm">Verifica PPE effettuata</span>
                  </label>
                  {form.pep_verificato && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.pep || false}
                        onChange={e => setForm(prev => ({ ...prev, pep: e.target.checked }))}
                        className="rounded text-red-600"
                      />
                      <span className="text-sm font-medium text-red-700">Il soggetto risulta PPE</span>
                    </label>
                  )}
                </div>
                {form.pep_verificato && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Data verifica (gg/mm/aaaa)</label>
                      <input
                        type="date"
                        className={inputCls}
                        onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                        value={formatDateInv(form.pep_data_verifica || '')}
                        onChange={e => setForm(prev => ({ ...prev, pep_data_verifica: formatDate(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Fonte verifica</label>
                      <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                        <select
                          className="w-full rounded-lg text-sm bg-white focus:outline-none focus:ring-0"
                          value={form.pep_fonte_verifica || ''}
                          onChange={e => setForm(prev => ({ ...prev, pep_fonte_verifica: e.target.value }))}
                        >
                          <option value="">Seleziona fonte...</option>
                          <option value="autodichiarazione">Autodichiarazione cliente</option>
                          <option value="banca_dati">Banca dati specializzata</option>
                          <option value="lista_anac">Lista ANAC</option>
                          <option value="registro_te">Registro Titolari Effettivi</option>
                          <option value="altra_fonte">Altra fonte</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
                {form.pep && (
                  <div>
                    <label className={labelCls}>Carica ricoperta</label>
                    <input
                      type="text"
                      className={inputCls}
                      value={form.pep_carica || ''}
                      onChange={e => setForm(prev => ({ ...prev, pep_carica: e.target.value }))}
                      placeholder="es. Parlamentare, Sindaco..."
                    />
                  </div>
                )}
              </div>

              {/* Sanzioni */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-semibold text-blue-900">Verifica Liste Sanzioni / Embargo</h4>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.sanzioni_verificato || false}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        sanzioni_verificato: e.target.checked,
                        sanzioni_data_verifica: e.target.checked ? formatDate(new Date().toISOString().slice(0, 10)) : '',
                      }))}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm">Verifica sanzioni effettuata</span>
                  </label>
                  {form.sanzioni_verificato && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.sanzioni || false}
                        onChange={e => setForm(prev => ({ ...prev, sanzioni: e.target.checked }))}
                        className="rounded text-red-600"
                      />
                      <span className="text-sm font-medium text-red-700">Presente in liste sanzioni</span>
                    </label>
                  )}
                </div>
                {form.sanzioni_verificato && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Data verifica (gg/mm/aaaa)</label>
                      <input
                        type="date"
                        className={inputCls}
                        onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                        value={formatDateInv(form.sanzioni_data_verifica || '')}
                        onChange={e => setForm(prev => ({ ...prev, sanzioni_data_verifica: formatDate(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Fonte verifica</label>
                      <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                        <select
                          className="w-full rounded-lg text-sm bg-white focus:outline-none focus:ring-0"
                          value={form.sanzioni_fonte_verifica || ''}
                          onChange={e => setForm(prev => ({ ...prev, sanzioni_fonte_verifica: e.target.value }))}
                        >
                          <option value="">Seleziona fonte...</option>
                          <option value="liste_ue">Liste UE</option>
                          <option value="liste_onu">Liste ONU</option>
                          <option value="ofac">OFAC (USA)</option>
                          <option value="banca_dati">Banca dati specializzata</option>
                          <option value="altra_fonte">Altra fonte</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Note verifica */}
              <div>
                <label className={labelCls}>Note di Verifica</label>
                <textarea
                  className={inputCls}
                  rows={2}
                  value={form.note_verifica || ''}
                  onChange={e => setForm(prev => ({ ...prev, note_verifica: e.target.value }))}
                  placeholder="Note aggiuntive sulla verifica..."
                />
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-100 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.nome_cognome.trim() || (isNew && !isAzienda && !newDocScadenza && (!!newDocFile || newDocCartaceo))}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvataggio...' : isNew ? 'Crea Anagrafica' : 'Salva Modifiche'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------- Card singola persona (slide verticale) ----------
const CARD_HEIGHT = 190; // px – altezza fissa per tutte le card

function PersonaCard({
  persona,
  onEdit,
  onCestina,
}: {
  persona: PersonaFisicaRecord;
  onEdit: () => void;
  onCestina?: () => void;
}) {
  const [showClienti, setShowClienti] = useState(false);
  const [clientiCount, setClientiCount] = useState<number | null>(null);

  const docLabel: Record<string, string> = {
    carta_identita: "Carta d'Identità",
    patente: 'Patente',
    passaporto: 'Passaporto',
  };
  const isAzienda = persona.tipo_soggetto === 'azienda';

  return (
    <div className="relative rounded-xl border border-gray-200 hover:border-blue-200 hover:shadow-md transition-colors duration-200 overflow-hidden bg-white" style={{ height: CARD_HEIGHT }}>
      {/* ===== FRONTE (dati anagrafici) ===== */}
      <div className="absolute inset-0 flex flex-col">
        {/* Header + info */}
        <div className="px-5 py-4 flex-1 min-h-0 overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 bg-gradient-to-br ${isAzienda ? 'from-amber-500 to-amber-600' : 'from-blue-500 to-blue-600'} rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0`}>
                {isAzienda
                  ? <Building2 className="w-5 h-5" />
                  : persona.nome_cognome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{persona.nome_cognome}</h3>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${isAzienda ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                    {isAzienda ? 'Azienda' : 'Persona'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {persona.codice_fiscale && (
                    <span className="text-xs text-gray-500 font-mono bg-gray-50 px-1.5 py-0.5 rounded">
                      {persona.codice_fiscale}
                    </span>
                  )}
                  {isAzienda && persona.partita_iva && persona.partita_iva !== persona.codice_fiscale && (
                    <span className="text-xs text-gray-500 font-mono bg-gray-50 px-1.5 py-0.5 rounded">
                      P.IVA {persona.partita_iva}
                    </span>
                  )}
                  {!isAzienda && persona.professione && (
                    <span className="text-xs text-gray-500 truncate">{persona.professione}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onEdit} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Modifica">
                <Edit3 className="w-4 h-4" />
              </button>
              {onCestina && (
                <button onClick={onCestina} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Sposta nel cestino">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Info rapide */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {isAzienda ? (
              <>
                {persona.natura_giuridica && <span>{persona.natura_giuridica}</span>}
                {persona.codice_ateco && <span>ATECO {persona.codice_ateco}</span>}
                {persona.residenza && <span className="truncate max-w-full">Sede: {persona.residenza.split(' | ').slice(-1)[0]}</span>}
                {persona.nazionalita && persona.nazionalita !== 'Italiana' && <span>Naz: {persona.nazionalita}</span>}
              </>
            ) : (
              <>
            {persona.data_nascita && <span>Nato/a il {persona.data_nascita}</span>}
            {persona.luogo_nascita && <span>a {persona.luogo_nascita}{persona.provincia_nascita ? ` (${persona.provincia_nascita})` : ''}</span>}
            {persona.nazionalita && persona.nazionalita !== 'Italiana' && <span>Naz: {persona.nazionalita}</span>}
            {persona.documento_tipo && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {docLabel[persona.documento_tipo] || persona.documento_tipo}
                {persona.documento_numero && ` n. ${persona.documento_numero}`}
              </span>
            )}
              </>
            )}
            {persona.pep && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                <AlertTriangle className="w-3 h-3" /> PEP
              </span>
            )}
            {persona.sanzioni && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                <Shield className="w-3 h-3" /> Sanzioni
              </span>
            )}
          </div>
        </div>

        {/* Bottone "Clienti associati" – sempre in basso */}
        <div className="border-t border-gray-100 shrink-0">
          <button
            onClick={() => setShowClienti(true)}
            className="w-full px-5 py-2.5 flex items-center justify-between text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Clienti associati o Ruoli
              {clientiCount !== null && clientiCount > 0 && (
                <span className="inline-flex items-center justify-center w-4.5 h-4.5 px-1 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold">
                  {clientiCount}
                </span>
              )}
            </span>
            <ChevronUp className="w-3.5 h-3.5" /> 
          </button>
        </div>
      </div>

      {/* ===== RETRO (clienti associati) – sale dal basso ===== */}
      <div
        className="absolute inset-0 flex flex-col bg-white transition-transform duration-400 ease-in-out"
        style={{ transform: showClienti ? 'translateY(0)' : 'translateY(100%)' }}
      >
        {/* Header retro */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Clienti associati
                {clientiCount !== null && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] font-bold align-middle">
                    {clientiCount}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-gray-400 truncate max-w-[180px]">{persona.nome_cognome}</p>
            </div>
          </div>
          <button
            onClick={() => setShowClienti(false)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Torna ai dati"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenuto clienti */}
        <div className="px-5 py-3 flex-1 min-h-0 overflow-y-auto">
          <ClientiAssociatiPanel persona={persona} onCount={setClientiCount} />
        </div>

        {/* Bottone torna indietro */}
        <div className="border-t border-gray-100 shrink-0">
          <button
            onClick={() => setShowClienti(false)}
            className="w-full px-5 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            Torna ai dati anagrafici
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Componente principale ----------
export function AnagraficaPersone() {
  const { activeStudioId } = useStudio();
  const confirm = useConfirm();
  const toast = useToast();
  const [persone, setPersone] = useState<PersonaFisicaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'tutti' | 'persona_fisica' | 'azienda'>('tutti');
  // Ordinamento lista anagrafica
  type SortOption = { field: keyof PersonaFisicaRecord; dir: 'asc' | 'desc'; label: string };
  const sortOptions: SortOption[] = [
    { field: 'created_at', dir: 'desc', label: 'Più recenti' },
    { field: 'created_at', dir: 'asc', label: 'Meno recenti' },
    { field: 'nome_cognome', dir: 'asc', label: 'Nome A→Z' },
    { field: 'nome_cognome', dir: 'desc', label: 'Nome Z→A' },
  ];
  const [sortIndex, setSortIndex] = useState(0);
  const [modalPersona, setModalPersona] = useState<PersonaFisicaRecord | null | undefined>(undefined);
  // undefined = chiuso, null = nuova, PersonaFisicaRecord = modifica
  useScrollLock(modalPersona !== undefined);

  // Sequence counter per scartare risposte di fetch obsolete (es. la richiesta
  // iniziale "tutti" che ritorna dopo una ricerca filtrata e la sovrascrive).
  const loadSeqRef = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    const data = await listPersone(search, activeStudioId);
    if (seq !== loadSeqRef.current) return; // arrivata in ritardo, ignora
    setPersone(data);
    setLoading(false);
  }, [search, activeStudioId]);

  const puoCestina = useCestinaPermesso();

  const handleCestina = async (p: PersonaFisicaRecord) => {
    if (!p.id) return;
    // Pre-check: se è ancora collegata, avvisa senza chiamare la RPC (evita il 400 in console).
    if (await anagraficaInUso(p.id)) {
      toast.warning('Impossibile spostare nel cestino: l\'anagrafica è ancora collegata a clienti, titolari, catena di controllo o documenti attivi.');
      return;
    }
    const clausola = await clausolaRecuperoCestino();
    const ok = await confirm({
      message: `Spostare "${p.nome_cognome}" nel cestino? ${clausola}`,
      variant: 'danger',
      confirmText: 'Sposta nel cestino',
    });
    if (!ok) return;
    try {
      await spostaNelCestino('anagrafica', p.id);
      toast.success('Anagrafica spostata nel cestino');
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Impossibile spostare nel cestino');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load]);

  // Applica il filtro tipo lato client (autodetect via CF per record legacy senza tipo_soggetto)
  const filteredPersone = persone
    .filter(p => {
      if (tipoFilter === 'tutti') return true;
      const t = p.tipo_soggetto ?? detectTipoSoggetto(p.codice_fiscale) ?? 'persona_fisica';
      return t === tipoFilter;
    })
    .sort((a, b) => {
      const opt = sortOptions[sortIndex];
      const va = (a[opt.field] ?? '') as string;
      const vb = (b[opt.field] ?? '') as string;
      const cmp = va.localeCompare(vb, 'it', { numeric: true });
      return opt.dir === 'asc' ? cmp : -cmp;
    });


  return (
    <div className="space-y-6">
      <div className="sticky top-28 z-20 bg-gray-50 pt-2 pb-3 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            Anagrafica
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestisci l'anagrafica centralizzata di persone fisiche e aziende
          </p>
        </div>
        <button
          onClick={() => setModalPersona(null)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nuovo Soggetto
        </button>
      </div>

      {/* Barra ricerca */}
      <div className="space-y-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per nome, ragione sociale, codice fiscale o P.IVA..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Contatore + filtro tipo */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-gray-500">
            {filteredPersone.length} {filteredPersone.length === 1 ? 'soggetto' : 'soggetti'}
            {(search || tipoFilter !== 'tutti') && persone.length !== filteredPersone.length && ` (di ${persone.length})`}
          </span>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filtro tipo */}
            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg text-xs font-medium">
              {([
                { value: 'tutti', label: 'Tutti', icon: null },
                { value: 'persona_fisica', label: 'Persone', icon: User },
                { value: 'azienda', label: 'Aziende', icon: Building2 },
              ] as const).map(opt => {
                const Icon = opt.icon;
                const active = tipoFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTipoFilter(opt.value)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                      active ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Ordinatore */}
            <div className="flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-gray-400" />
              <div className="border border-gray-200 bg-white rounded-md px-2 py-1 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
                <select
                  value={sortIndex}
                  onChange={(e) => setSortIndex(Number(e.target.value))}
                  className="text-xs text-gray-600 bg-white focus:outline-none focus:ring-0"
                >
                  {sortOptions.map((opt, i) => (
                    <option key={i} value={i}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Lista */}
      {loading ? (
        <Spinner />
      ) : filteredPersone.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            {(search || tipoFilter !== 'tutti') ? 'Nessun risultato' : 'Nessuna anagrafica'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {(search || tipoFilter !== 'tutti')
              ? 'Prova a modificare i termini di ricerca o il filtro per tipo.'
              : 'Le anagrafiche vengono create automaticamente quando inserisci nuovi clienti, oppure puoi crearne una manualmente.'}
          </p>
          {!search && tipoFilter === 'tutti' && (
            <button
              onClick={() => setModalPersona(null)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Crea prima anagrafica
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPersone.map((p) => (
            <PersonaCard
              key={p.id}
              persona={p}
              onEdit={() => setModalPersona(p)}
              onCestina={puoCestina ? () => handleCestina(p) : undefined}
            />
          ))}
        </div>
      )}

      {/* Modale creazione / modifica */}
      {modalPersona !== undefined && (
        <PersonaModal
          persona={modalPersona}
          onClose={() => setModalPersona(undefined)}
          onSaved={() => { setModalPersona(undefined); load(); }}
        />
      )}

    </div>
  );
}
