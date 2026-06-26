import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { WizardData } from '../types';
import { formatDateForDB } from '../utils';
import { addUserLog } from '../../LogUtente';
import { uploadDocumentoIdentita } from '../../../lib/documentUploadHelper';
import { useToast } from '../../Toast';
import { getActiveStudioIdHolder } from '../../../lib/studioHelper';
import { salvaCliente, validateScadenzeDocumenti } from '../../../../api/_lib/clienteService';

// La logica pura di salvataggio (anagrafiche, titolari, catena di controllo, INSERT/UPDATE)
// vive ora in `api/_lib/clienteService.ts`, condivisa tra UI e server MCP (vedi §9 del piano).
// Questo hook è un wrapper sottile attorno a quel servizio: gestisce solo lo stato React, i
// toast/errori UI e l'upload differito dei documenti d'identità (File, browser-only). Iniettiamo
// il client Supabase singleton e lo studio attivo del holder, così il comportamento resta identico.
export function useClienteSave(
  formData: WizardData,
  isClienteComplete: () => boolean,
  addDebugLog: (msg: string, data?: any) => void,
  clienteId?: string
) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const toast = useToast();

  const handleSave = async (onComplete: () => void) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Validazione: se viene registrato un documento di identità (PDF o cartaceo),
      // la data di scadenza è obbligatoria (serve per gli alert di scadenza e
      // come metadato obbligatorio sulla riga `documenti`). Regola condivisa col servizio.
      const scadenzaMancante = validateScadenzeDocumenti(formData);
      if (scadenzaMancante.length > 0) {
        const msg = `Data di scadenza documento mancante per: ${scadenzaMancante.join(', ')}. `
          + `La scadenza è obbligatoria quando viene registrato un documento (PDF o cartaceo).`;
        setSaveError(msg);
        toast.error(msg);
        setIsSaving(false);
        return;
      }

      // Salvataggio cliente + entità relazionali tramite il servizio condiviso.
      const result = await salvaCliente(supabase, formData, {
        clienteId,
        isComplete: isClienteComplete(),
        activeStudioId: getActiveStudioIdHolder(),
        log: addDebugLog,
        userLog: addUserLog,
      });

      const {
        cliente,
        clientePersonaId,
        rappresentantePersonaId,
        titolariPreparati,
        targetClienteId,
        clientStatus,
        isEditMode,
      } = result;

      // ============================================================
      // UPLOAD DIFFERITO DEI DOCUMENTI D'IDENTITÀ (file PDF / cartaceo)
      // Eseguito dopo il salvataggio del cliente: i file restano in memoria
      // durante il wizard e vengono caricati ora che abbiamo cliente.id e
      // tutti i persona_id necessari. Errori non bloccanti: vengono loggati.
      // Resta nel wizard (browser-only) perché manipola oggetti File.
      // ============================================================
      const uploadTasks: Array<{ label: string; args: Parameters<typeof uploadDocumentoIdentita>[0] }> = [];

      if (formData.tipo_cliente === 'persona_fisica' && clientePersonaId) {
        const d = formData.documento_pf;
        if (d?.file || d?.cartaceo) {
          uploadTasks.push({
            label: `cliente persona fisica (${formData.nome_cognome_pf})`,
            args: {
              personaId: clientePersonaId,
              clienteId: targetClienteId,
              file: d.file,
              cartaceo: d.cartaceo,
              dataScadenza: formatDateForDB(d.data_scadenza || ''),
              descrizione: d.descrizione,
            },
          });
        }
      }
      if (formData.tipo_cliente === 'professionista' && clientePersonaId) {
        const d = formData.documento_prof;
        if (d?.file || d?.cartaceo) {
          uploadTasks.push({
            label: `professionista (${formData.nome_cognome_prof})`,
            args: {
              personaId: clientePersonaId,
              clienteId: targetClienteId,
              file: d.file,
              cartaceo: d.cartaceo,
              dataScadenza: formatDateForDB(d.data_scadenza || ''),
              descrizione: d.descrizione,
            },
          });
        }
      }
      if (formData.tipo_cliente === 'impresa' && rappresentantePersonaId) {
        const d = formData.documento_rappresentante;
        if (d?.file || d?.cartaceo) {
          uploadTasks.push({
            label: `rappresentante legale (${formData.rappresentante_legale})`,
            args: {
              personaId: rappresentantePersonaId,
              clienteId: targetClienteId,
              file: d.file,
              cartaceo: d.cartaceo,
              dataScadenza: formatDateForDB(d.data_scadenza || ''),
              descrizione: d.descrizione,
            },
          });
        }
        for (let i = 0; i < titolariPreparati.length; i++) {
          const t = titolariPreparati[i];
          if (!t.persona_id) continue;
          if (!t._docFile && !t._docCartaceo) continue;
          uploadTasks.push({
            label: `titolare effettivo #${i + 1} (${formData.titolari_effettivi[i]?.nome_cognome || ''})`,
            args: {
              personaId: t.persona_id,
              clienteId: targetClienteId,
              file: t._docFile,
              cartaceo: t._docCartaceo,
              dataScadenza: t._docScadenza || null,
              descrizione: t._docDescrizione,
            },
          });
        }
      }

      if (uploadTasks.length > 0) {
        addDebugLog(`📎 Upload documenti d'identità: ${uploadTasks.length} task`);
        for (const task of uploadTasks) {
          const res = await uploadDocumentoIdentita(task.args);
          if (!res.ok) {
            addDebugLog(`⚠️ Upload fallito (${task.label})`, res.error);
            toast.warning(`Documento ${task.label}: ${res.error}`);
          } else if (!res.skipped) {
            addDebugLog(`✅ Documento caricato (${task.label})`);
          }
        }
      }

      addDebugLog('🎉 Salvataggio completato con successo');

      const actionMessage = isEditMode ? 'aggiornato' : 'salvato';
      const statusMessage = clientStatus === 'active'
        ? `Cliente ${actionMessage} e ATTIVATO con successo!`
        : `Cliente ${actionMessage} come BOZZA. Completa i dati obbligatori per attivarlo.`;

      // Riepilogo anagrafiche create/aggiornate automaticamente da questo flusso.
      // Le scritture effettive su anagrafica_soggetti sono già loggate dal trigger DB
      // (entity_type='soggetto'); qui produciamo solo la riga riassuntiva nel user log.
      const soggettiCollegati: string[] = [];
      if (clientePersonaId) soggettiCollegati.push('1 anagrafica cliente');
      if (rappresentantePersonaId) soggettiCollegati.push('1 rappresentante legale');
      if (titolariPreparati.length > 0) {
        soggettiCollegati.push(
          `${titolariPreparati.length} titolar${titolariPreparati.length === 1 ? 'e effettivo' : 'i effettivi'}`
        );
      }
      const soggettiSummary = soggettiCollegati.length > 0
        ? ` (anagrafiche collegate: ${soggettiCollegati.join(', ')})`
        : '';

      void cliente; // riga cliente salvata: disponibile per estensioni future
      const logMessage = `${actionMessage == 'salvato'? 'Nuovo c' : 'C'}liente ${formData.nome_cognome_pf ? formData.nome_cognome_pf : formData.ragione_sociale? formData.ragione_sociale: formData.nome_cognome_prof}, ${actionMessage}${clientStatus == 'draft'? ' come BOZZA': ''}${soggettiSummary}.`
      toast.success(statusMessage);
      addUserLog(logMessage );
      onComplete();

    } catch (error: any) {
      addDebugLog('❌ Errore durante il salvataggio', error);
      console.error('Errore salvataggio:', error);

      // Gestione errore duplicato codice cliente (constraint unique per studio)
      const errText = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
      const isDuplicateCodiceCliente =
        error?.code === '23505' &&
        (errText.includes('codice_cliente') || errText.includes('clienti_codice_cliente'));

      if (isDuplicateCodiceCliente) {
        const codice = formData.codice_cliente?.trim();
        const msg = codice
          ? `Il codice cliente "${codice}" è già assegnato a un altro cliente del tuo studio. Inseriscine uno diverso e riprova.`
          : `Il codice cliente inserito è già assegnato a un altro cliente del tuo studio. Inseriscine uno diverso e riprova.`;
        setSaveError(msg);
        toast.error(msg);
      } else {
        console.error('Errore salvataggio cliente:', error);
        const msg = 'Impossibile salvare il cliente. Verifica i dati inseriti o riprova più tardi.';
        setSaveError(msg);
        toast.error(msg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const clearSaveError = () => setSaveError(null);

  return { isSaving, saveError, handleSave, clearSaveError };
}
