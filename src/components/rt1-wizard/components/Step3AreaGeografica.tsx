import { Card } from '../../Card';
import { AlertCircle } from 'lucide-react';
import { SEZIONI_WIZARD, SLIDER_CONFIG } from '../constants';
import { RispostaSezione } from '../types';

interface Step3Props {
  risposta: RispostaSezione;
  updateRisposta: (updates: Partial<RispostaSezione>) => void;
  isReadOnly?: boolean;
}

export function Step3AreaGeografica({ risposta, updateRisposta, isReadOnly }: Step3Props) {
  const sezione = SEZIONI_WIZARD.find(s => s.key === 'area_geografica_operativita')!;
  
  return (
    <Card>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">{sezione.titolo}</h2>
      
      {/* Istruzioni */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <h4 className="font-semibold mb-1">Istruzioni</h4>
            <p className="whitespace-pre-line">{sezione.istruzioni}</p>
          </div>
        </div>
      </div>
      
      {/* Criteri Rischio */}
      {sezione.criteri_rischio && (
        <div className="mb-6">
          <h4 className="font-medium text-gray-900 mb-3">Criteri di Valutazione:</h4>
          <ul className="space-y-3">
            {sezione.criteri_rischio.map((criterio, i) => (
              <li key={i} className="text-sm text-gray-700 flex gap-3">
                <span className="font-bold text-blue-600 min-w-[2.5rem] text-center bg-blue-50 rounded px-2 py-0.5">
                  {criterio.indice_rischiosita}.0
                </span>
                <span className="flex-1">{criterio.descrizione}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Slider */}
      <div className="mb-6 bg-gray-50 rounded-lg p-5 border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-700">
            Indice di Rischiosità Selezionato
          </label>
          <span className="text-4xl font-bold text-blue-600">
            {risposta.scelta_valore !== null ? risposta.scelta_valore.toFixed(1) : '—'}
          </span>
        </div>
        
        <input
          type="range"
          min={SLIDER_CONFIG.min}
          max={SLIDER_CONFIG.max}
          step={SLIDER_CONFIG.step}
          value={risposta.scelta_valore ?? SLIDER_CONFIG.default}
          onChange={(e) => updateRisposta({ scelta_valore: parseFloat(e.target.value) })}
          disabled={isReadOnly}
          className="w-full h-3 bg-gradient-to-r from-green-200 via-yellow-200 to-red-200 rounded-lg appearance-none cursor-pointer slider-thumb"
          style={{
            background: 'linear-gradient(to right, #86efac 0%, #fef08a 50%, #fca5a5 100%)'
          }}
        />
        
        <div className="flex justify-between text-xs text-gray-600 mt-2 px-1">
          <span className="font-medium">1.0 (Non significativo)</span>
          <span className="font-medium">4.0 (Molto significativo)</span>
        </div>
      </div>
      
      {/* Note */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Note e Considerazioni Aggiuntive
        </label>
        <textarea
          value={risposta.note}
          onChange={(e) => updateRisposta({ note: e.target.value })}
          disabled={isReadOnly}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
          placeholder="Aggiungi eventuali note, dettagli specifici o motivazioni della scelta..."
        />
      </div>
    </Card>
  );
}
