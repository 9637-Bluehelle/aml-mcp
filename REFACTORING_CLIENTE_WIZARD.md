# 🔧 Refactoring ClienteWizard - Piano Completo

## ✅ Completato

- [x] Struttura cartelle creata
- [x] `types.ts` - Interfacce e tipi
- [x] `constants.ts` - Configurazioni

## 📋 File Rimanenti da Creare

### Fase 1: Infrastruttura

#### 3. `src/components/cliente-wizard/utils.ts` (~250 righe)
```typescript
// Funzioni di validazione
export const normalizeVatOrCF = (raw: string): string => { ... }
export const isValidPIva = (v: string): boolean => /^\d{11}$/.test(v);
export const isValidCF = (v: string): boolean => /^[A-Z0-9]{11,16}$/.test(v);
export const isValidDate = (dateStr: string): boolean => { ... }

// Funzioni di formattazione date
export const formatDateToISO = (displayDate: string): string => { ... }
export const formatDateForDB = (displayDate: string): string | null => { ... }
export const formatDate = (dateStr: string): string => { ... }

// Utility
export const extractLocationParts = (locationStr: string) => { ... }
export const exportAPIDataToJSON = (data: any, companyName: string) => { ... }
```

#### 4. `src/components/cliente-wizard/hooks/useClienteForm.ts` (~100 righe)
```typescript
import { useState } from 'react';
import { WizardData, DocumentoIdentita } from '../types';
import { isValidDate } from '../utils';

export function useClienteForm() {
  const [formData, setFormData] = useState<WizardData>({
    tipo_cliente: 'persona_fisica',
    codice_cliente: '',
    // ... tutti i campi iniziali
  });

  const updateFormData = (updates: Partial<WizardData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  // Validazione completezza cliente
  const isClienteComplete = (): boolean => {
    // Logica validazione per tipo_cliente
  };

  const validateStep1 = (): { valid: boolean; message?: string } => {
    // Validazione step 1
  };

  return {
    formData,
    setFormData,
    updateFormData,
    isClienteComplete,
    validateStep1
  };
}
```

#### 5. `src/components/cliente-wizard/hooks/useClienteSave.ts` (~200 righe)
```typescript
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { WizardData } from '../types';
import { formatDateForDB } from '../utils';

export function useClienteSave(
  formData: WizardData,
  isClienteComplete: () => boolean,
  addDebugLog: (msg: string, data?: any) => void
) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async (onComplete: () => void) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Determina status
      const isComplete = isClienteComplete();
      const clientStatus = isComplete ? 'active' : 'draft';

      // Prepara dati per DB
      let clienteData: any = {
        tipo_cliente: formData.tipo_cliente,
        codice_cliente: formData.codice_cliente,
        status: clientStatus,
      };

      // Mapping per tipo cliente
      if (formData.tipo_cliente === 'persona_fisica') {
        // ...
      } else if (formData.tipo_cliente === 'impresa') {
        // ...
      } else if (formData.tipo_cliente === 'professionista') {
        // ...
      }

      // INSERT cliente
      const { data: cliente, error } = await supabase
        .from('clienti')
        .insert(clienteData)
        .select()
        .single();

      if (error) throw error;

      // INSERT titolari effettivi (se impresa)
      if (formData.tipo_cliente === 'impresa' && formData.titolari_effettivi.length > 0) {
        // ...
      }

      alert(clientStatus === 'active' 
        ? '✓ Cliente salvato e ATTIVATO!' 
        : '✓ Cliente salvato come BOZZA.'
      );
      onComplete();

    } catch (error: any) {
      setSaveError(error.message);
      alert(`Errore: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return { isSaving, saveError, handleSave };
}
```

---

### Fase 2: Componenti Base

#### 6. `src/components/cliente-wizard/components/StepIndicator.tsx` (~50 righe)
```typescript
interface StepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
}

