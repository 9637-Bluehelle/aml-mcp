import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Save, Loader2, X } from 'lucide-react';
import { RT1WizardProps } from './types';
import { TOTAL_STEPS, STEP_LABELS } from './constants';
import { useRT1Form } from './hooks/useRT1Form';
import { useRT1Save } from './hooks/useRT1Save';
import { StepIndicator } from './components/StepIndicator';
import { LoadDraftModal } from './modals/LoadDraftModal';
import { Step1DescrizioneStudio } from './components/Step1DescrizioneStudio';
import { Step2TipologiaClientela } from './components/Step2TipologiaClientela';
import { Step3AreaGeografica } from './components/Step3AreaGeografica';
import { Step4CanaliDistributivi } from './components/Step4CanaliDistributivi';
import { Step5ServiziProfessionali } from './components/Step5ServiziProfessionali';
import { Step6Formazione } from './components/Step6Formazione';
import { Step7OrganizzazioneAdempimenti } from './components/Step7OrganizzazioneAdempimenti';
import { Step8Riepilogo } from './components/Step8Riepilogo';
import { Spinner } from '../cliente-wizard/modals/Spinner';
import { useToast } from '../Toast';

export function RT1Wizard({ onComplete, onCancel, autovalutazioneId, mode = 'new' }: RT1WizardProps) {
  const toast = useToast();
  // console.log('🎬 [WIZARD] RT1Wizard montato/aggiornato');
  // console.log('🎬 [WIZARD] onComplete ricevuto:', onComplete?.name || 'anonymous', onComplete);

  const {
    formData,
    updateFormData,
    updateDescrizioneStudio,
    updateRisposta,
    loading,
    initializing,
    initialStep,
    sourceAutovalutazione,
    initializeNewAutovalutazione,
    duplicateFromSource
  } = useRT1Form(autovalutazioneId, mode);

  const [currentStep, setCurrentStep] = useState(initialStep);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(autovalutazioneId);

  const { isSaving, saveError, saveDraft, saveComplete } = useRT1Save(formData, draftId);

  const isReadOnly = mode === 'view';

  useEffect(() => {
    if (!autovalutazioneId && !sourceAutovalutazione) {
      initializeNewAutovalutazione();
    }
  }, []);

  useEffect(() => {
    // Se c'è una bozza esistente e siamo in modalità new, mostra modal
    if (mode === 'new' && sourceAutovalutazione && !autovalutazioneId) {
      setShowDraftModal(true);
    }
  }, [sourceAutovalutazione, mode, autovalutazioneId]);

  // Navigazione step
  const nextStep = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const goToStep = (step: number) => {
    if (step >= 1 && step <= TOTAL_STEPS) {
      setCurrentStep(step);
    }
  };

  // Salvataggio bozza
  const handleSaveDraft = async () => {
    const savedId = await saveDraft(() => {
      toast.success('Bozza salvata con successo!');
    });
    
    // Aggiorna sempre draftId dopo il salvataggio (sia INSERT che UPDATE)
    if (savedId) {
      setDraftId(savedId);
    }
  };

  // Completamento autovalutazione
  const handleComplete = async () => {
    // console.log('🔵 [WIZARD] handleComplete chiamato');
    // console.log('🔵 [WIZARD] onComplete è:', typeof onComplete, onComplete);

    const success = await saveComplete(() => {
      // console.log('🟢 [WIZARD] Callback saveComplete eseguito!');
      // console.log('🟢 [WIZARD] Chiamando onComplete...');
      onComplete();
      // console.log('🟢 [WIZARD] onComplete chiamato!');
    });

    // console.log('🔵 [WIZARD] saveComplete ritornato, success:', success);
  };

  // Gestione modal bozza
  const handleContinueDraft = () => {
    if (sourceAutovalutazione) {
      setDraftId(sourceAutovalutazione.id);
      setCurrentStep(initialStep);
    }
    setShowDraftModal(false);
  };

  const handleStartNew = () => {
    setShowDraftModal(false);
  };

  const handleDuplicateFromSource = async () => {
    await duplicateFromSource();
    setShowDraftModal(false);
  };

  if (loading || initializing) {
    return <Spinner/>;
  }

  return (
    <>
      <LoadDraftModal
        show={showDraftModal}
        draft={sourceAutovalutazione}
        onContinue={handleContinueDraft}
        onStartNew={handleStartNew}
        onDuplicate={handleDuplicateFromSource}
      />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isReadOnly ? 'Visualizza Autovalutazione' : 'RT1 - Autovalutazione del Rischio'}
            </h1>
            <p className="text-gray-600 mt-1">
              {isReadOnly 
                ? `Versione ${formData.version} - ${formData.created_by}`
                : 'Valutazione del rischio di riciclaggio e finanziamento del terrorismo'
              }
            </p>
          </div>
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
            Chiudi
          </button>
        </div>

        {/* Step Indicator */}
        <StepIndicator
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          stepLabels={STEP_LABELS}
          onStepClick={goToStep}
        />

        {/* Alert Info */}
        {currentStep === 1 && !isReadOnly && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <div className="flex-1 text-sm text-blue-900">
                <p className="font-semibold mb-1">💡 Suggerimento</p>
                <p>
                  Puoi salvare la compilazione come <strong>bozza</strong> in qualsiasi momento. 
                  Le bozze non completate non sono valide ai fini normativi.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Content Steps */}
        <div className="min-h-[500px]">
          {currentStep === 1 && (
            <Step1DescrizioneStudio
              descrizione={formData.descrizione_studio}
              updateDescrizioneStudio={updateDescrizioneStudio}
              isReadOnly={isReadOnly}
            />
          )}

          {currentStep === 2 && (
            <Step2TipologiaClientela
              risposta={formData.risposte_dettagliate.tipologia_clientela}
              updateRisposta={(updates) => updateRisposta('tipologia_clientela', updates)}
              isReadOnly={isReadOnly}
            />
          )}

          {currentStep === 3 && (
            <Step3AreaGeografica
              risposta={formData.risposte_dettagliate.area_geografica_operativita}
              updateRisposta={(updates) => updateRisposta('area_geografica_operativita', updates)}
              isReadOnly={isReadOnly}
            />
          )}

          {currentStep === 4 && (
            <Step4CanaliDistributivi
              risposta={formData.risposte_dettagliate.canali_distributivi}
              updateRisposta={(updates) => updateRisposta('canali_distributivi', updates)}
              isReadOnly={isReadOnly}
            />
          )}

          {currentStep === 5 && (
            <Step5ServiziProfessionali
              risposta={formData.risposte_dettagliate.servizi_professionali_offerti}
              updateRisposta={(updates) => updateRisposta('servizi_professionali_offerti', updates)}
              isReadOnly={isReadOnly}
            />
          )}

          {currentStep === 6 && (
            <Step6Formazione
              risposta={formData.risposte_dettagliate.formazione}
              updateRisposta={(updates) => updateRisposta('formazione', updates)}
              isReadOnly={isReadOnly}
            />
          )}

          {currentStep === 7 && (
            <Step7OrganizzazioneAdempimenti
              risposte={formData.risposte_dettagliate}
              updateRisposta={updateRisposta}
              isReadOnly={isReadOnly}
            />
          )}

          {currentStep === 8 && (
            <Step8Riepilogo
              formData={formData}
              updateFormData={updateFormData}
              isReadOnly={isReadOnly}
            />
          )}
        </div>

        {/* Save Error */}
        {saveError && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
            <p className="text-sm text-red-800">{saveError}</p>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
          <div className="flex gap-3">
            <button
              onClick={prevStep}
              disabled={currentStep === 1}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Indietro
            </button>

            {!isReadOnly && (
              <button
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvataggio...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salva Bozza
                  </>
                )}
              </button>
            )}
          </div>

          <div>
            {currentStep < TOTAL_STEPS ? (
              <button
                onClick={nextStep}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Avanti
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              !isReadOnly && (
                <button
                  onClick={handleComplete}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvataggio...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Completa Autovalutazione
                    </>
                  )}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}
