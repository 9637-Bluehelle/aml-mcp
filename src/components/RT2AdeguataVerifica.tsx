import { useState, useEffect, useRef, Fragment } from 'react';
import { Card } from './Card';
import { useScrollLock } from '../hooks/useScrollLock';
import { ValutazioneRischioForm } from './ValutazioneRischioForm';
//import { RiskBadge } from './RiskBadge';
import { Save, Search, FileText, Users, X, /*AlertTriangle, Shield,*/ RefreshCw, CheckCircle, ArrowUpDown, Archive, RotateCcw, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { enrichClienteWithRappresentante, loadTitolariWithPersona, /*findPersoneIdByCliente*/ } from '../lib/personeHelper';
import { amlData, getPrestazione } from '../lib/aml-data';
import { /*calculateRT2Scores, */ RT2TabellaA, RT2TabellaB, /*RT2FattoreRischio, createDefaultTabellaA, createDefaultTabellaB*/ } from '../lib/calculations';
import { ClienteWizard } from './cliente-wizard';
import { Combobox } from '@headlessui/react';
import { Check, ChevronDown, Trash2, Plus} from "lucide-react";
import { /*useClienteDelete,*/ useIncaricoDelete } from './EliminaClienteIncarico.tsx';
// PDF generation - commentato per future implementazioni
// import { generateAndDownloadPDF, DocumentType } from '../lib/pdf-service';
//import { generateAndDownloadDOCX_AV3, generateAndDownloadDOCX_AV4 } from '../lib/docx-converter';
//import { getMyStudio } from '../lib/studioHelper';
import {formatDate, formatDateInv} from './cliente-wizard/components/forms/PersonaFisicaForm';
import { loadImpostazioni, generateCodiceIncarico, type FormatoCodice } from '../lib/codiceGenerator';
// import { useSystemAlerts } from './AlertPanel.tsx'; // [DEPRECATED 2026-04-22] Gestito dai trigger DB
import { useToast, useConfirm } from './Toast';
import { addUserLog } from './LogUtente.tsx';
import { useStudio } from '../lib/StudioContext';
import { Spinner } from '../components/cliente-wizard/modals/Spinner.tsx';
import { DocumentiAllegati } from './DocumentiAllegati';
import { DettaglioIncaricoPage } from './IncaricoDettModifica';
import { ClienteDettaglioView } from './ClienteDettaglioShared';
//import { getNomeBySigla, getSiglaByCity } from '../lib/provinceHelper';
//import codiciAtecoRischio from '../data/codici_ateco_2025_rischio.json';  // codici_ateco_rischio.json
//import rischioPaesiData from '../data/rischio_paesi.json';

interface Cliente {
  id: string;
  codice_cliente: string;
  ragione_sociale: string;
  tipo_cliente?: 'persona_fisica' | 'societa' | 'professionista' | 'impresa';
  status?: 'draft' | 'active' | 'archived';
  codice_fiscale?: string;
  partita_iva?: string;
  natura_giuridica?: string;
  indirizzo?: string;
  paese?: string;
  // Nuovi campi persona fisica
  data_nascita?: string;
  luogo_nascita?: string;
  nazionalita?: string;
  professione?: string;
  residenza?: string;
  // Campi vecchi 
  comune_nascita?: string;
  provincia_nascita?: string;
  via?: string;
  numero_civico?: string;
  comune_residenza?: string;
  provincia_residenza?: string;
  domicilio?: string;
  rappresentante_legale?: string;
  pep?: boolean;
  pep_dettagli?: string;
  sanzioni?: boolean;
  registro_imprese?: string;
  numero_iscrizione?: string;
  documento_identita?: {
    tipo: string;
    numero: string;
    data_rilascio: string;
    data_scadenza: string;
    ente_rilascio: string;
  };
  rappresentante_legale_documento?: {
    tipo: string;
    numero: string;
    data_rilascio: string;
    data_scadenza: string;
    ente_rilascio: string;
  };
  titolare_effettivo?: {
    nome: string;
    codice_fiscale: string;
    data_nascita: string;
    metodo_verifica: string;
    note: string;
  };
  ownerEmail?:string;
  isMine?:boolean;
  archiviato?: boolean;
}

interface TitolareEffettivo {
  id: string;
  cliente_id: string;
  tipo_soggetto?: 'persona_fisica' | 'azienda';
  tipo_rapporto: string;
  nome_cognome: string;
  codice_fiscale: string;
  professione: string;
  comune_nascita: string;
  provincia_nascita: string;
  data_nascita: string;
  comune_residenza: string;
  via_residenza: string;
  numero_civico: string;
  // Campi azienda (popolati solo quando tipo_soggetto='azienda')
  partita_iva?: string;
  natura_giuridica?: string;
  codice_ateco?: string;
  documento_tipo: string;
  documento_numero: string;
  documento_rilascio_ente: string;
  documento_rilascio_data: string;
  documento_scadenza: string;
  is_pep: boolean;
  pep_carica?: string;
  note_quota?: string;

}

interface Incarico {
  id: string;
  codice_incarico: string;
  tipologia_prestazione_id: string;
  descrizione: string;
  scopo_natura?: string;
  data_inizio?: string;
  importo_stimato?: number;
  cliente_id?: string;
  relazioni_cliente_te?: string;
  provenienza_fondi?: string;
  mezzi_pagamento?: string;
  ownerEmail?:string;
  isMine?:boolean;
  archiviato?: boolean;
}

interface IncaricoCompleto extends Incarico {
  cliente?: Cliente;
  conferma_fondi_leciti: boolean;
}

interface Valutazione {
  id: string;
  incarico_id: string;
  created_at: string;
  data_valutazione: string;
  rischio_inerente_prestazione: number;
  rischio_specifico: number;
  rischio_effettivo: number;
  classe_rischio: number;
  misure_applicate: string;
  tabella_a_scores: RT2TabellaA;
  tabella_b_scores: RT2TabellaB | null;
  user_id:string
}

/*interface StoricoModifica {
  id: string;
  created_at: string;
  entity_type: 'cliente' | 'incarico';
  entity_id: string;
  campo: string;
  valore_precedente: string | null;
  valore_nuovo: string | null;
  user_id: string;
}*/

// [DEPRECATED 2026-05-07] Helper per salvare lo storico modifiche.
// Sostituito dal trigger DB log_storico_clienti_incarichi() in migrazione
// 20260508000000_audit_storico_db_triggers.sql.
/*
async function saveStoricoModifiche(
  entityType: 'cliente' | 'incarico',
  entityId: string,
  campiModificati: { campo: string; vecchio: string | null; nuovo: string | null }[]
) {
  if (campiModificati.length === 0) return;
  const rows = campiModificati.map(m => ({
    entity_type: entityType,
    entity_id: entityId,
    campo: m.campo,
    valore_precedente: m.vecchio,
    valore_nuovo: m.nuovo,
  }));
  const { error } = await supabase.from('storico_modifiche').insert(rows);
  if (error) console.error('Errore salvataggio storico modifiche:', error);
}
*/

// Helper per caricare lo storico modifiche
/*async function loadStoricoModifiche(
  entityType: 'cliente' | 'incarico',
  entityId: string
): Promise<StoricoModifica[]> {
  const { data, error } = await supabase
    .from('storico_modifiche')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Errore caricamento storico modifiche:', error);
    return [];
  }
  return data || [];
}*/

// Etichette leggibili per i campi
/*const LABEL_CAMPI: Record<string, string> = {
  codice_incarico: 'Codice Incarico',
  tipologia_prestazione_id: 'Tipologia Prestazione',
  descrizione: 'Descrizione',
  scopo_natura: 'Scopo/Natura',
  data_inizio: 'Data Inizio',
  importo_stimato: 'Importo Stimato',
  relazioni_cliente_te: 'Relazioni Cliente/TE',
  provenienza_fondi: 'Provenienza Fondi',
  mezzi_pagamento: 'Mezzi di Pagamento',
  conferma_fondi_leciti: 'Conferma Fondi Leciti',
  cliente_id: 'Cliente',
  ragione_sociale: 'Ragione Sociale',
  codice_cliente: 'Codice Cliente',
  codice_fiscale: 'Codice Fiscale',
  partita_iva: 'Partita IVA',
  tipo_cliente: 'Tipo Cliente',
  natura_giuridica: 'Natura Giuridica',
  codice_ateco: 'Codice ATECO',
  attivita_svolta: 'Principale Attività Svolta',
  indirizzo: 'Indirizzo',
  paese: 'Paese',
  data_nascita: 'Data di Nascita',
  luogo_nascita: 'Luogo di Nascita',
  nazionalita: 'Nazionalità',
  professione: 'Professione',
  residenza: 'Residenza',
  domicilio: 'Domicilio',
  rappresentante_legale: 'Rappresentante Legale',
  pep: 'PEP',
  sanzioni: 'Sanzioni',
};*/

export function useAppData() {
  const [clienti, setClienti] = useState<any[]>([]);
  const [incarichi, setIncarichi] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { activeStudioId } = useStudio();

  async function loadData() {
    setLoading(true);
    // try/finally: `loading` viene SEMPRE riazzerato (anche su sessione assente o errore), così un
    // blip di auth/rete non blocca l'app in caricamento all'infinito.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const studioId = activeStudioId;

      const emailMap: Record<string, string> = {};

      if (studioId) {
        const { data: studioMembers, error: membersErr } = await supabase
          .from('user_profiles')
          .select('user_id, email, nome, cognome, role')
          .eq('studio_id', studioId);
        if (membersErr) throw membersErr;

        studioMembers?.forEach(m => {
          const fullName = [m.nome, m.cognome].filter(Boolean).join(' ');
          emailMap[m.user_id] = fullName || m.email || 'Utente';
        });
      } else {
        emailMap[user.id] = 'Utente';
      }

      let qClienti = supabase.from('clienti').select('*').is('deleted_at', null);
      let qIncarichi = supabase.from('incarichi').select('*').is('deleted_at', null);
      if (studioId) {
        qClienti = qClienti.eq('studio_id', studioId);
        qIncarichi = qIncarichi.eq('studio_id', studioId);
      }
      const [clientiRes, incarichiRes] = await Promise.all([qClienti, qIncarichi]);
      // Errori NON ignorati: su errore RLS/rete NON azzeriamo le liste (eviti di mostrare "0 clienti"
      // come fosse un dato reale) e segnaliamo l'errore al chiamante.
      if (clientiRes.error) throw clientiRes.error;
      if (incarichiRes.error) throw incarichiRes.error;

      const addOwnerLabel = (item: any) => ({
        ...item,
        ownerEmail: emailMap[item.user_id] || "Utente sconosciuto",
        isMine: item.user_id === user.id
      });

      setClienti((clientiRes.data ?? []).map(addOwnerLabel));
      setIncarichi((incarichiRes.data ?? []).map(addOwnerLabel));
      setError(null);
    } catch (e: any) {
      console.error('useAppData.loadData error:', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [activeStudioId]);

  return { clienti, incarichi, loading, error, loadData };
}

// Helper function per convertire date ISO in formato italiano
/*const formatISODateToItalian = (isoDate: string | null | undefined): string => {
  if (!isoDate) return 'N/D';
  try {
    const [year, month, day] = isoDate.split('-');
    if (!year || !month || !day) return 'N/D';
    return `${day}/${month}/${year}`;
  } catch {
    return 'N/D';
  }
};*/

// Validazione data formato gg/mm/aaaa
const isValidDate = (dateStr: string): boolean => {
  if (!dateStr) return true;
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = dateStr.match(regex);
  if (!match) return false;
  
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;
  
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
};

// Converti data da gg/mm/aaaa a yyyy-mm-dd per il DB
const formatDateForDB = (displayDate: string): string => {
  if (!displayDate || displayDate.trim() === '') return '';
  try {
    const cleaned = displayDate.trim().replace(/\s+/g, '');
    const parts = cleaned.split('/');
    if (parts.length !== 3) return '';
    const [day, month, year] = parts;
    if (isNaN(parseInt(day)) || isNaN(parseInt(month)) || isNaN(parseInt(year))) return '';
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  } catch {
    return '';
  }
};

// Formatta numero in formato italiano (es: 10000 -> "10.000,00")
const formatCurrency = (value: number | string): string => {
  if (!value && value !== 0) return '';
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '';
  return numValue.toLocaleString('it-IT', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

// Parsea stringa in formato italiano e restituisce numero (es: "10.000,00" -> 10000)
const parseCurrency = (value: string): number => {
  if (!value || value.trim() === '') return 0;
  // Rimuovi punti (separatore migliaia) e sostituisci virgola con punto
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export function RT2AdeguataVerifica({ onNavigate }: { onNavigate?: (tab: string) => void } = {}) {//| 'new-cliente'
  const [view, setView] = useState<'list' | 'new-incarico' | 'evaluate'| 'view-evaluations' | 'wizard' | 'view-cliente' | 'edit-incarico' | 'archived-lists'>('list');
  //const [clienti, setClienti] = useState<Cliente[]>([]);
  //const [incarichi, setIncarichi] = useState<Incarico[]>([]);
  // const {checkSystemAlerts} = useSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
  const toast = useToast();
  const confirm = useConfirm();

  const {clienti, incarichi, loading, loadData} = useAppData();
  const [valutazioni, setValutazioni] = useState<Valutazione[]>([]);
  const [incaricoCompleto, setIncaricoCompleto] = useState<IncaricoCompleto | null>(null);
  const [selectedCliente, setSelectedCliente] = useState('');
  const [selectedIncarico, setSelectedIncarico] = useState('');
  const [selectedIncaricoForView, setSelectedIncaricoForView] = useState('');
  const [clienteIdToEdit, setClienteIdToEdit] = useState<string | undefined>(undefined);
  const [previousView, setPreviousView] = useState('');
  const returnToFascicoloRef = useRef<string | null>(null);
  const creatingIncaricoRef = useRef(false);
  
  // Stati per il dettaglio cliente
  const [clienteCompleto, setClienteCompleto] = useState<Cliente | null>(null);
  const [titolariEffettivi, setTitolariEffettivi] = useState<TitolareEffettivo[]>([]);
  const [incarichiCliente, setIncarichiCliente] = useState<Incarico[]>([]);
  
  // Stato di caricamento per dettaglio incarico/cliente
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Stati per il pannello storico modifiche
  //const [showStoricoPanel, setShowStoricoPanel] = useState(false);
  /*const [storicoModifiche, setStoricoModifiche] = useState<StoricoModifica[]>([]);
  const [loadingStorico, setLoadingStorico] = useState(false);
  const [storicoCreationInfo, setStoricoCreationInfo] = useState<{ created_at: string; ownerEmail: string } | null>(null);
  */
  /*useEffect(() => {
    if (showStoricoPanel) {
      document.body.style.overflow = 'hidden'; // Blocca lo scroll
    } else {
      document.body.style.overflow = 'unset'; // Ripristina lo scroll
    }

    // Cleanup
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showStoricoPanel]);*/

  /*const handleOpenStorico = async (entityType: 'cliente' | 'incarico', entityId: string) => {
    setLoadingStorico(true);
    setShowStoricoPanel(true);
    const data = await loadStoricoModifiche(entityType, entityId);
    setStoricoModifiche(data);

    // Recupera info di creazione dall'entity
    const lista = entityType === 'cliente' ? clienti : incarichi;
    const entity = lista.find((e: any) => e.id === entityId);
    if (entity) {
      setStoricoCreationInfo({
        created_at: (entity as any).created_at || '',
        ownerEmail: (entity as any).ownerEmail || 'Utente sconosciuto',
      });
    } else {
      setStoricoCreationInfo(null);
    }

    setLoadingStorico(false);
  };*/

  // Stati per la ricerca/filtro
  const [searchClienteQuery, setSearchClienteQuery] = useState('');
  const [searchIncaricoQuery, setSearchIncaricoQuery] = useState('');

  // Ricerca e ordinamento archiviati (separati dalle liste principali)
  const [searchArchClienteQuery, setSearchArchClienteQuery] = useState('');
  const [searchArchIncaricoQuery, setSearchArchIncaricoQuery] = useState('');
  const [archClienteSort, setArchClienteSort] = useState(0);
  const [archIncaricoSort, setArchIncaricoSort] = useState(0);

  // Ordinamento liste
  type SortOption = { field: string; dir: 'asc' | 'desc'; label: string };
  const clienteSortOptions: SortOption[] = [
    { field: 'created_at', dir: 'desc', label: 'Più recenti' },
    { field: 'created_at', dir: 'asc', label: 'Meno recenti' },
    { field: 'ragione_sociale', dir: 'asc', label: 'Nome A→Z' },
    { field: 'ragione_sociale', dir: 'desc', label: 'Nome Z→A' },
    { field: 'codice_cliente', dir: 'asc', label: 'Codice A→Z' },
    { field: 'codice_cliente', dir: 'desc', label: 'Codice Z→A' },
  ];
  const incaricoSortOptions: SortOption[] = [
    { field: 'created_at', dir: 'desc', label: 'Più recenti' },
    { field: 'created_at', dir: 'asc', label: 'Meno recenti' },
    { field: 'codice_incarico', dir: 'asc', label: 'Codice A→Z' },
    { field: 'codice_incarico', dir: 'desc', label: 'Codice Z→A' },
    { field: 'data_inizio', dir: 'desc', label: 'Data inizio ↓' },
    { field: 'data_inizio', dir: 'asc', label: 'Data inizio ↑' },
  ];
  const [clienteSort, setClienteSort] = useState(0); // indice in clienteSortOptions
  const [incaricoSort, setIncaricoSort] = useState(0);
  
  // Stati per la ricerca cliente nel form nuovo incarico
  const [clienteSearchQuery, setClienteSearchQuery] = useState('');
  const [showClienteSuggestions, setShowClienteSuggestions] = useState(false);
  const [selectedClienteNome, setSelectedClienteNome] = useState('');
  const [nomeClienteRS, setNomeClienteRS] = useState('');
  
  // Stati per la ricerca incarico nella vista valutazione rischio
  //const [incaricoSearchQuery, setIncaricoSearchQuery] = useState('');
  //const [showIncaricoSuggestions, setShowIncaricoSuggestions] = useState(false);
  //const [selectedIncaricoNome, setSelectedIncaricoNome] = useState('');

  // Stati per eliminare clienti e incarichi
  //const [clienteId, setClienteId] = useState<string|undefined>('');
  //const { deleteCliente, isDeleting, deleteError } = useClienteDelete( clienteId );
  const incaricoToDelite = incarichi.find(i => i.id === selectedIncaricoForView);
  const { deleteIncarico, isDeletingI, deleteErrorI } = useIncaricoDelete(incaricoToDelite?.id);
  //const [eliminaCliente, setEliminaCliente] = useState(false);
  const [eliminaIncarico, setEliminaIncarico] = useState(false);
  const [eliminaValutazione, setEliminaValutazione] = useState<[boolean,string,string]>([false,'','']);
  useScrollLock(eliminaIncarico || eliminaValutazione[0]);

  // Stati per generazione PDF - commentato per future implementazioni
  // const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  // const [pdfGenerationType, setPdfGenerationType] = useState<DocumentType | null>(null);

  // Stati per generazione DOCX
  /*const [isGeneratingDOCX, setIsGeneratingDOCX] = useState(false);
  const [docxGenerationType, setDocxGenerationType] = useState<'av3' | 'av4' | null>(null);*/

  // Handler per generazione PDF - commentato per future implementazioni
  /*
  const handleGeneratePDF = async (documentType: DocumentType) => {
    if (!incaricoCompleto || !incaricoCompleto.cliente_id) {
      toast.warning('Dati incarico non completi');
      return;
    }

    setIsGeneratingPDF(true);
    setPdfGenerationType(documentType);

    try {
      await generateAndDownloadPDF({
        clienteId: incaricoCompleto.cliente_id,
        incaricoId: incaricoCompleto.id,
        documentType,
      });
    } catch (error: any) {
      console.error('Errore generazione PDF:', error);
      toast.error(`Errore durante la generazione del PDF: ${error.message}`);
    } finally {
      setIsGeneratingPDF(false);
      setPdfGenerationType(null);
    }
  };
  */

  // Handler per generazione DOCX
  /*const handleGenerateDOCX = async (type: 'av3' | 'av4') => {
    if (!incaricoCompleto?.cliente_id) {
      toast.warning('Dati incarico non completi');
      return;
    }

    setIsGeneratingDOCX(true);
    setDocxGenerationType(type);

    try {
      // Carica tutti i dati necessari
      const { data: clienteRaw2, error: clienteError } = await supabase
        .from('clienti')
        .select('*')
        .eq('id', incaricoCompleto.cliente_id)
        .single();

      if (clienteError) throw clienteError;
      const clienteData = await enrichClienteWithRappresentante(clienteRaw2);

      const titolariData = await loadTitolariWithPersona(incaricoCompleto.cliente_id);

      // Carica l'ultima valutazione per l'incarico (se esiste)
      const { data: valutazioneData } = await supabase
        .from('valutazioni_rischio')
        .select('*')
        .eq('incarico_id', incaricoCompleto.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: clienteDocs } = await supabase
        .from('documenti')
        .select('tipologia, nome_file')
        .eq('cliente_id', incaricoCompleto.cliente_id)
        .or(`incarico_id.is.null,incarico_id.eq.${incaricoCompleto.id}`);

      const pIds = await findPersoneIdByCliente(String(incaricoCompleto.cliente_id));
      let personaDocs: { tipologia: string; nome_file: string }[] = [];
      if (pIds.length > 0) {
        const { data: pDocs } = await supabase
          .from('documenti')
          .select('tipologia, nome_file')
          .in('persona_id', pIds)
          .or(`incarico_id.is.null,incarico_id.eq.${incaricoCompleto.id}`);
        personaDocs = pDocs || [];
      }
      const documentiData = [...(clienteDocs || []), ...personaDocs];

      // Prepara i dati nel formato richiesto
      const studioInfo = await getMyStudio();

      const amlData = {
        cliente: clienteData,
        titolari_effettivi: titolariData || [],
        incarico: {
          ...incaricoCompleto,
          scopo_natura: incaricoCompleto.scopo_natura ?? null,
          relazioni_cliente_te: incaricoCompleto.relazioni_cliente_te ?? null,
          provenienza_fondi: incaricoCompleto.provenienza_fondi ?? null,
          mezzi_pagamento: incaricoCompleto.mezzi_pagamento ?? null,
          importo_stimato: incaricoCompleto.importo_stimato ?? null
        },
        valutazione: valutazioneData || undefined,
        documenti: documentiData || undefined,
        nome_studio: studioInfo?.nome || undefined,
      };

      // Genera il documento DOCX appropriato
      if (type === 'av3') {
        await generateAndDownloadDOCX_AV3(amlData);
      } else {
        await generateAndDownloadDOCX_AV4(amlData);
      }

      // console.log(`✅ Documento ${type.toUpperCase()} DOCX generato con successo${valutazioneData ? ' (con valutazione)' : ''}`);
    } catch (error: any) {
      console.error('Errore generazione DOCX:', error);
      toast.error(`Errore durante la generazione del DOCX: ${error.message}`);
    } finally {
      setIsGeneratingDOCX(false);
      setDocxGenerationType(null);
    }
  };*/

  const [newIncarico, setNewIncarico] = useState({
    codice_incarico: '',
    tipologia_prestazione_id: '',
    descrizione: '',
    scopo_natura: '',
    data_inizio: '',
    importo_stimato: 0,
    relazioni_cliente_te: '',
    provenienza_fondi: '',
    mezzi_pagamento: '',
    conferma_fondi_leciti: true
  });

  const [editingIncaricoId, setEditingIncaricoId] = useState<string | null>(null);
  const [createdIncaricoId, setCreatedIncaricoId] = useState<string | null>(null);

  // Auto-generazione codice incarico
  const [formatoIncarico, setFormatoIncarico] = useState<FormatoCodice>('manuale');
  useEffect(() => {
    loadImpostazioni().then(imp => setFormatoIncarico(imp.formato_codice_incarico));
  }, []);

  // Navigazione da FascicoloCliente: apre direttamente il dettaglio incarico o la valutazione
  useEffect(() => {
    const pendingId = sessionStorage.getItem('rt2_pending_incarico');
    if (pendingId) {
      sessionStorage.removeItem('rt2_pending_incarico');
      handleViewEvaluations(pendingId);
    }
    const pendingEvalId = sessionStorage.getItem('rt2_pending_evaluate');
    const returnToFascicolo = sessionStorage.getItem('rt2_return_fascicolo');
    if (pendingEvalId) {
      sessionStorage.removeItem('rt2_pending_evaluate');
      if (returnToFascicolo) {
        sessionStorage.removeItem('rt2_return_fascicolo');
        returnToFascicoloRef.current = returnToFascicolo;
      }
      // Carica l'incarico e apri direttamente la vista valutazione
      (async () => {
        const { data } = await supabase
          .from('incarichi')
          .select('id, codice_incarico, descrizione, tipologia_prestazione_id')
          .eq('id', pendingEvalId)
          .single();
        if (data) {
          const prest = getPrestazione(data.tipologia_prestazione_id);
          if (prest) {
            setSelectedIncarico(data.id);
            //setSelectedIncaricoNome(`${data.codice_incarico} - ${data.descrizione || ''}`);
            setPreviousView('list');
            setView('evaluate');
          } else {
            toast.warning('È necessario indicare la tipologia di prestazione prima di continuare');
          }
        }
      })();
    }
  }, []);
  useEffect(() => {
    if (view === 'new-incarico' && formatoIncarico !== 'manuale') {
      (async () => {
        const cfPiva = clienteCompleto?.codice_fiscale || clienteCompleto?.partita_iva || '';
        const codice = await generateCodiceIncarico(formatoIncarico, nomeClienteRS || '', undefined, selectedCliente || undefined, cfPiva);
        if (codice) setNewIncarico(prev => ({ ...prev, codice_incarico: codice }));
      })();
    }
  }, [view, formatoIncarico, selectedCliente, clienteCompleto]);
  
  // Stato locale per la visualizzazione formattata dell'importo
  const [importoFormattato, setImportoFormattato] = useState('');

  //const [tabellaA, setTabellaA] = useState<RT2TabellaA>(createDefaultTabellaA());
  //const [tabellaB, setTabellaB] = useState<RT2TabellaB>(createDefaultTabellaB());

  // Stato per verificare titolari effettivi dalla tabella DB
  //const [hasTitolariEffettiviDB, setHasTitolariEffettiviDB] = useState<boolean | null>(null);

  // Stato per rischio contante (per suggerimento A.4)
  //const [rischioContanteData, setRischioContanteData] = useState<{ provincia: string; indice_rischiosita: number } | null>(null);

  // Stato per rischio paese estero (per suggerimento A.4)
  /*const [rischioPaeseEstero, setRischioPaeseEstero] = useState<{
    nome_it: string;
    rischio_calcolato: number;
    rischio_label: string;
    fatf_status: string | null;
    eu_alto_rischio: boolean;
    basel_aml_score: number | null;
    cpi_score: number | null;
  } | null>(null);*/

  useEffect(() => {
    loadData();
  }, []);

  // Controlla se esistono titolari effettivi nel DB per il cliente dell'incarico selezionato
  /*useEffect(() => {
    async function checkTitolariEffettivi() {
      if (!selectedIncarico) {
        setHasTitolariEffettiviDB(null);
        return;
      }
      const incarico = incarichi.find(i => i.id === selectedIncarico);
      if (!incarico?.cliente_id) {
        setHasTitolariEffettiviDB(null);
        return;
      }
      const cliente = clienti.find(c => c.id === incarico.cliente_id);
      // Per persona fisica il titolare effettivo è il cliente stesso
      if (cliente?.tipo_cliente === 'persona_fisica') {
        setHasTitolariEffettiviDB(true);
        return;
      }
      const { count, error } = await supabase
        .from('titolari_effettivi')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', incarico.cliente_id);
      if (error) {
        console.error('Errore check titolari effettivi:', error);
        setHasTitolariEffettiviDB(null);
        return;
      }
      setHasTitolariEffettiviDB((count ?? 0) > 0);
    }
    checkTitolariEffettivi();
  }, [selectedIncarico, incarichi, clienti]);*/

  // Carica rischio contante per la provincia del cliente selezionato (per suggerimento A.4)
  // oppure rischio paese estero se la residenza è estera
  /*useEffect(() => {
    async function fetchRischioGeografico() {
      if (!selectedIncarico) {
        setRischioContanteData(null);
        setRischioPaeseEstero(null);
        return;
      }
      const incarico = incarichi.find(i => i.id === selectedIncarico);
      if (!incarico?.cliente_id) {
        setRischioContanteData(null);
        setRischioPaeseEstero(null);
        return;
      }
      const cliente = clienti.find(c => c.id === incarico.cliente_id);
      if (!cliente) {
        // console.log('[A.4 Debug] Cliente non trovato per id:', incarico.cliente_id);
        setRischioContanteData(null);
        setRischioPaeseEstero(null);
        return;
      }
      // console.log('[A.4 Debug] Cliente trovato:', {
      //   ragione_sociale: cliente.ragione_sociale,
      //   tipo_cliente: cliente.tipo_cliente,
      //   provincia_residenza: cliente.provincia_residenza,
      //   comune_residenza: cliente.comune_residenza,
      //   indirizzo: cliente.indirizzo,
      //   residenza: cliente.residenza,
      //   paese: cliente.paese,
      // });

      // Rileva il paese estero da più fonti:
      // 1. Campo "residenza" con formato "Paese | Indirizzo" (persona_fisica, professionista)
      // 2. Campo "indirizzo" con formato "Paese | Indirizzo" (imprese con sede estera)
      // 3. Campo "paese" (imprese, es. "Albanese" o "Albania")
      let paeseEsteroRilevato = '';

      const residenzaCliente = (cliente.residenza || '').trim();
      const indirizzoCliente = (cliente.indirizzo || '').trim();
      const paeseField = (cliente.paese || '').trim();

      if (residenzaCliente.includes(' | ')) {
        paeseEsteroRilevato = residenzaCliente.split(' | ')[0].trim();
      } else if (indirizzoCliente.includes(' | ')) {
        paeseEsteroRilevato = indirizzoCliente.split(' | ')[0].trim();
      } else if (paeseField) {
        const paeseUp = paeseField.toUpperCase();
        if (paeseUp !== 'ITALIA' && paeseUp !== 'IT' && paeseUp !== 'ITALIANA') {
          paeseEsteroRilevato = paeseField;
        }
      }

      // console.log('[A.4 Debug] Paese estero rilevato:', paeseEsteroRilevato || '(nessuno)');

      if (paeseEsteroRilevato) {
        const paeseUp = paeseEsteroRilevato.toUpperCase();
        // Cerca il paese nel file rischio_paesi.json
        const paeseTrovato = rischioPaesiData.paesi.find((p: any) => {
          const nomeIt = p.nome_it.toUpperCase();
          const nomeEn = p.nome_en.toUpperCase();
          return nomeIt === paeseUp || nomeEn === paeseUp
            || paeseUp.includes(nomeIt) || nomeIt.includes(paeseUp)
            || paeseUp.includes(nomeEn) || nomeEn.includes(paeseUp);
        });

        if (paeseTrovato) {
          // console.log('[A.4 Debug] Paese estero trovato:', paeseTrovato.nome_it, '-> rischio:', paeseTrovato.rischio_calcolato);
          setRischioPaeseEstero({
            nome_it: paeseTrovato.nome_it,
            rischio_calcolato: paeseTrovato.rischio_calcolato,
            rischio_label: paeseTrovato.rischio_label,
            fatf_status: paeseTrovato.fatf_status,
            eu_alto_rischio: paeseTrovato.eu_alto_rischio,
            basel_aml_score: paeseTrovato.basel_aml_score,
            cpi_score: paeseTrovato.cpi_score,
          });
        } else {
          setRischioPaeseEstero(null);
        }
        setRischioContanteData(null);
        return;
      }

      // Residenza italiana: cerca rischio contante per provincia
      setRischioPaeseEstero(null);

      // Tenta di recuperare la provincia: prima da provincia_residenza, poi dalla sigla nell'indirizzo, poi dalla città
      let provincia = cliente.provincia_residenza;
      const indirizzoCompleto = cliente.indirizzo || cliente.residenza || '';

      if (!provincia) {
        // Cerca sigla provincia tra parentesi es. "... ACIREALE (CT)"
        const match = indirizzoCompleto.match(/\(([A-Z]{2})\)/);
        if (match) {
          const sigla = match[1];
          provincia = getNomeBySigla(sigla);
          // console.log('[A.4 Debug] Sigla trovata in indirizzo:', sigla, '-> provincia:', provincia);
        }
      }

      if (!provincia) {
        // Fallback: estrai la città dall'indirizzo e cerca la provincia nel JSON province_citta
        // Pattern: "... CAP CITTA" (es. "95025 ACI SANT'ANTONIO")
        const capCittaMatch = indirizzoCompleto.match(/(\d{5})\s+(.+?)$/);
        if (capCittaMatch) {
          const citta = capCittaMatch[2].trim();
          const sigla = getSiglaByCity(citta);
          if (sigla) {
            provincia = getNomeBySigla(sigla);
            // console.log('[A.4 Debug] Provincia ricavata dalla città:', citta, '-> sigla:', sigla, '-> provincia:', provincia);
          }
        }
      }

      // console.log('[A.4 Debug] Provincia finale:', provincia);
      if (!provincia) {
        // console.log('[A.4 Debug] Provincia non determinabile, uscita anticipata');
        setRischioContanteData(null);
        return;
      }
      const { data, error } = await supabase
        .from('rischio_contante')
        .select('provincia, indice_rischiosita')
        .ilike('provincia', provincia)
        .maybeSingle();
      if (error) {
        console.error('[A.4 Debug] Errore query rischio_contante:', error);
        setRischioContanteData(null);
        return;
      }
      // console.log('[A.4 Debug] Risultato query rischio_contante:', data);
      setRischioContanteData(data);
    }
    fetchRischioGeografico();
  }, [selectedIncarico, incarichi, clienti]);*/





  // Funzioni di filtro (escludi archiviati dalle liste principali)
  const filteredClienti = clienti.filter(cliente => {
    if (cliente.archiviato) return false;
    const query = searchClienteQuery.toLowerCase();
    return (
      cliente.ragione_sociale.toLowerCase().includes(query) ||
      cliente.codice_cliente.toLowerCase().includes(query)
    );
  }).sort((a: any, b: any) => {
    const opt = clienteSortOptions[clienteSort];
    const va = (a[opt.field] ?? '') as string;
    const vb = (b[opt.field] ?? '') as string;
    const cmp = va.localeCompare(vb, 'it', { numeric: true });
    return opt.dir === 'asc' ? cmp : -cmp;
  });

  // Filtro clienti per il form nuovo incarico (escludi archiviati)
  const filteredClientiForIncarico = clienti.filter(cliente => {
    if (cliente.archiviato) return false;
    const query = clienteSearchQuery.toLowerCase();
    return (
      cliente.ragione_sociale.toLowerCase().includes(query) ||
      cliente.codice_cliente.toLowerCase().includes(query)
    );
  });

  // Clienti e incarichi archiviati (con ricerca e ordinamento dedicati)
  const archivedClienti = clienti.filter(c => c.archiviato &&
    (c.ragione_sociale.toLowerCase().includes(searchArchClienteQuery.toLowerCase()) ||
     c.codice_cliente.toLowerCase().includes(searchArchClienteQuery.toLowerCase()))
  ).sort((a: any, b: any) => {
    const opt = clienteSortOptions[archClienteSort];
    const va = (a[opt.field] ?? '') as string;
    const vb = (b[opt.field] ?? '') as string;
    const cmp = va.localeCompare(vb, 'it', { numeric: true });
    return opt.dir === 'asc' ? cmp : -cmp;
  });

  const archivedIncarichi = incarichi.filter(i => i.archiviato &&
    (i.codice_incarico.toLowerCase().includes(searchArchIncaricoQuery.toLowerCase()) ||
     i.descrizione.toLowerCase().includes(searchArchIncaricoQuery.toLowerCase()))
  ).sort((a: any, b: any) => {
    const opt = incaricoSortOptions[archIncaricoSort];
    const va = (a[opt.field] ?? '') as string;
    const vb = (b[opt.field] ?? '') as string;
    const cmp = va.localeCompare(vb, 'it', { numeric: true });
    return opt.dir === 'asc' ? cmp : -cmp;
  });

  const totalArchivedClienti = clienti.filter(c => c.archiviato).length;
  const totalArchivedIncarichi = incarichi.filter(i => i.archiviato).length;
  
  // Filtro incarichi per la vista valutazione rischio
  /*const filteredIncarichiForEvaluate = incarichi.filter(incarico => {
    const query = incaricoSearchQuery.toLowerCase();
    const prest = getPrestazione(incarico.tipologia_prestazione_id);
    return (
      incarico.codice_incarico.toLowerCase().includes(query) ||
      incarico.descrizione.toLowerCase().includes(query) ||
      (prest?.label || '').toLowerCase().includes(query)
    );
  });*/

  const filteredIncarichi = incarichi.filter(incarico => {
    if (incarico.archiviato) return false;
    const query = searchIncaricoQuery.toLowerCase();
    const prest = getPrestazione(incarico.tipologia_prestazione_id);
    return (
      incarico.codice_incarico.toLowerCase().includes(query) ||
      incarico.descrizione.toLowerCase().includes(query) ||
      (prest?.label || '').toLowerCase().includes(query)
    );
  }).sort((a: any, b: any) => {
    const opt = incaricoSortOptions[incaricoSort];
    const va = (a[opt.field] ?? '') as string;
    const vb = (b[opt.field] ?? '') as string;
    const cmp = va.localeCompare(vb, 'it', { numeric: true });
    return opt.dir === 'asc' ? cmp : -cmp;
  });

  // Funzione per visualizzare il dettaglio del cliente
  async function handleViewClienteDetail(clienteId: string) {
    setLoadingDetail(true);
    try {
      // Carica i dati completi del cliente
      const { data: clienteRaw, error: clienteError } = await supabase
        .from('clienti')
        .select('*')
        .eq('id', clienteId)
        .single();

      if (clienteError) throw clienteError;
      // Arricchisci con dati rappresentante legale da anagrafica_soggetti
      const clienteData = await enrichClienteWithRappresentante(clienteRaw);
      setClienteCompleto(clienteData);

      // Carica i titolari effettivi con dati persona da anagrafica_soggetti
      const titolariData = await loadTitolariWithPersona(clienteId);
      setTitolariEffettivi(titolariData);

      // Carica gli incarichi associati al cliente
      const { data: incarichiData, error: incarichiError } = await supabase
        .from('incarichi')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('data_inizio', { ascending: false });

      if (incarichiError) throw incarichiError;
      setIncarichiCliente(incarichiData || []);

      setView('view-cliente');
    } catch (error) {
      console.error('Errore nel caricamento dei dettagli cliente:', error);
      toast.error('Errore nel caricamento dei dettagli del cliente');
    } finally {
      setLoadingDetail(false);
    }
  }


  const handleUpdateIncarico = async () => {
  if (!editingIncaricoId) return;

  try {
    // [DEPRECATED 2026-05-07] Diff e scrittura storico ora a carico del trigger
    // log_storico_clienti_incarichi sull'UPDATE di incarichi.
    // Vedi migrazione 20260508000000_audit_storico_db_triggers.sql.
    /*
    if (incaricoCompleto) {
      const campiDaConfrontare: { key: string; vecchio: any; nuovo: any }[] = [
        { key: 'codice_incarico', vecchio: incaricoCompleto.codice_incarico, nuovo: newIncarico.codice_incarico },
        { key: 'tipologia_prestazione_id', vecchio: incaricoCompleto.tipologia_prestazione_id, nuovo: newIncarico.tipologia_prestazione_id },
        { key: 'descrizione', vecchio: incaricoCompleto.descrizione, nuovo: newIncarico.descrizione },
        { key: 'scopo_natura', vecchio: incaricoCompleto.scopo_natura || '', nuovo: newIncarico.scopo_natura },
        { key: 'data_inizio', vecchio: incaricoCompleto.data_inizio || '', nuovo: newIncarico.data_inizio.includes('/') ? formatDateForDB(newIncarico.data_inizio) : newIncarico.data_inizio },
        { key: 'importo_stimato', vecchio: String(incaricoCompleto.importo_stimato || 0), nuovo: String(newIncarico.importo_stimato || 0) },
        { key: 'relazioni_cliente_te', vecchio: incaricoCompleto.relazioni_cliente_te || '', nuovo: newIncarico.relazioni_cliente_te },
        { key: 'provenienza_fondi', vecchio: incaricoCompleto.provenienza_fondi || '', nuovo: newIncarico.provenienza_fondi },
        { key: 'mezzi_pagamento', vecchio: incaricoCompleto.mezzi_pagamento || '', nuovo: newIncarico.mezzi_pagamento },
        { key: 'conferma_fondi_leciti', vecchio: String(incaricoCompleto.conferma_fondi_leciti), nuovo: String(newIncarico.conferma_fondi_leciti) },
        { key: 'cliente_id', vecchio: incaricoCompleto.cliente_id || '', nuovo: selectedCliente },
      ];

      const modifiche = campiDaConfrontare
        .filter(c => String(c.vecchio || '') !== String(c.nuovo || ''))
        .map(c => ({ campo: c.key, vecchio: String(c.vecchio || ''), nuovo: String(c.nuovo || '') }));

      await saveStoricoModifiche('incarico', editingIncaricoId, modifiche);
    }
    */

    const { error } = await supabase
      .from('incarichi')
      .update({
        codice_incarico: newIncarico.codice_incarico,
        data_inizio: newIncarico.data_inizio.includes('/') ? formatDateForDB(newIncarico.data_inizio) : newIncarico.data_inizio,
        tipologia_prestazione_id: newIncarico.tipologia_prestazione_id,
        descrizione: newIncarico.descrizione,
        scopo_natura: newIncarico.scopo_natura,
        importo_stimato: newIncarico.importo_stimato,
        relazioni_cliente_te: newIncarico.relazioni_cliente_te,
        provenienza_fondi: newIncarico.provenienza_fondi,
        mezzi_pagamento: newIncarico.mezzi_pagamento,
        conferma_fondi_leciti: newIncarico.conferma_fondi_leciti,
        cliente_id: selectedCliente,
      })
      .eq('id', editingIncaricoId);

    if (error) throw error;

    addUserLog(`Modificato incarico ${newIncarico.codice_incarico} per cliente ${selectedClienteNome}.`);
    // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB

    // Refresh dati incarico
    const { data, error : errorRef } = await supabase
      .from('incarichi')
      .select(`
        *,
        cliente:clienti (
          id,
          ragione_sociale,
          codice_cliente
        )
      `)
      .eq('id', editingIncaricoId)
      .single();

    if (errorRef) throw errorRef;
    
    setIncaricoCompleto(data);
    // AGGIORNA LA LISTA PRINCIPALE
    /*setIncarichi(prevIncarichi => 
      prevIncarichi.map(i => (i.id === editingIncaricoId ? data : i))
    );*/
    loadData();

    setTimeout(() => {
      setEditingIncaricoId(null);
      setView('view-evaluations');
    }, 50);
  } catch (err) {
    console.error('Errore aggiornamento incarico:', err);
    toast.error("Errore durante l'aggiornamento dell'incarico");
  }
};

  async function handleCreateIncarico() {
    if (creatingIncaricoRef.current) return; // guard doppio submit → niente incarichi duplicati
    if (!selectedCliente || !newIncarico.codice_incarico || !newIncarico.tipologia_prestazione_id || !newIncarico.data_inizio) {
      toast.warning('Compilare i campi obbligatori');
      return;
    }

    // Valida e converti la data
    if (!isValidDate(newIncarico.data_inizio)) {
      toast.warning('Formato data non valido. Utilizzare il formato gg/mm/aaaa');
      return;
    }

    const dataInizioISO = formatDateForDB(newIncarico.data_inizio);
    if (!dataInizioISO) {
      toast.error('Errore nella conversione della data');
      return;
    }

    creatingIncaricoRef.current = true;
    try {
      const { data, error } = await supabase.from('incarichi').insert({
        cliente_id: selectedCliente,
        ...newIncarico,
        data_inizio: dataInizioISO
      }).select('id').single();

      if (error || !data) {
        toast.error('Errore nella creazione dell\'incarico');
        return;
      }

      addUserLog(`Incarico ${newIncarico.codice_incarico} creato per cliente ${selectedClienteNome}.`);
      // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB

      // Resta nella schermata senza ricaricare - attiva la sezione documenti
      setCreatedIncaricoId(data.id);
    } finally {
      creatingIncaricoRef.current = false;
    }
  }

  function handleFinishIncarico() {
    setCreatedIncaricoId(null);
    setSelectedCliente('');
    setImportoFormattato('');
    setNewIncarico({
      codice_incarico: '',
      tipologia_prestazione_id: '',
      descrizione: '',
      scopo_natura: '',
      data_inizio: '',
      importo_stimato: 0,
      relazioni_cliente_te: '',
      provenienza_fondi: '',
      mezzi_pagamento: '',
      conferma_fondi_leciti: true
    });
    // Ricarica i dati solo quando l'utente esce
    loadData();
    setView('list');
  }
  
  function navigateBackFromEvaluate() {
    if (returnToFascicoloRef.current && onNavigate) {
      const incaricoId = returnToFascicoloRef.current;
      returnToFascicoloRef.current = null;
      sessionStorage.setItem('alert_navigate_fascicolo', JSON.stringify({
        clienteId: incaricoCompleto?.cliente?.id || '',
        tab: 'incarichi',
        incaricoId,
      }));
      onNavigate('fascicolo');
      return true;
    }
    return false;
  }

  const deleteSpecificValutazione = async (valutazioneId: string, userId: string) => {
  // Validazione input
  if (!valutazioneId || !userId) {
    console.error("Errore: valutazioneId o userId mancanti.");
    return false;
  }

  try {
    // Eliminazione con doppia condizione di sicurezza
    /*const { error, count } = await supabase
      .from('valutazioni_rischio')
      .delete()
      .eq('id', valutazioneId)
      .eq('user_id', userId);

    if (error) {
      console.error('Errore durante l\'eliminazione:', error.message);
      return false;
    }*/
    
    const valutazione = valutazioni.find(i => i.id === valutazioneId);

    // console.log(`Valutazione ${valutazioneId} eliminata correttamente con count: ${count}.`);
    addUserLog(`Eliminata valutazione del ${valutazione?.data_valutazione} nell\'incarico ${incaricoCompleto?.codice_incarico}, cliente: ${incaricoCompleto?.cliente?.ragione_sociale}.`)
    // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
    setEliminaValutazione([false,'','']);
    return true;

  } catch (err: any) {
    console.error('Errore critico durante l\'eliminazione:', err.message);
    return false;
  }
};

  /*async function handleSaveValutazione() {
    if (!selectedIncarico) {
      toast.warning('Selezionare un incarico');
      return;
    }

    const incarico = incarichi.find(i => i.id === selectedIncarico);
    if (!incarico) return;

    const prestazione = getPrestazione(incarico.tipologia_prestazione_id);
    // console.log(prestazione)
    if (prestazione) {

      // Verifica PEP del cliente
      const cliente = clienti.find(c => c.id === incarico.cliente_id);
      const isPep = cliente?.pep === true;

      const scores = calculateRT2Scores(
        incarico.tipologia_prestazione_id,
        tabellaA,
        prestazione.onlyTabA ? undefined : tabellaB,
        isPep
      );

      const classeRischio = scores.rischioEffettivo >= 3.6 ? 4 :
                            scores.rischioEffettivo >= 2.6 ? 3 :
                            scores.rischioEffettivo >= 1.6 ? 2 : 1;

      const rt2 = amlData.regole_tecniche.find(rt => rt.id === 'RT2');
      const misura = rt2?.misure_per_classe?.find(m => m.grade === classeRischio);

      // Calcola prossimo_controllo in base alla classe di rischio
      const periodicitaMesi = classeRischio >= 4 ? 6 : classeRischio >= 3 ? 12 : classeRischio >= 2 ? 24 : 36;
      const prossimoControllo = new Date();
      prossimoControllo.setMonth(prossimoControllo.getMonth() + periodicitaMesi);
      const prossimoControlloStr = prossimoControllo.toISOString().split('T')[0];

      const { error } = await supabase.from('valutazioni_rischio').insert({
        incarico_id: selectedIncarico,
        rischio_inerente_prestazione: scores.inerentePrestazione,
        tabella_a_scores: tabellaA,
        tabella_b_scores: prestazione.onlyTabA ? null : tabellaB,
        rischio_specifico: scores.rischioSpecifico,
        rischio_effettivo: scores.rischioEffettivo,
        classe_rischio: classeRischio,
        misure_applicate: misura?.label || '',
        prossimo_controllo: prossimoControlloStr,
      });

      if (error) {
        toast.error('Errore nel salvataggio della valutazione');
        return;
      }

      addUserLog(`Aggiunta valutazione del rischio all\'incarico  ${incaricoCompleto?.codice_incarico}, cliente: ${incaricoCompleto?.cliente?.ragione_sociale}.`);
      // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
      setSelectedIncarico('');
      setSelectedIncaricoNome('');
      setIncaricoSearchQuery('');
      setShowIncaricoSuggestions(false);
      setTabellaA(createDefaultTabellaA());
      setTabellaB(createDefaultTabellaB());
      toast.success('Valutazione salvata con successo');
      if (!navigateBackFromEvaluate()) {
        previousView == 'view-evaluations' ? [setView('view-evaluations'), handleViewEvaluations(selectedIncarico)] : setView('list');
      }
    } else { 
      toast.warning('Inserisci la tipologia di prestazione prima di continuare');
      return;
    };
  }*/

  async function loadValutazioni(incaricoId: string) {
    const { data, error } = await supabase
      .from('valutazioni_rischio')
      .select('*')
      .eq('incarico_id', incaricoId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Errore nel caricamento delle valutazioni:', error);
      return;
    }

    if (data) {
      setValutazioni(data);
    }
  }

  async function handleViewEvaluations(incaricoId: string) {
    setSelectedIncaricoForView(incaricoId);
    setLoadingDetail(true);

    try {
      // Carica i dati completi dell'incarico con il cliente
      const { data: incaricoData, error } = await supabase
        .from('incarichi')
        .select(`
          id,
          codice_incarico,
          tipologia_prestazione_id,
          descrizione,
          scopo_natura,
          data_inizio,
          data_fine,
          importo_stimato,
          cliente_id,
          relazioni_cliente_te,
          provenienza_fondi,
          mezzi_pagamento,
          status,
          created_at,
          updated_at,
          conferma_fondi_leciti,
          cliente:clienti(*)
        `)
        .eq('id', incaricoId)
        .single();

      if (error) {
        console.error('Errore nel caricamento dell\'incarico:', error);
      } else if (incaricoData) {
        setIncaricoCompleto({
          ...incaricoData,
          cliente: Array.isArray(incaricoData.cliente)
            ? incaricoData.cliente[0] || null
            : incaricoData.cliente
        });
      }

      await loadValutazioni(incaricoId);
      setView('view-evaluations');
    } finally {
      setLoadingDetail(false);
    }
  }

  const toggleArchiviaCliente = async (cliente: Cliente | null, currentStatus: boolean) => {
    const confirmMsg = currentStatus
      ? "Vuoi ripristinare questo cliente?"
      : "Vuoi archiviare questo cliente? Gli incarichi associati verranno archiviati.";

    if (!(await confirm({ message: confirmMsg, variant: 'warning' }))) return;

    try {
      const { error } = await supabase
        .from('clienti')
        .update({ archiviato: !currentStatus })
        .eq('id', cliente?.id);

      if (error) throw error;

      const { error: incarichiError } = await supabase
        .from('incarichi')
        .update({ archiviato: !currentStatus })
        .eq('cliente_id', cliente?.id);

      if (incarichiError) throw incarichiError;

      addUserLog(`${currentStatus ? 'Ripristinato' : 'Archiviato'} cliente: ${cliente?.ragione_sociale} (${cliente?.codice_cliente})`);
      // [DEPRECATED 2026-05-07] Archiviazione tracciata dal trigger
      // log_storico_clienti_incarichi (migrazione 20260508000000).
      // if (cliente?.id) {
      //   await saveStoricoModifiche('cliente', cliente.id, [{
      //     campo: 'archiviato',
      //     vecchio: currentStatus ? 'true' : 'false',
      //     nuovo: currentStatus ? 'false' : 'true',
      //   }]);
      // }
      await loadData();
      // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
      setView('list');
    } catch (err) {
      console.error("Errore durante l'operazione:", err);
      toast.error("Si è verificato un errore durante l'aggiornamento.");
    }
  };

  const toggleArchiviaIncarico = async (incarico: Incarico | null, currentStatus: boolean) => {
    const confirmMsg = currentStatus
      ? "Vuoi ripristinare questo incarico?"
      : "Vuoi archiviare questo incarico?";

    if (!(await confirm({ message: confirmMsg, variant: 'warning' }))) return;

    try {
      if (currentStatus) {
        const { data: clienteCorrelato, error: clienteErr } = await supabase
          .from('clienti')
          .select('archiviato, ragione_sociale, codice_cliente')
          .eq('id', incarico?.cliente_id)
          .single();

        if (clienteErr) throw clienteErr;
        if (clienteCorrelato?.archiviato) {
          toast.warning(
            `Impossibile ripristinare l'incarico: il cliente "${clienteCorrelato.ragione_sociale} (${clienteCorrelato.codice_cliente})" è attualmente archiviato.\n\nRipristina il cliente per ripristinare anche tutti gli incarichi associati.`
          );
          return;
        }
      }

      const { error } = await supabase
        .from('incarichi')
        .update({ archiviato: !currentStatus })
        .eq('id', incarico?.id);

      if (error) throw error;

      const clienteIncarico = clienti.find(c => c.id === incarico?.cliente_id);
      addUserLog(`${currentStatus ? 'Ripristinato' : 'Archiviato'} incarico: ${incarico?.codice_incarico} — cliente: ${clienteIncarico?.ragione_sociale || 'N/A'} (${clienteIncarico?.codice_cliente || 'N/A'})`);
      // [DEPRECATED 2026-05-07] Archiviazione tracciata dal trigger
      // log_storico_clienti_incarichi (migrazione 20260508000000).
      // if (incarico?.id) {
      //   await saveStoricoModifiche('incarico', incarico.id, [{
      //     campo: 'archiviato',
      //     vecchio: currentStatus ? 'true' : 'false',
      //     nuovo: currentStatus ? 'false' : 'true',
      //   }]);
      // }
      await loadData();
      // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
      setView('list');
    } catch (err) {
      console.error("Errore durante l'operazione:", err);
      toast.error("Si è verificato un errore durante l'aggiornamento.");
    }
};
 
  if(loading || loadingDetail) return <Spinner/>;

  // RENDER VISTA DETTAGLIO CLIENTE
  if (view === 'view-cliente') {
    return (
      <>
        {clienteCompleto && (
          <ClienteDettaglioView
            cliente={clienteCompleto as any}
            titolariEffettivi={titolariEffettivi}
            incarichiCliente={incarichiCliente}
            showHeader={true}
            onBack={() => setView('list')}
            onModifica={() => {
              setClienteIdToEdit(clienteCompleto.id);
              setView('wizard');
            }}
            onViewIncarico={(id) => handleViewEvaluations(id)}
            onNuovoIncarico={() => {
              setSelectedCliente(clienteCompleto.id ?? '');
              setNomeClienteRS(clienteCompleto.ragione_sociale);
              setSelectedClienteNome(
                `${clienteCompleto.ragione_sociale} (${clienteCompleto.codice_cliente})`
              );
              setView('new-incarico');
            }}
            creationInfo={clienteCompleto.ownerEmail ? {
              created_at: (clienteCompleto as any).created_at || '',
              ownerEmail: clienteCompleto.ownerEmail || 'Utente sconosciuto',
            } : null}
          />
        )}

        {/*eliminaCliente && clienteCompleto && (
          <div className="fixed inset-0 z-50 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 transition-opacity duration-300">
            <div 
              className="bg-white rounded-xl shadow-2xl max-w-lg w-full transform transition-all duration-300 scale-100 opacity-100"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
            >
              <div className="p-6 sm:p-8">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-red-100 p-3 rounded-full">
                    <Trash2 className="h-6 w-6 text-red-600" aria-hidden="true" />
                  </div>
                  <div className="ml-4 text-left">
                    <h3 
                      className="text-lg leading-6 font-bold text-gray-900" 
                      id="modal-title"
                    >
                      Conferma Eliminazione Cliente
                    </h3>
                  </div>
                </div>
                <div className="mt-4">
                  <h2 className="text-sm text-gray-500">
                    Sei sicuro di voler eliminare il cliente: 
                    <span className="font-semibold text-gray-900 ml-1">
                      {clienteCompleto?.ragione_sociale} ({clienteCompleto?.codice_cliente})
                    </span> ?
                  </h2>
                  <p className="mt-2 text-sm font-medium text-red-600">
                    <strong>Attenzione</strong> : Questa operazione è <strong>irreversibile</strong>.<br/> Tutti i dati associati, inclusi i dettagli, i titolari effettivi e gli incarichi, verranno persi.
                  </p>
                </div>
              </div>
              {deleteError && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                  <p className="text-sm text-red-800">{deleteError}</p>
                </div>
              )}
              <div className="px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse sm:gap-3 rounded-b-xl">
                <button
                  type="button"
                  onClick={
                    async()=>{
                      await deleteCliente(()=>{setEliminaCliente(false); setView('list')}); 
                      addUserLog(`Eliminato il cliente ${clienteCompleto?.ragione_sociale} (${clienteCompleto?.codice_cliente}).`);
                      // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
                      loadData()
                    }
                  }
                  disabled={isDeleting}
                  className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm transition-colors"
                >
                  {isDeleting ? 'Eliminazione...' : 'Sì, Elimina Definitivamente'}
                </button>
                <button
                  type="button"
                  onClick={()=>setEliminaCliente(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm transition-colors"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        )*/}
      </>
    );
  }

  if (view === 'wizard') {
    return (
      <ClienteWizard 
        onComplete={() => {
          loadData();
          setClienteIdToEdit(undefined);
          setView('list');
        }}
        onCancel={() => {
          setClienteIdToEdit(undefined);
          setView('list');
        }}
        clienteId={clienteIdToEdit}
      />
    );
  }

  interface PrestazioniSelectProps {
    value: string;
    onChange: (newValue: string | null) => void;
  }

  function PrestazioniSelect({ value, onChange }: PrestazioniSelectProps) {
  
    const prestazioniOrdinate = [...amlData.prestazioni_catalog].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    const [query, setQuery] = useState("");

    const filtered =
      query === ""
        ? prestazioniOrdinate
        : prestazioniOrdinate.filter(p =>
          p.label.toLowerCase().includes(query.toLowerCase())
        );

    return (
      <Combobox value={value} onChange={onChange}>
        <div className="relative">
        
          <Combobox.Button as="div" className="relative w-full cursor-pointer">
            <Combobox.Input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
              displayValue={(id) => {
                const found = prestazioniOrdinate.find(p => p.id === id);
                return found ? `${found.label} (Rischio: ${found.inherentRisk})` : "";
              }}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Seleziona prestazione..."
            />
            <span className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
              <ChevronDown className="w-4 h-4 text-black" strokeWidth={3}/>
            </span>
          </Combobox.Button>

          {filtered.length > 0 && (
            <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto 
                                         rounded-lg bg-white py-1 shadow-lg border border-gray-200">
              {filtered.map((prest, index) => (
                <Fragment key={prest.id}>
                  <Combobox.Option
                    value={prest.id}
                    className={({ active }) => `cursor-pointer select-none px-4 py-2 ${active ? "bg-blue-100" : ""}`}
                  >
                    {({ selected }) => (
                      <div className="flex items-center justify-between">
                        <span>{prest.label} (Rischio: {prest.inherentRisk})</span>
                        {selected && (
                          <Check className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                    )}
                  </Combobox.Option>

                  {/* Divider tra le opzioni (non dopo l'ultima) */}
                  {index < filtered.length - 1 && (
                    <div className="border-t border-gray-200 mx-2" />
                  )}
                </Fragment>
              ))}
            </Combobox.Options>
          )}
        </div>
      </Combobox>
    );
  }

  if (view === 'new-incarico' || view === 'edit-incarico') {
    const incaricoSalvato = !!(createdIncaricoId || (view === 'edit-incarico' && editingIncaricoId));
    const currentIncaricoId = createdIncaricoId || editingIncaricoId;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            {createdIncaricoId ? 'Incarico Salvato' : view === 'edit-incarico' ? 'Modifica Incarico' : 'Nuovo Incarico'}
          </h1>
          <button
            onClick={() => {
              if (createdIncaricoId) {
                handleFinishIncarico();
              } else {
                setView(view === 'edit-incarico' ? 'view-evaluations':'list');
                setSelectedCliente('');
                setNomeClienteRS('');
                setSelectedClienteNome('');
                setClienteSearchQuery('');
                setShowClienteSuggestions(false);
                setImportoFormattato('');
              }
            }}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {createdIncaricoId ? 'Torna alla Lista' : view === 'edit-incarico' ? 'Indietro' : 'Annulla'}
          </button>
        </div>

        {createdIncaricoId && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-900">Incarico creato con successo</p>
              <p className="text-xs text-green-700 mt-0.5">
                Puoi ora allegare documenti all'incarico oppure tornare alla lista.
              </p>
            </div>
          </div>
        )}

        <Card title="Dati Incarico">
          <fieldset disabled={!!createdIncaricoId} className={createdIncaricoId ? 'opacity-50 pointer-events-none' : ''}>
          <div className="space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cliente *
              </label>
              
              {/* Cliente selezionato */}
              {selectedCliente && selectedClienteNome && (
                <div className="mb-2 flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900">{selectedClienteNome}</p>
                    <p className="text-xs text-blue-600">Cliente selezionato</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCliente('');
                      setNomeClienteRS('');
                      setSelectedClienteNome('');
                      setClienteSearchQuery('');
                      setShowClienteSuggestions(false);
                    }}
                    className="text-blue-600 hover:text-blue-800 p-1"
                    title="Cambia cliente"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              
              {/* Campo di ricerca */}
              {!selectedCliente && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Cerca cliente per nome o codice..."
                      value={clienteSearchQuery}
                      onChange={(e) => {
                        setClienteSearchQuery(e.target.value);
                        setShowClienteSuggestions(true);
                      }}
                      onFocus={() => setShowClienteSuggestions(true)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  {/* Lista suggerimenti */}
                  {showClienteSuggestions && clienteSearchQuery && filteredClientiForIncarico.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredClientiForIncarico.slice(0, 10).map(cliente => (
                        <button
                          key={cliente.id}
                          onClick={() => {
                            setSelectedCliente(cliente.id);
                            setNomeClienteRS(cliente.ragione_sociale);
                            setSelectedClienteNome(`${cliente.ragione_sociale} (${cliente.codice_cliente})`);
                            setClienteCompleto(cliente);
                            setClienteSearchQuery('');
                            setShowClienteSuggestions(false);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                        >
                          <p className="font-medium text-gray-900">{cliente.ragione_sociale}</p>
                          <p className="text-sm text-gray-600">{cliente.codice_cliente}</p>
                        </button>
                      ))}
                      {filteredClientiForIncarico.length > 10 && (
                        <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50">
                          Mostrando 10 di {filteredClientiForIncarico.length} risultati. Continua a digitare per affinare la ricerca.
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Nessun risultato */}
                  {showClienteSuggestions && clienteSearchQuery && filteredClientiForIncarico.length === 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
                      Nessun cliente trovato
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Codice Incarico *
                  {formatoIncarico !== 'manuale' && (
                    <span className="ml-2 text-xs text-blue-600 font-normal">
                      (generazione automatica: {formatoIncarico})
                    </span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newIncarico.codice_incarico}
                    onChange={(e) => setNewIncarico({ ...newIncarico, codice_incarico: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={formatoIncarico !== 'manuale' ? 'Generato automaticamente...' : 'es. INC-2025-001'}
                  />
                  {formatoIncarico !== 'manuale' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const cfPiva = clienteCompleto?.codice_fiscale || clienteCompleto?.partita_iva || '';
                        const codice = await generateCodiceIncarico(formatoIncarico, nomeClienteRS || '', undefined, selectedCliente || undefined, cfPiva);
                        if (codice) setNewIncarico(prev => ({ ...prev, codice_incarico: codice }));
                      }}
                      className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex-shrink-0"
                      title="Rigenera codice"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data Inizio * (gg/mm/aaaa)
                </label>
                <input
                  type="date"
                  onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                  value={newIncarico.data_inizio.includes('/') && newIncarico.data_inizio.length === 10? formatDateInv(newIncarico.data_inizio) : newIncarico.data_inizio}
                  onChange={(e) => {
                    const data = formatDate(e.target.value);
                    setNewIncarico({ ...newIncarico, data_inizio: data })
                  }}
                  placeholder="gg/mm/aaaa"
                  maxLength={10}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent border-gray-300`}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipologia Prestazione *
              </label>
              <PrestazioniSelect
                value={newIncarico.tipologia_prestazione_id}
                onChange={(v) => setNewIncarico({ ...newIncarico, tipologia_prestazione_id: v ?? "" })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descrizione
              </label>
              <input
                type="text"
                value={newIncarico.descrizione}
                onChange={(e) => setNewIncarico({ ...newIncarico, descrizione: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Breve descrizione dell'incarico"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scopo e Natura dell'Incarico
              </label>
              <textarea
                value={newIncarico.scopo_natura}
                onChange={(e) => setNewIncarico({ ...newIncarico, scopo_natura: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Descrivere scopo e natura della prestazione professionale..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Importo Stimato (€)
              </label>
              <input
                type="text"
                value={importoFormattato}
                onChange={(e) => {
                  const inputValue = e.target.value;
                  setImportoFormattato(inputValue);
                  
                  // Parsea e salva il valore numerico
                  const numericValue = parseCurrency(inputValue);
                  setNewIncarico({ ...newIncarico, importo_stimato: numericValue });
                }}
                onBlur={(e) => {
                  // Quando l'utente esce dal campo, formatta il valore
                  const numericValue = parseCurrency(e.target.value);
                  if (numericValue > 0) {
                    setImportoFormattato(formatCurrency(numericValue));
                  } else {
                    setImportoFormattato('');
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="10.000,00"
              />
              <p className="text-xs text-gray-500 mt-1">Formato: 10.000,00 (punto per migliaia, virgola per decimali)</p>
            </div>

            {/* Campi AV.4 - Dichiarazione Cliente */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-md font-semibold text-gray-900 mb-4">📋 Dati per Dichiarazione Cliente (AV.4)</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Relazioni tra Cliente e Titolari Effettivi
                  </label>
                  <textarea
                    value={newIncarico.relazioni_cliente_te}
                    onChange={(e) => setNewIncarico({ ...newIncarico, relazioni_cliente_te: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Descrivere i rapporti tra il cliente e i titolari effettivi..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Provenienza dei Fondi
                  </label>
                  <input
                    type="text"
                    value={newIncarico.provenienza_fondi}
                    onChange={(e) => setNewIncarico({ ...newIncarico, provenienza_fondi: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Es: Reddito da lavoro, attività imprenditoriale, patrimonio familiare..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mezzi di Pagamento Previsti
                  </label>
                  <input
                    type="text"
                    value={newIncarico.mezzi_pagamento}
                    onChange={(e) => setNewIncarico({ ...newIncarico, mezzi_pagamento: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Es: Bonifico bancario, assegno, contanti..."
                  />
                </div>

                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="conferma_fondi_leciti"
                    checked={newIncarico.conferma_fondi_leciti}
                    onChange={(e) => setNewIncarico({ ...newIncarico, conferma_fondi_leciti: e.target.checked })}
                    className="mt-1 mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="conferma_fondi_leciti" className="text-sm text-gray-700">
                    <span className="font-medium">Conferma Provenienza Lecita dei Fondi</span>
                    <p className="text-xs text-gray-500 mt-1">
                      Il cliente dichiara che i fondi provengono da attività lecite
                    </p>
                  </label>
                </div>
              </div>
            </div>

            {!createdIncaricoId && (
              <div className="flex justify-end">
                <button
                  onClick={ view === 'edit-incarico' ? handleUpdateIncarico : handleCreateIncarico }
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {view === 'edit-incarico' ? 'Aggiorna Incarico' : 'Crea Incarico'}
                </button>
              </div>
            )}
          </div>
          </fieldset>
        </Card>

        <div className={`rounded-lg p-4 flex items-center gap-3 ${
          incaricoSalvato
            ? 'bg-blue-50 border border-blue-200'
            : 'bg-amber-50 border border-amber-200'
        }`}>
          <FileText className={`w-5 h-5 flex-shrink-0 ${incaricoSalvato ? 'text-blue-500' : 'text-amber-500'}`} />
          <p className={`text-sm font-medium ${incaricoSalvato ? 'text-blue-800' : 'text-amber-800'}`}>
            {incaricoSalvato
              ? "L'aggiunta di documenti è facoltativa. Puoi allegarli ora o in un secondo momento dalla sezione dettaglio incarico."
              : "Dopo aver salvato l'incarico potrai allegare documenti in questa sezione."
            }
          </p>
        </div>

        {incaricoSalvato && currentIncaricoId && selectedCliente && (() => {
          let openUploadFn: (() => void) | null = null;
          return (
            <Card title="Documenti Allegati all'Incarico" button={
              <button
                onClick={() => openUploadFn?.()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                <Plus className="w-4 h-4" />
                Aggiungi Documento
              </button>
            }>
              <DocumentiAllegati
                clienteId={selectedCliente}
                incaricoId={currentIncaricoId}
                titolo=""
                hideAddButton
                onOpenUploadRef={(fn) => { openUploadFn = fn; }}
              />
            </Card>
          );
        })()}

        {createdIncaricoId && (
          <div className="flex justify-end">
            <button
              onClick={handleFinishIncarico}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Torna alla Lista Incarichi
            </button>
          </div>
        )}
      </div>
    );
  }

  if (view === 'view-evaluations') {
    return (
      <>
        {incaricoCompleto && (
          <DettaglioIncaricoPage
            incarico={incaricoCompleto}
            valutazioni={valutazioni}
            clienteNome={incaricoCompleto.cliente?.ragione_sociale}
            ownerEmail={incarichi.find(i => i.id === incaricoCompleto.id)?.ownerEmail}
            onBack={() => { setPreviousView('list'); setView('list'); }}
            onSaved={async () => {
              await handleViewEvaluations(incaricoCompleto.id);
              loadData();
            }}
            onAggiungiValutazione={() => {
              const prestazione = incaricoCompleto ? getPrestazione(incaricoCompleto.tipologia_prestazione_id) : null;
              if (prestazione) {
                setView('evaluate');
                setPreviousView('view-evaluations');
                setSelectedIncarico(incaricoCompleto.id);
                //setSelectedIncaricoNome(`${incaricoCompleto.codice_incarico} - ${incaricoCompleto.descrizione}`);
              } else {
                toast.warning('È necessario indicare la tipologia di prestazione prima di continuare');
              }
            }}
          />
        )}

        {(eliminaIncarico || eliminaValutazione[0]) && (
          <div className="fixed inset-0 z-50 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 transition-opacity duration-300">
            <div 
          className="bg-white rounded-xl shadow-2xl max-w-lg w-full transform transition-all duration-300 scale-100 opacity-100"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="p-6 sm:p-8">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-red-100 p-3 rounded-full">
                <Trash2 className="h-6 w-6 text-red-600" aria-hidden="true" />
              </div>
              <div className="ml-4 text-left">
                <h3 
                  className="text-lg leading-6 font-bold text-gray-900" 
                  id="modal-title"
                >
                  {eliminaIncarico ? 'Conferma Eliminazione incarico' : 'Conferma Eliminazione' }
                </h3>
              </div>
            </div>
            <div className="mt-4 px-7">
              {eliminaIncarico ? 
                <h2 className="text-sm text-gray-500">
                  Sei sicuro di voler eliminare questo incarico: 
                  <span className="font-semibold text-gray-900 ml-1">
                    {incaricoCompleto?.cliente?.ragione_sociale} ({incaricoCompleto?.codice_incarico})
                  </span> ?
                </h2>
                :
                <h2 className="text-sm text-gray-500">
                  Sei sicuro di voler eliminare questa valutazione ?
                </h2>
              }
              {eliminaIncarico ? 
                <p className="mt-2 text-sm font-medium text-red-600">
                  <strong>Attenzione</strong> : Questa operazione è <strong>irreversibile</strong>.<br/> Tutti i dati di questo <strong>incarico e </strong> le eventuali <strong>valutazioni</strong> saranno eliminate definitivamente.
                </p>
                : 
                <p className="mt-2 text-sm font-medium text-red-600">
                  <strong>Attenzione</strong> : Questa operazione è <strong>irreversibile</strong>.<br/> Questa <strong>valutazione</strong> sarà eliminata definitivamente.
                </p>
              }
            </div>
          </div>
          {deleteErrorI && (
            <div className="mb-3 mx-8 bg-red-50 border border-red-200 p-3 rounded-lg">
              <p className="text-sm text-red-800">{deleteErrorI}</p>
            </div>
          )}
          <div className="px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse sm:gap-3 rounded-b-xl">
            <button
              type="button"
              onClick={async() =>{
                eliminaIncarico ?
                  [
                    await deleteIncarico(() => {
                      setEliminaIncarico(false);
                      setView('list');
                    }),
                    addUserLog(`Eliminato incarico ${incaricoCompleto?.codice_incarico}, cliente: ${incaricoCompleto?.cliente?.ragione_sociale}.`),
                    // checkSystemAlerts(), // [DEPRECATED 2026-04-22] Gestito dai trigger DB
                    loadData()
                  ]:[ 
                    deleteSpecificValutazione(eliminaValutazione[1], eliminaValutazione[2]),
                    handleViewEvaluations(String(incaricoCompleto?.id))
                  ]
              }}
              disabled={isDeletingI}
              className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm transition-colors"
            >
               {isDeletingI ? 'Eliminazione...' : 'Sì, Elimina Definitivamente'}
            </button>
            <button
              type="button"
              onClick={()=>{setEliminaIncarico(false), setEliminaValutazione([false,'',''])}}
              className="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm transition-colors"
            >
              Annulla
            </button>
          </div>
        </div>
      </div>
        )}
      </>
    );
  }

  if (view === 'evaluate') {
    return (
      <ValutazioneRischioForm
        incaricoId={selectedIncarico || undefined}
        clienti={clienti}
        incarichi={incarichi}
        cancelLabel={returnToFascicoloRef.current ? 'Torna al Fascicolo' : 'Annulla'}
        onCancel={() => {
          setSelectedIncarico('');
         /* setSelectedIncaricoNome('');
          setIncaricoSearchQuery('');
          setShowIncaricoSuggestions(false);
          setTabellaA(createDefaultTabellaA());
          setTabellaB(createDefaultTabellaB());*/
          if (!navigateBackFromEvaluate()) {
            previousView == 'view-evaluations' ? setView('view-evaluations') : setView('list');
          }
        }}
        onSave={() => {
          loadData();
          setSelectedIncarico('');
          /*setSelectedIncaricoNome('');
          setIncaricoSearchQuery('');
          setShowIncaricoSuggestions(false);
          setTabellaA(createDefaultTabellaA());
          setTabellaB(createDefaultTabellaB());*/
          if (!navigateBackFromEvaluate()) {
            previousView == 'view-evaluations' ? [setView('view-evaluations'), handleViewEvaluations(selectedIncarico)] : setView('list');
          }
        }}
      />
    );
  }
  // ==================== VISTA ARCHIVIATI ====================
  if (view === 'archived-lists') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('list')} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Archive className="w-6 h-6 text-amber-600" />
                Clienti e Incarichi Archiviati
              </h1>
              <p className="text-gray-600 mt-1">Elementi archiviati in sola lettura</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Clienti archiviati */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-600" />
              Clienti Archiviati
            </h3>
            {/* Ricerca, contatore e ordinamento */}
            <div className="mb-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Cerca per nome o codice..."
                  value={searchArchClienteQuery}
                  onChange={(e) => setSearchArchClienteQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                {searchArchClienteQuery && (
                  <button
                    onClick={() => setSearchArchClienteQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {archivedClienti.length} {archivedClienti.length === 1 ? 'cliente trovato' : 'clienti trovati'}
                  {searchArchClienteQuery && ` (filtrati da ${totalArchivedClienti} totali)`}
                </div>
                <div className="flex items-center gap-1">
                  <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  <div className="border border-gray-200 rounded-md px-2 py-1 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
                  <select
                    value={archClienteSort}
                    onChange={(e) => setArchClienteSort(Number(e.target.value))}
                    className="text-xs text-gray-600 bg-white focus:outline-none focus:ring-0"
                  >
                    {clienteSortOptions.map((opt, i) => (
                      <option key={i} value={i}>{opt.label}</option>
                    ))}
                  </select>
                  </div>
                </div>
              </div>
            </div>
            {archivedClienti.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Nessun cliente archiviato.</p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {archivedClienti.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg bg-amber-50/50">
                    <div>
                      <p className="font-medium text-gray-900">{c.ragione_sociale}</p>
                      <p className="text-sm text-gray-500">{c.codice_cliente} | {c.tipo_cliente}</p>
                    </div>
                    <button
                      onClick={() => toggleArchiviaCliente(c, true)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Ripristina
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Incarichi archiviati */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-600" />
              Incarichi Archiviati
            </h3>
            {/* Ricerca, contatore e ordinamento */}
            <div className="mb-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Cerca per codice o descrizione..."
                  value={searchArchIncaricoQuery}
                  onChange={(e) => setSearchArchIncaricoQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                {searchArchIncaricoQuery && (
                  <button
                    onClick={() => setSearchArchIncaricoQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {archivedIncarichi.length} {archivedIncarichi.length === 1 ? 'incarico trovato' : 'incarichi trovati'}
                  {searchArchIncaricoQuery && ` (filtrati da ${totalArchivedIncarichi} totali)`}
                </div>
                <div className="flex items-center gap-1">
                  <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  <div className="border border-gray-200 rounded-md px-2 py-1 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
                  <select
                    value={archIncaricoSort}
                    onChange={(e) => setArchIncaricoSort(Number(e.target.value))}
                    className="text-xs text-gray-600 bg-white focus:outline-none focus:ring-0"
                  >
                    {incaricoSortOptions.map((opt, i) => (
                      <option key={i} value={i}>{opt.label}</option>
                    ))}
                  </select>
                  </div>
                </div>
              </div>
            </div>
            {archivedIncarichi.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Nessun incarico archiviato.</p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {archivedIncarichi.map(i => {
                  const cliente = clienti.find(c => c.id === i.cliente_id);
                  return (
                    <div key={i.id} className="flex items-center justify-between p-3 border rounded-lg bg-amber-50/50">
                      <div>
                        <p className="font-medium text-gray-900">{i.codice_incarico}</p>
                        <p className="text-sm text-gray-500">
                          {cliente?.ragione_sociale || 'Cliente sconosciuto'} | {getPrestazione(i.tipologia_prestazione_id)?.label || i.descrizione}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleArchiviaIncarico(i, true)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Ripristina
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">RT2 - Adeguata Verifica della Clientela</h1>
          <p className="text-gray-600 mt-1">Identificazione cliente e valutazione rischio incarichi</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('wizard')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            title="Wizard completo AV.4 - Dichiarazione Cliente"
          >
            <Users className="w-4 h-4" />
            Nuovo Cliente
          </button>
          <button
            onClick={() => setView('new-incarico')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Nuovo Incarico
          </button>
          <button
            onClick={() => setView('evaluate')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Search className="w-4 h-4" />
            Valuta Rischio
          </button>
          {(archivedClienti.length > 0 || archivedIncarichi.length > 0) && (
            <button
              onClick={() => setView('archived-lists')}
              className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors"
            >
              <Archive className="w-4 h-4" />
              Archiviati ({archivedClienti.length + archivedIncarichi.length})
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Clienti" icon={<Users className="w-5 h-5 text-blue-600" />}>
          {/* Campo di ricerca e contatore */}
          <div className="mb-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Cerca per nome o codice..."
                value={searchClienteQuery}
                onChange={(e) => setSearchClienteQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              {searchClienteQuery && (
                <button
                  onClick={() => setSearchClienteQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {filteredClienti.length} {filteredClienti.length === 1 ? 'cliente trovato' : 'clienti trovati'}
                {searchClienteQuery && ` (filtrati da ${clienti.length} totali)`}
              </div>
              <div className="flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3 text-gray-400" />
                <div className="border border-gray-200 rounded-md px-2 py-1 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
                <select
                  value={clienteSort}
                  onChange={(e) => setClienteSort(Number(e.target.value))}
                  className="text-xs text-gray-600 bg-white focus:outline-none focus:ring-0"
                >
                  {clienteSortOptions.map((opt, i) => (
                    <option key={i} value={i}>{opt.label}</option>
                  ))}
                </select>
                </div>
              </div>
            </div>
          </div>

          {/* Lista clienti con scrolling */}
          {filteredClienti.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>{searchClienteQuery ? 'Nessun cliente trovato' : 'Nessun cliente registrato'}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {filteredClienti.map(cliente => (
                <div key={cliente.id} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-between transition-colors cursor-pointer" onClick={() => handleViewClienteDetail(cliente.id)}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{cliente.ragione_sociale}</p>
                      {cliente.status === 'draft' && (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded">
                          BOZZA
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{cliente.codice_cliente}</p>
                  </div>
                  {/*<span
                    className="ml-2 px-3 py-1 text-sm text-blue-600 rounded-lg flex items-center gap-1"
                    title="Visualizza dettaglio cliente"
                  >
                    <Eye className="w-4 h-4" />
                    Dettaglio
                  </span>*/}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Incarichi" icon={<FileText className="w-5 h-5 text-blue-600" />}>
          {/* Campo di ricerca e contatore */}
          <div className="mb-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Cerca per codice o descrizione..."
                value={searchIncaricoQuery}
                onChange={(e) => setSearchIncaricoQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              {searchIncaricoQuery && (
                <button
                  onClick={() => setSearchIncaricoQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {filteredIncarichi.length} {filteredIncarichi.length === 1 ? 'incarico trovato' : 'incarichi trovati'}
                {searchIncaricoQuery && ` (filtrati da ${incarichi.length} totali)`}
              </div>
              <div className="flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3 text-gray-400" />
                <div className="border border-gray-200 rounded-md px-2 py-1 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
                <select
                  value={incaricoSort}
                  onChange={(e) => setIncaricoSort(Number(e.target.value))}
                  className="text-xs text-gray-600 bg-white focus:outline-none focus:ring-0"
                >
                  {incaricoSortOptions.map((opt, i) => (
                    <option key={i} value={i}>{opt.label}</option>
                  ))}
                </select>
                </div>
              </div>
            </div>
          </div>

          {/* Lista incarichi con scrolling */}
          {filteredIncarichi.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>{searchIncaricoQuery ? 'Nessun incarico trovato' : 'Nessun incarico attivo'}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {filteredIncarichi.map(incarico => {
                const prest = getPrestazione(incarico.tipologia_prestazione_id);
                return (
                  <div key={incarico.id} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => handleViewEvaluations(incarico.id)}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{incarico.codice_incarico}</p>
                        <p className="text-sm text-gray-600">{prest?.label || incarico.descrizione}</p>
                      </div>
                      {/*<span
                        className="ml-2 px-3 py-1 text-sm text-blue-600 rounded-lg"
                        title="Visualizza valutazioni salvate"
                      >
                        <FileText className="w-4 h-4" />
                      </span>*/}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
