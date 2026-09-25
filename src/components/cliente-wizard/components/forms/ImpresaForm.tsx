import { WizardData } from '../../types';
import { isValidDate } from '../../utils';
import { parseCodiceFiscale } from './PersonaFisicaForm';
import { useEffect, useState } from 'react';
import { User, Building2, Search } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import {formatDate, formatDateInv, normalizeDate} from './PersonaFisicaForm';
import { AnagraficaSearchInput } from '../../../AnagraficaSearchInput';
import type { PersonaFisicaRecord } from '../../../../lib/personeHelper';
import { detectTipoSoggetto } from '../../../../lib/personeHelper';
import { useCfConflictCheck } from '../../../../lib/useCfConflictCheck';
import { IndirizzoStructured } from './IndirizzoStructured';
import { NAZIONALITA, getNazioneByNazionalita, isItaliana, normalizeNazionalita } from '../../../../lib/nazionalitaHelper';
import { CodiceAtecoSearch } from './CodiceAtecoSearch';
import { CodiceRaeSearch } from './CodiceRaeSearch';
import { DocumentoIdentitaUpload } from './DocumentoIdentitaUpload';
import { fetchDocumentoIdentitaEsistente } from '../../../../lib/documentUploadHelper';

interface ImpresaFormProps {
  formData: WizardData;
  updateFormData: (updates: Partial<WizardData>) => void;
  clienteId?: string;
}

