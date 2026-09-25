import { WizardData } from '../../types';
import { isValidDate, normalizeDate } from '../../utils';
import codiciBelfioreJson from "../../../../data/codici-belfiore.json";
import { useEffect } from "react";
import { Search } from 'lucide-react';
import { AnagraficaSearchInput } from '../../../AnagraficaSearchInput';
import type { PersonaFisicaRecord } from '../../../../lib/personeHelper';
import { useCfConflictCheck } from '../../../../lib/useCfConflictCheck';
import { IndirizzoStructured } from './IndirizzoStructured';
import { NAZIONALITA, getNazioneByNazionalita, isItaliana, normalizeNazionalita } from '../../../../lib/nazionalitaHelper';
import { DocumentoIdentitaUpload } from './DocumentoIdentitaUpload';
import { fetchDocumentoIdentitaEsistente } from '../../../../lib/documentUploadHelper';


interface PersonaFisicaFormProps {
  formData: WizardData;
  updateFormData: (updates: Partial<WizardData>) => void;
}

export const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  // Esempio: "2025-12-12" -> ["2025", "12", "12"]
  const parts = dateString.split('-');
  if (parts.length === 3) {
    // Restituisce "12/12/2025"
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString;
};

// `normalizeDate` è stato spostato in `cliente-wizard/utils.ts` (modulo neutro, no React)
// per essere riusato da `clienteService`/MCP. Ri-esportato qui per i consumatori storici.
export { normalizeDate };

export const formatDateInv = (dateString: string): string => {
  if (!dateString) return '';
  // Se è già in formato ISO (YYYY-MM-DD), restituiscilo direttamente
  if (dateString.includes('-') && dateString.split('-')[0].length === 4) {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }
  // Formato DD/MM/YYYY -> YYYY-MM-DD
  const parts = dateString.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return '';
};

// Estraiamo dal codice fiscale tutti i dati disponibili
export function parseCodiceFiscale(cf:string) {
  if (!cf || cf.length !== 16) return null;

  cf = cf.toUpperCase();

  // Mese: lettera A..T. Se non è una lettera-mese valida (CF malformato/omocodice anomalo) NON
  // produciamo una data corrotta come "1985-undefined-12".
  const mesi : { [key: string]: number } = {
    A: 1, B: 2, C: 3, D: 4, E: 5, H: 6,
    L: 7, M: 8, P: 9, R: 10, S: 11, T: 12,
  };
  const mese = mesi[cf[8]];

  // Anno (2 cifre) e giorno: nei CF "omocodici" alcune cifre sono sostituite da lettere → NaN.
  const yy = parseInt(cf.substring(6, 8), 10);
  let giorno = parseInt(cf.substring(9, 11), 10);

  // Secolo: 2000+yy, ma una data di nascita non può stare nel futuro → in tal caso 1900+yy. Evita il
  // vecchio cutoff dinamico (getFullYear()%100) che cambiava il secolo dello stesso CF di anno in anno.
  let anno = 2000 + yy;
  if (anno > new Date().getFullYear()) anno -= 100;

  // Giorno: +40 se femmina.
  const sesso = !Number.isNaN(giorno) && giorno > 40 ? "F" : "M";
  if (!Number.isNaN(giorno) && giorno > 40) giorno -= 40;

  // Data solo se TUTTE le componenti sono decodificabili; altrimenti stringa vuota (niente data
  // corrotta). I chiamanti fanno `if (cfData)` e gestiscono data_nascita vuota.
  const dataValida = mese !== undefined && !Number.isNaN(yy) && !Number.isNaN(giorno);
  const data = dataValida
    ? `${anno}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`
    : "";

  // Codice Belfiore
  const codiciBelfiore: Record<string, { comune: string; provincia: string }> = codiciBelfioreJson;
  const codiceComune = cf.substring(11, 15);
  const comuneInfo = codiciBelfiore[codiceComune] || {
    comune: "",
    provincia: "",
  };

  return {
    data_nascita: data,
    sesso,
    comune: comuneInfo.comune,
    provincia: comuneInfo.provincia,
  };
}


