import { Card } from '../../Card';
import { AlertCircle } from 'lucide-react';
import { SEZIONI_WIZARD, SLIDER_CONFIG } from '../constants';
import { RispostaSezione, RisposteDettagliate } from '../types';

interface Step7Props {
  risposte: RisposteDettagliate;
  updateRisposta: (key: keyof RisposteDettagliate, updates: Partial<RispostaSezione>) => void;
  isReadOnly?: boolean;
}

export function Step7OrganizzazioneAdempimenti({ risposte, updateRisposta, isReadOnly }: Step7Props) {
  const sezioni = [
    SEZIONI_WIZARD.find(s => s.key === 'organizzazione_adeguata_verifica')!,
    SEZIONI_WIZARD.find(s => s.key === 'organizzazione_conservazione')!,
    SEZIONI_WIZARD.find(s => s.key === 'organizzazione_segnalazione_sos')!
  ];

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Organizzazione Adempimenti Antiriciclaggio</h2>
        <p className="text-sm text-gray-600 mt-1">
          Valuta l'organizzazione interna dello studio per i principali adempimenti antiriciclaggio
        </p>
      </div>

      {sezioni.map((sezione, idx) => {
        const risposta = risposte[sezione.key as keyof RisposteDettagliate] as RispostaSezione;
        
        return (
          <Card key={sezione.key}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {idx + 1}. {sezione.titolo}
            </h3>
            
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
                onChange={(e) => updateRisposta(
                  sezione.key as keyof RisposteDettagliate, 
                  { scelta_valore: parseFloat(e.target.value) }
                )}
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
                onChange={(e) => updateRisposta(
                  sezione.key as keyof RisposteDettagliate,
                  { note: e.target.value }
                )}
                disabled={isReadOnly}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
                placeholder="Aggiungi eventuali note, procedure implementate, punti di forza o debolezza..."
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
