import { WizardData } from '../../types';
import { isValidDate } from '../../utils';
import { parseCodiceFiscale } from './PersonaFisicaForm';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import {formatDate, formatDateInv, normalizeDate} from './PersonaFisicaForm';
import { AnagraficaSearchInput } from '../../../AnagraficaSearchInput';
import type { PersonaFisicaRecord } from '../../../../lib/personeHelper';
import { useCfConflictCheck } from '../../../../lib/useCfConflictCheck';
import { IndirizzoStructured } from './IndirizzoStructured';
import { NAZIONALITA, getNazioneByNazionalita, isItaliana, normalizeNazionalita } from '../../../../lib/nazionalitaHelper';
import { CodiceAtecoSearch } from './CodiceAtecoSearch';
import { CodiceRaeSearch } from './CodiceRaeSearch';
import { DocumentoIdentitaUpload } from './DocumentoIdentitaUpload';
import { fetchDocumentoIdentitaEsistente } from '../../../../lib/documentUploadHelper';

interface ProfessionistaFormProps {
  formData: WizardData;
  updateFormData: (updates: Partial<WizardData>) => void;
  clienteId?: string;
}

export function ProfessionistaForm({ formData, updateFormData, clienteId }: ProfessionistaFormProps) {
  const [pivaDuplicata, setPivaDuplicata] = useState<string | null>(null);
  const cfConflict = useCfConflictCheck(formData.codice_fiscale_prof, formData.nome_cognome_prof);

  useEffect(() => {
    if (!formData.nazionalita_prof) {
      updateFormData({ nazionalita_prof: "Italiana" });
    }
  }, []);

  useEffect(() => {
    const piva = (formData.partita_iva_prof || '').trim();
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
  }, [formData.partita_iva_prof, clienteId]);

  async function handleImportPersona(p: PersonaFisicaRecord) {
    const esistente = p.id ? await fetchDocumentoIdentitaEsistente(p.id) : null;
    updateFormData({
      nome_cognome_prof: p.nome_cognome,
      codice_fiscale_prof: p.codice_fiscale,
      data_nascita_prof: normalizeDate(p.data_nascita),
      luogo_nascita_prof: p.luogo_nascita || '',
      provincia_nascita_prof: p.provincia_nascita || '',
      nazionalita_prof: normalizeNazionalita(p.nazionalita),
      professione_prof: p.professione,
      residenza_prof: p.residenza,
      residenza_estera_prof: !isItaliana(p.nazionalita),
      documento_prof: {
        tipo: p.documento_tipo,
        numero: p.documento_numero,
        data_rilascio: normalizeDate(p.documento_data_rilascio),
        data_scadenza: normalizeDate(p.documento_data_scadenza),
        ente_rilascio: p.documento_ente_rilascio,
        esistente,
      },
      pep_prof: p.pep,
      pep_verificato_prof: p.pep_verificato,
      pep_carica_prof: p.pep_carica,
      pep_data_verifica_prof: p.pep_data_verifica,
      pep_fonte_verifica_prof: p.pep_fonte_verifica,
      sanzioni_prof: p.sanzioni,
      sanzioni_verificato_prof: p.sanzioni_verificato,
      sanzioni_data_verifica_prof: p.sanzioni_data_verifica,
      sanzioni_fonte_verifica_prof: p.sanzioni_fonte_verifica,
      note_verifica_prof: p.note_verifica,
    });
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-1 w-fit">
        <Search className="w-3.5 h-3.5" />
        Digita per cercare un'anagrafica già registrata
      </span>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Nome e Cognome *</label>
          <AnagraficaSearchInput
            tipoFilter="persona_fisica"
            onSelectAnagrafica={handleImportPersona}
            value={formData.nome_cognome_prof}
            onChange={(e) => updateFormData({ nome_cognome_prof: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="es. Mario Rossi"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Codice Fiscale *</label>
          <AnagraficaSearchInput
            tipoFilter="persona_fisica"
            onSelectAnagrafica={handleImportPersona}
            value={formData.codice_fiscale_prof}
            onChange={(e) => {
              const cf = e.target.value.toUpperCase();
              updateFormData({ codice_fiscale_prof: cf });

              const dati = parseCodiceFiscale(cf);
              if (dati) {
                updateFormData({
                  data_nascita_prof: formatDate(dati.data_nascita),
                  luogo_nascita_prof: dati.comune || '',
                  provincia_nascita_prof: dati.provincia || '',
                });
              }
            }}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
              cfConflict
                ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
            placeholder="es. RSSMRA80A01H501X"
            maxLength={16}
          />
          {cfConflict && (
            <p className="text-xs text-red-600 mt-1">Codice fiscale già associato a "{cfConflict}"</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Partita IVA *</label>
          <AnagraficaSearchInput
            tipoFilter="persona_fisica"
            onSelectAnagrafica={handleImportPersona}
            value={formData.partita_iva_prof}
            onChange={(e) => updateFormData({ partita_iva_prof: e.target.value.toUpperCase() })}
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
          <label className="block text-sm font-medium text-gray-700 mb-2">Data di Nascita * (gg/mm/aaaa)</label>
          <input
            type="date"
            onClick={(e) => (e.target as HTMLInputElement).showPicker()}
            value={formatDateInv(formData.data_nascita_prof || '')}
            onChange={(e) => {
              const date = formatDate(e.target.value);
              updateFormData({ data_nascita_prof: date })
            }}
            placeholder="gg/mm/aaaa"
            maxLength={10}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              formData.data_nascita_prof && !isValidDate(formData.data_nascita_prof)
                ? 'border-red-500'
                : 'border-gray-300'
            }`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Luogo di Nascita *</label>
          <input
            type="text"
            value={formData.luogo_nascita_prof || ''}
            onChange={(e) => updateFormData({ luogo_nascita_prof: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="es. Roma"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Provincia di Nascita</label>
          <input
            type="text"
            value={formData.provincia_nascita_prof || ''}
            onChange={(e) => updateFormData({ provincia_nascita_prof: e.target.value.toUpperCase() })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="es. RM"
            maxLength={2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Nazionalità *</label>
          <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
            <select
              value={formData.nazionalita_prof || 'Italiana'}
              onChange={(e) => updateFormData({ nazionalita_prof: e.target.value })}
              className="w-full rounded-lg bg-white focus:outline-none focus:ring-0"
            >
              {NAZIONALITA.map(n => (
                <option key={n.nazionalita} value={n.nazionalita}>{n.nazionalita}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Professione *</label>
          <input
            type="text"
            value={formData.professione_prof || ''}
            onChange={(e) => updateFormData({ professione_prof: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="es. Commercialista"
          />
        </div>
      </div>
      <div className='flex flex-col pt-3 gap-2'>
        <IndirizzoStructured
          label="Residenza"
          required
          value={formData.residenza_prof || ''}
          onChange={(val) => updateFormData({ residenza_prof: val })}
          nazionalitaEstera={!isItaliana(formData.nazionalita_prof)}
          nazione={getNazioneByNazionalita(formData.nazionalita_prof || '') || ''}
          residenzaEstera={formData.residenza_estera_prof}
          onResidenzaEsteraChange={(val) => updateFormData({ residenza_estera_prof: val })}
        />

        <CodiceAtecoSearch
          codiceAteco={formData.codice_ateco_prof || ''}
          attivitaSvolta={formData.attivita_svolta_prof || ''}
          onSelect={(codice, attivita) => updateFormData({ codice_ateco_prof: codice, attivita_svolta_prof: attivita })}
        />
        {/*
        <CodiceRaeSearch
          codiceRae={formData.codice_rae_prof || ''}
          descrizioneRae={formData.descrizione_rae_prof || ''}
          onSelect={(codice, descrizione) => updateFormData({ codice_rae_prof: codice, descrizione_rae_prof: descrizione })}
        />*/}
      </div>
      {/* Documento d'Identità */}
      <div className="border-t pt-4">
        <h4 className="font-semibold mb-3">Documento d'Identità</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo Documento *</label>
            <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
              <select
                value={formData.documento_prof?.tipo || ''}
                onChange={(e) => updateFormData({ documento_prof: { ...formData.documento_prof!, tipo: e.target.value }})}
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
              value={formData.documento_prof?.numero || ''}
              onChange={(e) => updateFormData({ 
                documento_prof: { ...formData.documento_prof!, numero: e.target.value } 
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
              value={formatDateInv(formData.documento_prof?.data_rilascio || '')}
              onChange={(e) => {
                const date= formatDate(e.target.value);
                updateFormData({ 
                  documento_prof: { 
                    ...formData.documento_prof!, 
                    data_rilascio: date
                  } 
                });
              }}
              placeholder="gg/mm/aaaa"
              maxLength={10}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                formData.documento_prof?.data_rilascio && !isValidDate(formData.documento_prof?.data_rilascio)
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
              value={formatDateInv(formData.documento_prof?.data_scadenza || '')}
              onChange={(e) => {
                const date = formatDate(e.target.value)
                updateFormData({ 
                  documento_prof: { 
                    ...formData.documento_prof!, 
                    data_scadenza: date
                  } 
                });
              }}
              placeholder="gg/mm/aaaa"
              maxLength={10}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                formData.documento_prof?.data_scadenza && !isValidDate(formData.documento_prof?.data_scadenza)
                  ? 'border-red-500'
                  : 'border-gray-300'
              }`}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Ente Rilascio *</label>
            <input
              type="text"
              value={formData.documento_prof?.ente_rilascio || ''}
              onChange={(e) => updateFormData({
                documento_prof: { ...formData.documento_prof!, ente_rilascio: e.target.value }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="es. Comune di Roma"
            />
          </div>

          <DocumentoIdentitaUpload
            file={formData.documento_prof?.file}
            cartaceo={formData.documento_prof?.cartaceo}
            descrizione={formData.documento_prof?.descrizione}
            dataScadenza={formData.documento_prof?.data_scadenza}
            esistente={formData.documento_prof?.esistente}
            onFileChange={(f) => updateFormData({
              documento_prof: { ...formData.documento_prof!, file: f }
            })}
            onCartaceoChange={(c) => updateFormData({
              documento_prof: {
                ...formData.documento_prof!,
                cartaceo: c,
                ...(c ? { file: null } : {}),
              }
            })}
            onDescrizioneChange={(d) => updateFormData({
              documento_prof: { ...formData.documento_prof!, descrizione: d }
            })}
            onDataScadenzaChange={(s) => updateFormData({
              documento_prof: { ...formData.documento_prof!, data_scadenza: s }
            })}
          />
        </div>
      </div>

      {/* Verifica PEP */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold text-blue-900">Verifica PPE (Persona Politicamente Esposta)</h4>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.pep_verificato_prof || false}
              onChange={(e) => updateFormData({
                pep_verificato_prof: e.target.checked,
                pep_data_verifica_prof: e.target.checked ? formatDate(new Date().toISOString().slice(0, 10)) : '',
              })}
              className="rounded text-blue-600"
            />
            <span className="text-sm">Verifica PPE effettuata</span>
          </label>
          {formData.pep_verificato_prof && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.pep_prof || false}
                onChange={(e) => updateFormData({ pep_prof: e.target.checked })}
                className="rounded text-red-600"
              />
              <span className="text-sm font-medium text-red-700">Il soggetto risulta PPE</span>
            </label>
          )}
        </div>
        {formData.pep_verificato_prof && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data verifica (gg/mm/aaaa)</label>
              <input
                type="date"
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                value={formatDateInv(formData.pep_data_verifica_prof || '')}
                onChange={(e) => updateFormData({ pep_data_verifica_prof: formatDate(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fonte verifica</label>
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                <select
                  value={formData.pep_fonte_verifica_prof || ''}
                  onChange={(e) => updateFormData({ pep_fonte_verifica_prof: e.target.value })}
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
        {formData.pep_prof && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Carica ricoperta</label>
            <input
              type="text"
              value={formData.pep_carica_prof || ''}
              onChange={(e) => updateFormData({ pep_carica_prof: e.target.value })}
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
              checked={formData.sanzioni_verificato_prof || false}
              onChange={(e) => updateFormData({
                sanzioni_verificato_prof: e.target.checked,
                sanzioni_data_verifica_prof: e.target.checked ? formatDate(new Date().toISOString().slice(0, 10)) : '',
              })}
              className="rounded text-blue-600"
            />
            <span className="text-sm">Verifica sanzioni effettuata</span>
          </label>
          {formData.sanzioni_verificato_prof && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.sanzioni_prof || false}
                onChange={(e) => updateFormData({ sanzioni_prof: e.target.checked })}
                className="rounded text-red-600"
              />
              <span className="text-sm font-medium text-red-700">Presente in liste sanzioni</span>
            </label>
          )}
        </div>
        {formData.sanzioni_verificato_prof && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data verifica (gg/mm/aaaa)</label>
              <input
                type="date"
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                value={formatDateInv(formData.sanzioni_data_verifica_prof || '')}
                onChange={(e) => updateFormData({ sanzioni_data_verifica_prof: formatDate(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fonte verifica</label>
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                <select
                  value={formData.sanzioni_fonte_verifica_prof || ''}
                  onChange={(e) => updateFormData({ sanzioni_fonte_verifica_prof: e.target.value })}
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
          value={formData.note_verifica_prof}
          onChange={(e) => updateFormData({ note_verifica_prof: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Note sulla verifica del professionista..."
        />
      </div>
    </div>
  );
}
