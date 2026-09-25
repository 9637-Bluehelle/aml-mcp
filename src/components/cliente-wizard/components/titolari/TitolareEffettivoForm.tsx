import { useState, useEffect } from 'react';
import { Trash2, User, Building2, Search } from 'lucide-react';
import { TitolareEffettivo } from '../../types';
import { isValidDate } from '../../utils';
import {formatDate, formatDateInv, normalizeDate, parseCodiceFiscale} from '../forms/PersonaFisicaForm';
import { AnagraficaSearchInput } from '../../../AnagraficaSearchInput';
import type { PersonaFisicaRecord } from '../../../../lib/personeHelper';
import { detectTipoSoggetto } from '../../../../lib/personeHelper';
import { useCfConflictCheck } from '../../../../lib/useCfConflictCheck';
import { IndirizzoStructured } from '../forms/IndirizzoStructured';
import { NAZIONALITA, getNazioneByNazionalita, isItaliana } from '../../../../lib/nazionalitaHelper';
import { DocumentoIdentitaUpload } from '../forms/DocumentoIdentitaUpload';
import { CodiceAtecoSearch } from '../forms/CodiceAtecoSearch';
import { fetchDocumentoIdentitaEsistente } from '../../../../lib/documentUploadHelper';

interface TitolareEffettivoFormProps {
  titolare: TitolareEffettivo;
  index: number;
  rappresentanteLegaleName?: string;
  onUpdate: (updates: Partial<TitolareEffettivo>) => void;
  onRemove: () => void;
}

