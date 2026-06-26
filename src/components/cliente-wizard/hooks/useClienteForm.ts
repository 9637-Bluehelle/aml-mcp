import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { WizardData, DocumentoIdentita } from '../types';
import { isValidDate, formatDate } from '../utils';
import { creaCatenaVuota, CatenaControllo, NodoPartecipativo, ArcoPartecipativo, TipoEntita, TipoControllo } from '../../../lib/titolare-effettivo';
import { isItaliana } from '../../../lib/nazionalitaHelper';
import { useToast } from '../../Toast';
import { fetchDocumentoIdentitaEsistente } from '../../../lib/documentUploadHelper';

/** Rileva se un indirizzo è in formato estero (contiene " | " separatore) */
function isIndirizzoEstero(indirizzo: string | undefined, nazionalita: string | undefined): boolean {
  if (!indirizzo) return false;
  // Se contiene il separatore " | " è sicuramente estero
  if (indirizzo.includes(' | ')) return true;
  // Se la nazionalità non è italiana e l'indirizzo non ha formato italiano (no provincia tra parentesi)
  if (!isItaliana(nazionalita) && !indirizzo.match(/\([A-Z]{2}\)/)) return true;
  return false;
}

export function useClienteForm(clienteId?: string) {
  const toast = useToast();
  const [loadingCliente, setLoadingCliente] = useState(!!clienteId);
  const [formData, setFormData] = useState<WizardData>({
    tipo_cliente: 'persona_fisica',
    codice_cliente: '',
    
    // Persona Fisica
    nome_cognome_pf: '',
    codice_fiscale_pf: '',
    documento_pf: {
      tipo: '',
      numero: '',
      data_rilascio: '',
      data_scadenza: '',
      ente_rilascio: ''
    },
    pep_pf: false,
    sanzioni_pf: false,
    note_verifica_pf: '',
    
    // Impresa
    ragione_sociale: '',
    natura_giuridica: '',
    partita_iva_impresa: '',
    codice_fiscale_impresa: '',
    paese: '',
    indirizzo: '',
    rappresentante_legale: '',
    documento_rappresentante: {
      tipo: '',
      numero: '',
      data_rilascio: '',
      data_scadenza: '',
      ente_rilascio: ''
    },
    pep_impresa: false,
    sanzioni_impresa: false,

    // Professionista
    nome_cognome_prof: '',
    codice_fiscale_prof: '',
    partita_iva_prof: '',
    documento_prof: {
      tipo: '',
      numero: '',
      data_rilascio: '',
      data_scadenza: '',
      ente_rilascio: ''
    },
    note_verifica_prof: '',
    
    // Wizard fields
    titolari_effettivi: []
  });

  const updateFormData = (updates: Partial<WizardData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  // Carica dati cliente esistente
  useEffect(() => {
    if (clienteId) {
      loadClienteData(clienteId);
    }
  }, [clienteId]);

  const loadCatenaControllo = async (clienteId: string, denominazione: string, naturaGiuridica?: string): Promise<CatenaControllo | undefined> => {
    try {
      const { data: nodiData, error: nodiError } = await supabase
        .from('catena_controllo_nodi')
        .select('*, anagrafica_soggetti(nome_cognome, codice_fiscale, data_nascita, residenza)')
        .eq('cliente_id', clienteId);

      if (nodiError) return undefined; // Table may not exist yet

      const { data: archiData, error: archiError } = await supabase
        .from('catena_controllo_archi')
        .select('*')
        .eq('cliente_id', clienteId);

      if (archiError) return undefined;

      if (!nodiData || nodiData.length === 0) return undefined;

      const clienteNodo = nodiData.find((n: any) => n.is_cliente_nodo);
      if (!clienteNodo) return undefined;

      const nodi: NodoPartecipativo[] = nodiData.map((n: any) => {
        const pf = n.anagrafica_soggetti || {};
        return {
          id: n.nodo_id,
          tipo: n.tipo as TipoEntita,
          denominazione: n.denominazione,
          nome_cognome: pf.nome_cognome || undefined,
          codice_fiscale: pf.codice_fiscale || undefined,
          persona_id: n.persona_id || undefined,
          natura_giuridica: n.natura_giuridica || undefined,
          is_pep: n.is_pep || false,
          pep_carica: n.pep_carica || undefined,
          data_nascita: pf.data_nascita || undefined,
          residenza: pf.residenza || undefined,
          capitale_sociale: n.capitale_sociale ? Number(n.capitale_sociale) : undefined,
          sede_legale: n.sede_legale || undefined,
        };
      });

      const archi: ArcoPartecipativo[] = (archiData || []).map((a: any) => ({
        id: a.arco_id,
        da_nodo_id: a.da_nodo_id,
        a_nodo_id: a.a_nodo_id,
        percentuale_capitale: Number(a.percentuale_capitale),
        percentuale_voti: a.percentuale_voti ? Number(a.percentuale_voti) : undefined,
        tipo_controllo: a.tipo_controllo as TipoControllo,
        note: a.note || undefined,
        tramite_fiduciaria: a.tramite_fiduciaria || false,
        diritto_reale: a.diritto_reale || undefined,
      }));

      return {
        clienteNodoId: clienteNodo.nodo_id,
        nodi,
        archi,
      };
    } catch {
      return undefined; // Gracefully fail if tables don't exist
    }
  };

  const loadClienteData = async (id: string) => {
    setLoadingCliente(true);
    try {
      // Carica dati cliente
      const { data: clienteData, error: clienteError } = await supabase
        .from('clienti')
        .select('*')
        .eq('id', id)
        .single();

      if (clienteError) throw clienteError;

      // Carica titolari effettivi con dati persona da anagrafica_soggetti
      let titolari: any[] = [];
      if (clienteData.tipo_cliente === 'impresa') {
        const { data: titolariData, error: titolariError } = await supabase
          .from('titolari_effettivi')
          .select('id, cliente_id, persona_id, tipo_rapporto, ruolo, is_pep, pep_carica, note_quota, anagrafica_soggetti(tipo_soggetto, nome_cognome, codice_fiscale, professione, luogo_nascita, provincia_nascita, data_nascita, nazionalita, residenza, documento_tipo, documento_numero, documento_ente_rilascio, documento_data_rilascio, documento_data_scadenza, partita_iva, natura_giuridica, codice_ateco, pep, pep_verificato, pep_carica, pep_data_verifica, pep_fonte_verifica, sanzioni, sanzioni_verificato, sanzioni_data_verifica, sanzioni_fonte_verifica)')
          .eq('cliente_id', id);

        if (titolariError) throw titolariError;
        titolari = titolariData || [];
      }

      // Carica dati persona da anagrafica_soggetti (PEP, sanzioni e altri campi centralizzati)
      let personaData: any = null;
      if (clienteData.persona_id) {
        const { data: pData } = await supabase
          .from('anagrafica_soggetti')
          .select('pep, pep_verificato, pep_carica, pep_data_verifica, pep_fonte_verifica, sanzioni, sanzioni_verificato, sanzioni_data_verifica, sanzioni_fonte_verifica, note_verifica')
          .eq('id', clienteData.persona_id)
          .maybeSingle();
        personaData = pData;
      }

      // Carica rappresentante legale da anagrafica_soggetti se disponibile
      let rappresentanteData: any = null;
      if (clienteData.tipo_cliente === 'impresa' && clienteData.rappresentante_persona_id) {
        const { data: rlData } = await supabase
          .from('anagrafica_soggetti')
          .select('*')
          .eq('id', clienteData.rappresentante_persona_id)
          .maybeSingle();
        rappresentanteData = rlData;
      }

      // Converti date ISO → formato italiano (gg/mm/aaaa)
      const convertDocumento = (doc: any) => {
        if (!doc) return { tipo: '', numero: '', data_rilascio: '', data_scadenza: '', ente_rilascio: '' };
        return {
          tipo: doc.tipo || '',
          numero: doc.numero || '',
          data_rilascio: formatDate(doc.data_rilascio || ''),
          data_scadenza: formatDate(doc.data_scadenza || ''),
          ente_rilascio: doc.ente_rilascio || ''
        };
      };

      // Costruisci formData in base al tipo cliente
      const baseData: Partial<WizardData> = {
        tipo_cliente: clienteData.tipo_cliente || 'persona_fisica',
        codice_cliente: clienteData.codice_cliente || '',
      };

      // PERSONA FISICA
      if (clienteData.tipo_cliente === 'persona_fisica') {
        Object.assign(baseData, {
          nome_cognome_pf: clienteData.ragione_sociale || '',
          codice_fiscale_pf: clienteData.codice_fiscale || '',
          data_nascita_pf: formatDate(clienteData.data_nascita || ''),
          luogo_nascita_pf: clienteData.luogo_nascita || '',
          provincia_nascita_pf: clienteData.provincia_nascita || '',
          nazionalita_pf: clienteData.nazionalita || '',
          professione_pf: clienteData.professione || '',
          residenza_pf: clienteData.residenza || '',
          residenza_estera_pf: isIndirizzoEstero(clienteData.residenza, clienteData.nazionalita),
          documento_pf: convertDocumento(clienteData.documento_identita),
          pep_pf: personaData?.pep ?? clienteData.pep ?? false,
          pep_verificato_pf: personaData?.pep_verificato ?? clienteData.pep_verificato ?? false,
          pep_carica_pf: personaData?.pep_carica || '',
          pep_data_verifica_pf: formatDate(personaData?.pep_data_verifica || clienteData.pep_data_verifica || ''),
          pep_fonte_verifica_pf: personaData?.pep_fonte_verifica || clienteData.pep_fonte_verifica || '',
          sanzioni_pf: personaData?.sanzioni ?? clienteData.sanzioni ?? false,
          sanzioni_verificato_pf: personaData?.sanzioni_verificato ?? clienteData.sanzioni_verificato ?? false,
          sanzioni_data_verifica_pf: formatDate(personaData?.sanzioni_data_verifica || clienteData.sanzioni_data_verifica || ''),
          sanzioni_fonte_verifica_pf: personaData?.sanzioni_fonte_verifica || clienteData.sanzioni_fonte_verifica || '',
          note_verifica_pf: personaData?.note_verifica || clienteData.note_verifica || ''
        });
      }

      // IMPRESA
      if (clienteData.tipo_cliente === 'impresa') {
        // Rappresentante legale da anagrafica_soggetti
        const rl = rappresentanteData;
        // Carica il documento d'identità già a sistema per il rappresentante
        // (se esiste) così il form lo mostra subito senza dover "importare da anagrafica".
        // Salta se il rappresentante è un'azienda (non ha documento d'identità).
        const rlDocEsistente = clienteData.rappresentante_persona_id && rl?.tipo_soggetto !== 'azienda'
          ? await fetchDocumentoIdentitaEsistente(clienteData.rappresentante_persona_id)
          : null;
        const rlDoc = rl ? {
          tipo: rl.documento_tipo || '',
          numero: rl.documento_numero || '',
          data_rilascio: formatDate(rl.documento_data_rilascio || ''),
          data_scadenza: formatDate(rl.documento_data_scadenza || ''),
          ente_rilascio: rl.documento_ente_rilascio || '',
          esistente: rlDocEsistente,
        } : { tipo: '', numero: '', data_rilascio: '', data_scadenza: '', ente_rilascio: '' };

        // Precomputa i titolari effettivi risolvendo in parallelo il documento
        // d'identità esistente per ogni persona.
        const titolariMapped = await Promise.all(titolari.map(async (t) => {
          const pf = t.anagrafica_soggetti || {};
          const esistente = t.persona_id
            ? await fetchDocumentoIdentitaEsistente(t.persona_id)
            : null;
          return {
            id: t.id,
            persona_id: t.persona_id || undefined,
            tipo_soggetto: pf.tipo_soggetto || 'persona_fisica',
            tipo_rapporto: t.tipo_rapporto || 'in_proprio',
            ruolo: t.ruolo || '',
            nome_cognome: pf.nome_cognome || '',
            codice_fiscale: pf.codice_fiscale || '',
            partita_iva: pf.partita_iva || '',
            natura_giuridica: pf.natura_giuridica || '',
            codice_ateco: pf.codice_ateco || '',
            professione: pf.professione || '',
            comune_nascita: pf.luogo_nascita || '',
            provincia_nascita: pf.provincia_nascita || '',
            data_nascita: formatDate(pf.data_nascita || ''),
            nazionalita: pf.nazionalita || '',
            residenza: pf.residenza || '',
            residenza_estera: isIndirizzoEstero(pf.residenza, pf.nazionalita),
            documento_tipo: pf.documento_tipo || '',
            documento_numero: pf.documento_numero || '',
            documento_rilascio_ente: pf.documento_ente_rilascio || '',
            documento_rilascio_data: formatDate(pf.documento_data_rilascio || ''),
            documento_scadenza: formatDate(pf.documento_data_scadenza || ''),
            is_pep: pf.pep ?? t.is_pep ?? false,
            pep_carica: pf.pep_carica || t.pep_carica || '',
            pep_verificato: pf.pep_verificato ?? false,
            pep_data_verifica: pf.pep_data_verifica || '',
            pep_fonte_verifica: pf.pep_fonte_verifica || '',
            sanzioni: pf.sanzioni ?? false,
            sanzioni_verificato: pf.sanzioni_verificato ?? false,
            sanzioni_data_verifica: pf.sanzioni_data_verifica || '',
            sanzioni_fonte_verifica: pf.sanzioni_fonte_verifica || '',
            note_quota: t.note_quota || '',
            documento_esistente: esistente,
          };
        }));

        Object.assign(baseData, {
          ragione_sociale: clienteData.ragione_sociale || '',
          natura_giuridica: clienteData.natura_giuridica || '',
          partita_iva_impresa: clienteData.partita_iva || '',
          codice_fiscale_impresa: clienteData.codice_fiscale || '',
          paese: clienteData.paese || '',
          indirizzo: clienteData.indirizzo || '',
          sede_estera: isIndirizzoEstero(clienteData.indirizzo, clienteData.paese),
          rappresentante_legale: rl?.nome_cognome || '',
          codice_fiscale_rappresentante: rl?.codice_fiscale || '',
          tipo_soggetto_rappresentante: rl?.tipo_soggetto || 'persona_fisica',
          partita_iva_rappresentante: rl?.partita_iva || '',
          natura_giuridica_rappresentante: rl?.natura_giuridica || '',
          codice_ateco_rappresentante: rl?.codice_ateco || '',
          data_nascita_rappresentante: formatDate(rl?.data_nascita || ''),
          luogo_nascita_rappresentante: rl?.luogo_nascita || '',
          provincia_nascita_rappresentante: rl?.provincia_nascita || '',
          nazionalita_rappresentante: rl?.nazionalita || '',
          residenza_rappresentante: rl?.residenza || '',
          residenza_estera_rappresentante: isIndirizzoEstero(rl?.residenza, rl?.nazionalita),
          documento_rappresentante: rlDoc,
          pep_impresa: clienteData.pep || false,
          pep_verificato_impresa: clienteData.pep_verificato || false,
          pep_carica_impresa: rl?.pep_carica || '',
          pep_data_verifica_impresa: formatDate(clienteData.pep_data_verifica || ''),
          pep_fonte_verifica_impresa: clienteData.pep_fonte_verifica || '',
          sanzioni_impresa: clienteData.sanzioni || false,
          sanzioni_verificato_impresa: clienteData.sanzioni_verificato || false,
          sanzioni_data_verifica_impresa: formatDate(clienteData.sanzioni_data_verifica || ''),
          sanzioni_fonte_verifica_impresa: clienteData.sanzioni_fonte_verifica || '',
          codice_ateco_impresa: clienteData.codice_ateco || '',
          attivita_svolta_impresa: clienteData.attivita_svolta || '',
          codice_rae_impresa: clienteData.codice_rae || '',
          descrizione_rae_impresa: clienteData.descrizione_rae || '',
          note_verifica_impresa: clienteData.note_verifica || '',
          // Carica catena di controllo (se esiste)
          catena_controllo: await loadCatenaControllo(id, clienteData.ragione_sociale || '', clienteData.natura_giuridica),
          // Titolari pre-computati sopra (includono documento_esistente).
          titolari_effettivi: titolariMapped,
        });
      }

      // PROFESSIONISTA
      if (clienteData.tipo_cliente === 'professionista') {
        Object.assign(baseData, {
          nome_cognome_prof: clienteData.ragione_sociale || '',
          codice_fiscale_prof: clienteData.codice_fiscale || '',
          partita_iva_prof: clienteData.partita_iva || '',
          data_nascita_prof: formatDate(clienteData.data_nascita || ''),
          luogo_nascita_prof: clienteData.luogo_nascita || '',
          provincia_nascita_prof: clienteData.provincia_nascita || '',
          nazionalita_prof: clienteData.nazionalita || '',
          professione_prof: clienteData.professione || '',
          residenza_prof: clienteData.residenza || '',
          residenza_estera_prof: isIndirizzoEstero(clienteData.residenza, clienteData.nazionalita),
          documento_prof: convertDocumento(clienteData.documento_identita),
          codice_ateco_prof: clienteData.codice_ateco || '',
          attivita_svolta_prof: clienteData.attivita_svolta || '',
          codice_rae_prof: clienteData.codice_rae || '',
          descrizione_rae_prof: clienteData.descrizione_rae || '',
          pep_prof: personaData?.pep ?? clienteData.pep ?? false,
          pep_verificato_prof: personaData?.pep_verificato ?? clienteData.pep_verificato ?? false,
          pep_carica_prof: personaData?.pep_carica || '',
          pep_data_verifica_prof: formatDate(personaData?.pep_data_verifica || clienteData.pep_data_verifica || ''),
          pep_fonte_verifica_prof: personaData?.pep_fonte_verifica || clienteData.pep_fonte_verifica || '',
          sanzioni_prof: personaData?.sanzioni ?? clienteData.sanzioni ?? false,
          sanzioni_verificato_prof: personaData?.sanzioni_verificato ?? clienteData.sanzioni_verificato ?? false,
          sanzioni_data_verifica_prof: formatDate(personaData?.sanzioni_data_verifica || clienteData.sanzioni_data_verifica || ''),
          sanzioni_fonte_verifica_prof: personaData?.sanzioni_fonte_verifica || clienteData.sanzioni_fonte_verifica || '',
          note_verifica_prof: personaData?.note_verifica || clienteData.note_verifica || ''
        });
      }

      setFormData(prev => ({ ...prev, ...baseData } as WizardData));
    } catch (error) {
      console.error('Errore nel caricamento dei dati cliente:', error);
      toast.error('Errore nel caricamento dei dati del cliente');
    } finally {
      setLoadingCliente(false);
    }
  };

  // VALIDAZIONE - Verifica se tutti i campi obbligatori sono compilati
  const isClienteComplete = (): boolean => {
    const { tipo_cliente } = formData;

    // PERSONA FISICA
    if (tipo_cliente === 'persona_fisica') {
      return !!(
        formData.nome_cognome_pf?.trim() &&
        formData.codice_fiscale_pf?.trim() &&
        formData.data_nascita_pf?.trim() &&
        isValidDate(formData.data_nascita_pf) &&
        formData.luogo_nascita_pf?.trim() &&
        formData.nazionalita_pf?.trim() &&
        formData.professione_pf?.trim() &&
        formData.residenza_pf?.trim() &&
        formData.documento_pf?.tipo &&
        formData.documento_pf?.numero?.trim() &&
        formData.documento_pf?.data_rilascio?.trim() &&
        formData.documento_pf?.ente_rilascio?.trim() &&
        formData.documento_pf?.data_scadenza
      );
    }

    // IMPRESA
    if (tipo_cliente === 'impresa') {
      return !!(
        formData.ragione_sociale?.trim() &&
        formData.codice_fiscale_impresa?.trim() &&
        formData.documento_rappresentante?.tipo &&
        formData.documento_rappresentante?.numero?.trim() &&
        formData.documento_rappresentante?.data_rilascio?.trim() &&
        formData.documento_rappresentante?.ente_rilascio?.trim() &&
        formData.documento_rappresentante?.data_scadenza
      );
    }

    // PROFESSIONISTA
    if (tipo_cliente === 'professionista') {
      return !!(
        formData.nome_cognome_prof?.trim() &&
        formData.codice_fiscale_prof?.trim() &&
        formData.partita_iva_prof?.trim() &&
        formData.data_nascita_prof?.trim() &&
        isValidDate(formData.data_nascita_prof) &&
        formData.luogo_nascita_prof?.trim() &&
        formData.nazionalita_prof?.trim() &&
        formData.professione_prof?.trim() &&
        formData.residenza_prof?.trim() &&
        formData.documento_prof?.tipo &&
        formData.documento_prof?.numero?.trim() &&
        formData.documento_prof?.data_rilascio?.trim() &&
        formData.documento_prof?.ente_rilascio?.trim() &&
        formData.documento_prof?.data_scadenza
      );
    }

    return false;
  };

  const validateStep1 = (): { valid: boolean; message?: string } => {
    // Per Step 1, richiedi solo codice_cliente
    if (!formData.codice_cliente.trim()) {
      return { valid: false, message: 'Codice Cliente è obbligatorio' };
    }

    // Valida formato date se presenti
    const { tipo_cliente } = formData;
    
    if (tipo_cliente === 'persona_fisica') {
      if (formData.data_nascita_pf && !isValidDate(formData.data_nascita_pf)) {
        return { valid: false, message: 'Data di Nascita non valida (formato: gg/mm/aaaa)' };
      }
    }

    if (tipo_cliente === 'professionista') {
      if (formData.data_nascita_prof && !isValidDate(formData.data_nascita_prof)) {
        return { valid: false, message: 'Data di Nascita non valida (formato: gg/mm/aaaa)' };
      }
    }

    return { valid: true };
  };

  return {
    formData,
    setFormData,
    updateFormData,
    isClienteComplete,
    validateStep1,
    loadingCliente
  };
}
