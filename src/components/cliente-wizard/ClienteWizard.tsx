import { useState } from 'react';
import { ArrowLeft, ArrowRight, Save, Loader2, Bug } from 'lucide-react';
import { useToast } from '../Toast';
import { Spinner } from './modals/Spinner';
import { ClienteWizardProps, TitolareEffettivo, APILog } from './types';
import { DEBUG_MODE, emptyTitolare } from './constants';
import { normalizeVatOrCF, isValidPIva, isValidCF, formatDate, extractLocationParts, exportAPIDataToJSON} from './utils';//getLegalRepresentative
import { useClienteForm } from './hooks/useClienteForm';
import { useClienteSave } from './hooks/useClienteSave';
import { useIsAdmin } from '../../lib/hooks/useIsAdmin';
import { StepIndicator } from './components/StepIndicator';
import { APIChoiceModal } from './modals/APIChoiceModal';
import { APISearchModal } from './modals/APISearchModal';
import { DebugLogModal } from './modals/DebugLogModal';
import { Step1DatiCliente } from './components/Step1DatiCliente';
import { Step2TitolariEffettivi } from './components/Step2TitolariEffettivi';
import { Step3Riepilogo } from './components/Step3Riepilogo';
import { parseCodiceFiscale } from './components/forms/PersonaFisicaForm';
import { getNazionalitaByISO } from '../../lib/nazionalitaHelper';
import { supabase } from '../../lib/supabase';

