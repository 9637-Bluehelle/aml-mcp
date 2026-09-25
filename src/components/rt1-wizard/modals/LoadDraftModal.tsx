import { X, FileText, Plus, Copy } from 'lucide-react';
import { AutovalutazioneDB } from '../types';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { formatDate, calculateCompletionPercentage } from '../utils';

interface LoadDraftModalProps {
  show: boolean;
  draft: AutovalutazioneDB | null;
  onContinue: () => void;
  onStartNew: () => void;
  onDuplicate?: () => void;
}

export function LoadDraftModal({ show, draft, onContinue, onStartNew, onDuplicate }: LoadDraftModalProps) {
  useScrollLock(show && !!draft);
  if (!show || !draft) return null;

  const completionPercentage = calculateCompletionPercentage({
    version: draft.version,
    created_by: draft.created_by,
    descrizione_studio: draft.descrizione_studio,
    risposte_dettagliate: draft.risposte_dettagliate,
    piano_mitigazione: draft.piano_mitigazione
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Bozza Esistente Trovata</h2>
            <p className="text-sm text-gray-600 mt-1">
              È presente una bozza di autovalutazione non completata
            </p>
          </div>
          <button
            onClick={onStartNew}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Draft Info Card */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <div className="bg-blue-100 rounded-lg p-3">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Bozza - Versione {draft.version}</h3>
                <div className="mt-2 space-y-1 text-sm text-gray-700">
                  <p><strong>Valutatore:</strong> {draft.created_by || 'Non specificato'}</p>
                  <p><strong>Ultima modifica:</strong> {formatDate(draft.created_at)}</p>
                  <p><strong>Completamento:</strong> {completionPercentage}%</p>
                </div>

                {/* Progress Bar */}
                <div className="mt-3">
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info Text */}
          <div className="text-sm text-gray-600">
            <p className="mb-2">
              Hai tre opzioni:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Continua la bozza:</strong> Riprendi la compilazione dal punto in cui l'hai lasciata</li>
              <li><strong>Inizia da zero:</strong> Crea una nuova autovalutazione senza caricare la bozza</li>
              {onDuplicate && (
                <li><strong>Duplica bozza:</strong> Crea una copia della bozza esistente per modificarla</li>
              )}
            </ul>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>⚠️ Attenzione:</strong> Se scegli "Inizia da zero", la bozza esistente rimarrà salvata 
              ma non verrà caricata automaticamente. Potrai sempre accedervi dalla dashboard.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onContinue}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            <FileText className="w-4 h-4" />
            Continua la Bozza
          </button>
          
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors"
            >
              <Copy className="w-4 h-4" />
              Duplica
            </button>
          )}
          
          <button
            onClick={onStartNew}
            className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Inizia da Zero
          </button>
        </div>
      </div>
    </div>
  );
}
