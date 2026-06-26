import { X, Bug } from 'lucide-react';
import { useScrollLock } from '../../../hooks/useScrollLock';

interface DebugLogModalProps {
  show: boolean;
  debugLog: string[];
  onClose: () => void;
}

export function DebugLogModal({ show, debugLog, onClose }: DebugLogModalProps) {
  useScrollLock(show);
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Bug className="w-5 h-5" />
            Debug Log
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs overflow-x-auto max-h-[70vh] overflow-y-auto">
          {debugLog.length === 0 ? (
            <p>Nessun log disponibile</p>
          ) : (
            debugLog.map((log, i) => (
              <div key={i} className="mb-2 whitespace-pre-wrap">{log}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
