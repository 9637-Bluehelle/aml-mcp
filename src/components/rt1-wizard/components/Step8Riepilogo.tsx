import { Card } from '../../Card';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { RT1WizardData } from '../types';
import { calculateRT1Scores, validateComplete, getRiskLabel } from '../utils';

interface Step8Props {
  formData: RT1WizardData;
  updateFormData: (updates: Partial<RT1WizardData>) => void;
  isReadOnly?: boolean;
}

export function Step8Riepilogo({ formData, updateFormData, isReadOnly }: Step8Props) {
  const scores = calculateRT1Scores(formData.risposte_dettagliate);
  const validation = validateComplete(formData);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Riepilogo Autovalutazione</h2>
        <p className="text-sm text-gray-600 mt-1">
          Verifica i dati inseriti e completa l'autovalutazione
        </p>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-center">
            <h4 className="text-sm font-medium text-gray-600 mb-2">Rischio Inerente</h4>
            <div className="text-5xl font-bold text-blue-600 mb-2">
              {scores.inerente.toFixed(2)}
            </div>
            <div className="text-sm font-semibold text-gray-600">{getRiskLabel(scores.inerente)}</div>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <h4 className="text-sm font-medium text-gray-600 mb-2">Vulnerabilità</h4>
            <div className="text-5xl font-bold text-orange-600 mb-2">
              {scores.vulnerabilita.toFixed(2)}
            </div>
            <div className="text-sm font-semibold text-gray-600">{getRiskLabel(scores.vulnerabilita)}</div>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <h4 className="text-sm font-medium text-gray-600 mb-2">Rischio Residuo</h4>
            <div className="text-5xl font-bold text-red-600 mb-2">
              {scores.residuo.toFixed(2)}
            </div>
            <div className="text-sm font-semibold text-gray-600">{getRiskLabel(scores.residuo)}</div>
          </div>
        </Card>
      </div>

      {/* Riepilogo Descrizione Studio */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Descrizione Studio Professionale</h3>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium text-gray-700">Tipologia Giuridica:</dt>
            <dd className="text-gray-600 mt-1">{formData.descrizione_studio.tipologia_giuridica || '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-700">Anno Inizio Attività:</dt>
            <dd className="text-gray-600 mt-1">{formData.descrizione_studio.anno_inizio_attivita || '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-700">Sedi:</dt>
            <dd className="text-gray-600 mt-1 whitespace-pre-line">{formData.descrizione_studio.sedi || '—'}</dd>
          </div>
        </dl>
      </Card>

      {/* Riepilogo Risposte */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Fattori di Rischio Valutati</h3>
        <div className="space-y-3">
          {Object.entries(formData.risposte_dettagliate).map(([key, risposta]) => (
            <div key={key} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
              <span className="text-sm font-medium text-gray-700 capitalize">
                {key.replace(/_/g, ' ')}
              </span>
              <span className="text-lg font-bold text-blue-600">
                {risposta.scelta_valore !== null ? risposta.scelta_valore.toFixed(1) : '—'}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Piano Mitigazione */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Piano di Mitigazione *</h3>
        <p className="text-sm text-gray-600 mb-3">
          Indica le misure di mitigazione adottate o pianificate per ridurre il rischio residuo.
        </p>
        <textarea
          value={formData.piano_mitigazione}
          onChange={(e) => updateFormData({ piano_mitigazione: e.target.value })}
          disabled={isReadOnly}
          rows={6}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
          placeholder="Descrivi le misure di mitigazione implementate: procedure interne, formazione del personale, sistemi di controllo, aggiornamenti normativi..."
        />
      </Card>

      {/* Metadati */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Informazioni Autovalutazione</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Versione *
            </label>
            <input
              type="text"
              value={formData.version}
              onChange={(e) => updateFormData({ version: e.target.value })}
              disabled={isReadOnly}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
              placeholder="Es: 1.0, 1.1, 2.0..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Valutatore *
            </label>
            <input
              type="text"
              value={formData.created_by}
              onChange={(e) => updateFormData({ created_by: e.target.value })}
              disabled={isReadOnly}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
              placeholder="Nome e cognome del valutatore"
            />
          </div>
        </div>
      </Card>

      {/* Validazione Errors */}
      {!validation.valid && !isReadOnly && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-800 mb-2">
                Dati mancanti o incompleti
              </h4>
              <p className="text-sm text-red-700">{validation.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {validation.valid && !isReadOnly && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
          <div className="flex items-start">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-green-800 mb-1">
                Autovalutazione Completa
              </h4>
              <p className="text-sm text-green-700">
                Tutti i dati necessari sono stati inseriti. Puoi procedere al completamento dell'autovalutazione.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
