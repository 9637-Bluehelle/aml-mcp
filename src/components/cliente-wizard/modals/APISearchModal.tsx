import { X, Search, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { APILog } from '../types';
import { useScrollLock } from '../../../hooks/useScrollLock';

interface APISearchModalProps {
  show: boolean;
  apiVatInput: string;
  apiLog: APILog | null;
  onClose: () => void;
  onVatInputChange: (value: string) => void;
  onSearch: () => void;
  onProceed: () => void;
}

export function APISearchModal({
  show,
  apiVatInput,
  apiLog,
  onClose,
  onVatInputChange,
  onSearch,
  onProceed
}: APISearchModalProps) {
  useScrollLock(show);
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">🔍 Ricerca API AML</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Partita IVA o Codice Fiscale
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={apiVatInput}
                onChange={(e) => onVatInputChange(e.target.value)}
                placeholder="es. 12345678901"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={onSearch}
                disabled={!apiVatInput || apiLog?.status === 'loading'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {apiLog?.status === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Ricerca...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Cerca
                  </>
                )}
              </button>
            </div>
          </div>

          {apiLog && (
            <div className={`p-4 rounded-lg ${
              apiLog.status === 'success' ? 'bg-green-50 border border-green-200' :
              apiLog.status === 'error' ? 'bg-red-50 border border-red-200' :
              'bg-blue-50 border border-blue-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {apiLog.status === 'success' && <CheckCircle className="w-5 h-5 text-green-600" />}
                {apiLog.status === 'error' && <XCircle className="w-5 h-5 text-red-600" />}
                {apiLog.status === 'loading' && <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
                <span className="font-medium">
                  {apiLog.status === 'success' && 'Dati recuperati con successo'}
                  {apiLog.status === 'error' && 'Errore nella ricerca'}
                  {apiLog.status === 'loading' && 'Ricerca in corso...'}
                </span>
              </div>
              {apiLog.errorMessage && (
                <p className="text-sm text-red-600">{apiLog.errorMessage}</p>
              )}
              {apiLog.responseData && (
                <div className="text-sm text-gray-600 mt-2">
                  <p><strong>Ragione Sociale:</strong> {
                    apiLog.responseData.data?.companyDetails?.companyName || 
                    apiLog.responseData.companyDetails?.companyName || 
                    'N/D'
                  }</p>
                  <p><strong>P.IVA:</strong> {
                    apiLog.responseData.data?.companyDetails?.vatCode || 
                    apiLog.responseData.companyDetails?.vatCode || 
                    'N/D'
                  }</p>
                </div>
              )}
            </div>
          )}

          {apiLog?.status === 'success' && (
            <button
              onClick={onProceed}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Procedi con i dati caricati
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
