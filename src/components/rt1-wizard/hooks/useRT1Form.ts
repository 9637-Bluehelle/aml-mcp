// ==================== USE RT1 FORM HOOK ====================

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { RT1WizardData, AutovalutazioneDB } from '../types';
import { emptyDescrizioneStudio, emptyRisposteDettagliate } from '../constants';
import { convertLegacyData, getLastCompletedStep, incrementVersion } from '../utils';
import { useToast } from '../../Toast';

export function useRT1Form(autovalutazioneId?: string, mode?: 'new' | 'view' | 'draft') {
  const toast = useToast();
  const [formData, setFormData] = useState<RT1WizardData>({
    version: '1.0',
    created_by: '',
    descrizione_studio: { ...emptyDescrizioneStudio },
    risposte_dettagliate: { ...emptyRisposteDettagliate },
    piano_mitigazione: ''
  });

  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [initialStep, setInitialStep] = useState(1);
  const [sourceAutovalutazione, setSourceAutovalutazione] = useState<AutovalutazioneDB | null>(null);

  // Carica i dati se in modalità view o draft
  useEffect(() => {
    if (autovalutazioneId) {
      loadAutovalutazione(autovalutazioneId);
    } else {
      // Controlla se esiste una bozza per l'utente corrente
      checkForExistingDraft();
    }
  }, [autovalutazioneId]);

  /**
   * Carica un'autovalutazione esistente
   */
  async function loadAutovalutazione(id: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('autovalutazioni')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        setSourceAutovalutazione(data);
        
        // Converti dati legacy se necessario
        let risposte = data.risposte_dettagliate || { ...emptyRisposteDettagliate };
        
        // Se risposte_dettagliate è vuoto ma esistono fattori legacy, converti
        const hasLegacyData = data.fattori_inerenti || data.fattori_vulnerabilita;
        const hasNewData = Object.values(risposte).some((r: any) => r.scelta_valore !== null);
        
        if (hasLegacyData && !hasNewData) {
          const converted = convertLegacyData(data);
          risposte = { ...risposte, ...converted };
        }

        const loadedData: RT1WizardData = {
          version: data.version,
          created_by: data.created_by,
          descrizione_studio: data.descrizione_studio || { ...emptyDescrizioneStudio },
          risposte_dettagliate: risposte,
          piano_mitigazione: data.piano_mitigazione || '',
          inerente_score: data.inerente_score,
          vulnerabilita_score: data.vulnerabilita_score,
          residuo_score: data.residuo_score
        };

        setFormData(loadedData);

        // Se è una bozza, posiziona sull'ultimo step compilato
        if (mode === 'draft') {
          setInitialStep(getLastCompletedStep(loadedData));
        }
      }
    } catch (error) {
      console.error('Errore caricamento autovalutazione:', error);
      toast.error('Errore nel caricamento dell\'autovalutazione');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Controlla se esiste una bozza per l'utente corrente
   */
  async function checkForExistingDraft() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('autovalutazioni')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'draft')
        .is('deleted_at', null) // ignora le bozze spostate nel cestino (soft-deleted)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Esiste una bozza - possiamo mostrarla o offrire di caricarla
        setSourceAutovalutazione(data);
      }
    } catch (error) {
      console.error('Errore verifica bozze:', error);
    }
  }

  /**
   * Ottiene l'ultima valutazione CURRENT per suggerire la versione successiva
   */
  async function getLatestVersion(): Promise<string> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return '1.0';

      const { data } = await supabase
        .from('autovalutazioni')
        .select('version')
        .eq('user_id', user.id)
        .eq('status', 'current')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.version) {
        return incrementVersion(data.version);
      }

      return '1.0';
    } catch (error) {
      console.error('Errore recupero versione:', error);
      return '1.0';
    }
  }

  /**
   * Inizializza una nuova autovalutazione con versione suggerita
   */
  async function initializeNewAutovalutazione() {
    setInitializing(true);
    try {
    const suggestedVersion = await getLatestVersion();
    const updates: Partial<RT1WizardData> = { version: suggestedVersion };

    // Pre-popola il valutatore con nome e cognome dell'utente corrente
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('nome, cognome')
          .eq('user_id', user.id)
          .single();
        if (profile?.nome || profile?.cognome) {
          updates.created_by = `${profile.nome || ''} ${profile.cognome || ''}`.trim();
        }

        // Pre-popola la descrizione studio dall'ultima autovalutazione completata
        const { data: lastAuto } = await supabase
          .from('autovalutazioni')
          .select('descrizione_studio')
          .eq('user_id', user.id)
          .in('status', ['current', 'expired', 'archived'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastAuto?.descrizione_studio) {
          updates.descrizione_studio = lastAuto.descrizione_studio;
        }
      }
    } catch (error) {
      console.error('Errore recupero profilo utente:', error);
    }

    updateFormData(updates);
    } finally {
      setInitializing(false);
    }
  }

  /**
   * Aggiorna i dati del form
   */
  function updateFormData(updates: Partial<RT1WizardData>) {
    setFormData(prev => ({
      ...prev,
      ...updates
    }));
  }

  /**
   * Aggiorna descrizione studio
   */
  function updateDescrizioneStudio(updates: Partial<typeof formData.descrizione_studio>) {
    setFormData(prev => ({
      ...prev,
      descrizione_studio: {
        ...prev.descrizione_studio,
        ...updates
      }
    }));
  }

  /**
   * Aggiorna una risposta specifica
   */
  function updateRisposta(
    key: keyof typeof formData.risposte_dettagliate,
    updates: Partial<typeof formData.risposte_dettagliate[typeof key]>
  ) {
    setFormData(prev => ({
      ...prev,
      risposte_dettagliate: {
        ...prev.risposte_dettagliate,
        [key]: {
          ...prev.risposte_dettagliate[key],
          ...updates
        }
      }
    }));
  }

  /**
   * Duplica l'autovalutazione sorgente per crearne una nuova
   */
  async function duplicateFromSource() {
    if (!sourceAutovalutazione) return;

    const newVersion = await getLatestVersion();
    
    // Carica i dati della sorgente
    let risposte = sourceAutovalutazione.risposte_dettagliate || { ...emptyRisposteDettagliate };
    
    // Converti legacy se necessario
    const hasLegacyData = sourceAutovalutazione.fattori_inerenti || sourceAutovalutazione.fattori_vulnerabilita;
    const hasNewData = Object.values(risposte).some((r: any) => r.scelta_valore !== null);
    
    if (hasLegacyData && !hasNewData) {
      const converted = convertLegacyData(sourceAutovalutazione);
      risposte = { ...risposte, ...converted };
    }

    setFormData({
      version: newVersion,
      created_by: sourceAutovalutazione.created_by,
      descrizione_studio: sourceAutovalutazione.descrizione_studio || { ...emptyDescrizioneStudio },
      risposte_dettagliate: risposte,
      piano_mitigazione: sourceAutovalutazione.piano_mitigazione || ''
    });
  }

  /**
   * Reset del form
   */
  function resetForm() {
    setFormData({
      version: '1.0',
      created_by: '',
      descrizione_studio: { ...emptyDescrizioneStudio },
      risposte_dettagliate: { ...emptyRisposteDettagliate },
      piano_mitigazione: ''
    });
  }

  return {
    formData,
    updateFormData,
    updateDescrizioneStudio,
    updateRisposta,
    loading,
    initializing,
    initialStep,
    sourceAutovalutazione,
    initializeNewAutovalutazione,
    duplicateFromSource,
    resetForm,
    getLatestVersion
  };
}