export function ImpresaForm({ formData, updateFormData, clienteId }: ImpresaFormProps) {
  const [pivaDuplicata, setPivaDuplicata] = useState<string | null>(null);
  const cfConflictImpresa = useCfConflictCheck(formData.codice_fiscale_impresa, formData.ragione_sociale);
  const cfConflictRappresentante = useCfConflictCheck(formData.codice_fiscale_rappresentante, formData.rappresentante_legale);

  useEffect(() => {
    const piva = (formData.partita_iva_impresa || '').trim();
    if (!piva) {
      setPivaDuplicata(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      let query = supabase
        .from('clienti')
        .select('ragione_sociale, codice_cliente')
        .eq('partita_iva', piva)
        .limit(1);
      if (clienteId) query = query.neq('id', clienteId);
      const { data } = await query;
      if (cancelled) return;
      if (data && data.length > 0) {
        const match = data[0];
        setPivaDuplicata(
          `P.IVA già associata al cliente "${match.ragione_sociale || match.codice_cliente || 'altro cliente'}"`
        );
      } else {
        setPivaDuplicata(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.partita_iva_impresa, clienteId]);

  // Tipo effettivo rappresentante (auto-detect via CF per dati legacy)
  const tipoRappresentanteEffettivo: 'persona_fisica' | 'azienda' =
    formData.tipo_soggetto_rappresentante
      ?? detectTipoSoggetto(formData.codice_fiscale_rappresentante)
      ?? 'persona_fisica';
  const rappresentanteIsAzienda = tipoRappresentanteEffettivo === 'azienda';
  const [tipoRappresentanteManuale, setTipoRappresentanteManuale] = useState(false);

  function handleTipoRappresentanteChange(nuovo: 'persona_fisica' | 'azienda') {
    setTipoRappresentanteManuale(true);
    updateFormData({ tipo_soggetto_rappresentante: nuovo });
  }

  // Importa azienda dall'anagrafica per i campi impresa stessi (cliente).
  // Traccia l'uuid dell'anagrafica importata: al save useClienteSave lo userà come
  // `clienti.id` per realizzare il bridge cliente↔anagrafica con UUID condiviso.
  async function handleImportAzienda(p: PersonaFisicaRecord) {
    updateFormData({
      _importedClientePersonaId: p.id,
      ragione_sociale: p.nome_cognome,
      codice_fiscale_impresa: p.codice_fiscale,
      partita_iva_impresa: p.partita_iva || p.codice_fiscale || '',
      natura_giuridica: p.natura_giuridica || formData.natura_giuridica,
      paese: normalizeNazionalita(p.nazionalita) || formData.paese,
      indirizzo: p.residenza || formData.indirizzo,
      sede_estera: !isItaliana(p.nazionalita),
      codice_ateco_impresa: p.codice_ateco || formData.codice_ateco_impresa,
      attivita_svolta_impresa: p.professione || formData.attivita_svolta_impresa,
    });
  }

  async function handleImportRappresentante(p: PersonaFisicaRecord) {
    const tipo = p.tipo_soggetto ?? detectTipoSoggetto(p.codice_fiscale) ?? 'persona_fisica';
    const isAzienda = tipo === 'azienda';
    const esistente = p.id && !isAzienda ? await fetchDocumentoIdentitaEsistente(p.id) : null;
    setTipoRappresentanteManuale(true);
    updateFormData({
      tipo_soggetto_rappresentante: tipo,
      rappresentante_legale: p.nome_cognome,
      codice_fiscale_rappresentante: p.codice_fiscale,
      partita_iva_rappresentante: p.partita_iva || '',
      natura_giuridica_rappresentante: p.natura_giuridica || '',
      codice_ateco_rappresentante: p.codice_ateco || '',
      data_nascita_rappresentante: isAzienda ? '' : normalizeDate(p.data_nascita),
      luogo_nascita_rappresentante: isAzienda ? '' : p.luogo_nascita,
      provincia_nascita_rappresentante: isAzienda ? '' : p.provincia_nascita,
      nazionalita_rappresentante: normalizeNazionalita(p.nazionalita),
      residenza_rappresentante: p.residenza,
      residenza_estera_rappresentante: !isItaliana(p.nazionalita),
      documento_rappresentante: {
        tipo: isAzienda ? '' : p.documento_tipo,
        numero: isAzienda ? '' : p.documento_numero,
        data_rilascio: isAzienda ? '' : normalizeDate(p.documento_data_rilascio),
        data_scadenza: isAzienda ? '' : normalizeDate(p.documento_data_scadenza),
        ente_rilascio: isAzienda ? '' : p.documento_ente_rilascio,
        esistente,
      },
      pep_impresa: p.pep,
      pep_verificato_impresa: p.pep_verificato,
      pep_carica_impresa: p.pep_carica,
      pep_data_verifica_impresa: p.pep_data_verifica,
      pep_fonte_verifica_impresa: p.pep_fonte_verifica,
      sanzioni_impresa: p.sanzioni,
      sanzioni_verificato_impresa: p.sanzioni_verificato,
      sanzioni_data_verifica_impresa: p.sanzioni_data_verifica,
      sanzioni_fonte_verifica_impresa: p.sanzioni_fonte_verifica,
      note_verifica_impresa: p.note_verifica,
    });
  }

  function handleCfRappresentanteChange(raw: string) {
    const cf = raw.toUpperCase();
    const detected = detectTipoSoggetto(cf);
    const nextTipo = !tipoRappresentanteManuale && detected
      ? detected
      : (formData.tipo_soggetto_rappresentante || 'persona_fisica');

    if (nextTipo === 'persona_fisica') {
      const dati = parseCodiceFiscale(cf);
      if (dati) {
        updateFormData({
          tipo_soggetto_rappresentante: nextTipo,
          codice_fiscale_rappresentante: cf,
          data_nascita_rappresentante: formatDate(dati.data_nascita),
          luogo_nascita_rappresentante: dati.comune,
          provincia_nascita_rappresentante: dati.provincia,
        });
        return;
      }
    }
    updateFormData({
      tipo_soggetto_rappresentante: nextTipo,
      codice_fiscale_rappresentante: cf,
      // Per azienda con CF a 11 cifre, ricopia su P.IVA se vuota
      ...(nextTipo === 'azienda' && /^\d{11}$/.test(cf) && !formData.partita_iva_rappresentante
        ? { partita_iva_rappresentante: cf }
        : {}),
    });
  }

  useEffect(() => {
    if (!formData.paese) {
      updateFormData({ paese: "Italiana" });
    }
    if (!formData.nazionalita_rappresentante) {
      updateFormData({ nazionalita_rappresentante: "Italiana" });
    }
  }, []);

  return (
    <div className="space-y-4 border-t pt-4">
      <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-1 w-fit">
        <Search className="w-3.5 h-3.5" />
        Digita per cercare un'azienda già registrata
      </span>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ragione Sociale *</label>
          <AnagraficaSearchInput
            tipoFilter="azienda"
            onSelectAnagrafica={handleImportAzienda}
            value={formData.ragione_sociale}
            onChange={(e) => updateFormData({ ragione_sociale: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="es. Acme S.r.l."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Natura Giuridica</label>
          <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
            <select
              value={formData.natura_giuridica}
              onChange={(e) => updateFormData({ natura_giuridica: e.target.value })}
              className="w-full rounded-lg focus:outline-none focus:ring-0"
            >
              <option value="">Seleziona...</option>
              <option value="srl">S.r.l.</option>
              <option value="spa">S.p.a.</option>
              <option value="sas">S.a.s.</option>
              <option value="snc">S.n.c.</option>
              <option value="ditta-individuale">Ditta Individuale</option>
              <option value="altro">Altro</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Partita IVA</label>
          <AnagraficaSearchInput
            tipoFilter="azienda"
            onSelectAnagrafica={handleImportAzienda}
            value={formData.partita_iva_impresa}
            onChange={(e) => updateFormData({ partita_iva_impresa: e.target.value.toUpperCase() })}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
              pivaDuplicata
                ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
            placeholder="es. 12345678901"
            maxLength={16}
          />
          {pivaDuplicata && (
            <p className="text-xs text-red-600 mt-1">{pivaDuplicata}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Codice Fiscale *</label>
          <AnagraficaSearchInput
            tipoFilter="azienda"
            onSelectAnagrafica={handleImportAzienda}
            value={formData.codice_fiscale_impresa}
            onChange={(e) => updateFormData({ codice_fiscale_impresa: e.target.value.toUpperCase() })}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
              cfConflictImpresa
                ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
            placeholder="es. 12345678901"
          />
          {cfConflictImpresa && (
            <p className="text-xs text-red-600 mt-1">Codice fiscale già associato a "{cfConflictImpresa}"</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Nazionalità</label>
          <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
            <select
              value={formData.paese || 'Italiana'}
              onChange={(e) => updateFormData({ paese: e.target.value })}
              className="w-full rounded-lg bg-white focus:outline-none focus:ring-0"
            >
              {NAZIONALITA.map(n => (
                <option key={n.nazionalita} value={n.nazionalita}>{n.nazionalita}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="md:col-span-2">
          <IndirizzoStructured
            label="Sede legale"
            value={formData.indirizzo || ''}
            onChange={(val) => updateFormData({ indirizzo: val })}
            nazionalitaEstera={!isItaliana(formData.paese)}
            nazione={getNazioneByNazionalita(formData.paese || '') || ''}
            residenzaEstera={formData.sede_estera}
            onResidenzaEsteraChange={(val) => updateFormData({ sede_estera: val })}
          />
        </div>

        <CodiceAtecoSearch
          codiceAteco={formData.codice_ateco_impresa || ''}
          attivitaSvolta={formData.attivita_svolta_impresa || ''}
          onSelect={(codice, attivita) => updateFormData({ codice_ateco_impresa: codice, attivita_svolta_impresa: attivita })}
          raeDescription={formData.rae_description}
        />
      {/*
        <CodiceRaeSearch
          codiceRae={formData.codice_rae_impresa || ''}
          descrizioneRae={formData.descrizione_rae_impresa || ''}
          onSelect={(codice, descrizione) => updateFormData({ codice_rae_impresa: codice, descrizione_rae_impresa: descrizione })}
          raeApiSuggestion={formData.rae_description}
        />*/}
      </div>
      <div className="border-t pt-4 space-y-4">
        {/* Toggle PF/Azienda per il rappresentante legale */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => handleTipoRappresentanteChange('persona_fisica')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                !rappresentanteIsAzienda ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <User className="w-4 h-4" />
              Persona fisica
            </button>
            <button
              type="button"
              onClick={() => handleTipoRappresentanteChange('azienda')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                rappresentanteIsAzienda ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Azienda
            </button>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-1">
            <Search className="w-3.5 h-3.5" />
            Digita per cercare un'anagrafica esistente
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {rappresentanteIsAzienda ? 'Ragione Sociale Rappresentante' : 'Rappresentante Legale'}
          </label>
          <AnagraficaSearchInput
            onSelectAnagrafica={handleImportRappresentante}
            value={formData.rappresentante_legale}
            onChange={(e) => updateFormData({ rappresentante_legale: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder={rappresentanteIsAzienda ? 'es. ALPHA S.R.L.' : 'es. Mario Rossi'}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {rappresentanteIsAzienda ? 'CF Azienda Rappresentante' : 'CF Rappresentante Legale'}
          </label>
          <AnagraficaSearchInput
            onSelectAnagrafica={handleImportRappresentante}
            value={formData.codice_fiscale_rappresentante || ''}
            onChange={(e) => handleCfRappresentanteChange(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
              cfConflictRappresentante
                ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
            placeholder={rappresentanteIsAzienda ? '11 cifre' : 'es. RSSMRA80A01H501X'}
            maxLength={rappresentanteIsAzienda ? 11 : 16}
          />
          {cfConflictRappresentante && (
            <p className="text-xs text-red-600 mt-1">Codice fiscale già associato a "{cfConflictRappresentante}"</p>
          )}
        </div>

        {rappresentanteIsAzienda ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Partita IVA</label>
              <input
                type="text"
                value={formData.partita_iva_rappresentante || ''}
                onChange={(e) => updateFormData({ partita_iva_rappresentante: e.target.value })}
                maxLength={11}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="es. 12345678901"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Natura Giuridica</label>
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                <select
                  value={formData.natura_giuridica_rappresentante || ''}
                  onChange={(e) => updateFormData({ natura_giuridica_rappresentante: e.target.value })}
                  className="w-full rounded-lg bg-white focus:outline-none focus:ring-0"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Data Nascita * (gg/mm/aaaa)</label>
              <input
                type="date"
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                value={formatDateInv(formData.data_nascita_rappresentante || '')}
                onChange={(e) => {
                  const date = formatDate(e.target.value);
                  updateFormData({ data_nascita_rappresentante: date })
                }}
                placeholder="gg/mm/aaaa"
                maxLength={10}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  formData.data_nascita_rappresentante && !isValidDate(formData.data_nascita_rappresentante)
                    ? 'border-red-500'
                    : 'border-gray-300'
                }`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Comune Nascita</label>
              <input
                type="text"
                value={formData.luogo_nascita_rappresentante || ''}
                onChange={(e) => updateFormData({ luogo_nascita_rappresentante: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="es. Roma"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Provincia Nascita</label>
              <input
                type="text"
                value={formData.provincia_nascita_rappresentante || ''}
                onChange={(e) => updateFormData({ provincia_nascita_rappresentante: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="es. RM"
                maxLength={2}
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Nazionalità</label>
          <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
            <select
              value={formData.nazionalita_rappresentante || 'Italiana'}
              onChange={(e) => updateFormData({ nazionalita_rappresentante: e.target.value })}
              className="w-full rounded-lg bg-white focus:outline-none focus:ring-0"
            >
              {NAZIONALITA.map(n => (
                <option key={n.nazionalita} value={n.nazionalita}>{n.nazionalita}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="md:col-span-2">
          <IndirizzoStructured
            label={rappresentanteIsAzienda ? 'Sede Legale Rappresentante' : 'Residenza Rappresentante Legale'}
            value={formData.residenza_rappresentante || ''}
            onChange={(val) => updateFormData({ residenza_rappresentante: val })}
            nazionalitaEstera={!isItaliana(formData.nazionalita_rappresentante)}
            nazione={getNazioneByNazionalita(formData.nazionalita_rappresentante || '') || ''}
            residenzaEstera={formData.residenza_estera_rappresentante}
            onResidenzaEsteraChange={(val) => updateFormData({ residenza_estera_rappresentante: val })}
          />
        </div>

        {rappresentanteIsAzienda && (
          <div className="md:col-span-2">
            <CodiceAtecoSearch
              codiceAteco={formData.codice_ateco_rappresentante || ''}
              attivitaSvolta={''}
              onSelect={(codice) => updateFormData({ codice_ateco_rappresentante: codice })}
            />
          </div>
        )}
    </div>

    {/* Documento Rappresentante Legale — solo per persone fisiche */}
    {!rappresentanteIsAzienda && (
    <div className="border-t pt-4">
      <h4 className="font-semibold mb-3">Documento d'Identità Rappresentante Legale</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo Documento *</label>
          <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
            <select
              value={formData.documento_rappresentante?.tipo || ''}
              onChange={(e) => updateFormData({documento_rappresentante: { ...formData.documento_rappresentante!, tipo: e.target.value }})}
              className="w-full rounded-lg focus:outline-none focus:ring-0"
            >
              <option value="">Seleziona...</option>
              <option value="carta-identita">Carta d'Identità</option>
              <option value="passaporto">Passaporto</option>
              <option value="patente">Patente di Guida</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Numero Documento *</label>
            <input
              type="text"
              value={formData.documento_rappresentante?.numero || ''}
              onChange={(e) => updateFormData({ 
                documento_rappresentante: { ...formData.documento_rappresentante!, numero: e.target.value } 
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="es. AB123456"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data Rilascio * (gg/mm/aaaa)</label>
            <input
              type="date"
              onClick={(e) => (e.target as HTMLInputElement).showPicker()}
              value={formatDateInv(formData.documento_rappresentante?.data_rilascio || '')}
              onChange={(e) => {
                const date = formatDate(e.target.value);
                updateFormData({ 
                  documento_rappresentante: { 
                    ...formData.documento_rappresentante!, 
                    data_rilascio: date
                  } 
                });
              }}
              placeholder="gg/mm/aaaa"
              maxLength={10}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                formData.documento_rappresentante?.data_rilascio && !isValidDate(formData.documento_rappresentante?.data_rilascio)
                  ? 'border-red-500'
                  : 'border-gray-300'
              }`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data Scadenza * (gg/mm/aaaa)</label>
            <input
              type="date"
              onClick={(e) => (e.target as HTMLInputElement).showPicker()}
              value={formatDateInv(formData.documento_rappresentante?.data_scadenza || '')}
              onChange={(e) => {
                const date= formatDate(e.target.value);
                updateFormData({ 
                  documento_rappresentante: { 
                    ...formData.documento_rappresentante!, 
                    data_scadenza: date
                  } 
                });
              }}
              placeholder="gg/mm/aaaa"
              maxLength={10}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                formData.documento_rappresentante?.data_scadenza && !isValidDate(formData.documento_rappresentante?.data_scadenza)
                  ? 'border-red-500'
                  : 'border-gray-300'
              }`}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Ente Rilascio *</label>
            <input
              type="text"
              value={formData.documento_rappresentante?.ente_rilascio || ''}
              onChange={(e) => updateFormData({
                documento_rappresentante: { ...formData.documento_rappresentante!, ente_rilascio: e.target.value }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="es. Comune di Roma"
            />
          </div>

          <DocumentoIdentitaUpload
            file={formData.documento_rappresentante?.file}
            cartaceo={formData.documento_rappresentante?.cartaceo}
            descrizione={formData.documento_rappresentante?.descrizione}
            dataScadenza={formData.documento_rappresentante?.data_scadenza}
            esistente={formData.documento_rappresentante?.esistente}
            onFileChange={(f) => updateFormData({
              documento_rappresentante: { ...formData.documento_rappresentante!, file: f }
            })}
            onCartaceoChange={(c) => updateFormData({
              documento_rappresentante: {
                ...formData.documento_rappresentante!,
                cartaceo: c,
                ...(c ? { file: null } : {}),
              }
            })}
            onDescrizioneChange={(d) => updateFormData({
              documento_rappresentante: { ...formData.documento_rappresentante!, descrizione: d }
            })}
            onDataScadenzaChange={(s) => updateFormData({
              documento_rappresentante: { ...formData.documento_rappresentante!, data_scadenza: s }
            })}
          />
        </div>
      </div>
      )}

      {/* Verifica PEP */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold text-blue-900">Verifica PPE (Persona Politicamente Esposta)</h4>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.pep_verificato_impresa || false}
              onChange={(e) => updateFormData({
                pep_verificato_impresa: e.target.checked,
                pep_data_verifica_impresa: e.target.checked ? formatDate(new Date().toISOString().slice(0, 10)) : '',
              })}
              className="rounded text-blue-600"
            />
            <span className="text-sm">Verifica PPE effettuata</span>
          </label>
          {formData.pep_verificato_impresa && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.pep_impresa || false}
                onChange={(e) => updateFormData({ pep_impresa: e.target.checked })}
                className="rounded text-red-600"
              />
              <span className="text-sm font-medium text-red-700">Il soggetto risulta PPE</span>
            </label>
          )}
        </div>
        {formData.pep_verificato_impresa && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data verifica (gg/mm/aaaa)</label>
              <input
                type="date"
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                value={formatDateInv(formData.pep_data_verifica_impresa || '')}
                onChange={(e) => updateFormData({ pep_data_verifica_impresa: formatDate(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fonte verifica</label>
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                <select
                  value={formData.pep_fonte_verifica_impresa || ''}
                  onChange={(e) => updateFormData({ pep_fonte_verifica_impresa: e.target.value })}
                  className="w-full rounded-lg text-sm focus:outline-none focus:ring-0"
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
        {formData.pep_impresa && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Carica ricoperta</label>
            <input
              type="text"
              value={formData.pep_carica_impresa || ''}
              onChange={(e) => updateFormData({ pep_carica_impresa: e.target.value })}
              placeholder="es. Parlamentare, Sindaco..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}
      </div>

      {/* Verifica Sanzioni */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold text-blue-900">Verifica Liste Sanzioni / Embargo</h4>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.sanzioni_verificato_impresa || false}
              onChange={(e) => updateFormData({
                sanzioni_verificato_impresa: e.target.checked,
                sanzioni_data_verifica_impresa: e.target.checked ? formatDate(new Date().toISOString().slice(0, 10)) : '',
              })}
              className="rounded text-blue-600"
            />
            <span className="text-sm">Verifica sanzioni effettuata</span>
          </label>
          {formData.sanzioni_verificato_impresa && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.sanzioni_impresa || false}
                onChange={(e) => updateFormData({ sanzioni_impresa: e.target.checked })}
                className="rounded text-red-600"
              />
              <span className="text-sm font-medium text-red-700">Presente in liste sanzioni</span>
            </label>
          )}
        </div>
        {formData.sanzioni_verificato_impresa && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data verifica (gg/mm/aaaa)</label>
              <input
                type="date"
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                value={formatDateInv(formData.sanzioni_data_verifica_impresa || '')}
                onChange={(e) => updateFormData({ sanzioni_data_verifica_impresa: formatDate(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fonte verifica</label>
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                <select
                  value={formData.sanzioni_fonte_verifica_impresa || ''}
                  onChange={(e) => updateFormData({ sanzioni_fonte_verifica_impresa: e.target.value })}
                  className="w-full rounded-lg text-sm focus:outline-none focus:ring-0"
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

      {/* Note Verifica */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Note Verifica</label>
        <textarea
          value={formData.note_verifica_impresa}
          onChange={(e) => updateFormData({ note_verifica_impresa: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Note sulla verifica dell'impresa..."
        />
      </div>
    </div>
  );
}
