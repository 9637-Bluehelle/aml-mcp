import { useScrollLock } from '../../../hooks/useScrollLock';

interface APIChoiceModalProps {
  show: boolean;
  onChoice: (useAPI: boolean) => void;
}

export function APIChoiceModal({ show, onChoice }: APIChoiceModalProps) {
  useScrollLock(show);
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-bold mb-4">🔍 Ricerca Dati Impresa</h3>
        <p className="text-sm text-gray-600 mb-6">
          Vuoi cercare i dati dell'impresa tramite l'API AML usando la Partita IVA o Codice Fiscale?
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => onChoice(true)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Sì, cerca tramite API
          </button>
          <button
            onClick={() => onChoice(false)}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            No, inserimento manuale
          </button>
        </div>
      </div>
    </div>
  );
}
