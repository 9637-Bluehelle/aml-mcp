import { useState, useEffect } from 'react';
import { Plus, CheckCircle, UserPlus } from 'lucide-react';
import { Card } from '../../Card';
import { WizardData, TitolareEffettivo } from '../types';
import { TitolareEffettivoForm } from './titolari/TitolareEffettivoForm';
//import { CatenaControlloEditor } from './CatenaControlloEditor';
import { creaCatenaVuota, CatenaControllo } from '../../../lib/titolare-effettivo';

interface Step2Props {
  formData: WizardData;
  updateFormData: (updates: Partial<WizardData>) => void;
  addTitolare: () => void;
  addTitolareDaRappresentante: () => void;
  removeTitolare: (index: number) => void;
  updateTitolare: (index: number, updates: Partial<TitolareEffettivo>) => void;
  apiDataLoaded: boolean;
}

export function Step2TitolariEffettivi({
  formData,
  updateFormData,
  addTitolare,
  addTitolareDaRappresentante,
  removeTitolare,
  updateTitolare,
  apiDataLoaded
}: Step2Props) {
  // Inizializza la catena di controllo se non presente e il cliente è un'impresa
  useEffect(() => {
    if (formData.tipo_cliente === 'impresa' && !formData.catena_controllo) {
      const nodoCliente: import('../../../lib/titolare-effettivo').NodoPartecipativo = {
        id: 'cliente_root',
        tipo: 'societa_capitali',
        denominazione: formData.ragione_sociale || 'Impresa Cliente',
        natura_giuridica: formData.natura_giuridica || undefined,
      };
      const catena = creaCatenaVuota(nodoCliente);
      updateFormData({ catena_controllo: catena });
    }
  }, [formData.tipo_cliente, formData.ragione_sociale]);

  const handleCatenaChange = (catena: CatenaControllo) => {
    updateFormData({ catena_controllo: catena });
  };

  // Verifica se rappresentante legale è già presente nei titolari
  const isRLAlreadyPresent = () => {
    const rlName = formData.rappresentante_legale?.trim().toLowerCase();
    if (!rlName) return false;
    
    return formData.titolari_effettivi.some(t => 
      t.nome_cognome.trim().toLowerCase() === rlName
    );
  };

  const rappresentanteLegalePresente = isRLAlreadyPresent();
  // Salta questo step per persona fisica e professionista
  if (formData.tipo_cliente !== 'impresa') {
    return (
      <Card title="Step 2: Titolari Effettivi">
        <div className="text-center py-8 text-gray-500">
          <p>I titolari effettivi sono richiesti solo per le imprese.</p>
          <p className="text-sm mt-2">Puoi procedere al passaggio successivo.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Step 2: Titolari Effettivi">
      <div className="space-y-4">
        {/* Sezione Rappresentante Legale */}
        {formData.rappresentante_legale && (
          <div className={`p-4 rounded-lg border-2 ${
            rappresentanteLegalePresente 
              ? 'bg-green-50 border-green-300' 
              : 'bg-blue-50 border-blue-300'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  👤 Rappresentante Legale: <span className="font-bold">{formData.rappresentante_legale}</span>
                </p>
                {rappresentanteLegalePresente ? (
                  <p className="text-xs text-green-700 mt-1">
                    ✅ Già presente nei titolari effettivi
                  </p>
                ) : (
                  <p className="text-xs text-blue-700 mt-1">
                    ⚠️ Non presente nei titolari effettivi - Consigliato aggiungerlo
                  </p>
                )}
              </div>
              
              {!rappresentanteLegalePresente && (
                <button
                  onClick={addTitolareDaRappresentante}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Aggiungi come Titolare
                </button>
              )}
            </div>
          </div>
        )}

        {formData.titolari_effettivi.length === 0 && (
          <div className="bg-yellow-50 p-4 rounded-lg">
            <p className="text-sm text-yellow-800">
              ⚠️ Per le imprese è obbligatorio inserire almeno un titolare effettivo con tutti i dettagli richiesti dalla normativa AML.
            </p>
          </div>
        )}
        
        {apiDataLoaded && formData.titolari_effettivi.length > 0 && (
          <div className="bg-green-50 p-3 rounded-lg border border-green-200">
            <p className="text-sm text-green-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {formData.titolari_effettivi.length} titolare/i effettivo/i caricato/i da API
            </p>
          </div>
        )}
        
        {formData.titolari_effettivi.map((t, i) => (
          <TitolareEffettivoForm
            key={i}
            titolare={t}
            index={i}
            rappresentanteLegaleName={formData.rappresentante_legale}
            onUpdate={(updates) => updateTitolare(i, updates)}
            onRemove={() => removeTitolare(i)}
          />
        ))}
        
        <div className="flex gap-2">
          <button
            onClick={addTitolare}
            className="flex-1 flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 justify-center"
          >
            <Plus className="w-4 h-4" /> Aggiungi Titolare Manualmente
          </button>
        </div>
      </div>

      {/* Catena di Controllo - solo per imprese */}
      {/*formData.catena_controllo && (
        <div className="mt-6">
          <CatenaControlloEditor
            catena={formData.catena_controllo}
            onCatenaChange={handleCatenaChange}
          />
        </div>
      )*/}
    </Card>
  );
}