export function PersonaFisicaForm({ formData, updateFormData }: PersonaFisicaFormProps) {
  const cfConflict = useCfConflictCheck(formData.codice_fiscale_pf, formData.nome_cognome_pf);

  useEffect(() => {
    if (!formData.nazionalita_pf) {
      updateFormData({ nazionalita_pf: "Italiana" });
    }
  }, []);

  async function handleImportPersona(p: PersonaFisicaRecord) {
    const esistente = p.id ? await fetchDocumentoIdentitaEsistente(p.id) : null;
    updateFormData({
      nome_cognome_pf: p.nome_cognome,
      codice_fiscale_pf: p.codice_fiscale,
      data_nascita_pf: normalizeDate(p.data_nascita),
      luogo_nascita_pf: p.luogo_nascita || '',
      provincia_nascita_pf: p.provincia_nascita || '',
      nazionalita_pf: normalizeNazionalita(p.nazionalita),
      professione_pf: p.professione,
      residenza_pf: p.residenza,
      residenza_estera_pf: !isItaliana(p.nazionalita),
      documento_pf: {
        tipo: p.documento_tipo,
        numero: p.documento_numero,
        data_rilascio: normalizeDate(p.documento_data_rilascio),
        data_scadenza: normalizeDate(p.documento_data_scadenza),
        ente_rilascio: p.documento_ente_rilascio,
        esistente,
      },
      pep_pf: p.pep,
      pep_verificato_pf: p.pep_verificato,
      pep_carica_pf: p.pep_carica,
      pep_data_verifica_pf: p.pep_data_verifica,
      pep_fonte_verifica_pf: p.pep_fonte_verifica,
      sanzioni_pf: p.sanzioni,
      sanzioni_verificato_pf: p.sanzioni_verificato,
      sanzioni_data_verifica_pf: p.sanzioni_data_verifica,
      sanzioni_fonte_verifica_pf: p.sanzioni_fonte_verifica,
      note_verifica_pf: p.note_verifica,
    });
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-1 w-fit">
        <Search className="w-3.5 h-3.5" />
        Digita per cercare una persona già registrata
      </span>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Nome e Cognome *</label>
        <AnagraficaSearchInput
          tipoFilter="persona_fisica"
          onSelectAnagrafica={handleImportPersona}
          value={formData.nome_cognome_pf}
          onChange={(e) => updateFormData({ nome_cognome_pf: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="es. Mario Rossi"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Codice Fiscale *</label>
        <AnagraficaSearchInput
          tipoFilter="persona_fisica"
          onSelectAnagrafica={handleImportPersona}
          value={formData.codice_fiscale_pf}
          onChange={(e) => {
            const cf = e.target.value.toUpperCase();
            updateFormData({ codice_fiscale_pf: cf });

            const dati = parseCodiceFiscale(cf);

            if (dati) {
              updateFormData({
                data_nascita_pf: formatDate(dati.data_nascita),
                luogo_nascita_pf: dati.comune || '',
                provincia_nascita_pf: dati.provincia || '',
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Data di Nascita * (gg/mm/aaaa)</label>
          <input
            type="date"
            onClick={(e) => (e.target as HTMLInputElement).showPicker()}
            value={formatDateInv(formData.data_nascita_pf || '')}
            onChange={(e) => {
              const formattedDate = formatDate(e.target.value);
              
              updateFormData({ data_nascita_pf: formattedDate })
            }}
            placeholder="gg/mm/aaaa"
            maxLength={10}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              formData.data_nascita_pf && !isValidDate(formData.data_nascita_pf)
                ? 'border-red-500'
                : 'border-gray-300'
            }`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Luogo di Nascita *</label>
          <input
            type="text"
            value={formData.luogo_nascita_pf || ''}
            onChange={(e) => updateFormData({ luogo_nascita_pf: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="es. Roma"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Provincia di Nascita</label>
          <input
            type="text"
            value={formData.provincia_nascita_pf || ''}
            onChange={(e) => updateFormData({ provincia_nascita_pf: e.target.value.toUpperCase() })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="es. RM"
            maxLength={2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Professione *</label>
          <input
            type="text"
            value={formData.professione_pf || ''}
            onChange={(e) => updateFormData({ professione_pf: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="es. Avvocato"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Nazionalità *</label>
          <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
            <select
              value={formData.nazionalita_pf || 'Italiana'}
              onChange={(e) => updateFormData({ nazionalita_pf: e.target.value })}
              className="w-full rounded-lg bg-white focus:outline-none focus:ring-0"
            >
              {NAZIONALITA.map(n => (
                <option key={n.nazionalita} value={n.nazionalita}>{n.nazionalita}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <IndirizzoStructured
        label="Residenza"
        required
        value={formData.residenza_pf || ''}
        onChange={(val) => updateFormData({ residenza_pf: val })}
        nazionalitaEstera={!isItaliana(formData.nazionalita_pf)}
        nazione={getNazioneByNazionalita(formData.nazionalita_pf || '') || ''}
        residenzaEstera={formData.residenza_estera_pf}
        onResidenzaEsteraChange={(val) => updateFormData({ residenza_estera_pf: val })}
      />

      {/* Documento d'Identità */}
      <div className="border-t pt-4">
        <h4 className="font-semibold mb-3">Documento d'Identità</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo Documento *</label>
            <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
              <select
                value={formData.documento_pf?.tipo || ''}
                onChange={(e) => updateFormData({documento_pf: { ...formData.documento_pf!, tipo: e.target.value }})}
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
              value={formData.documento_pf?.numero || ''}
              onChange={(e) => updateFormData({ 
                documento_pf: { ...formData.documento_pf!, numero: e.target.value } 
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
              value={formatDateInv(formData.documento_pf?.data_rilascio || '')}
              onChange={(e) => {
                const date=formatDate(e.target.value)
                updateFormData({ 
                  documento_pf: { 
                    ...formData.documento_pf!, 
                    data_rilascio: date
                  } 
                });
              }}
              placeholder="gg/mm/aaaa"
              maxLength={10}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                formData.documento_pf?.data_rilascio && !isValidDate(formData.documento_pf?.data_rilascio)
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
              value={formatDateInv(formData.documento_pf?.data_scadenza || '')}
              onChange={(e) => {
                const date = formatDate(e.target.value)
                updateFormData({ 
                  documento_pf: { 
                    ...formData.documento_pf!, 
                    data_scadenza: date
                  } 
                });
              }}
              placeholder="gg/mm/aaaa"
              maxLength={10}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                formData.documento_pf?.data_scadenza && !isValidDate(formData.documento_pf?.data_scadenza)
                  ? 'border-red-500'
                  : 'border-gray-300'
              }`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ente Rilascio *</label>
            <input
              type="text"
              value={formData.documento_pf?.ente_rilascio || ''}
              onChange={(e) => updateFormData({
                documento_pf: { ...formData.documento_pf!, ente_rilascio: e.target.value }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="es. Comune di Roma"
            />
          </div>

          <DocumentoIdentitaUpload
            file={formData.documento_pf?.file}
            cartaceo={formData.documento_pf?.cartaceo}
            descrizione={formData.documento_pf?.descrizione}
            dataScadenza={formData.documento_pf?.data_scadenza}
            esistente={formData.documento_pf?.esistente}
            onFileChange={(f) => updateFormData({
              documento_pf: { ...formData.documento_pf!, file: f }
            })}
            onCartaceoChange={(c) => updateFormData({
              documento_pf: {
                ...formData.documento_pf!,
                cartaceo: c,
                ...(c ? { file: null } : {}),
              }
            })}
            onDescrizioneChange={(d) => updateFormData({
              documento_pf: { ...formData.documento_pf!, descrizione: d }
            })}
            onDataScadenzaChange={(s) => updateFormData({
              documento_pf: { ...formData.documento_pf!, data_scadenza: s }
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
              checked={formData.pep_verificato_pf || false}
              onChange={(e) => updateFormData({
                pep_verificato_pf: e.target.checked,
                pep_data_verifica_pf: e.target.checked ? formatDate(new Date().toISOString().slice(0, 10)) : '',
              })}
              className="rounded text-blue-600"
            />
            <span className="text-sm">Verifica PPE effettuata</span>
          </label>
          {formData.pep_verificato_pf && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.pep_pf || false}
                onChange={(e) => updateFormData({ pep_pf: e.target.checked })}
                className="rounded text-red-600"
              />
              <span className="text-sm font-medium text-red-700">Il soggetto risulta PPE</span>
            </label>
          )}
        </div>
        {formData.pep_verificato_pf && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data verifica (gg/mm/aaaa)</label>
              <input
                type="date"
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                value={formatDateInv(formData.pep_data_verifica_pf || '')}
                onChange={(e) => updateFormData({ pep_data_verifica_pf: formatDate(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fonte verifica</label>
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                <select
                  value={formData.pep_fonte_verifica_pf || ''}
                  onChange={(e) => updateFormData({ pep_fonte_verifica_pf: e.target.value })}
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
        {formData.pep_pf && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Carica ricoperta</label>
            <input
              type="text"
              value={formData.pep_carica_pf || ''}
              onChange={(e) => updateFormData({ pep_carica_pf: e.target.value })}
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
              checked={formData.sanzioni_verificato_pf || false}
              onChange={(e) => updateFormData({
                sanzioni_verificato_pf: e.target.checked,
                sanzioni_data_verifica_pf: e.target.checked ? formatDate(new Date().toISOString().slice(0, 10)) : '',
              })}
              className="rounded text-blue-600"
            />
            <span className="text-sm">Verifica sanzioni effettuata</span>
          </label>
          {formData.sanzioni_verificato_pf && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.sanzioni_pf || false}
                onChange={(e) => updateFormData({ sanzioni_pf: e.target.checked })}
                className="rounded text-red-600"
              />
              <span className="text-sm font-medium text-red-700">Presente in liste sanzioni</span>
            </label>
          )}
        </div>
        {formData.sanzioni_verificato_pf && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data verifica (gg/mm/aaaa)</label>
              <input
                type="date"
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                value={formatDateInv(formData.sanzioni_data_verifica_pf || '')}
                onChange={(e) => updateFormData({ sanzioni_data_verifica_pf: formatDate(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fonte verifica</label>
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                <select
                  value={formData.sanzioni_fonte_verifica_pf || ''}
                  onChange={(e) => updateFormData({ sanzioni_fonte_verifica_pf: e.target.value })}
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
          value={formData.note_verifica_pf}
          onChange={(e) => updateFormData({ note_verifica_pf: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Note sulla verifica del cliente..."
        />
      </div>
    </div>
  );
}