export function TitolareEffettivoForm({ 
  titolare, 
  index, 
  rappresentanteLegaleName,
  onUpdate, 
  onRemove 
}: TitolareEffettivoFormProps) {
  // Verifica se questo titolare è il rappresentante legale
  const isRappresentanteLegale = rappresentanteLegaleName &&
    titolare.nome_cognome.trim().toLowerCase() === rappresentanteLegaleName.trim().toLowerCase();

  // Derive il tipo effettivo: usa quello salvato, altrimenti deduci dal CF (per dati pre-compilati / legacy)
  const tipoEffettivo: 'persona_fisica' | 'azienda' =
    titolare.tipo_soggetto
      ?? detectTipoSoggetto(titolare.codice_fiscale)
      ?? 'persona_fisica';
  const isAzienda = tipoEffettivo === 'azienda';
  // Una volta che l'utente sceglie il tipo manualmente, l'autodetect da CF non lo cambia più
  const [tipoManuale, setTipoManuale] = useState(false);
  const cfConflict = useCfConflictCheck(titolare.codice_fiscale, titolare.nome_cognome);

  // Persiste il tipo dedotto al primo render se mancante sul record (dati legacy)
  useEffect(() => {
    if (!titolare.tipo_soggetto && tipoEffettivo) {
      onUpdate({ tipo_soggetto: tipoEffettivo });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTipoChange(nuovo: 'persona_fisica' | 'azienda') {
    setTipoManuale(true);
    onUpdate({
      tipo_soggetto: nuovo,
      // Quando si passa ad azienda, suggerisci tipo_rapporto coerente
      ...(nuovo === 'azienda' && titolare.tipo_rapporto === 'in_proprio'
        ? { tipo_rapporto: 'societa_ente' as const }
        : {}),
    });
  }

  async function handleImportPersona(p: PersonaFisicaRecord) {
    const estero = !isItaliana(p.nazionalita);
    const esistente = p.id && p.tipo_soggetto !== 'azienda'
      ? await fetchDocumentoIdentitaEsistente(p.id)
      : null;
    const importIsAzienda = p.tipo_soggetto === 'azienda';
    onUpdate({
      tipo_soggetto: p.tipo_soggetto || 'persona_fisica',
      nome_cognome: p.nome_cognome,
      codice_fiscale: p.codice_fiscale,
      partita_iva: p.partita_iva || '',
      natura_giuridica: p.natura_giuridica || '',
      codice_ateco: p.codice_ateco || '',
      data_nascita: normalizeDate(p.data_nascita),
      comune_nascita: p.luogo_nascita,
      provincia_nascita: p.provincia_nascita,
      nazionalita: p.nazionalita,
      // Per le aziende, "professione" è il ruolo specifico verso il cliente: non si importa dall'anagrafica
      professione: importIsAzienda ? '' : p.professione,
      residenza: p.residenza,
      residenza_estera: estero,
      documento_tipo: p.documento_tipo,
      documento_numero: p.documento_numero,
      documento_rilascio_data: normalizeDate(p.documento_data_rilascio),
      documento_scadenza: normalizeDate(p.documento_data_scadenza),
      documento_rilascio_ente: p.documento_ente_rilascio,
      is_pep: p.pep || false,
      pep_carica: p.pep_carica || '',
      pep_verificato: p.pep_verificato,
      pep_data_verifica: normalizeDate(p.pep_data_verifica),
      pep_fonte_verifica: p.pep_fonte_verifica,
      sanzioni: p.sanzioni,
      sanzioni_verificato: p.sanzioni_verificato,
      sanzioni_data_verifica: normalizeDate(p.sanzioni_data_verifica),
      sanzioni_fonte_verifica: p.sanzioni_fonte_verifica,
      documento_esistente: esistente,
    });
  }

  function handleCfChange(raw: string) {
    const cf = raw.toUpperCase();
    const detected = detectTipoSoggetto(cf);
    const nuovoTipo = !tipoManuale && detected ? detected : (titolare.tipo_soggetto || 'persona_fisica');

    if (nuovoTipo === 'persona_fisica') {
      const dati = parseCodiceFiscale(cf);
      if (dati) {
        onUpdate({
          tipo_soggetto: nuovoTipo,
          codice_fiscale: cf,
          data_nascita: formatDate(dati.data_nascita),
          comune_nascita: dati.comune,
          provincia_nascita: dati.provincia,
        });
        return;
      }
    }
    onUpdate({
      tipo_soggetto: nuovoTipo,
      codice_fiscale: cf,
      // Per azienda con CF a 11 cifre, ricopia su partita IVA se non è già compilata
      ...(nuovoTipo === 'azienda' && /^\d{11}$/.test(cf) && !titolare.partita_iva
        ? { partita_iva: cf }
        : {}),
    });
  }

  return (
    <div className={`border p-4 rounded-lg ${
      isRappresentanteLegale ? 'bg-blue-50 border-blue-300' : 'bg-gray-50'
    }`}>
      <div className="flex justify-between mb-4">
        <div className="flex items-center gap-2">
          <h4 className="font-medium">Titolare #{index + 1}</h4>
          {isAzienda && (
            <span className="text-xs bg-amber-600 text-white px-2 py-1 rounded font-semibold">
              AZIENDA
            </span>
          )}
          {isRappresentanteLegale && !isAzienda && (
            <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded font-semibold">
              RAPPRESENTANTE LEGALE
            </span>
          )}
        </div>
        <button onClick={onRemove} className="text-red-600 hover:text-red-800">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        {/* Toggle PF/Azienda */}
        <div className="flex items-center gap-3 flex-wrap">
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
                isAzienda ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
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
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {isAzienda ? 'Ragione Sociale *' : 'Nome e Cognome *'}
        </label>
        <AnagraficaSearchInput
          onSelectAnagrafica={handleImportPersona}
          placeholder={isAzienda ? 'es. ALPHA S.R.L.' : 'Nome e Cognome'}
          value={titolare.nome_cognome}
          onChange={(e) => onUpdate({ nome_cognome: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {isAzienda ? 'Codice Fiscale Azienda *' : 'Codice Fiscale *'}
        </label>
        <AnagraficaSearchInput
          onSelectAnagrafica={handleImportPersona}
          placeholder={isAzienda ? '11 cifre' : 'Codice Fiscale'}
          value={titolare.codice_fiscale}
          onChange={(e) => handleCfChange(e.target.value)}
          maxLength={isAzienda ? 11 : 16}
          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
            cfConflict
              ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
              : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
          }`}
        />
        {cfConflict && (
          <p className="text-xs text-red-600 mt-1">Codice fiscale già associato a "{cfConflict}"</p>
        )}
        {!isAzienda && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Professione
            </label>
            <input
              type="text"
              placeholder="es. Commercialista"
              value={titolare.professione}
              onChange={(e) => onUpdate({ professione: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </>
        )}
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Ruolo *
        </label>
        <input
          type="text"
          placeholder={isAzienda ? 'es. Azionista, Socio, Amministratore, Controllante, Beneficiario…' : 'es. Socio al 30%, Amministratore, Beneficiario…'}
          value={titolare.ruolo}
          onChange={(e) => onUpdate({ ruolo: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />

        {isAzienda ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Partita IVA</label>
                <input
                  type="text"
                  placeholder="es. 12345678901"
                  maxLength={11}
                  value={titolare.partita_iva || ''}
                  onChange={(e) => onUpdate({ partita_iva: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Natura Giuridica</label>
                <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                  <select
                    value={titolare.natura_giuridica || ''}
                    onChange={(e) => onUpdate({ natura_giuridica: e.target.value })}
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
            </div>
            <CodiceAtecoSearch
              codiceAteco={titolare.codice_ateco || ''}
              attivitaSvolta=""
              onSelect={(codice) => onUpdate({ codice_ateco: codice })}
            />
          </>
        ) : (
          <>
        <div className="grid grid-cols-2 gap-3">
          <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Comune Nascita *
          </label>
          <input
            type="text"
            placeholder="Comune Nascita"
            value={titolare.comune_nascita}
            onChange={(e) => onUpdate({ comune_nascita: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          </div>
          <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
           Provincia *
          </label>
          <input
            type="text"
            placeholder="Provincia"
            value={titolare.provincia_nascita}
            onChange={(e) => onUpdate({ provincia_nascita: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-2">
          Data Nascita * (gg/mm/aaaa)
        </label>
        <input
          type="date"
          onClick={(e) => (e.target as HTMLInputElement).showPicker()}
          placeholder="gg/mm/aaaa"
          value={formatDateInv(titolare.data_nascita)}
          onChange={(e) => {
            const date = formatDate(e.target.value)
            onUpdate({ data_nascita: date })
          }}
          maxLength={10}
          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            titolare.data_nascita && !isValidDate(titolare.data_nascita)
              ? 'border-red-500'
              : 'border-gray-200'
          }`}
        />
          </>
        )}
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Nazionalità *
        </label>
        <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
          <select
            value={titolare.nazionalita || 'Italiana'}
            onChange={(e) => onUpdate({ nazionalita: e.target.value })}
            className="w-full rounded-lg bg-white focus:outline-none focus:ring-0"
          >
            {NAZIONALITA.map(n => (
              <option key={n.nazionalita} value={n.nazionalita}>{n.nazionalita}</option>
            ))}
          </select>
        </div>

        {/* RESIDENZA / SEDE LEGALE */}
        <div className="border-t pt-3 mt-3">
          <IndirizzoStructured
            label={isAzienda ? 'Sede Legale' : 'Residenza'}
            value={titolare.residenza}
            onChange={(val) => onUpdate({ residenza: val })}
            nazionalitaEstera={!isItaliana(titolare.nazionalita)}
            nazione={getNazioneByNazionalita(titolare.nazionalita || '') || ''}
            residenzaEstera={titolare.residenza_estera}
            onResidenzaEsteraChange={(val) => onUpdate({ residenza_estera: val })}
          />
        </div>


        {/* DOCUMENTO IDENTITÀ — solo per persone fisiche */}
        {!isAzienda && (
        <div className="border-t pt-3 mt-3">
          <h5 className="font-semibold mb-3">Documento d'Identità</h5>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo Documento *</label>
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                <select
                  value={titolare.documento_tipo || ''}
                  onChange={(e) => onUpdate({ documento_tipo: e.target.value })}
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Numero *</label>
              <input
                type="text"
                placeholder="Numero"
                value={titolare.documento_numero}
                onChange={(e) => onUpdate({ documento_numero: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Data Rilascio * (gg/mm/aaaa)</label>
              <input
                type="date"
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                placeholder="gg/mm/aaaa"
                value={formatDateInv(titolare.documento_rilascio_data)}
                onChange={(e) => {
                  const date = formatDate(e.target.value);
                  onUpdate({ documento_rilascio_data: date })
                }}
                maxLength={10}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  titolare.documento_rilascio_data && !isValidDate(titolare.documento_rilascio_data)
                    ? 'border-red-500'
                    : 'border-gray-200'
                }`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Data Scadenza * (gg/mm/aaaa)</label>
              <input
                type="date"
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                placeholder="gg/mm/aaaa"
                value={formatDateInv(titolare.documento_scadenza)}
                onChange={(e) => {
                  const date = formatDate(e.target.value);
                  onUpdate({ documento_scadenza:date })
                }}
                maxLength={10}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  titolare.documento_scadenza && !isValidDate(titolare.documento_scadenza)
                    ? 'border-red-500'
                    : 'border-gray-200'
                }`}
              />
            </div>
          </div>
          
          <label className="block text-sm font-medium text-gray-700 mt-3 mb-0">Ente Rilascio *</label>
          <input
            type="text"
            placeholder="Rilasciato da"
            value={titolare.documento_rilascio_ente}
            onChange={(e) => onUpdate({ documento_rilascio_ente: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg mt-2"
          />

          <div className="mt-3">
            <DocumentoIdentitaUpload
              file={titolare.documento_file}
              cartaceo={titolare.documento_cartaceo}
              descrizione={titolare.documento_descrizione}
              dataScadenza={titolare.documento_scadenza}
              esistente={titolare.documento_esistente}
              onFileChange={(f) => onUpdate({ documento_file: f })}
              onCartaceoChange={(c) => onUpdate({
                documento_cartaceo: c,
                ...(c ? { documento_file: null } : {}),
              })}
              onDescrizioneChange={(d) => onUpdate({ documento_descrizione: d })}
              onDataScadenzaChange={(s) => onUpdate({ documento_scadenza: s })}
            />
          </div>
        </div>
        )}

        {/* DOCUMENTO AZIENDA — upload generico (visura, atto costitutivo, ecc.) */}
        {isAzienda && (
        <div className="border-t pt-3 mt-3">
          <h5 className="font-semibold mb-3">Documento Azienda</h5>
          <p className="text-xs text-gray-500 italic mb-3">
            Carica un documento di riferimento (es. visura camerale, atto costitutivo). Potrai aggiungere ulteriori documenti dopo il salvataggio.
          </p>
          <DocumentoIdentitaUpload
            file={titolare.documento_file}
            cartaceo={titolare.documento_cartaceo}
            descrizione={titolare.documento_descrizione}
            dataScadenza={titolare.documento_scadenza}
            esistente={titolare.documento_esistente}
            onFileChange={(f) => onUpdate({ documento_file: f })}
            onCartaceoChange={(c) => onUpdate({
              documento_cartaceo: c,
              ...(c ? { documento_file: null } : {}),
            })}
            onDescrizioneChange={(d) => onUpdate({ documento_descrizione: d })}
            onDataScadenzaChange={(s) => onUpdate({ documento_scadenza: s })}
          />
        </div>
        )}

        <div className="border-t pt-3 mt-3">
          <h5 className="font-semibold font-medium  mb-2">Note</h5>
          <input
            type="text"
            placeholder="es. Quota: ..."
            value={titolare.note_quota}//useClienteForm
            onChange={(e) => onUpdate({ note_quota: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Verifica PEP / Sanzioni — solo per persone fisiche */}
        {!isAzienda && (
        <div className="border-t pt-3 mt-3 space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <h5 className="text-sm font-semibold text-blue-900">Verifica PPE (Persona Politicamente Esposta)</h5>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={titolare.pep_verificato || false}
                  onChange={(e) => onUpdate({
                    pep_verificato: e.target.checked,
                    pep_data_verifica: e.target.checked ? formatDate(new Date().toISOString().slice(0, 10)) : '',
                  })}
                  className="rounded text-blue-600"
                />
                <span className="text-sm">Verifica PPE effettuata</span>
              </label>
              {titolare.pep_verificato && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={titolare.is_pep}
                    onChange={(e) => onUpdate({ is_pep: e.target.checked })}
                    className="rounded text-red-600"
                  />
                  <span className="text-sm font-medium text-red-700">Il soggetto risulta PPE</span>
                </label>
              )}
            </div>
            {titolare.pep_verificato && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Data verifica (gg/mm/aaaa)</label>
                  <input
                    type="date"
                    onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                    value={formatDateInv(titolare.pep_data_verifica || '')}
                    onChange={(e) => onUpdate({ pep_data_verifica: formatDate(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fonte verifica</label>
                  <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                    <select
                      value={titolare.pep_fonte_verifica || ''}
                      onChange={(e) => onUpdate({ pep_fonte_verifica: e.target.value })}
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
            {titolare.is_pep && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Carica ricoperta</label>
                <input
                  type="text"
                  placeholder="es. Parlamentare, Sindaco..."
                  value={titolare.pep_carica}
                  onChange={(e) => onUpdate({ pep_carica: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}
          </div>

          {/* Verifica Sanzioni */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <h5 className="text-sm font-semibold text-blue-900">Verifica Liste Sanzioni / Embargo</h5>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={titolare.sanzioni_verificato || false}
                  onChange={(e) => onUpdate({
                    sanzioni_verificato: e.target.checked,
                    sanzioni_data_verifica: e.target.checked ? formatDate(new Date().toISOString().slice(0, 10)) : '',
                  })}
                  className="rounded text-blue-600"
                />
                <span className="text-sm">Verifica sanzioni effettuata</span>
              </label>
              {titolare.sanzioni_verificato && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={titolare.sanzioni || false}
                    onChange={(e) => onUpdate({ sanzioni: e.target.checked })}
                    className="rounded text-red-600"
                  />
                  <span className="text-sm font-medium text-red-700">Presente in liste sanzioni</span>
                </label>
              )}
            </div>
            {titolare.sanzioni_verificato && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Data verifica (gg/mm/aaaa)</label>
                  <input
                    type="date"
                    onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                    value={formatDateInv(titolare.sanzioni_data_verifica || '')}
                    onChange={(e) => onUpdate({ sanzioni_data_verifica: formatDate(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fonte verifica</label>
                  <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                    <select
                      value={titolare.sanzioni_fonte_verifica || ''}
                      onChange={(e) => onUpdate({ sanzioni_fonte_verifica: e.target.value })}
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
        </div>
        )}
      </div>
    </div>
  );
}