export function StepIndicator({ currentStep, totalSteps = 3 }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center space-x-4 mb-8">
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map(step => (
        <div key={step} className="flex items-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
            currentStep === step ? 'bg-blue-600 text-white' :
            currentStep > step ? 'bg-green-600 text-white' :
            'bg-gray-200 text-gray-600'
          }`}>
            {step}
          </div>
          {step < totalSteps && (
            <div className={`w-16 h-1 ${
              currentStep > step ? 'bg-green-600' : 'bg-gray-200'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}
```

#### 7-9. Modals (APIChoiceModal, APISearchModal, DebugLogModal)
- Estrarre i 3 modals dal ClienteWizard originale
- Separare in 3 file nella cartella `modals/`

---

### Fase 3: Form Components

#### 10. `src/components/cliente-wizard/components/forms/TipologiaClienteSelector.tsx`
```typescript
import { User, Building2, Briefcase } from 'lucide-react';

interface TipologiaClienteSelectorProps {
  selectedTipo: 'persona_fisica' | 'impresa' | 'professionista';
  onChange: (tipo: 'persona_fisica' | 'impresa' | 'professionista') => void;
}

export function TipologiaClienteSelector({ selectedTipo, onChange }: TipologiaClienteSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-3">
        Tipo Cliente *
      </label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onChange('persona_fisica')}
          className={`p-4 border-2 rounded-lg flex items-center gap-3 transition-all ${
            selectedTipo === 'persona_fisica'
              ? 'border-blue-600 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <User className={`w-6 h-6 ${selectedTipo === 'persona_fisica' ? 'text-blue-600' : 'text-gray-400'}`} />
          <div className="text-left">
            <div className="font-semibold">Persona Fisica</div>
            <div className="text-xs text-gray-500">Cliente privato</div>
          </div>
        </button>
        {/* Ripetere per impresa e professionista */}
      </div>
    </div>
  );
}
```

#### 11. `DocumentoIdentitaFields.tsx` - Campi documento riutilizzabili

#### 12-14. Form specifici (PersonaFisicaForm, ImpresaForm, ProfessionistaForm)
- Estrarre le sezioni form specifiche per ogni tipo
- ~200 righe ciascuno

---

### Fase 4: Step Components

#### 15. `Step1DatiCliente.tsx` - Container step 1
#### 16. `TitolareEffettivoCard.tsx` - Card singolo titolare
#### 17. `Step2TitolariEffettivi.tsx` - Gestione titolari
#### 18. `Step3Riepilogo.tsx` - Riepilogo finale

---

### Fase 5: Refactoring Orchestratore

#### 19. ClienteWizard refactored (~200 righe)
```typescript
import { useState } from 'react';
import { ClienteWizardProps } from './types';
import { useClienteForm } from './hooks/useClienteForm';
import { useClienteSave } from './hooks/useClienteSave';
import { StepIndicator } from './components/StepIndicator';
import { Step1DatiCliente } from './components/Step1DatiCliente';
// ... altri import

export function ClienteWizard({ onComplete, onCancel, clienteId }: ClienteWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const { formData, updateFormData, isClienteComplete, validateStep1 } = useClienteForm();
  const { isSaving, saveError, handleSave } = useClienteSave(formData, isClienteComplete, addDebugLog);

  // Stati API
  const [showAPIModal, setShowAPIModal] = useState(false);
  // ...

  const nextStep = () => {
    if (currentStep === 1) {
      const validation = validateStep1();
      if (!validation.valid) {
        alert(validation.message);
        return;
      }
    }
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  return (
    <>
      {/* Modals */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">
            {clienteId ? 'Modifica Cliente' : 'Nuovo Cliente'}
          </h1>
          <button onClick={onCancel}>Annulla</button>
        </div>

        <StepIndicator currentStep={currentStep} />

        {currentStep === 1 && <Step1DatiCliente formData={formData} updateFormData={updateFormData} />}
        {currentStep === 2 && <Step2TitolariEffettivi formData={formData} updateFormData={updateFormData} />}
        {currentStep === 3 && <Step3Riepilogo formData={formData} />}

        {/* Navigation buttons */}
      </div>
    </>
  );
}
```

#### 20. `index.ts` - Export principale
```typescript
export { ClienteWizard } from './ClienteWizard';
export * from './types';
```

---

## 🔄 Modalità Edit (da aggiungere)

Nel file `useClienteForm.ts`, aggiungere:

```typescript
// useEffect per caricamento dati esistenti
useEffect(() => {
  if (clienteId) {
    loadClienteData(clienteId);
  }
}, [clienteId]);

const loadClienteData = async (id: string) => {
  // Carica cliente
  const { data: cliente } = await supabase
    .from('clienti')
    .select('*')
    .eq('id', id)
    .single();

  // Carica titolari effettivi
  const { data: titolari } = await supabase
    .from('titolari_effettivi')
    .select('*')
    .eq('cliente_id', id);

  // Mappa dati a formData
  // Converti date da ISO a formato italiano
};
```

In `useClienteSave.ts`, modificare per gestire UPDATE:

```typescript
if (clienteId) {
  // UPDATE esistente
  const { error } = await supabase
    .from('clienti')
    .update(clienteData)
    .eq('id', clienteId);
  
  // Delete e re-insert titolari
  await supabase
    .from('titolari_effettivi')
    .delete()
    .eq('cliente_id', clienteId);
} else {
  // INSERT nuovo
}
```

---

## 📝 Aggiornamento RT2AdeguataVerifica.tsx

Cambiare l'import:
```typescript
// Prima
import { ClienteWizard } from './ClienteWizard';

// Dopo
import { ClienteWizard } from './cliente-wizard';
```

Aggiungere stato e logica modifica:
```typescript
const [clienteIdToEdit, setClienteIdToEdit] = useState<string | null>(null);

// Nel view-cliente, aggiungere pulsante
<button onClick={() => {
  setClienteIdToEdit(clienteCompleto.id);
  setView('wizard');
}}>
  Modifica Cliente
</button>

// Nel render wizard
{view === 'wizard' && (
  <ClienteWizard 
    clienteId={clienteIdToEdit}
    onComplete={() => {
      loadData();
      setView(clienteIdToEdit ? 'view-cliente' : 'list');
      setClienteIdToEdit(null);
    }}
    onCancel={() => setView('list')}
  />
)}
```

---

## ✅ Checklist Finale

- [ ] Tutti i 20 file creati
- [ ] ClienteWizard.tsx originale rimosso o rinominato
- [ ] Import aggiornati in RT2AdeguataVerifica
- [ ] Test creazione nuovo cliente
- [ ] Test modifica cliente esistente
- [ ] Test modalità draft/active
- [ ] Test API AML per imprese
- [ ] Verifica tutti i 3 tipi cliente (PF, Impresa, Prof)

---

## 🎯 Vantaggi Ottenuti

✅ **Manutenibilità**: File < 250 righe  
✅ **Riutilizzabilità**: Componenti modulari  
✅ **Testabilità**: Ogni componente isolato  
✅ **Performance**: Lazy loading possibile  
✅ **Chiarezza**: Separazione responsabilità  
✅ **Scalabilità**: Facile aggiungere funzionalità
