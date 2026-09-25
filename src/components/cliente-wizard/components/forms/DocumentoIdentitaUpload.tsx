import { useId } from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import { formatDate, formatDateInv } from './PersonaFisicaForm';
import type { DocumentoIdentitaEsistente } from '../../../../lib/documentUploadHelper';

interface DocumentoIdentitaUploadProps {
  file?: File | null;
  cartaceo?: boolean;
  descrizione?: string;
  /** Data di scadenza in formato dd/mm/yyyy (stessa del blocco metadati: edit qui aggiorna là) */
  dataScadenza?: string;
  /** Documento già presente a sistema (persona importata dall'anagrafica). Se presente,
   *  mostriamo le info in lettura invece del form di upload. */
  esistente?: DocumentoIdentitaEsistente | null;
  onFileChange: (file: File | null) => void;
  onCartaceoChange: (cartaceo: boolean) => void;
  onDescrizioneChange: (descrizione: string) => void;
  onDataScadenzaChange: (dataScadenza: string) => void;
}

export function DocumentoIdentitaUpload({
  file,
  cartaceo,
  descrizione,
  dataScadenza,
  esistente,
  onFileChange,
  onCartaceoChange,
  onDescrizioneChange,
  onDataScadenzaChange,
}: DocumentoIdentitaUploadProps) {
  const checkboxId = useId();
  const scadenzaObbligatoria = !!file || !!cartaceo;
  const scadenzaMancante = scadenzaObbligatoria && !dataScadenza;

  if (esistente) {
    const scadIt = esistente.data_scadenza ? formatDate(esistente.data_scadenza) : '—';
    const acqIt = esistente.data_acquisizione ? formatDate(esistente.data_acquisizione) : '—';
    return (
      <div className="md:col-span-2 border-2 border-green-200 bg-green-50 rounded-lg p-4 space-y-2">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-medium text-green-900">Documento di Identità già a sistema</h4>
            <p className="text-xs text-green-800 mt-0.5">
              La persona importata ha già un documento di identità registrato. Non è necessario caricarne uno nuovo.
            </p>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-green-200 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="font-medium text-gray-900 truncate" title={esistente.nome_file}>
              {esistente.nome_file || 'Documento di identità'}
            </span>
            {esistente.cartaceo && (
              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded">Cartaceo</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 pt-1">
            <div><span className="text-gray-500">Data acquisizione: </span>{acqIt}</div>
            <div><span className="text-gray-500">Data scadenza: </span>{scadIt}</div>
          </div>
          {esistente.descrizione && (
            <div className="text-xs text-gray-700 pt-1">
              <span className="text-gray-500">Descrizione: </span>{esistente.descrizione}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="md:col-span-2 space-y-2">
      <p className="text-xs text-gray-500 italic">
        Facoltativo — il documento di identità può essere caricato anche in un secondo momento dalla scheda anagrafica.
      </p>
      <div className="border-2 border-blue-200 bg-blue-50 rounded-lg p-4 space-y-4">
        <h4 className="font-medium text-blue-900 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Carica o Registra Documento di Identità
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipologia</label>
            <div className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
              Documento di identità
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data scadenza documento {scadenzaObbligatoria && <span className="text-red-600">*</span>} (gg/mm/aaaa)
            </label>
            <input
              type="date"
              onClick={(e) => (e.target as HTMLInputElement).showPicker()}
              value={formatDateInv(dataScadenza || '')}
              onChange={(e) => onDataScadenzaChange(formatDate(e.target.value))}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                scadenzaMancante ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {scadenzaMancante && (
              <p className="mt-1 text-xs text-red-600">
                Obbligatoria quando viene registrato un documento (PDF o cartaceo).
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
            <input
              type="text"
              value={descrizione || ''}
              onChange={(e) => onDescrizioneChange(e.target.value)}
              placeholder="Descrizione opzionale..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={checkboxId}
            checked={!!cartaceo}
            onChange={(e) => onCartaceoChange(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor={checkboxId} className="text-sm font-medium text-gray-700 cursor-pointer">
            Documento di identità cartaceo (non disponibile digitalmente)
          </label>
        </div>

        {!cartaceo && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File del documento di identità</label>
            <p className="text-xs text-gray-500 mb-2">
              Sono supportati esclusivamente file in formato <strong>PDF</strong> o <strong>PDF/A</strong>.
            </p>
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => onFileChange(e.target.files?.[0] || null)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-blue-100 file:text-blue-700 file:text-sm file:cursor-pointer"
            />
            {file && (
              <p className="mt-2 text-xs text-blue-800">
                Selezionato: <strong>{file.name}</strong>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
