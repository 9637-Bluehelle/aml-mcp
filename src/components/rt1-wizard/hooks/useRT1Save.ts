// ==================== USE RT1 SAVE HOOK ====================

import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { RT1WizardData } from '../types';
import { calculateRT1Scores, validateComplete, getValidUntilDate } from '../utils';
import { FATTORI_INERENTI_KEYS, FATTORI_VULNERABILITA_KEYS } from '../constants';
import { useToast, useConfirm } from '../../Toast';
import { addUserLog } from '../../LogUtente';

export function useRT1Save(
  formData: RT1WizardData,
  autovalutazioneId?: string
) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  /**
   * Salva come BOZZA
   */
  async function saveDraft(onSuccess?: () => void): Promise<string | null> {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Ottieni user_id corrente
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utente non autenticato');

      // Calcola score solo se abbiamo dati sufficienti, altrimenti NULL
      const scores = calculateRT1Scores(formData.risposte_dettagliate);
      
      // Se lo score è 0 o troppo basso, usa NULL (bozza parziale)
      const hasValidScores = scores.inerente >= 1 && scores.vulnerabilita >= 1 && scores.residuo >= 1;

      // Prepara i dati per il salvataggio
      const dataToSave: any = {
        user_id: user.id,
        version: formData.version || '1.0',
        created_by: formData.created_by || '',
        status: 'draft',
        descrizione_studio: formData.descrizione_studio,
        risposte_dettagliate: formData.risposte_dettagliate,
        piano_mitigazione: formData.piano_mitigazione || '',
        inerente_score: hasValidScores ? scores.inerente : null,
        vulnerabilita_score: hasValidScores ? scores.vulnerabilita : null,
        residuo_score: hasValidScores ? scores.residuo : null,
        valid_until: null, // Le bozze non hanno scadenza
        // Mantieni compatibilità con vecchio formato
        fattori_inerenti: {
          clientTypes: formData.risposte_dettagliate.tipologia_clientela.scelta_valore || 0,
          geography: formData.risposte_dettagliate.area_geografica_operativita.scelta_valore || 0,
          channels: formData.risposte_dettagliate.canali_distributivi.scelta_valore || 0,
          services: formData.risposte_dettagliate.servizi_professionali_offerti.scelta_valore || 0
        },
        fattori_vulnerabilita: {
          training: formData.risposte_dettagliate.formazione.scelta_valore || 0,
          kycOrg: formData.risposte_dettagliate.organizzazione_adeguata_verifica.scelta_valore || 0,
          retentionOrg: formData.risposte_dettagliate.organizzazione_conservazione.scelta_valore || 0,
          sosCashControls: formData.risposte_dettagliate.organizzazione_segnalazione_sos.scelta_valore || 0
        }
      };

      let savedId: string;

      if (autovalutazioneId) {
        // UPDATE bozza esistente
        const { data, error } = await supabase
          .from('autovalutazioni')
          .update(dataToSave)
          .eq('id', autovalutazioneId)
          .select('id')
          .single();

        if (error) throw error;
        savedId = data.id;
        
        // console.log('✅ Bozza aggiornata:', savedId);
        addUserLog(`Bozza autovalutazione RT1 v${formData.version || '1.0'} aggiornata`);
      } else {
        // INSERT nuova bozza
        const { data, error } = await supabase
          .from('autovalutazioni')
          .insert(dataToSave)
          .select('id')
          .single();

        if (error) throw error;
        savedId = data.id;
        
        // console.log('✅ Nuova bozza creata:', savedId);
        addUserLog(`Nuova bozza autovalutazione RT1 v${formData.version || '1.0'} creata`);
      }

      if (onSuccess) onSuccess();
      
      return savedId;
    } catch (error: any) {
      console.error('❌ Errore salvataggio bozza:', error);
      setSaveError(error.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Completa e salva come CURRENT
   */
  async function saveComplete(onSuccess?: () => void): Promise<boolean> {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Valida completezza
      const validation = validateComplete(formData);
      if (!validation.valid) {
        toast.warning(validation.message);
        setIsSaving(false);
        return false;
      }

      // Calcola score finali
      const scores = calculateRT1Scores(formData.risposte_dettagliate);

      // Calcola valid_until (oggi + 3 anni)
      const validUntil = getValidUntilDate();

      // Prepara i dati per il salvataggio
      const dataToSave: any = {
        version: formData.version,
        created_by: formData.created_by,
        status: 'current',
        valid_until: validUntil,
        descrizione_studio: formData.descrizione_studio,
        risposte_dettagliate: formData.risposte_dettagliate,
        piano_mitigazione: formData.piano_mitigazione,
        inerente_score: scores.inerente,
        vulnerabilita_score: scores.vulnerabilita,
        residuo_score: scores.residuo,
        // Mantieni compatibilità con vecchio formato
        fattori_inerenti: {
          clientTypes: formData.risposte_dettagliate.tipologia_clientela.scelta_valore || 0,
          geography: formData.risposte_dettagliate.area_geografica_operativita.scelta_valore || 0,
          channels: formData.risposte_dettagliate.canali_distributivi.scelta_valore || 0,
          services: formData.risposte_dettagliate.servizi_professionali_offerti.scelta_valore || 0
        },
        fattori_vulnerabilita: {
          training: formData.risposte_dettagliate.formazione.scelta_valore || 0,
          kycOrg: formData.risposte_dettagliate.organizzazione_adeguata_verifica.scelta_valore || 0,
          retentionOrg: formData.risposte_dettagliate.organizzazione_conservazione.scelta_valore || 0,
          sosCashControls: formData.risposte_dettagliate.organizzazione_segnalazione_sos.scelta_valore || 0
        }
      };

      // Se esiste una CURRENT precedente, archiviala
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utente non autenticato');

      const { error: archiveError } = await supabase
        .from('autovalutazioni')
        .update({ status: 'archived' })
        .eq('user_id', user.id)
        .eq('status', 'current');

      if (archiveError) {
        console.warn('Attenzione durante archiviazione autovalutazione precedente:', archiveError);
      }

      // Se stiamo aggiornando una bozza esistente, fai UPDATE + cambio status
      if (autovalutazioneId) {
        const { error } = await supabase
          .from('autovalutazioni')
          .update(dataToSave)
          .eq('id', autovalutazioneId);

        if (error) throw error;
        
        // console.log('✅ Bozza completata e promossa a CURRENT:', autovalutazioneId);
        addUserLog(`Autovalutazione RT1 v${formData.version} completata e attivata`);
      } else {
        // Altrimenti INSERT nuova CURRENT con user_id esplicito
        const { error } = await supabase
          .from('autovalutazioni')
          .insert({
            ...dataToSave,
            user_id: user.id
          });

        if (error) throw error;
        
        // console.log('✅ Nuova autovalutazione CURRENT salvata');
        addUserLog(`Nuova autovalutazione RT1 v${formData.version} completata e attivata`);
      }

      toast.success('Autovalutazione completata e salvata con successo! Valida fino al: ' + new Date(validUntil).toLocaleDateString('it-IT'));
      
      // console.log('🎉 [SAVE] Alert chiuso, chiamando onSuccess callback...');
      if (onSuccess) {
        // console.log('🎉 [SAVE] onSuccess ESISTE, chiamandolo ora!');
        onSuccess();
        // console.log('🎉 [SAVE] onSuccess chiamato con successo!');
      } else {
        console.warn('⚠️ [SAVE] onSuccess è undefined!');
      }
      
      return true;
    } catch (error: any) {
      console.error('❌ Errore salvataggio autovalutazione:', error);
      setSaveError(error.message);
      toast.error('Errore durante il salvataggio: ' + error.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Duplica un'autovalutazione esistente come nuova DRAFT
   */
  async function duplicateAs(sourceId: string, newVersion: string): Promise<string | null> {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Carica autovalutazione sorgente
      const { data: source, error: loadError } = await supabase
        .from('autovalutazioni')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (loadError) throw loadError;
      if (!source) throw new Error('Autovalutazione sorgente non trovata');

      // Crea nuova bozza con i dati della sorgente
      const newDraft = {
        version: newVersion,
        created_by: source.created_by,
        status: 'draft',
        descrizione_studio: source.descrizione_studio,
        risposte_dettagliate: source.risposte_dettagliate,
        piano_mitigazione: source.piano_mitigazione,
        inerente_score: source.inerente_score,
        vulnerabilita_score: source.vulnerabilita_score,
        residuo_score: source.residuo_score,
        fattori_inerenti: source.fattori_inerenti,
        fattori_vulnerabilita: source.fattori_vulnerabilita,
        valid_until: null // Le bozze non hanno scadenza
      };

      const { data: newData, error: insertError } = await supabase
        .from('autovalutazioni')
        .insert(newDraft)
        .select('id')
        .single();

      if (insertError) throw insertError;

      // console.log('✅ Autovalutazione duplicata come bozza:', newData.id);
      
      return newData.id;
    } catch (error: any) {
      console.error('❌ Errore duplicazione autovalutazione:', error);
      setSaveError(error.message);
      toast.error('Errore durante la duplicazione: ' + error.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Elimina una bozza
   */
  async function deleteDraft(draftId: string, onSuccess?: () => void): Promise<boolean> {
    try {
      const confirmed = await confirm({ message: 'Sei sicuro di voler eliminare questa bozza?', variant: 'danger', confirmText: 'Elimina' });
      if (!confirmed) return false;

      const { error } = await supabase
        .from('autovalutazioni')
        .delete()
        .eq('id', draftId)
        .eq('status', 'draft'); // Sicurezza: elimina solo se è draft

      if (error) throw error;

      // console.log('✅ Bozza eliminata:', draftId);
      addUserLog('Eliminata bozza autovalutazione RT1');
      
      if (onSuccess) onSuccess();
      
      return true;
    } catch (error: any) {
      console.error('❌ Errore eliminazione bozza:', error);
      toast.error('Errore durante l\'eliminazione: ' + error.message);
      return false;
    }
  }

  return {
    isSaving,
    saveError,
    saveDraft,
    saveComplete,
    duplicateAs,
    deleteDraft
  };
}