export function ClienteWizard({ onComplete, onCancel, clienteId, initialStep }: ClienteWizardProps) {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(initialStep || 1);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  
  // Stati API (solo per imprese)
  const [showAPIModal, setShowAPIModal] = useState(false);
  const [showAPIInputModal, setShowAPIInputModal] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [apiVatInput, setApiVatInput] = useState('');
  const [apiLog, setApiLog] = useState<APILog | null>(null);
  const [apiDataLoaded, setApiDataLoaded] = useState(false);
  
  // Custom hooks
  const { formData, updateFormData, isClienteComplete, validateStep1, loadingCliente } = useClienteForm(clienteId);
  const { isAdmin, isSuperAdmin } = useIsAdmin();

  
  // API AML chiamata via Edge Function proxy (bearer token server-side)
  
  const addDebugLog = (message: string, data?: any) => {
    if (DEBUG_MODE) {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}`;
      // console.log(logEntry, data || '');
      setDebugLog(prev => [...prev, logEntry + (data ? '\n' + JSON.stringify(data, null, 2) : '')]);
    }
  };

  const { isSaving, saveError, handleSave, clearSaveError } = useClienteSave(formData, isClienteComplete, addDebugLog, clienteId);

  const handleFieldFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!saveError) return;
    const target = e.target as HTMLElement;
    if (target.matches('input, textarea, select')) {
      clearSaveError();
    }
  };

  // Gestione cambio tipo cliente
  const handleTipoClienteChange = (tipo: 'persona_fisica' | 'impresa' | 'professionista') => {
    updateFormData({ tipo_cliente: tipo });
    
    if (tipo !== 'impresa') {
      setApiDataLoaded(false);
      setShowAPIModal(false);
    }
    
    // Non mostrare API modal se siamo in modalità EDIT
    if (tipo === 'impresa' && !apiDataLoaded && !clienteId) {
      setShowAPIModal(true);
    }
  };

  const handleAPIChoice = (useAPI: boolean) => {
    setShowAPIModal(false);
    if (useAPI) {
      setShowAPIInputModal(true);
    }
  };

  const handleCloseAPIInputModal = () => {
    setShowAPIInputModal(false);
    setApiLog(null);
    setApiVatInput('');
  };

  const handleProceedWithData = () => {
    setShowAPIInputModal(false);
  };

  const getBeneficialOwners = (shareholders: any[], managers: any[]): TitolareEffettivo[] => {
    const owners: TitolareEffettivo[] = [];

    for (const shareholder of shareholders) {
      if (shareholder.percentShare > 25) {
        for (const info of shareholder.shareholdersInformation || []) {
          const birthPlace = extractLocationParts(info.birthTown || '');
          let dataNascita = formatDate(info.birthDate || '');
          let comuneNascita = birthPlace.city;
          let provinciaNascita = birthPlace.province;

          // Fallback: ricava dati nascita dal codice fiscale se mancanti dall'API
          if ((!dataNascita || !comuneNascita || !provinciaNascita) && info.taxCode) {
            const cfData = parseCodiceFiscale(info.taxCode);
            if (cfData) {
              if (!dataNascita) dataNascita = formatDate(cfData.data_nascita);
              if (!comuneNascita) comuneNascita = cfData.comune;
              if (!provinciaNascita) provinciaNascita = cfData.provincia;
            }
          }

          owners.push({
            tipo_rapporto: 'societa_ente',
            nome_cognome: info.companyName || `${info.name || ''} ${info.surname || ''}`.trim(),
            professione: 'Azionista',
            ruolo: `Socio al ${shareholder.percentShare}%`,
            comune_nascita: comuneNascita,
            provincia_nascita: provinciaNascita,
            data_nascita: dataNascita,
            nazionalita: 'Italiana',
            residenza: '',
            codice_fiscale: info.taxCode || '',
            documento_tipo: '',
            documento_numero: '',
            documento_rilascio_ente: '',
            documento_rilascio_data: '',
            documento_scadenza: '',
            is_pep: false,
            pep_carica: '',
            note_quota: `Quota: ${shareholder.percentShare}%`
          });
        }
      }
    }

    if (owners.length === 0 && managers) {
      for (const manager of managers) {
        if (manager.name) {
          const roles = manager.roles?.map((r: any) => r.role?.description || '').join(', ') || 'Amministratore';
          const birthPlace = extractLocationParts(manager.birthTown || '');
          let dataNascita = formatDate(manager.birthDate || '');
          let comuneNascita = birthPlace.city;
          let provinciaNascita = birthPlace.province;

          // Fallback: ricava dati nascita dal codice fiscale se mancanti dall'API
          if ((!dataNascita || !comuneNascita || !provinciaNascita) && manager.taxCode) {
            const cfData = parseCodiceFiscale(manager.taxCode);
            if (cfData) {
              if (!dataNascita) dataNascita = formatDate(cfData.data_nascita);
              if (!comuneNascita) comuneNascita = cfData.comune;
              if (!provinciaNascita) provinciaNascita = cfData.provincia;
            }
          }

          owners.push({
            tipo_rapporto: 'caso_residuale',
            nome_cognome: `${manager.name || ''} ${manager.surname || ''}`.trim(),
            professione: roles,
            ruolo: roles,
            comune_nascita: comuneNascita,
            provincia_nascita: provinciaNascita,
            data_nascita: dataNascita,
            nazionalita: 'Italiana',
            residenza: '',
            codice_fiscale: manager.taxCode || '',
            documento_tipo: '',
            documento_numero: '',
            documento_rilascio_ente: '',
            documento_rilascio_data: '',
            documento_scadenza: '',
            is_pep: false,
            pep_carica: '',
            note_quota: ''
          });
        }
      }
    }

    return owners;
  };
  
  const getErrorMessage = (status: string) => {
    switch (status) {
      case 'HTTP 400: ' : return "HTTP 400: Richiesta non valida. Controlla i dati inseriti.";
      case 'HTTP 401: ' : return "HTTP 401: Autorizzazione fallita. Verifica il token API.";
      case 'HTTP 402: ' : return "HTTP 402: A causa di un’interruzione tecnica sui nostri canali esterni, alcune funzionalità sono momentaneamente disabilitate. Il ripristino è previsto a breve.";
      case 'HTTP 403: ' : return "HTTP 403: Accesso negato. Non hai i permessi necessari.";
      case 'HTTP 404: ' : return "HTTP 404: Nessun dato trovato per la Partita IVA o Codice Fiscale inserito.";
      case 'HTTP 404: Not Found' : return "HTTP 404: Nessun dato trovato. Controlla la connesione e riprova.";
      case 'HTTP 406: ' : return "HTTP 406: Partita IVA o Codice Fiscale non valido.";
      case 'HTTP 429: ' : return "HTTP 429: Troppe richieste. Attendere qualche secondo e riprovare.";
      case 'HTTP 500: ' : return "HTTP 500: Errore interno del server. Riprova più tardi.";
      case 'HTTP 503: ' : return "HTTP 503: Servizio momentaneamente non disponibile.";
      default: return "Errore sconosciuto. Controlla la connesione e riprova.";
    }
  };

  const notifyCreditoApiEsaurito = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const oggetto = '[AUTO] Credito Open API esaurito';
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: existing } = await supabase
        .from('segnalazioni')
        .select('id')
        .eq('oggetto', oggetto)
        .eq('stato', 'aperta')
        .gte('created_at', since)
        .limit(1)
        .maybeSingle();

      if (existing) return;

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('nome, cognome, email, studi(nome)')
        .eq('user_id', user.id)
        .maybeSingle();

      const nome = profile?.nome || '';
      const cognome = profile?.cognome || '';
      const email = profile?.email || user.email || 'N/D';
      const studioNome = (profile as any)?.studi?.nome || 'N/D';

      const descrizione =
        `Timestamp: ${new Date().toISOString()}\n` +
        `Utente: ${`${nome} ${cognome}`.trim() || 'N/D'}\n` +
        `Email: ${email}\n` +
        `Studio: ${studioNome}`;

      await supabase.from('segnalazioni').insert({
        user_id: user.id,
        categoria: 'bug',
        oggetto,
        descrizione,
        sezione: 'Wizard Cliente - Ricerca API',
      });
    } catch {
      // Silently ignore — non deve impattare l'UX dell'utente
    }
  };

  const handleAPISearch = async () => {
    const normalizedVat = normalizeVatOrCF(apiVatInput);
    
    if (!isValidPIva(normalizedVat) && !isValidCF(normalizedVat)) {
      toast.warning('P.IVA o Codice Fiscale non valido');
      return;
    }

    const now = new Date().toISOString();
    setApiLog({
      timestamp: now,
      status: 'loading',
      requestUrl: `/api/aml-lookup`,
    });

    addDebugLog('🔍 Inizio ricerca API AML', { vat: normalizedVat });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/aml-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ vatOrCF: normalizedVat }),
      });

      if (response.status === 402) {
        notifyCreditoApiEsaurito();
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      addDebugLog(`📡 Response status: ${response.status}`);

      setApiLog({
        timestamp: now,
        status: 'success',
        requestUrl: `/api/aml-lookup`,
        responseStatus: response.status,
        responseData: data
      });

      const apiData = data.data || data;

      if (apiData && apiData.companyDetails) {
        const company = apiData.companyDetails;
        const address = apiData.address;
        const managers = apiData.managers || [];
        const shareholders = apiData.shareholders || [];

        const fullAddress = address ?
          `${address.streetName || ''}, ${address.zipCode || ''} ${address.town || ''} (${address.province?.code || ''})`
          : '';

        const legalRepresentative = managers.find((manager:any) => manager.isLegalRepresentative === true);
        let managerTaxCode = '';
        let managerName = '';
        let managerSurname = '';
        let fullAddressRap = '';

        if (legalRepresentative) {
          managerTaxCode = legalRepresentative.taxCode;
          managerName = legalRepresentative.name;
          managerSurname = legalRepresentative.surname;

          // --- 2. Cercare il Socio Corrispondente tramite Codice Fiscale ---
          const shareholders = apiData.shareholders || [];

          // Scorri l'array shareholders
          for (const shareholderGroup of shareholders) {
            if (shareholderGroup.shareholdersInformation) {
              // Scorri l'array shareholdersInformation all'interno di ogni gruppo
              const matchingShareholderInfo = shareholderGroup.shareholdersInformation.find(
                  (info:any) => info.taxCode === managerTaxCode
              );

              if (matchingShareholderInfo) {
                // Trovato! Formattiamo l'indirizzo e usciamo dal loop
                const info = matchingShareholderInfo;
                fullAddressRap = `${info.streetName || ''}, ${info.zipCode || ''} ${info.town || ''}`;
                break; // Interrompi la ricerca appena trovi il match
              }
            }
          }
        }


        // Risultati dell'estrazione selettiva
        const selectiveSummary = {
          NomeRappresentanteLegale: `${managerName} ${managerSurname}`,
          CodiceFiscale: managerTaxCode || 'N/D',
          IndirizzoSocioCorrispondente: fullAddressRap
        };
        const beneficialOwners = getBeneficialOwners(shareholders, managers);
        
        const natureGiuridicaPatterns = [
          { pattern: /s\.?\s?r\.?\s?l/i, result: 'srl' },
          { pattern: /s\.?\s?p\.?\s?a/i, result: 'spa' },
          { pattern: /s\.?\s?a\.?\s?s/i, result: 'sas' },
          { pattern: /s\.?\s?n\.?\s?c/i, result: 'snc' },
        ];

        // Cerca la prima corrispondenza nell'array
        const foundMatch = natureGiuridicaPatterns.find(item => {
          const companyName = company.companyName || '' ;
          const lastSixChars = companyName.slice(-6);
          //const lastThreeChars = companyName.slice(-3);
    
          return item.pattern.test(lastSixChars); 
        });

        // risultato
        const naturaGiuridica = foundMatch ? foundMatch.result : '';

        const dati = parseCodiceFiscale(selectiveSummary.CodiceFiscale);

        const mappedData = {
          ragione_sociale: company.companyName || '',
          natura_giuridica: naturaGiuridica,
          partita_iva_impresa: company.vatCode || normalizedVat,
          codice_fiscale_impresa: company.taxCode || '',
          indirizzo: fullAddress.trim(),
          paese: getNazionalitaByISO(address?.country?.code || 'IT') || 'Italiana',
          rappresentante_legale: selectiveSummary.NomeRappresentanteLegale,
          codice_fiscale_rappresentante: selectiveSummary.CodiceFiscale,
          data_nascita_rappresentante: dati? formatDate(dati.data_nascita) : '',
          luogo_nascita_rappresentante: dati? dati.comune : '',
          provincia_nascita_rappresentante: dati? dati.provincia: '',
          titolari_effettivi: beneficialOwners,
          residenza_rappresentante:selectiveSummary.IndirizzoSocioCorrispondente,
          rae_description: apiData.rae?.description || '',
          attivita_svolta_impresa: apiData.rae?.description ? `${apiData.rae.description} (Classificazione RAE).` : '',
        };

        updateFormData(mappedData);
        setApiDataLoaded(true);
        addDebugLog('✅ Dati mappati nel form', { ...mappedData, titolari: beneficialOwners.length });
        
        // Esporta JSON solo se l'utente è admin
        if (isAdmin) {
          const companyName = company.companyName || 'Impresa';
          const exportedFileName = exportAPIDataToJSON(data, companyName);
          if (exportedFileName) {
            addDebugLog(`📥 Dati API esportati in: ${exportedFileName}`);
          }
        }
      } else {
        addDebugLog('⚠️ Struttura dati API non riconosciuta', data);
        toast.error('Dati ricevuti dall\'API ma struttura non riconosciuta. Verifica il debug log.');
      }

    } catch (error: any) {
      const isNetworkError =
        error?.message === 'Failed to fetch' ||
        error?.name === 'TypeError' ||
        !navigator.onLine;
      const apiErrorMessage = isNetworkError
        ? 'Impossibile contattare il servizio. Controlla la connessione a Internet e riprova.'
        : getErrorMessage(error.message);

      addDebugLog('❌ Errore API',  `${apiErrorMessage} (${error})`);
      setApiLog({
        timestamp: now,
        status: 'error',
        requestUrl: `/api/aml-lookup`,
        errorMessage: isNetworkError ? apiErrorMessage : `${apiErrorMessage}`
      });
    }
  };

  // Funzione per aggiungere rappresentante legale come titolare effettivo
  const addTitolareDaRappresentante = () => {
    if (!formData.rappresentante_legale) {
      toast.warning('Inserisci prima il rappresentante legale in Step 1');
      return;
    }
    
    // Verifica se RL è già presente
    const rlName = formData.rappresentante_legale.trim().toLowerCase();
    const isDuplicate = formData.titolari_effettivi.some(t => 
      t.nome_cognome.trim().toLowerCase() === rlName
    );
    
    if (isDuplicate) {
      toast.warning('Il rappresentante legale è già presente nei titolari effettivi');
      return;
    }
    
    const nuovoTitolare: TitolareEffettivo = {
      tipo_rapporto: 'in_proprio',
      nome_cognome: formData.rappresentante_legale,
      codice_fiscale: formData.codice_fiscale_rappresentante || '',
      professione: 'Rappresentante Legale',
      ruolo: 'Rappresentante Legale',
      comune_nascita: formData.luogo_nascita_rappresentante || '',
      provincia_nascita: formData.provincia_nascita_rappresentante || '',
      data_nascita: formData.data_nascita_rappresentante || '',
      nazionalita: formData.nazionalita_rappresentante || 'Italiana',
      residenza: formData.residenza_rappresentante || '',
      // Copia automatica documento rappresentante
      documento_tipo: formData.documento_rappresentante?.tipo || '',
      documento_numero: formData.documento_rappresentante?.numero || '',
      documento_rilascio_ente: formData.documento_rappresentante?.ente_rilascio || '',
      documento_rilascio_data: formData.documento_rappresentante?.data_rilascio || '',
      documento_scadenza: formData.documento_rappresentante?.data_scadenza || '',
      documento_esistente: formData.documento_rappresentante?.esistente || null,
      is_pep: formData.pep_impresa || false,
      pep_carica: formData.pep_carica_impresa || '',
      pep_verificato: formData.pep_verificato_impresa,
      pep_data_verifica: formData.pep_data_verifica_impresa,
      pep_fonte_verifica: formData.pep_fonte_verifica_impresa,
      sanzioni: formData.sanzioni_impresa,
      sanzioni_verificato: formData.sanzioni_verificato_impresa,
      sanzioni_data_verifica: formData.sanzioni_data_verifica_impresa,
      sanzioni_fonte_verifica: formData.sanzioni_fonte_verifica_impresa,
      note_quota: ''
    };

    updateFormData({
      titolari_effettivi: [...formData.titolari_effettivi, nuovoTitolare]
    });

    addDebugLog('✅ Rappresentante legale aggiunto come titolare effettivo', {
      nome: nuovoTitolare.nome_cognome,
      codice_fiscale: nuovoTitolare.codice_fiscale,
      documento_copiato: !!nuovoTitolare.documento_numero
    });
  };

  // Sincronizza dati rappresentante legale → titolare effettivo
  const syncRappresentanteLegaleToTitolari = () => {
    // Solo per imprese con rappresentante legale
    if (formData.tipo_cliente !== 'impresa' || !formData.rappresentante_legale) {
      return;
    }
    
    const rlName = formData.rappresentante_legale.trim().toLowerCase();
    
    // Trova e aggiorna il titolare che corrisponde al rappresentante legale
    const updatedTitolari = formData.titolari_effettivi.map(titolare => {
      const titolareName = titolare.nome_cognome.trim().toLowerCase();
      
      // Se questo titolare è il rappresentante legale
      if (titolareName === rlName) {
        return {
          ...titolare,
          // Aggiorna con dati più recenti di Step 1 (se disponibili)
          codice_fiscale: formData.codice_fiscale_rappresentante || titolare.codice_fiscale,
          residenza: formData.residenza_rappresentante || titolare.residenza,
          data_nascita: formData.data_nascita_rappresentante || titolare.data_nascita,
          comune_nascita: formData.luogo_nascita_rappresentante || titolare.comune_nascita,
          provincia_nascita: formData.provincia_nascita_rappresentante || titolare.provincia_nascita,
          // Aggiorna documento solo se compilato in Step 1
          documento_tipo: formData.documento_rappresentante?.tipo || titolare.documento_tipo,
          documento_numero: formData.documento_rappresentante?.numero || titolare.documento_numero,
          documento_rilascio_ente: formData.documento_rappresentante?.ente_rilascio || titolare.documento_rilascio_ente,
          documento_rilascio_data: formData.documento_rappresentante?.data_rilascio || titolare.documento_rilascio_data,
          documento_scadenza: formData.documento_rappresentante?.data_scadenza || titolare.documento_scadenza,
          documento_esistente: formData.documento_rappresentante?.esistente ?? titolare.documento_esistente,
        };
      }
      
      return titolare;
    });
    
    // Aggiorna titolari se ci sono stati cambiamenti
    if (JSON.stringify(updatedTitolari) !== JSON.stringify(formData.titolari_effettivi)) {
      updateFormData({ titolari_effettivi: updatedTitolari });
      addDebugLog('🔄 Sincronizzati dati RL → Titolare RL', {
        rl_name: formData.rappresentante_legale,
        cf_aggiornato: !!formData.codice_fiscale_rappresentante,
        residenza_aggiornata: !!formData.residenza_rappresentante,
        documento_aggiornato: !!formData.documento_rappresentante?.numero
      });
    }
  };

  // Navigazione step
  const nextStep = () => {
    if (currentStep === 1) {
      const validation = validateStep1();
      if (!validation.valid) {
        toast.warning(validation.message || 'Dati non validi. Controlla i campi obbligatori.');
        return;
      }
      
      // Sincronizza dati rappresentante legale → titolare effettivo
      syncRappresentanteLegaleToTitolari();
    }
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  if (loadingCliente) return <Spinner />;

  return (
    <>
      <APIChoiceModal show={showAPIModal} onChoice={handleAPIChoice} />
      
      <APISearchModal
        show={showAPIInputModal}
        apiVatInput={apiVatInput}
        apiLog={apiLog}
        onClose={handleCloseAPIInputModal}
        onVatInputChange={setApiVatInput}
        onSearch={handleAPISearch}
        onProceed={handleProceedWithData}
      />

      <DebugLogModal
        show={showDebugModal}
        debugLog={debugLog}
        onClose={() => setShowDebugModal(false)}
      />

      <div className="space-y-6" onFocusCapture={handleFieldFocus}>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">
            {clienteId ? 'Modifica Cliente' : 'Nuovo Cliente'}
          </h1>
          <div className="flex gap-2">
            {DEBUG_MODE && isSuperAdmin && (
              <button
                onClick={() => setShowDebugModal(true)}
                className="px-4 py-2 text-orange-700 hover:bg-orange-100 rounded-lg flex items-center gap-2"
              >
                <Bug className="w-4 h-4" />
                Debug Log
              </button>
            )}
            <button onClick={onCancel} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
              Annulla
            </button>
          </div>
        </div>

        <StepIndicator currentStep={currentStep} />

        {currentStep === 1 && (
          <Step1DatiCliente
            formData={formData}
            updateFormData={updateFormData}
            onTipoClienteChange={handleTipoClienteChange}
            isEditMode={!!clienteId}
            clienteId={clienteId}
          />
        )}

        {currentStep === 2 && (
          <Step2TitolariEffettivi
            formData={formData}
            updateFormData={updateFormData}
            addTitolare={() => updateFormData({ 
              titolari_effettivi: [...formData.titolari_effettivi, { ...emptyTitolare }] 
            })}
            addTitolareDaRappresentante={addTitolareDaRappresentante}
            removeTitolare={(index) => updateFormData({ 
              titolari_effettivi: formData.titolari_effettivi.filter((_, i) => i !== index) 
            })}
            updateTitolare={(index, updates) => {
              const updated = formData.titolari_effettivi.map((t, i) =>
                i === index ? { ...t, ...updates } : t
              );
              updateFormData({ titolari_effettivi: updated });
            }}
            apiDataLoaded={apiDataLoaded}
          />
        )}

        {currentStep === 3 && (
          <Step3Riepilogo formData={formData} />
        )}

        {saveError && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
            <p className="text-sm text-red-800">{saveError}</p>
          </div>
        )}

        <div className="flex justify-between">
          <button
            onClick={prevStep}
            disabled={currentStep === 1}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" /> Indietro
          </button>
          {currentStep < 3 ? (
            <button onClick={nextStep} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg">
              Avanti <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => handleSave(onComplete)}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salva Cliente
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
