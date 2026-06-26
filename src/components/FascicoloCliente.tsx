/**
 * FascicoloCliente - Hub centralizzato del fascicolo cliente
 *
 * Riferimenti normativi:
 * - D.Lgs. 231/2007, artt. 17-30 (adeguata verifica)
 * - Linee Guida CNDCEC 22/05/2019, Parte III, par. 3.1 (fascicolo del cliente)
 * - Regola Tecnica n. 3 (conservazione documenti, dati e informazioni)
 * - Allegato AV.2 (check-list formazione fascicolo)
 *
 * Il fascicolo del cliente aggrega tutti i dati relativi a:
 * - Anagrafica cliente e documenti identità
 * - Titolari effettivi e catene di controllo
 * - Incarichi professionali e valutazioni rischio
 * - Documenti allegati
 * - Controlli costanti e anomalie
 * - Alert e scadenze
 * - Timeline delle attività (audit trail)
 */
import { useState, useEffect, useMemo, useRef, Fragment, lazy, Suspense } from 'react';
import { User, Building2, FileText, Shield, AlertTriangle, ChevronRight, CheckCircle, XCircle, Search, FolderOpen, Activity, Calendar, ArrowLeft, RotateCcw, Archive, ArrowUpDown, X, Plus, PlusCircle, Save, RefreshCw, ChevronDown, Check, Download, Loader2, Briefcase, Info, Upload } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { ValutazioneRischioForm } from './ValutazioneRischioForm';
import { amlData, getPrestazione } from '../lib/aml-data';
import { loadImpostazioni, generateCodiceIncarico, type FormatoCodice } from '../lib/codiceGenerator';
import { formatDate as formatDateWizard, formatDateInv, normalizeDate } from './cliente-wizard/components/forms/PersonaFisicaForm';
import { Combobox } from '@headlessui/react';
import { RiskBadge } from './RiskBadge';
import { supabase } from '../lib/supabase';
import { enrichClienteWithRappresentante, loadTitolariWithPersona, type PersonaFisicaRecord } from '../lib/personeHelper';
import { PersonaModal } from './AnagraficaPersone';
import { classificaRischioEffettivo } from '../lib/calculations';
import { Spinner } from './cliente-wizard/modals/Spinner';
import { DocumentiAllegati } from './DocumentiAllegati';
import { DettaglioIncaricoPage } from './IncaricoDettModifica';
import { ClienteDettaglioView } from './ClienteDettaglioShared';
import { ClienteWizard } from './cliente-wizard';
// Lazy: xlsx + tabella code page (~900KB) restano fuori dal bundle principale e
// vengono caricati solo all'apertura dell'import.
const ImportClientiModal = lazy(() => import('./ImportClientiModal').then(m => ({ default: m.ImportClientiModal })));
import { addUserLog, logAccess } from './LogUtente';
// import { useSystemAlerts } from './AlertPanel.tsx'; // [DEPRECATED 2026-04-22] Gestito dai trigger DB
import { useToast, useConfirm } from './Toast';
import { spostaNelCestino, anagraficheEsclusiveCliente, anagraficheCondiviseCliente, clausolaRecuperoCestino } from '../lib/cestinoHelper';
import { generateBlobDOCX_AV1, generateBlobDOCX_AV3, generateBlobDOCX_AV4, generateBlobDOCX_AV5, generateBlobDOCX_AV6, type DocumentoAllegato } from '../lib/docx-converter';
import { getMyStudio, getMyProfile } from '../lib/studioHelper';
import { useStudio } from '../lib/StudioContext';
import { findPersoneIdByCliente } from '../lib/personeHelper';
import { TIPOLOGIE_DOCUMENTO } from './DocumentiAllegati';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface Cliente {
  id: string;
  codice_cliente: string;
  ragione_sociale: string;
  tipo_cliente: string;
  natura_giuridica: string;
  codice_fiscale: string;
  partita_iva: string;
  indirizzo: string;
  paese: string;
  pep: boolean;
  pep_verificato: boolean;
  sanzioni: boolean;
  sanzioni_verificato: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  codice_ateco: string;
  attivita_svolta: string;
  note_verifica: string;
  documento_identita: any;
  studio_id?: string | null;
  archiviato?: boolean;
}

interface Incarico {
  id: string;
  codice_incarico: string;
  tipologia_prestazione_id: string;
  descrizione: string;
  scopo_natura: string;
  data_inizio: string;
  data_fine: string;
  importo_stimato: number;
  status: string;
  mezzi_pagamento?: string;
  provenienza_fondi?: string;
  created_at?: string;
  updated_at?: string;
  studio_id?: string | null;
  archiviato?: boolean;
}

interface ValutazioneRischio {
  id: string;
  incarico_id: string;
  data_valutazione: string;
  rischio_inerente_prestazione: number;
  rischio_specifico: number;
  rischio_effettivo: number;
  classe_rischio: number;
  tabella_a_scores: any;
  tabella_b_scores: any;
  misure_applicate: string;
  note: string;
  prossimo_controllo: string;
  created_at: string;
}

interface TitolareEffettivo {
  id: string;
  persona_id?: string;
  nome_cognome: string;
  codice_fiscale: string;
  tipo_rapporto: string;
  is_pep: boolean;
  pep_carica: string;
  documento_tipo: string;
  documento_scadenza: string;
  note_quota?: string;
}

interface Documento {
  id: string;
  incarico_id: string | null;
  tipologia: string;
  nome_file: string;
  descrizione: string;
  file_path: string;
  data_acquisizione: string;
  data_scadenza: string;
}

interface Alert {
  id: string;
  tipo_rt: string;
  messaggio: string;
  priorita: string;
  status: string;
  created_at: string;
}

interface IncaricoCompleto extends Incarico {
  cliente_id: string;
  relazioni_cliente_te?: string;
  conferma_fondi_leciti?: boolean;
  cliente?: Cliente | null;
}

interface ControllosCostante {
  id: string;
  incarico_id: string;
  data_controllo: string;
  tipologia: string;
  esito: string;
  anomalie_rilevate: any;
  prossima_scadenza: string;
}


// Check-list AV.2 items (Linee Guida CNDCEC, Allegato AV.2)
// level: 'cliente' = adempimento del cliente (condiviso), 'incarico' = specifico per incarico
// requiredForClasses: classi di rischio per cui l'item è obbligatorio
//   [1,2,3,4] = sempre obbligatorio | [3,4] = ordinaria+rafforzata | [4] = solo rafforzata | [] = sempre facoltativo
//   Rif.: D.Lgs. 231/2007, artt. 18 (ordinaria), 23 (semplificata), 24-25 (rafforzata); RT CNDCEC 2025, RT2
const CHECKLIST_AV2 = [
  // --- Identificazione (cliente) ---
  { id: 'cl_identita', label: 'Fotocopia documento identità del Cliente o dell\'esecutore', requiredForClasses: [1,2,3,4], category: 'identificazione', level: 'cliente' as const },
  //{ id: 'cl_identita_esecutore', label: 'Copia documento identità esecutore (se diverso dal cliente)', requiredForClasses: [] as number[], category: 'identificazione', level: 'cliente' as const },
  { id: 'cl_codice_fiscale', label: 'Attestazione codice fiscale e (eventuale) partita IVA', requiredForClasses: [1,2,3,4], category: 'identificazione', level: 'cliente' as const },
  { id: 'cl_visura', label: 'Visura del Registro Imprese (per società/enti)', requiredForClasses: [] as number[], category: 'identificazione', level: 'cliente' as const },
  { id: 'cl_atti_costitutivi', label: 'Atti costitutivi e delibere (per enti non iscritti al Registro Imprese)', requiredForClasses: [] as number[], category: 'identificazione', level: 'cliente' as const },
  // --- Titolare effettivo (cliente) ---
  { id: 'cl_titolare_effettivo', label: 'Individuazione e verifica titolare/i effettivo/i', requiredForClasses: [3,4], category: 'titolare_effettivo', level: 'cliente' as const },
  { id: 'cl_te_metodo', label: 'Documentazione del metodo di individuazione del TE', requiredForClasses: [3,4], category: 'titolare_effettivo', level: 'cliente' as const },
  { id: 'cl_te_documenti', label: 'Documenti identità titolari effettivi', requiredForClasses: [3,4], category: 'titolare_effettivo', level: 'cliente' as const },
  // --- Compliance (cliente) ---
  { id: 'cl_pep_check', label: 'Verifica PPE effettuata', requiredForClasses: [3,4], category: 'compliance', level: 'cliente' as const },
  { id: 'cl_sanzioni_check', label: 'Verifica liste sanzioni/embargo', requiredForClasses: [3,4], category: 'compliance', level: 'cliente' as const },
  // --- Approfondimenti (cliente) ---
  { id: 'cl_dichiarazione_penale', label: 'Dichiarazione sostitutiva / certificato Tribunale (condanne e procedimenti)', requiredForClasses: [] as number[], category: 'approfondimenti', level: 'cliente' as const },
  { id: 'cl_esiti_ricerche', label: 'Esiti ricerche internet o banche dati sul Cliente/TE', requiredForClasses: [4], category: 'approfondimenti', level: 'cliente' as const },
  { id: 'cl_consistenza_patrimoniale', label: 'Documentazione consistenza patrimoniale e/o capacità di credito', requiredForClasses: [4], category: 'approfondimenti', level: 'cliente' as const },
  { id: 'cl_visura_nominativa', label: 'Visura camerale nominativa (cariche, protesti, procedure concorsuali)', requiredForClasses: [] as number[], category: 'approfondimenti', level: 'cliente' as const },
  { id: 'cl_posizione_giuridica', label: 'Documentazione posizione giuridica del Cliente (difesa/rappresentanza)', requiredForClasses: [] as number[], category: 'approfondimenti', level: 'cliente' as const },
  // --- Dichiarazioni e modelli (incarico) ---
  { id: 'cl_scheda_av3', label: 'Scheda di adeguata verifica (modello AV.3) — generata automaticamente se i dati sono completi', requiredForClasses: [1,2,3,4], category: 'dichiarazioni', level: 'incarico' as const },
  { id: 'cl_dichiarazione_av4', label: 'Dichiarazione antiriciclaggio del cliente (modello  AV.4) — firmata dal cliente', requiredForClasses: [3,4], category: 'dichiarazioni', level: 'incarico' as const },
  { id: 'cl_scheda_av1', label: 'Scheda di determinazione del rischio effettivo (modello  AV.1) — generata automaticamente se i dati sono completi', requiredForClasses: [1,2,3,4], category: 'rischio', level: 'incarico' as const },
  { id: 'cl_attestazione_av5', label: 'Attestazione verifica da parte di terzi (modello AV.5)', requiredForClasses: [] as number[], category: 'dichiarazioni', level: 'incarico' as const },
  // --- Prestazione (incarico) ---
  { id: 'cl_scopo_natura', label: 'Descrizione scopo e natura della prestazione', requiredForClasses: [1,2,3,4], category: 'prestazione', level: 'incarico' as const },
  { id: 'cl_mandato', label: 'Mandato (lettera di incarico) professionale', requiredForClasses: [1,2,3,4], category: 'prestazione', level: 'incarico' as const },
  { id: 'cl_mezzi_pagamento', label: 'Informazioni su mezzi di pagamento utilizzati', requiredForClasses: [4], category: 'prestazione', level: 'incarico' as const },
  { id: 'cl_provenienza_fondi', label: 'Informazioni su provenienza dei fondi', requiredForClasses: [4], category: 'prestazione', level: 'incarico' as const },
  { id: 'cl_doc_semplificati_rafforzati', label: 'Documentazione obblighi semplificati o rafforzati di adeguata verifica', requiredForClasses: [4], category: 'compliance', level: 'incarico' as const },
  // --- Monitoraggio (incarico) ---
  { id: 'cl_controllo_costante', label: 'Programmazione controllo costante', requiredForClasses: [1,2,3,4], category: 'monitoraggio', level: 'incarico' as const },
];

const CHECKLIST_CLIENTE = CHECKLIST_AV2.filter(c => c.level === 'cliente');
//const CHECKLIST_INCARICO = CHECKLIST_AV2.filter(c => c.level === 'incarico');

/** Label leggibili per lo status di clienti/incarichi */
const STATUS_LABELS: Record<string, string> = {
  draft: 'Bozza',
  active: 'Attivo',
  completed: 'Completato',
  suspended: 'Sospeso',
  closed: 'Chiuso',
};
function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

/** Determina se un item è obbligatorio per una data classe di rischio. Senza valutazione = classe 1 (semplificata). */
function isItemRequired(item: typeof CHECKLIST_AV2[0], classe: number | null): boolean {
  return item.requiredForClasses.includes(classe ?? 1);
}


// [DEPRECATED 2026-05-07] Helper per salvare lo storico modifiche.
// Sostituito dal trigger DB log_storico_clienti_incarichi() in migrazione
// 20260508000000_audit_storico_db_triggers.sql. L'archiviazione cliente/incarico
// (campo 'archiviato') è ora catturata automaticamente dal trigger sull'UPDATE.
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

type FascicoloTab = 'anagrafica' | 'titolari' | 'incarichi' | 'documenti' | 'checklist' | 'timeline' | 'alert';

export function FascicoloCliente({} = {}) {
  // const { checkSystemAlerts } = useSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
  const toast = useToast();
  const confirm = useConfirm();
  const { activeStudioId } = useStudio();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [enrichedCliente, setEnrichedCliente] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<FascicoloTab>('anagrafica');
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'tutti' | 'persona_fisica' | 'impresa' | 'professionista'>('tutti');
  const [statusFilter, setStatusFilter] = useState<'tutti' | 'draft' | 'active'>('tutti');
  const [loading, setLoading] = useState(true);
  const [archiveFolder, setArchiveFolder] = useState<'attivi' | 'archiviati'>('attivi');

  // Ordinamento lista clienti
  type SortOption = { field: string; dir: 'asc' | 'desc'; label: string };
  const clienteSortOptions: SortOption[] = [
    { field: 'created_at', dir: 'desc', label: 'Più recenti' },
    { field: 'created_at', dir: 'asc', label: 'Meno recenti' },
    { field: 'ragione_sociale', dir: 'asc', label: 'Nome A→Z' },
    { field: 'ragione_sociale', dir: 'desc', label: 'Nome Z→A' },
    { field: 'codice_cliente', dir: 'asc', label: 'Codice A→Z' },
    { field: 'codice_cliente', dir: 'desc', label: 'Codice Z→A' },
  ];
  const [clienteSort, setClienteSort] = useState(0);

  // Dati del fascicolo per il cliente selezionato
  const [incarichi, setIncarichi] = useState<Incarico[]>([]);
  const [valutazioni, setValutazioni] = useState<ValutazioneRischio[]>([]);
  const [titolari, setTitolari] = useState<TitolareEffettivo[]>([]);
  const [documenti, setDocumenti] = useState<Documento[]>([]);
  // Documenti collegati alle persone associate al cliente (titolari effettivi, rappresentante).
  // Tenuti separati da `documenti` per non alterare il calcolo della completezza,
  // ma uniti nel conteggio del badge della tab Documenti.
  const [documentiPersone, setDocumentiPersone] = useState<Documento[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [controlli, setControlli] = useState<ControllosCostante[]>([]);
  const [personaIds, setPersonaIds] = useState<string[]>([]);
  // checklistState calcolato via useMemo
  const [checklistIncaricoAperto, setChecklistIncaricoAperto] = useState<string | null>(null);

  // Dettaglio incarico
  const [dettaglioIncarico, setDettaglioIncarico] = useState<IncaricoCompleto | null>(null);
  const [loadingDettaglio, setLoadingDettaglio] = useState(false);
  const [loadingFascicolo, setLoadingFascicolo] = useState(false);

  // Download DOCX modal
  const [downloadModalIncarico, setDownloadModalIncarico] = useState<Incarico | null>(null);
  useScrollLock(!!downloadModalIncarico);
  const [isGeneratingDOCX, setIsGeneratingDOCX] = useState(false);
  const [docxGenerationType, setDocxGenerationType] = useState<string | null>(null);

  // Allegati per download ZIP
  interface AllegatoDownload { id: string; tipologia: string; nome_file: string; file_path: string; }
  const [allegatiIncarico, setAllegatiIncarico] = useState<AllegatoDownload[]>([]);
  const [includeAllegati, setIncludeAllegati] = useState(true);
  const [selectedAllegatiIds, setSelectedAllegatiIds] = useState<Set<string>>(new Set());
  const [loadingAllegati, setLoadingAllegati] = useState(false);
  const [downloadView, setDownloadView] = useState<'allegati' | 'modulo'>('allegati');

  // Creazione nuovo incarico inline
  const [creatingIncarico, setCreatingIncarico] = useState(false);
  const [createdIncaricoId, setCreatedIncaricoId] = useState<string | null>(null);
  const creatingIncaricoRef = useRef(false);
  const [formatoIncarico, setFormatoIncarico] = useState<FormatoCodice>('manuale');
  const [importoFormattato, setImportoFormattato] = useState('');
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
    conferma_fondi_leciti: true,
  });

  useEffect(() => {
    loadImpostazioni().then(imp => setFormatoIncarico(imp.formato_codice_incarico));
  }, []);

  // Auto-generazione codice incarico
  useEffect(() => {
    if (creatingIncarico && formatoIncarico !== 'manuale' && selectedCliente && !newIncarico.codice_incarico) {
      (async () => {
        const cfPiva = selectedCliente.codice_fiscale || selectedCliente.partita_iva || '';
        const codice = await generateCodiceIncarico(formatoIncarico, selectedCliente.ragione_sociale, undefined, selectedCliente.id, cfPiva);
        if (codice) setNewIncarico(prev => ({ ...prev, codice_incarico: codice }));
      })();
    }
  }, [creatingIncarico, formatoIncarico, selectedCliente]);

  function resetNuovoIncarico() {
    setCreatingIncarico(false);
    setCreatedIncaricoId(null);
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
      conferma_fondi_leciti: true,
    });
  }

  async function openDownloadModal(inc: Incarico) {
    setDownloadModalIncarico(inc);
    setIncludeAllegati(true);
    setSelectedAllegatiIds(new Set());
    setDownloadView('allegati');
    setLoadingAllegati(true);
    try {
      // Carica in parallelo i documenti cliente e l'elenco persona_id associate.
      // pDocs richiede pIds, quindi resta in coda; ma docs e pIds sono indipendenti.
      const [
        { data: docs },
        pIds,
      ] = await Promise.all([
        supabase
          .from('documenti')
          .select('id, tipologia, nome_file, file_path')
          .eq('cliente_id', selectedCliente!.id)
          .or(`incarico_id.is.null,incarico_id.eq.${inc.id}`),
        findPersoneIdByCliente(String(selectedCliente!.id)),
      ]);
      let personaDocs: AllegatoDownload[] = [];
      if (pIds.length > 0) {
        const { data: pDocs } = await supabase
          .from('documenti')
          .select('id, tipologia, nome_file, file_path')
          .in('persona_id', pIds)
          .or(`incarico_id.is.null,incarico_id.eq.${inc.id}`);
        personaDocs = pDocs || [];
      }
      const all = [...(docs || []), ...personaDocs];
      // Rimuovi duplicati per id
      const unique = Array.from(new Map(all.map(d => [d.id, d])).values());
      setAllegatiIncarico(unique);
      setSelectedAllegatiIds(new Set(unique.map(d => d.id)));
    } catch {
      setAllegatiIncarico([]);
    } finally {
      setLoadingAllegati(false);
    }
  }

  function isCartaceo(doc: { file_path: string }): boolean {
    return !doc.file_path || doc.file_path.startsWith('*');
  }

  async function fetchDocxDataForIncarico(inc: Incarico) {
    if (!selectedCliente) throw new Error('Cliente non selezionato');

    // Tutte queste lookup sono indipendenti tra loro: caricarle in parallelo dimezza la latenza
    // percepita dall'utente che clicca "Scarica DOCX". L'unico passaggio davvero dipendente è
    // il fetch di personaDocs (richiede gli ID restituiti da findPersoneIdByCliente), che resta
    // in coda al batch.
    const clientePromise = supabase
      .from('clienti').select('*').eq('id', selectedCliente.id).single()
      .then(async ({ data, error }) => {
        if (error) throw error;
        return enrichClienteWithRappresentante(data);
      });

    const [
      clienteData,
      titolariData,
      { data: valutazioneData },
      { data: clienteDocs },
      pIds,
      [studioInfo, profileInfo],
      { count: countIncarichi },
    ] = await Promise.all([
      clientePromise,
      loadTitolariWithPersona(selectedCliente.id),
      supabase
        .from('valutazioni_rischio').select('*').eq('incarico_id', inc.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase
        .from('documenti').select('tipologia, nome_file')
        .eq('cliente_id', selectedCliente.id)
        .or(`incarico_id.is.null,incarico_id.eq.${inc.id}`),
      findPersoneIdByCliente(String(selectedCliente.id)),
      Promise.all([getMyStudio(), getMyProfile()]),
      // Conta gli incarichi totali del cliente per spuntare automaticamente "Nuovo Cliente"
      // (=1 incarico) o "Cliente già identificato" (>1) nel modulo AV.3
      supabase
        .from('incarichi')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', selectedCliente.id),
    ]);

    let personaDocs: DocumentoAllegato[] = [];
    if (pIds.length > 0) {
      const { data: pDocs } = await supabase
        .from('documenti').select('tipologia, nome_file')
        .in('persona_id', pIds)
        .or(`incarico_id.is.null,incarico_id.eq.${inc.id}`);
      personaDocs = pDocs || [];
    }
    const documentiData: DocumentoAllegato[] = [...(clienteDocs || []), ...personaDocs];

    return {
      cliente: clienteData,
      titolari_effettivi: titolariData || [],
      incarico: {
        ...inc,
        cliente_id: selectedCliente.id,
        scopo_natura: inc.scopo_natura ?? null,
        relazioni_cliente_te: (inc as any).relazioni_cliente_te ?? null,
        provenienza_fondi: inc.provenienza_fondi ?? null,
        mezzi_pagamento: inc.mezzi_pagamento ?? null,
        importo_stimato: inc.importo_stimato ?? null,
      },
      valutazione: valutazioneData || undefined,
      documenti: documentiData || undefined,
      nome_studio: studioInfo?.nome || undefined,
      studio_comune_sede: studioInfo?.comune_sede ?? null,
      studio_provincia_sede: studioInfo?.provincia_sede ?? null,
      studio_via_piazza_sede: studioInfo?.via_piazza_sede ?? null,
      studio_numero_civico_sede: studioInfo?.numero_civico_sede ?? null,
      studio_nome_proprietario: studioInfo?.nome_proprietario ?? null,
      studio_cognome_proprietario: studioInfo?.cognome_proprietario ?? null,
      studio_albo_sede: studioInfo?.albo_sede ?? null,
      studio_albo_numero: studioInfo?.albo_numero ?? null,
      studio_albo_sezione: studioInfo?.albo_sezione ?? null,
      responsabile_nome: profileInfo?.nome ?? null,
      responsabile_cognome: profileInfo?.cognome ?? null,
      numero_incarichi_cliente: countIncarichi ?? 0,
    };
  }

  /** Raccoglie gli ID dei documenti da includere nello ZIP (vuoto = nessun allegato) */
  function getSelectedAttachmentIds(): string[] {
    if (!includeAllegati) {
      // L'utente ha deselezionato "tutti" e potrebbe aver selezionato singoli
      return allegatiIncarico.filter(d => selectedAllegatiIds.has(d.id)).map(d => d.id);
    }
    return allegatiIncarico.map(d => d.id);
  }

  /** Scarica i file allegati da Supabase e li restituisce come array di {name, blob}. Salta i cartacei. */
  async function downloadAttachments(ids: string[]): Promise<{ name: string; blob: Blob }[]> {
    const toDownload = allegatiIncarico.filter(d => ids.includes(d.id) && !isCartaceo(d));
    const results: { name: string; blob: Blob }[] = [];
    for (const doc of toDownload) {
      try {
        const { data, error } = await supabase.storage.from('file_allegati').download(doc.file_path);
        if (!error && data) results.push({ name: doc.nome_file, blob: data });
      } catch { /* skip file on error */ }
    }
    return results;
  }

  async function handleDownloadDOCX(inc: Incarico, type: 'av1' | 'av3' | 'av4' | 'av5' | 'av6' | 'all') {
    setIsGeneratingDOCX(true);
    setDocxGenerationType(type);
    try {
      const docxData = await fetchDocxDataForIncarico(inc);
      const attachIds = getSelectedAttachmentIds();

      // Per AV.5 ci sono due allegati obbligatori: la "Dichiarazione del cliente ex art. 22"
      // (AV.4) e il "documento di identità del cliente". Per la Dichiarazione AV.4:
      //   - se esiste (anche solo cartacea) la elenchiamo sempre nell'AV.5, col file se digitale;
      //   - se non esiste in alcuna forma, chiediamo se includere il modello precompilato "DA_FIRMARE_".
      const LABEL_DICHIARAZIONE = 'Dichiarazione del cliente ex art. 22 d.lgs. 231/2007';
      let daFirmareAv4: { name: string; blob: Blob } | null = null;
      if (type === 'av5') {
        const MANDATORY_AV5 = [
          { tipologia: 'dichiarazione_av4', label: LABEL_DICHIARAZIONE },
          { tipologia: 'documento_identita', label: 'Documento di identità del cliente' },
        ];

        const missingDigital = MANDATORY_AV5.flatMap(m => {
          const digital = allegatiIncarico.find(d => d.tipologia === m.tipologia && !isCartaceo(d));
          if (digital && !attachIds.includes(digital.id)) {
            return [{ id: digital.id, label: m.label }];
          }
          return [];
        });

        if (missingDigital.length > 0) {
          const listStr = missingDigital.map(m => `• ${m.label}`).join('\n');
          const ok = await confirm({
            title: 'Allegati obbligatori per l\'AV.5',
            message: `I seguenti allegati sono richiesti dall'Attestazione AV.5 e sono presenti nel fascicolo ma non selezionati:\n\n${listStr}\n\nVuoi aggiungerli a questo download?`,
            confirmText: 'Sì, aggiungi',
            cancelText: 'No, procedi senza',
            variant: 'warning',
          });
          if (ok) {
            for (const m of missingDigital) {
              if (!attachIds.includes(m.id)) attachIds.push(m.id);
            }
          }
        }

        const av4Docs = allegatiIncarico.filter(d => d.tipologia === 'dichiarazione_av4');
        if (av4Docs.length === 0) {
          const ok = await confirm({
            title: 'Dichiarazione AV.4 mancante',
            message: 'La "Dichiarazione del cliente ex art. 22 d.lgs. 231/2007" (modulo AV.4) è obbligatoria per l\'Attestazione AV.5 ma non è presente nel fascicolo.\n\nVuoi includere il modello AV.4 precompilato da firmare come allegato?',
            confirmText: 'Sì, allega il modello',
            cancelText: 'No, procedi senza',
            variant: 'warning',
          });
          if (ok) {
            const av4Template = await generateBlobDOCX_AV4(docxData);
            const daFirmareName = `DA_FIRMARE_${av4Template.filename}`;
            daFirmareAv4 = { name: daFirmareName, blob: av4Template.blob };
          }
        }
      }

      // Sovrascrivi documenti nel DOCX con la selezione utente (per AV.3 che li elenca — include anche cartacei)
      const selectedDocs = allegatiIncarico.filter(d => attachIds.includes(d.id));
      docxData.documenti = selectedDocs.map<DocumentoAllegato>(d => ({ tipologia: d.tipologia, nome_file: d.nome_file }));

      if (type === 'av5') {
        // Il label "Dichiarazione del cliente ex art. 22 d.lgs. 231/2007" deve SEMPRE comparire
        // nell'elenco allegati dell'AV.5, anche se il file non è presente / non è stato scaricato.
        docxData.documenti = (docxData.documenti || []).filter(d => d.tipologia !== 'dichiarazione_av4');
        const av4Entry = selectedDocs.find(d => d.tipologia === 'dichiarazione_av4')
          || allegatiIncarico.find(d => d.tipologia === 'dichiarazione_av4');
        const av4NomeFile = daFirmareAv4?.name ?? av4Entry?.nome_file;
        docxData.documenti.push({
          tipologia: 'dichiarazione_av4',
          nome_file: av4NomeFile,
          label: LABEL_DICHIARAZIONE,
        });
      }

      // ZIP serve solo se ci sono allegati digitali da impacchettare
      const hasDigitalAttachments = selectedDocs.some(d => !isCartaceo(d));
      const needsZip = hasDigitalAttachments || !!daFirmareAv4;

      // Genera blob dei moduli richiesti
      const moduli: { blob: Blob; filename: string }[] = [];

      if (type === 'all' || type === 'av1') {
        const av1 = docxData.valutazione
          ? await generateBlobDOCX_AV1(docxData)
          : await generateBlobDOCX_AV1(docxData, { blank: true });
        moduli.push(av1);
      }
      if (type === 'all' || type === 'av3') {
        moduli.push(await generateBlobDOCX_AV3(docxData));
      }
      if (type === 'all' || type === 'av4') {
        moduli.push(await generateBlobDOCX_AV4(docxData));
      }
      if (type === 'av5') {
        moduli.push(await generateBlobDOCX_AV5(docxData));
      }
      if (type === 'av6') {
        moduli.push(await generateBlobDOCX_AV6(docxData));
      }

      if (needsZip) {
        // Scarica allegati e crea ZIP
        const attachments = await downloadAttachments(attachIds);
        if (daFirmareAv4) attachments.push(daFirmareAv4);
        const zip = new JSZip();
        const moduliFolder = zip.folder('Moduli')!;
        for (const m of moduli) moduliFolder.file(m.filename, m.blob);
        if (attachments.length > 0) {
          const allegatiFolder = zip.folder('Allegati')!;
          for (const a of attachments) allegatiFolder.file(a.name, a.blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipName = type === 'all'
          ? `Fascicolo_${inc.codice_incarico}.zip`
          : `AV${type.replace('av', '')}_${inc.codice_incarico}.zip`;
        saveAs(zipBlob, zipName);
      } else {
        // Nessun allegato: scarica direttamente i moduli (singolo o multipli)
        if (moduli.length === 1) {
          saveAs(moduli[0].blob, moduli[0].filename);
        } else {
          // Multipli moduli senza allegati → ZIP solo moduli
          const zip = new JSZip();
          for (const m of moduli) zip.file(m.filename, m.blob);
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          saveAs(zipBlob, `Moduli_${inc.codice_incarico}.zip`);
        }
      }

      toast.success(type === 'all' ? 'Documenti scaricati con successo' : `Documento AV.${type.replace('av', '')} scaricato`);
      const docLabel = type === 'all' ? 'tutti i documenti AV' : `documento AV.${type.replace('av', '')}`;
      addUserLog(`Esportazione ${docLabel} per incarico ${inc.codice_incarico}`);
    } catch (error) {
      console.error('Errore generazione DOCX:', error);
      toast.error('Impossibile generare il documento. Riprovare o contattare il supporto.');
    } finally {
      setIsGeneratingDOCX(false);
      setDocxGenerationType(null);
      setDownloadModalIncarico(null);
    }
  }

  async function handleCreateIncarico() {
    if (creatingIncaricoRef.current) return; // guard doppio submit → niente incarichi duplicati
    if (!selectedCliente || !newIncarico.codice_incarico || !newIncarico.tipologia_prestazione_id || !newIncarico.data_inizio) {
      toast.warning('Compilare i campi obbligatori: Codice, Tipologia Prestazione, Data Inizio');
      return;
    }
    // Converti data
    const dataInizioISO = newIncarico.data_inizio.includes('/')
      ? (() => { const p = newIncarico.data_inizio.split('/'); return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`; })()
      : newIncarico.data_inizio;

    creatingIncaricoRef.current = true;
    try {
      const { data, error } = await supabase.from('incarichi').insert({
        cliente_id: selectedCliente.id,
        ...newIncarico,
        data_inizio: dataInizioISO,
      }).select('id').single();

      if (error || !data) {
        toast.error("Errore nella creazione dell'incarico");
        return;
      }
      addUserLog(`Incarico ${newIncarico.codice_incarico} creato per cliente ${selectedCliente.ragione_sociale}.`);
      // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB — vedi migration 20260422000000_alert_db_logic.sql
      setCreatedIncaricoId(data.id);
    } finally {
      creatingIncaricoRef.current = false;
    }
  }

  function handleFinishNuovoIncarico() {
    resetNuovoIncarico();
    if (selectedCliente) loadFascicoloData(selectedCliente.id);
  }

  // Wizard modifica cliente (da tab anagrafica) o nuovo cliente (dalla lista)
  const [showClienteWizard, setShowClienteWizard] = useState(false);
  const [showNuovoClienteWizard, setShowNuovoClienteWizard] = useState(false);
  const [showImportClienti, setShowImportClienti] = useState(false);
  // Modale modifica anagrafica persona (da tab titolari)
  const [editingPersona, setEditingPersona] = useState<PersonaFisicaRecord | null>(null);

  // Timeline: evento espanso (key = `${incId}_${idx}`)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  // Deep-link navigation da AlertPanel
  const [pendingIncaricoId, setPendingIncaricoId] = useState<string | null>(null);
  const [evaluatingIncaricoId, setEvaluatingIncaricoId] = useState<string | null>(null);
  const alertNavRef = useRef(false);

  // Quando si torna alla lista da un dettaglio, riporto in vista la riga del
  // cliente appena aperto invece di salvare/ripristinare la posizione di scroll
  // (più robusto rispetto a layout shift e differenze di altezza pagina).
  const prevSelectedClienteRef = useRef<Cliente | null>(null);
  useEffect(() => {
    const prev = prevSelectedClienteRef.current;
    if (prev && !selectedCliente) {
      const lastId = prev.id;
      let attempts = 0;
      const tryScroll = () => {
        const el = document.querySelector(`[data-cliente-id="${lastId}"]`) as HTMLElement | null;
        if (el) {
          // Posiziono la riga ~60% dall'alto del viewport: leggermente sotto
          // il centro, sotto le barre sticky.
          const rect = el.getBoundingClientRect();
          const targetY = window.scrollY + rect.top - window.innerHeight * 0.6;
          window.scrollTo({ top: Math.max(0, targetY), behavior: 'auto' });
        } else if (attempts < 30) {
          attempts += 1;
          requestAnimationFrame(tryScroll);
        }
      };
      requestAnimationFrame(tryScroll);
    }
    prevSelectedClienteRef.current = selectedCliente;
  }, [selectedCliente]);

  useEffect(() => {
    if (activeStudioId) loadClienti();
  }, [activeStudioId]);

  // Gestione deep-link: dopo caricamento clienti, applica navigazione da alert
  useEffect(() => {
    if (clienti.length === 0) return;
    const raw = sessionStorage.getItem('alert_navigate_fascicolo');
    if (!raw) return;
    sessionStorage.removeItem('alert_navigate_fascicolo');
    try {
      const nav = JSON.parse(raw) as { clienteId: string; tab: FascicoloTab; incaricoId?: string };
      const cliente = clienti.find(c => c.id === nav.clienteId);
      if (cliente) {
        alertNavRef.current = true;
        setSelectedCliente(cliente);
        setActiveTab(nav.tab);
        if (nav.incaricoId) {
          setPendingIncaricoId(nav.incaricoId);
        }
      }
    } catch { /* ignore malformed data */ }
  }, [clienti]);

  // Audit trail GDPR/AML: registra l'apertura di un fascicolo cliente.
  // Fire-and-forget server-side (RPC log_user_action): IP e user_id sono
  // catturati dal token, non dal client.
  useEffect(() => {
    if (!selectedCliente?.id) return;
    const etichetta = selectedCliente.ragione_sociale || selectedCliente.codice_cliente || selectedCliente.id;
    logAccess({
      action: `Apertura fascicolo cliente ${etichetta}`,
      action_type: 'READ',
      target_table: 'clienti',
      target_id: selectedCliente.id,
    });
  }, [selectedCliente?.id]);

  useEffect(() => {
    if (selectedCliente) {
      setLoadingFascicolo(true);
      loadFascicoloData(selectedCliente.id);
      // All'apertura di un fascicolo, scroll in cima al dettaglio.
      // Al rientro alla lista NON azzeriamo: il restore della posizione
      // è gestito dall'effect dedicato a `selectedCliente`.
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    // Reset stati di navigazione interna quando cambia cliente
    // (skip reset tab se la navigazione viene da un alert)
    if (alertNavRef.current) {
      alertNavRef.current = false;
    } else {
      setActiveTab('anagrafica');
    }
    setEnrichedCliente(null);
    setChecklistIncaricoAperto(null);
    setDettaglioIncarico(null);
    setCreatingIncarico(false);
    setCreatedIncaricoId(null);
    setShowClienteWizard(false);
    setDownloadModalIncarico(null);
    setExpandedEvent(null);
    setEvaluatingIncaricoId(null);
  }, [selectedCliente]);

  // Dopo caricamento incarichi, apri dettaglio se richiesto da deep-link alert
  useEffect(() => {
    if (pendingIncaricoId && incarichi.length > 0) {
      const found = incarichi.find(i => i.id === pendingIncaricoId);
      if (found) {
        handleOpenDettaglio(pendingIncaricoId);
      }
      setPendingIncaricoId(null);
    }
  }, [incarichi, pendingIncaricoId]);

  async function loadClienti() {
    setLoading(true);
    let query = supabase
      .from('clienti')
      .select('*')
      .is('deleted_at', null)
      .order('ragione_sociale');
    if (activeStudioId) query = query.eq('studio_id', activeStudioId);
    const { data, error } = await query;
    if (!error && data) setClienti(data);
    setLoading(false);
  }

  async function loadFascicoloData(clienteId: string) {
    setLoadingFascicolo(true);
    try {
    // Carica prima le persone associate al cliente (cliente stesso, rappresentante, titolari effettivi)
    // così possiamo caricare in parallelo anche i documenti collegati a loro tramite persona_id.
    const personaIdsForDocs = await findPersoneIdByCliente(clienteId);
    setPersonaIds(personaIdsForDocs);

    const [
      { data: incData },
      teData,
      { data: docData },
      personaDocsResult,
      enrichedCliente,
    ] = await Promise.all([
      supabase.from('incarichi').select('*').eq('cliente_id', clienteId).is('deleted_at', null).order('data_inizio', { ascending: false }),
      loadTitolariWithPersona(clienteId),
      supabase.from('documenti').select('*, rinnovo_di').eq('cliente_id', clienteId).is('deleted_at', null).order('created_at', { ascending: false }),
      // Documenti collegati alle persone (titolari effettivi, rappresentante legale)
      personaIdsForDocs.length > 0
        ? supabase.from('documenti').select('*, rinnovo_di').in('persona_id', personaIdsForDocs).is('deleted_at', null).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      // Arricchisci il cliente con dati PEP da anagrafica_soggetti
      supabase.from('clienti').select('*').eq('id', clienteId).single().then(({ data }) =>
        data ? enrichClienteWithRappresentante(data) : null
      ),
    ]);

    // Alert del fascicolo: gli alert non sono tutti ancorati al cliente. A seconda
    // del tipo_rt, riferimento_id punta al cliente (RT4, RT2-DRAFT), all'incarico
    // (RT2, RT2-SCADENZA, RT4-SCADENZA) o al documento (DOC-SCADENZA). Raccogliamo
    // quindi gli alert di tutti gli elementi che appartengono al cliente: il cliente
    // stesso, i suoi incarichi e i suoi documenti (anche quelli delle persone associate).
    const incIdsForAlert = (incData || []).map(i => i.id);
    const docIdsForAlert = [
      ...(docData || []),
      ...(personaDocsResult.data || []),
    ].map(d => d.id);
    const riferimentoIds = [clienteId, ...incIdsForAlert, ...docIdsForAlert];
    const { data: alertData } = await supabase
      .from('alert')
      .select('*')
      .in('riferimento_id', riferimentoIds)
      .order('created_at', { ascending: false });

    // Dati arricchiti con PEP/rappresentante da anagrafica_soggetti
    if (enrichedCliente) {
      setEnrichedCliente(enrichedCliente);
    }

    if (incData) {
      setIncarichi(incData);
      // Carica valutazioni e controlli costanti per tutti gli incarichi in parallelo:
      // sono due lookup indipendenti sulla stessa lista di incarico_id.
      const incIds = incData.map(i => i.id);
      if (incIds.length > 0) {
        const [
          { data: valData },
          { data: contrData },
        ] = await Promise.all([
          supabase
            .from('valutazioni_rischio')
            .select('*')
            .in('incarico_id', incIds)
            .order('data_valutazione', { ascending: false }),
          supabase
            .from('controlli_costanti')
            .select('*')
            .in('incarico_id', incIds)
            .order('data_controllo', { ascending: false }),
        ]);
        setValutazioni(valData || []);
        setControlli(contrData || []);
      } else {
        setValutazioni([]);
        setControlli([]);
      }
    } else {
      setIncarichi([]);
      setValutazioni([]);
      setControlli([]);
    }
    if (teData) setTitolari(teData);
    if (docData) setDocumenti(docData);
    setDocumentiPersone(personaDocsResult.data || []);
    if (alertData) setAlerts(alertData);
    } finally {
      setLoadingFascicolo(false);
    }
  }

  async function handleOpenDettaglio(incaricoId: string) {
    setLoadingDettaglio(true);
    const { data } = await supabase
      .from('incarichi')
      .select('*, cliente:clienti(*)')
      .eq('id', incaricoId)
      .single();
    if (data) {
      setDettaglioIncarico({
        ...data,
        cliente: Array.isArray(data.cliente) ? data.cliente[0] ?? null : data.cliente,
      });
    }
    setLoadingDettaglio(false);
  }


  // Misure per classe dal JSON regole tecniche
  const misurePerClasse = useMemo(() => {
    const rt2 = amlData.regole_tecniche?.find((rt: any) => rt.id === 'RT2');
    return (rt2 as any)?.misure_per_classe ?? [];
  }, []);

  // Calcolo completezza fascicolo — suddiviso per cliente e per incarico
  const { completezza, clientChecks, incaricoChecksMap } = useMemo(() => {
    const emptyResult = {
      completezza: { completati: 0, totali: 0, percentuale: 0, completatiTotali: 0, totaliAssoluti: 0, cliente: { completati: 0, totali: 0, percentuale: 0 }, perIncarico: [] as any[] },
      clientChecks: {} as Record<string, boolean>,
      incaricoChecksMap: new Map<string, Record<string, boolean>>(),
    };
    if (!selectedCliente) return emptyResult;

    // --- Client-level checks ---
    const cc: Record<string, boolean> = {};
    const isImpresa = selectedCliente.tipo_cliente === 'impresa';
    const isPF = selectedCliente.tipo_cliente === 'persona_fisica';
    const clientDocs = documenti.filter(d => !d.incarico_id);

    const docId = selectedCliente.documento_identita;
    const hasDocumento = docId && typeof docId === 'object' && !!docId.tipo && !!docId.numero;
    const rappDoc = enrichedCliente?.rappresentante_legale_documento;
    const hasRappDocumento = !!(rappDoc && rappDoc.tipo && rappDoc.numero);
    cc['cl_identita'] = isImpresa ? hasRappDocumento : hasDocumento;
    cc['cl_identita_esecutore'] = clientDocs.some(d => d.tipologia === 'documento_identita_esecutore');
    cc['cl_codice_fiscale'] = !!(selectedCliente.codice_fiscale || selectedCliente.partita_iva)
      || clientDocs.some(d => d.tipologia === 'codice_fiscale');
    cc['cl_visura'] = isPF ? true : clientDocs.some(d => d.tipologia === 'visura');
    cc['cl_atti_costitutivi'] = isPF
      ? true
      : isImpresa
        ? clientDocs.some(d => d.tipologia === 'atti_costitutivi' || d.tipologia === 'visura')
        : clientDocs.some(d => d.tipologia === 'atti_costitutivi');

    cc['cl_titolare_effettivo'] = isPF || titolari.length > 0;
    cc['cl_te_metodo'] = isPF || titolari.length > 0;
    cc['cl_te_documenti'] = isPF || (titolari.length > 0 && titolari.every(t => !!t.documento_tipo));

    cc['cl_pep_check'] = !!selectedCliente.pep_verificato;
    cc['cl_sanzioni_check'] = !!selectedCliente.sanzioni_verificato;

    cc['cl_dichiarazione_penale'] = clientDocs.some(d => d.tipologia === 'dichiarazione_penale');
    cc['cl_esiti_ricerche'] = clientDocs.some(d => d.tipologia === 'esiti_ricerche');
    cc['cl_consistenza_patrimoniale'] = clientDocs.some(d => d.tipologia === 'consistenza_patrimoniale' || d.tipologia === 'bilancio');
    cc['cl_visura_nominativa'] = clientDocs.some(d => d.tipologia === 'visura_nominativa');
    cc['cl_posizione_giuridica'] = clientDocs.some(d => d.tipologia === 'posizione_giuridica');

    const clientRequired = CHECKLIST_CLIENTE.filter(c => isItemRequired(c, null));
    const clientCompletati = clientRequired.filter(c => cc[c.id]).length;
    const clientPct = clientRequired.length > 0 ? Math.round((clientCompletati / clientRequired.length) * 100) : 100;

    // --- Per-incarico checks ---
    const incMap = new Map<string, Record<string, boolean>>();
    const activeIncarichi = incarichi.filter(i => !i.archiviato);
    const hasClientBase = !!(selectedCliente.ragione_sociale && selectedCliente.codice_fiscale && selectedCliente.indirizzo && selectedCliente.paese);

    const perIncaricoStats = activeIncarichi.map(inc => {
      const incDocs = documenti.filter(d => d.incarico_id === inc.id);
      const incVals = valutazioni.filter(v => v.incarico_id === inc.id);
      const incCtrl = controlli.filter((c: any) => c.incarico_id === inc.id);
      const latestVal = incVals.length > 0 ? incVals[0] : null;

      const ic: Record<string, boolean> = {};
      ic['cl_scheda_av3'] = hasClientBase && !!inc.codice_incarico && !!inc.descrizione && !!inc.scopo_natura && !!inc.data_inizio;
      ic['cl_dichiarazione_av4'] = incDocs.some(d => d.tipologia === 'dichiarazione_av4');
      ic['cl_scheda_av1'] = incVals.length > 0;
      ic['cl_attestazione_av5'] = incDocs.some(d => d.tipologia === 'attestazione_av5');
      ic['cl_scopo_natura'] = !!inc.scopo_natura;
      ic['cl_mandato'] = incDocs.some(d => d.tipologia === 'mandato' || d.tipologia === 'incarico');
      ic['cl_mezzi_pagamento'] = !!inc.mezzi_pagamento || incDocs.some(d => d.tipologia === 'mezzi_pagamento');
      ic['cl_provenienza_fondi'] = !!inc.provenienza_fondi || incDocs.some(d => d.tipologia === 'provenienza_fondi');
      ic['cl_doc_semplificati_rafforzati'] = incDocs.some(d => d.tipologia === 'doc_semplificati_rafforzati');
      ic['cl_controllo_costante'] = incVals.some(v => !!v.prossimo_controllo) || incCtrl.length > 0;

      incMap.set(inc.id, ic);

      const classeRischio = latestVal?.classe_rischio ?? null;
      const misura = classeRischio ? misurePerClasse.find((m: any) => m.grade === classeRischio) : null;

      // Stats per incarico: tutti i 24 item (cliente + incarico), obbligatorietà in base alla classe
      const allItemChecks = { ...cc, ...ic };
      const allRequired = CHECKLIST_AV2.filter(c => isItemRequired(c, classeRischio));
      const incCompletati = allRequired.filter(c => allItemChecks[c.id]).length;
      const incPct = allRequired.length > 0 ? Math.round((incCompletati / allRequired.length) * 100) : 100;
      const completatiTotali = CHECKLIST_AV2.filter(c => allItemChecks[c.id]).length;

      return {
        incaricoId: inc.id,
        codiceIncarico: inc.codice_incarico,
        descrizione: inc.descrizione || getPrestazione(inc.tipologia_prestazione_id)?.label || inc.tipologia_prestazione_id || '',
        completati: incCompletati,
        totali: allRequired.length,
        percentuale: incPct,
        completatiTotali,
        totaliAssoluti: CHECKLIST_AV2.length,
        classeRischio,
        misureLabel: misura?.label ?? null,
        prossimoControllo: latestVal?.prossimo_controllo ?? null,
      };
    });

    // --- Aggregazione ---
    const allPcts = perIncaricoStats.map(s => s.percentuale);
    const worstPct = allPcts.length > 0 ? Math.min(...allPcts) : clientPct;

    const totalRequired = CHECKLIST_AV2.filter(c => isItemRequired(c, null));
    // Somma globale per backward compat header
    const allChecks = { ...cc };
    activeIncarichi.forEach(inc => {
      const ic = incMap.get(inc.id);
      if (ic) Object.assign(allChecks, ic); // NB: se più incarichi, l'ultimo vince — ok per il conteggio globale
    });
    const globalCompletati = totalRequired.filter(c => allChecks[c.id]).length;
    const globalTutti = CHECKLIST_AV2.filter(c => allChecks[c.id]).length;

    return {
      completezza: {
        completati: globalCompletati,
        totali: totalRequired.length,
        percentuale: worstPct,
        completatiTotali: globalTutti,
        totaliAssoluti: CHECKLIST_AV2.length,
        cliente: { completati: clientCompletati, totali: clientRequired.length, percentuale: clientPct },
        perIncarico: perIncaricoStats,
      },
      clientChecks: cc,
      incaricoChecksMap: incMap,
    };
  }, [selectedCliente, enrichedCliente, titolari, documenti, valutazioni, incarichi, controlli, misurePerClasse]);

  const baseFilteredClienti = clienti.filter(c =>
    (c.ragione_sociale?.toLowerCase().includes(search.toLowerCase()) ||
     c.codice_cliente?.toLowerCase().includes(search.toLowerCase()) ||
     c.codice_fiscale?.toLowerCase().includes(search.toLowerCase())) &&
    (tipoFilter === 'tutti' || c.tipo_cliente === tipoFilter) &&
    (statusFilter === 'tutti' || c.status === statusFilter)
  );
  const filteredClienti = baseFilteredClienti.filter(c =>
    archiveFolder === 'archiviati' ? c.archiviato : !c.archiviato
  ).sort((a: any, b: any) => {
    const opt = clienteSortOptions[clienteSort];
    const va = (a[opt.field] ?? '') as string;
    const vb = (b[opt.field] ?? '') as string;
    const cmp = va.localeCompare(vb, 'it', { numeric: true });
    return opt.dir === 'asc' ? cmp : -cmp;
  });
  //const archivedCount = clienti.filter(c => c.archiviato).length;
  const totalForFolder = clienti.filter(c => archiveFolder === 'archiviati' ? c.archiviato : !c.archiviato).length;

  // Archivia / Ripristina cliente
  const toggleArchiviaCliente = async (cliente: Cliente, archivio: boolean) => {
    const msg = archivio
      ? `Vuoi archiviare il cliente "${cliente.ragione_sociale}"? Gli incarichi associati verranno archiviati.`
      : `Vuoi ripristinare il cliente "${cliente.ragione_sociale}"? Gli incarichi associati verranno ripristinati.`;
    if (!(await confirm({ message: msg, variant: 'warning', confirmText: archivio ? 'Archivia' : 'Ripristina' }))) return;
    try {
      const { error } = await supabase.from('clienti').update({ archiviato: archivio }).eq('id', cliente.id);
      if (error) throw error;
      // Cascata sugli incarichi
      await supabase.from('incarichi').update({ archiviato: archivio }).eq('cliente_id', cliente.id);
      addUserLog(`${archivio ? 'Archiviato' : 'Ripristinato'} cliente: ${cliente.ragione_sociale} (${cliente.codice_cliente})`);
      // [DEPRECATED 2026-05-07] Archiviazione tracciata automaticamente dal trigger
      // log_storico_clienti_incarichi (migrazione 20260508000000).
      // await saveStoricoModifiche('cliente', cliente.id, [{
      //   campo: 'archiviato',
      //   vecchio: archivio ? 'false' : 'true',
      //   nuovo: archivio ? 'true' : 'false',
      // }]);
      // Ricarica
      setSelectedCliente(null);
      loadClienti();
      // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB — vedi migration 20260422000000_alert_db_logic.sql
    } catch (err) {
      console.error('Errore archiviazione:', err);
      toast.error('Si è verificato un errore durante l\'operazione.');
    }
  };

  // Rischio massimo tra tutte le valutazioni
  const rischioMax = valutazioni.length > 0
    ? Math.max(...valutazioni.map(v => v.rischio_effettivo))
    : null;

  const alertsAperti = alerts.filter(a => a.status === 'open').length;

  // ==================== LISTA CLIENTI ====================
  if (!selectedCliente) {
    // Wizard creazione nuovo cliente (dalla lista)
    if (showNuovoClienteWizard) {
      return (
        <ClienteWizard
          onComplete={async () => {
            setShowNuovoClienteWizard(false);
            await loadClienti();
            // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB — vedi migration 20260422000000_alert_db_logic.sql
          }}
          onCancel={() => setShowNuovoClienteWizard(false)}
        />
      );
    }

    return (
      <div className="space-y-4">
        <div className="sticky top-28 z-20 bg-gray-50 pt-2 pb-3 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-blue-600" />
              </div>
              Fascicoli Cliente
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Gestisci i fascicoli e la documentazione antiriciclaggio dei clienti
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportClienti(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Importa
            </button>
            <button
              onClick={() => setShowNuovoClienteWizard(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nuovo Cliente
            </button>
          </div>
        </div>

        {showImportClienti && (
          <Suspense fallback={null}>
            <ImportClientiModal
              onClose={() => setShowImportClienti(false)}
              onImported={() => { void loadClienti(); }}
            />
          </Suspense>
        )}

        {/* Segmented control: Attivi / Archiviati */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setArchiveFolder('attivi')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              archiveFolder === 'attivi' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            Attivi
          </button>
          <button
            onClick={() => setArchiveFolder('archiviati')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              archiveFolder === 'archiviati' ? 'bg-white shadow text-amber-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Archive className="w-4 h-4" />
            Archiviati 
          </button>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per nome, codice o CF..."
              className="w-full pl-10 pr-10 py-3 border rounded-lg"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-gray-500">
              {filteredClienti.length} {filteredClienti.length === 1 ? 'cliente trovato' : 'clienti trovati'}
              {(search || tipoFilter !== 'tutti' || statusFilter !== 'tutti') && ` (filtrati da ${totalForFolder} totali)`}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Filtro tipo cliente */}
              <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg text-xs font-medium">
                {([
                  { value: 'tutti', label: 'Tutti', icon: null },
                  { value: 'persona_fisica', label: 'Persone fisiche', icon: User },
                  { value: 'impresa', label: 'Imprese', icon: Building2 },
                  { value: 'professionista', label: 'Professionisti', icon: Briefcase },
                ] as const).map(opt => {
                  const Icon = opt.icon;
                  const active = tipoFilter === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setTipoFilter(opt.value)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                        active ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5" />}
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Filtro stato cliente */}
              <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg text-xs font-medium">
                {([
                  { value: 'tutti', label: 'Tutti' },
                  { value: 'draft', label: 'Bozza' },
                  { value: 'active', label: 'Attivo' },
                ] as const).map(opt => {
                  const active = statusFilter === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setStatusFilter(opt.value)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                        active
                          ? opt.value === 'draft'
                            ? 'bg-white text-yellow-700 shadow-sm'
                            : opt.value === 'active'
                            ? 'bg-white text-green-700 shadow-sm'
                            : 'bg-white text-blue-700 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Ordinatore */}
              <div className="flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3 text-gray-400" />
                <div className="border border-gray-200 bg-white rounded-md px-2 py-1 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
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
        </div>
        </div>

        {loading ? (
          <>
          {/*<div className="text-center py-8 text-gray-500">Caricamento clienti...</div>*/}
          <Spinner/></>
        ) : (
          <div className="space-y-2">
            {filteredClienti.map(cliente => (
              <div
                key={cliente.id}
                data-cliente-id={cliente.id}
                onClick={() => setSelectedCliente(cliente)}
                className="flex items-center justify-between p-4 bg-white border rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  {cliente.tipo_cliente === 'persona_fisica' ? (
                    <User className="w-8 h-8 text-blue-500 bg-blue-100 p-1.5 rounded-full" />
                  ) : cliente.tipo_cliente === 'professionista' ? (
                    <Briefcase className="w-8 h-8 text-sky-600 bg-sky-100 p-1.5 rounded-full" />
                  ) : (
                    <Building2 className="w-8 h-8 text-indigo-600 bg-indigo-100 p-1.5 rounded-full" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{cliente.ragione_sociale}</p>
                    <p className="text-sm text-gray-500">
                      {cliente.codice_cliente} | {cliente.codice_fiscale || cliente.partita_iva}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded ${
                    cliente.status === 'active' ? 'bg-green-100 text-green-700' :
                    cliente.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {statusLabel(cliente.status)}
                  </span>
                  {cliente.pep && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-bold">PPE</span>
                  )}
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            ))}
            {filteredClienti.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FolderOpen className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                  {(search || tipoFilter !== 'tutti' || statusFilter !== 'tutti')
                    ? 'Nessun risultato'
                    : archiveFolder === 'archiviati'
                    ? 'Nessun cliente archiviato'
                    : 'Nessun cliente presente'}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  {(search || tipoFilter !== 'tutti' || statusFilter !== 'tutti')
                    ? 'Prova a modificare i termini di ricerca o i filtri.'
                    : archiveFolder === 'archiviati'
                    ? 'I clienti archiviati appariranno qui.'
                    : 'Crea il primo cliente per iniziare a gestire i fascicoli.'}
                </p>
                {!search && tipoFilter === 'tutti' && statusFilter === 'tutti' && archiveFolder !== 'archiviati' && (
                  <button
                    onClick={() => setShowNuovoClienteWizard(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Crea il primo cliente
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (loadingDettaglio) return <Spinner />;

  // ==================== FASCICOLO SINGOLO CLIENTE ====================
  const isArchiviato = !!selectedCliente?.archiviato;

  // Conta solo i documenti attuali (non rinnovati da un altro documento).
  // Unisce i documenti del cliente con quelli delle persone associate (titolari effettivi,
  // rappresentante legale), evitando duplicati per id.
  const documentiTuttiPerBadge = (() => {
    const seen = new Set(documenti.map((d: any) => d.id));
    return [...documenti, ...documentiPersone.filter((d: any) => !seen.has(d.id))];
  })();
  const renewedDocIds = new Set(documentiTuttiPerBadge.filter((d: any) => d.rinnovo_di).map((d: any) => d.rinnovo_di));
  const documentiAttualiCount = documentiTuttiPerBadge.filter((d: any) => !renewedDocIds.has(d.id)).length;

  const tabs: { id: FascicoloTab; label: string; icon: any; badge?: number }[] = [
    { id: 'anagrafica', label: 'Anagrafica Cliente', icon: User },
    { id: 'titolari', label: 'Titolari Effettivi', icon: User, badge: titolari.length },
    { id: 'incarichi', label: 'Incarichi & Rischio', icon: Shield, badge: incarichi.length },
    { id: 'documenti', label: 'Documenti', icon: FileText, badge: documentiAttualiCount },
    { id: 'checklist', label: 'Check-list AV.2', icon: CheckCircle },
    { id: 'timeline', label: 'Timeline', icon: Activity },
    { id: 'alert', label: 'Alert', icon: AlertTriangle, badge: alertsAperti },
  ];

  return (
    <div className="space-y-4">
      {loadingFascicolo && <Spinner />}
      {/* Header fascicolo */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedCliente(null);
                setActiveTab('anagrafica');
                setDettaglioIncarico(null);
                setIncarichi([]);
                setValutazioni([]);
                setTitolari([]);
                setDocumenti([]);
                setAlerts([]);
                setControlli([]);
                setShowClienteWizard(false);
                resetNuovoIncarico();
                setExpandedEvent(null);
                setPendingIncaricoId(null);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FolderOpen className="w-6 h-6 text-blue-600" />
                {selectedCliente.ragione_sociale}
              </h2>
              <p className="text-sm text-gray-500">
                {selectedCliente.codice_cliente} | {selectedCliente.tipo_cliente} | {selectedCliente.codice_fiscale}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Indicatore completezza */}
            <div className="text-center">
              {incarichi.length === 0 ? (
                <>
                  <div className="text-2xl font-bold text-gray-300">—</div>
                  <p className="text-xs text-gray-400">Nessun incarico</p>
                </>
              ) : (
                <>
                  <div className={`text-2xl font-bold ${
                    completezza.percentuale >= 80 ? 'text-green-600' :
                    completezza.percentuale >= 50 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {completezza.percentuale}%
                  </div>
                  <p className="text-xs text-gray-500">Completezza min. AV.2</p>
                </>
              )}
            </div>

            {/* Rischio massimo */}
            {rischioMax && (
              <div className="text-center">
                <RiskBadge score={rischioMax} />
                <p className="text-xs text-gray-500 mt-1">Rischio max. effettivo</p>
              </div>
            )}

            {/* Alert aperti */}
            {alertsAperti > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{alertsAperti}</div>
                <p className="text-xs text-gray-500">Alert</p>
              </div>
            )}

            {/* Archivia / Ripristina */}
            {!isArchiviato && (
              <button
                onClick={() => toggleArchiviaCliente(selectedCliente, true)}
                className="flex items-center gap-2 px-3 py-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 text-sm transition-colors"
                title="Archivia cliente"
              >
                <Archive className="w-4 h-4" />
                Archivia
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Banner archiviato */}
      {isArchiviato && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-800">
            <Archive className="w-5 h-5" />
            <span className="font-medium">Cliente archiviato</span>
            <span className="text-sm">— Consultazione in sola lettura. Modifica disabilitata.</span>
          </div>
          <button
            onClick={() => toggleArchiviaCliente(selectedCliente, false)}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Ripristina
          </button>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 bg-white border rounded-lg p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              // Reset stati di navigazione interna delle tab
              setChecklistIncaricoAperto(null);
              setDettaglioIncarico(null);
              setCreatingIncarico(false);
              setCreatedIncaricoId(null);
              setShowClienteWizard(false);
              setExpandedEvent(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="bg-gray-200 text-gray-700 text-xs px-1.5 py-0.5 rounded-full">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white border rounded-lg p-6">
        {activeTab === 'anagrafica' && !showClienteWizard && (
          <ClienteDettaglioView
            cliente={(enrichedCliente || selectedCliente) as any}
            titolariEffettivi={titolari as any}
            incarichiCliente={incarichi}
            showHeader={false}
            hideIncarichi
            onModifica={isArchiviato ? undefined : () => setShowClienteWizard(true)}
            onCestina={async () => {
              if (!selectedCliente) return;
              // Anagrafiche collegate SOLO a questo cliente (candidate) e quelle
              // condivise con altri clienti (che restano intatte).
              const [esclusive, condivise] = await Promise.all([
                anagraficheEsclusiveCliente(selectedCliente.id),
                anagraficheCondiviseCliente(selectedCliente.id),
              ]);
              const clausola = await clausolaRecuperoCestino();
              const ok = await confirm({
                message: (
                  <>
                    Spostare il cliente "{selectedCliente.ragione_sociale}" e tutto il suo fascicolo nel cestino? {clausola}
                    {condivise.length > 0 && (
                      <span className="mt-2 flex items-start gap-1.5 text-blue-700">
                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>
                          {condivise.length === 1
                            ? '1 anagrafica collegata anche ad altri clienti resterà intatta.'
                            : `${condivise.length} anagrafiche collegate anche ad altri clienti resteranno intatte.`}
                        </span>
                      </span>
                    )}
                  </>
                ),
                variant: 'danger',
                confirmText: 'Sposta nel cestino',
              });
              if (!ok) return;
              // Conferma UNICA per tutte le anagrafiche esclusive.
              let includiAnagrafiche = false;
              if (esclusive.length > 0) {
                const nomi = esclusive.map(e => e.nome_cognome).filter(Boolean).join(', ');
                const uno = esclusive.length === 1;
                includiAnagrafiche = await confirm({
                  message: `${uno ? "C'è 1 anagrafica collegata" : `Ci sono ${esclusive.length} anagrafiche collegate`} solo a questo cliente:\n${nomi}\n\nVuoi spostare nel cestino anche quest${uno ? 'a' : 'e'}? Le anagrafiche collegate anche ad altri clienti restano.`,
                  confirmText: uno ? "Sì, anche l'anagrafica" : 'Sì, anche le anagrafiche',
                  cancelText: 'No, solo il cliente',
                });
              }
              try {
                await spostaNelCestino('cliente', selectedCliente.id, includiAnagrafiche);
                toast.success('Cliente spostato nel cestino');
                setSelectedCliente(null);
                loadClienti();
              } catch (err: any) {
                toast.error(err?.message || 'Errore nello spostamento nel cestino');
              }
            }}
          />
        )}

        {activeTab === 'anagrafica' && showClienteWizard && (
          <ClienteWizard
            clienteId={selectedCliente.id}
            onComplete={async () => {
              setShowClienteWizard(false);
              await loadClienti();
              // Ricarica il cliente aggiornato
              const { data } = await supabase
                .from('clienti')
                .select('*')
                .eq('id', selectedCliente.id)
                .single();
              if (data) setSelectedCliente(data);
              loadFascicoloData(selectedCliente.id);
            }}
            onCancel={() => setShowClienteWizard(false)}
          />
        )}

        {activeTab === 'titolari' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Titolari Effettivi</h3>
            {titolari.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {selectedCliente.tipo_cliente === 'persona_fisica'
                  ? 'Per le persone fisiche il TE coincide con il cliente.'
                  : 'Nessun titolare effettivo registrato. Inserire tramite modifica anagrafica.'}
              </div>
            ) : (
              <div className="space-y-3">
                {titolari.map(te => (
                  <button
                    key={te.id}
                    onClick={async () => {
                      if (isArchiviato || !te.persona_id) return;
                      const { data } = await supabase.from('anagrafica_soggetti').select('*').eq('id', te.persona_id).single();
                      if (data) setEditingPersona(data);
                    }}
                    disabled={isArchiviato || !te.persona_id}
                    className={`w-full text-left border rounded-lg p-4 transition-colors ${te.is_pep ? 'border-red-300 bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'} ${isArchiviato ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <User className="w-5 h-5 text-green-600" />
                          <span className="font-medium">{te.nome_cognome}</span>
                          {te.is_pep && (
                            <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded font-bold">PPE: {te.pep_carica}</span>
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-gray-600">
                          <span>CF: {te.codice_fiscale}</span>
                          {te.documento_tipo ? (() => {
                            const scad = normalizeDate(te.documento_scadenza);
                            return <span>Doc: {te.documento_tipo}{scad ? ` (scad. ${scad})` : ''}</span>;
                          })() : <></>}
                        </div>
                        {te.note_quota && (
                          <div className="mt-2 text-sm text-gray-500">
                            <span className="font-medium text-gray-600">Note:</span> {te.note_quota}
                          </div>
                        )}
                      </div>
                      {!isArchiviato && te.persona_id && <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 self-center" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {/* Modale Modifica Anagrafica */}
            {editingPersona && (
              <PersonaModal
                persona={editingPersona}
                onClose={() => setEditingPersona(null)}
                onSaved={() => {
                  setEditingPersona(null);
                  if (selectedCliente) loadFascicoloData(selectedCliente.id);
                }}
              />
            )}
          </div>
        )}

        {activeTab === 'incarichi' && (
          <div className="space-y-4">
            {evaluatingIncaricoId ? (
              /* ---- VALUTAZIONE RISCHIO INLINE ---- */
              <ValutazioneRischioForm
                incaricoId={evaluatingIncaricoId}
                clienti={clienti}
                incarichi={incarichi}
                cancelLabel="Torna al Dettaglio"
                onCancel={() => setEvaluatingIncaricoId(null)}
                onSave={async () => {
                  setEvaluatingIncaricoId(null);
                  if (selectedCliente) await loadFascicoloData(selectedCliente.id);
                  if (dettaglioIncarico) await handleOpenDettaglio(dettaglioIncarico.id);
                }}
              />
            ) : dettaglioIncarico ? (
              /* ---- DETTAGLIO / MODIFICA INCARICO ---- */
              <div className="space-y-4">
                <DettaglioIncaricoPage
                  incarico={dettaglioIncarico}
                  valutazioni={valutazioni}
                  clienteNome={selectedCliente?.ragione_sociale}
                  onBack={() => setDettaglioIncarico(null)}
                  onSaved={async () => {
                    await handleOpenDettaglio(dettaglioIncarico.id);
                    if (selectedCliente) loadFascicoloData(selectedCliente.id);
                  }}
                  onAggiungiValutazione={isArchiviato || dettaglioIncarico.archiviato ? undefined : () => {
                    setEvaluatingIncaricoId(dettaglioIncarico.id);
                  }}
                  readOnly={isArchiviato || !!dettaglioIncarico.archiviato}
                />
              </div>
            ) : creatingIncarico ? (
              /* ---- CREAZIONE NUOVO INCARICO ---- */
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">
                    {createdIncaricoId ? 'Incarico Creato' : 'Nuovo Incarico'}
                  </h3>
                  <button
                    onClick={createdIncaricoId ? handleFinishNuovoIncarico : resetNuovoIncarico}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    {createdIncaricoId ? 'Torna alla Lista' : 'Annulla'}
                  </button>
                </div>

                <div className="border rounded-lg p-6 bg-white">
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Dati Incarico</h4>
                  <fieldset disabled={!!createdIncaricoId} className={createdIncaricoId ? 'opacity-50 pointer-events-none' : ''}>
                    <div className="space-y-4">
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
                                  if (!selectedCliente) return;
                                  const cfPiva = selectedCliente.codice_fiscale || selectedCliente.partita_iva || '';
                                  const codice = await generateCodiceIncarico(formatoIncarico, selectedCliente.ragione_sociale, undefined, selectedCliente.id, cfPiva);
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
                            value={newIncarico.data_inizio.includes('/') && newIncarico.data_inizio.length === 10 ? formatDateInv(newIncarico.data_inizio) : newIncarico.data_inizio}
                            onChange={(e) => {
                              const data = formatDateWizard(e.target.value);
                              setNewIncarico({ ...newIncarico, data_inizio: data });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Tipologia Prestazione *
                        </label>
                        <PrestazioniSelectInline
                          value={newIncarico.tipologia_prestazione_id}
                          onChange={(v) => setNewIncarico({ ...newIncarico, tipologia_prestazione_id: v ?? '' })}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Descrizione</label>
                        <input
                          type="text"
                          value={newIncarico.descrizione}
                          onChange={(e) => setNewIncarico({ ...newIncarico, descrizione: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Breve descrizione dell'incarico"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Scopo e Natura dell'Incarico</label>
                        <textarea
                          value={newIncarico.scopo_natura}
                          onChange={(e) => setNewIncarico({ ...newIncarico, scopo_natura: e.target.value })}
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Descrivere scopo e natura della prestazione professionale..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Importo Stimato (€)</label>
                        <input
                          type="text"
                          value={importoFormattato}
                          onChange={(e) => {
                            setImportoFormattato(e.target.value);
                            const cleaned = e.target.value.replace(/\./g, '').replace(',', '.');
                            const parsed = parseFloat(cleaned);
                            setNewIncarico({ ...newIncarico, importo_stimato: isNaN(parsed) ? 0 : parsed });
                          }}
                          onBlur={(e) => {
                            const cleaned = e.target.value.replace(/\./g, '').replace(',', '.');
                            const num = parseFloat(cleaned);
                            if (!isNaN(num) && num > 0) {
                              setImportoFormattato(num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            } else {
                              setImportoFormattato('');
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="10.000,00"
                        />
                        <p className="text-xs text-gray-500 mt-1">Formato: 10.000,00 (punto per migliaia, virgola per decimali)</p>
                      </div>

                      {/* Campi AV.4 */}
                      <div className="border-t pt-4 mt-4">
                        <h4 className="text-md font-semibold text-gray-900 mb-4">Dati per Dichiarazione Cliente (AV.4)</h4>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Relazioni tra Cliente e Titolari Effettivi</label>
                            <textarea
                              value={newIncarico.relazioni_cliente_te}
                              onChange={(e) => setNewIncarico({ ...newIncarico, relazioni_cliente_te: e.target.value })}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Descrivere i rapporti tra il cliente e i titolari effettivi..."
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Provenienza dei Fondi</label>
                            <input
                              type="text"
                              value={newIncarico.provenienza_fondi}
                              onChange={(e) => setNewIncarico({ ...newIncarico, provenienza_fondi: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Es: Reddito da lavoro, attività imprenditoriale, patrimonio familiare..."
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Mezzi di Pagamento Previsti</label>
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
                              id="fc_conferma_fondi"
                              checked={newIncarico.conferma_fondi_leciti}
                              onChange={(e) => setNewIncarico({ ...newIncarico, conferma_fondi_leciti: e.target.checked })}
                              className="mt-1 mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <label htmlFor="fc_conferma_fondi" className="text-sm text-gray-700">
                              <span className="font-medium">Conferma Provenienza Lecita dei Fondi</span>
                              <p className="text-xs text-gray-500 mt-1">Il cliente dichiara che i fondi provengono da attività lecite</p>
                            </label>
                          </div>
                        </div>
                      </div>
                      {!createdIncaricoId && (
                        <div className="flex justify-end">
                          <button
                            onClick={handleCreateIncarico}
                            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            <Save className="w-4 h-4" />
                            Crea Incarico
                          </button>
                        </div>
                      )}
                    </div>
                  </fieldset>
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
                {createdIncaricoId && selectedCliente && (
                  <DocumentiAllegati
                    clienteId={selectedCliente.id}
                    incaricoId={createdIncaricoId}
                    onDocumentiChange={() => {}}
                    personaIds={personaIds}
                  />
                )}

                {createdIncaricoId && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleFinishNuovoIncarico}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Torna alla Lista Incarichi
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* ---- LISTA INCARICHI ---- */
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Incarichi e Valutazioni Rischio</h3>
                  {!isArchiviato && (
                    <button
                      onClick={() => setCreatingIncarico(true)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Nuovo Incarico
                    </button>
                  )}
                </div>
                {incarichi.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">Nessun incarico registrato.</div>
                ) : (
                  <div className="space-y-2">
                    {incarichi.map(inc => {
                      const valIncarico = valutazioni.filter(v => v.incarico_id === inc.id);
                      const ultimaVal = valIncarico[0];
                      const incArchiviato = !!inc.archiviato;
                      return (
                        <div
                          key={inc.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleOpenDettaglio(inc.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleOpenDettaglio(inc.id);
                            }
                          }}
                          className={`border rounded-lg p-4 transition-colors cursor-pointer ${incArchiviato ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300' : 'hover:border-blue-300 hover:bg-blue-50'}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{inc.codice_incarico} - {getPrestazione(inc.tipologia_prestazione_id)?.label || inc.tipologia_prestazione_id || inc.descrizione}</p>
                              <p className="text-sm text-gray-500">
                                {inc.scopo_natura} | {formatDate(inc.data_inizio)}{inc.data_fine ? ` - ${formatDate(inc.data_fine)}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {incArchiviato && (
                                <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700">
                                  Archiviato
                                </span>
                              )}
                              <span className={`text-xs px-2 py-1 rounded ${
                                inc.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {statusLabel(inc.status)}
                              </span>
                              <FileText className="w-4 h-4 text-gray-400" />
                            </div>
                          </div>
                          {ultimaVal && (
                            <div className="mt-3 bg-gray-50 rounded p-3">
                              <div className="flex items-center gap-4 text-sm">
                                <span>R. Inerente: <strong>{ultimaVal.rischio_inerente_prestazione}</strong></span>
                                <span>R. Specifico: <strong>{ultimaVal.rischio_specifico}</strong></span>
                                <span>R. Effettivo: <strong>{ultimaVal.rischio_effettivo}</strong></span>
                                <RiskBadge score={ultimaVal.rischio_effettivo} />
                                {ultimaVal.prossimo_controllo && (
                                  <span className="flex items-center gap-1 text-gray-500">
                                    <Calendar className="w-3 h-3" />
                                    Prossimo controllo: {formatDate(ultimaVal.prossimo_controllo)}
                                  </span>
                                )}
                              </div>
                              {ultimaVal.misure_applicate && (
                                <p className="text-xs text-gray-600 mt-1">Misure: {ultimaVal.misure_applicate}</p>
                              )}
                            </div>
                          )}
                          {/* Azioni: download documenti + archivia/ripristina */}
                          <div className="flex justify-between items-center mt-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDownloadModal(inc);
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200"
                            >
                              <Download className="w-3 h-3" />
                              Scarica Modelli
                            </button>
                            {!isArchiviato && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const msg = incArchiviato
                                    ? `Ripristinare l'incarico "${inc.codice_incarico}"?`
                                    : `Archiviare l'incarico "${inc.codice_incarico}"?`;
                                  if (!(await confirm({ message: msg, variant: 'warning', confirmText: incArchiviato ? 'Ripristina' : 'Archivia' }))) return;
                                  supabase.from('incarichi').update({ archiviato: !incArchiviato }).eq('id', inc.id).then(async () => {
                                    addUserLog(`${incArchiviato ? 'Ripristinato' : 'Archiviato'} incarico: ${inc.codice_incarico}`);
                                    // [DEPRECATED 2026-05-07] Archiviazione tracciata automaticamente dal trigger
                                    // log_storico_clienti_incarichi (migrazione 20260508000000).
                                    // await saveStoricoModifiche('incarico', inc.id, [{
                                    //   campo: 'archiviato',
                                    //   vecchio: incArchiviato ? 'true' : 'false',
                                    //   nuovo: incArchiviato ? 'false' : 'true',
                                    // }]);
                                    if (selectedCliente) loadFascicoloData(selectedCliente.id);
                                    // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB — vedi migration 20260422000000_alert_db_logic.sql
                                  });
                                }}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                                  incArchiviato
                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                }`}
                              >
                                {incArchiviato ? <RotateCcw className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                                {incArchiviato ? 'Ripristina' : 'Archivia'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'documenti' && selectedCliente && (
          <DocumentiAllegati
            clienteId={selectedCliente.id}
            incarichi={incarichi}
            onDocumentiChange={() => loadFascicoloData(selectedCliente.id)}
            readOnly={isArchiviato}
            personaIds={personaIds}
          />
        )}

        {activeTab === 'checklist' && (() => {
          // Helper per renderizzare una riga di checklist
          const isImpresa = selectedCliente?.tipo_cliente === 'impresa';
          const isPF = selectedCliente?.tipo_cliente === 'persona_fisica';
          const getCounter = (itemId: string): { done: number; total: number } | undefined => {
            if (itemId === 'cl_te_documenti' && isImpresa && titolari.length > 0) {
              return {
                done: titolari.filter(t => !!t.documento_tipo).length,
                total: titolari.length,
              };
            }
            return undefined;
          };

          const getAutoLabel = (itemId: string): string | undefined => {
            if (itemId === 'cl_atti_costitutivi' && isPF) {
              return 'Non applicabile — persona fisica';
            }
            return undefined;
          };

          const renderCheckItem = (
            item: typeof CHECKLIST_AV2[0],
            checked: boolean,
            classe: number | null,
            counter?: { done: number; total: number },
            autoLabel?: string,
          ) => {
            const required = isItemRequired(item, classe);
            const counterComplete = counter ? counter.done === counter.total && counter.total > 0 : false;
            return (
              <div key={item.id} className={`flex items-center gap-3 p-2 rounded ${
                checked ? 'bg-green-50' : required ? 'bg-red-50' : 'bg-gray-50'
              }`}>
                {checked ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                ) : (
                  <XCircle className={`w-5 h-5 flex-shrink-0 ${required ? 'text-red-500' : 'text-gray-400'}`} />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm">{item.label}</span>
                </div>
                {autoLabel && (
                  <span className="text-xs text-blue-700 bg-blue-100 font-medium flex-shrink-0 px-2 py-0.5 rounded italic">
                    {autoLabel}
                  </span>
                )}
                {counter && (
                  <span className={`text-xs font-medium flex-shrink-0 px-2 py-0.5 rounded ${
                    counterComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {counter.done}/{counter.total}
                  </span>
                )}
                {required && !checked && (
                  <span className="text-xs text-red-600 font-medium flex-shrink-0">Obbligatorio</span>
                )}
              </div>
            );
          };

          // Helper per badge percentuale colorato
          const pctBg = (pct: number) =>
            pct >= 80 ? 'bg-green-100 text-green-700' : pct >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';

          // ---- VISTA DETTAGLIO INCARICO ----
          if (checklistIncaricoAperto) {
            const incStats = completezza.perIncarico?.find(s => s.incaricoId === checklistIncaricoAperto);
            const incChecks = incaricoChecksMap.get(checklistIncaricoAperto) || {};
            const allChecks = { ...clientChecks, ...incChecks };
            const misura = incStats?.classeRischio
              ? misurePerClasse.find((m: any) => m.grade === incStats.classeRischio)
              : null;

            return (
              <div className="space-y-5">
                {/* Header con torna indietro */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setChecklistIncaricoAperto(null)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="flex-1">
                    <h3 className="text-lg font-medium">{incStats?.codiceIncarico} — {incStats?.descrizione}</h3>
                    <p className="text-sm text-gray-500">Check-list AV.2</p>
                  </div>
                  {incStats && (
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-sm font-bold px-2 py-1 rounded ${pctBg(incStats.percentuale)}`}>
                        Obbligatori: {incStats.completati}/{incStats.totali} ({incStats.percentuale}%)
                      </span>
                      <span className="text-sm text-gray-500">
                        Totale: {incStats.completatiTotali}/{incStats.totaliAssoluti}
                      </span>
                    </div>
                  )}
                </div>

                {/* Label normativo */}
                {incStats?.classeRischio ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
                    <strong>Adeguata verifica {({ 1: 'Semplificata', 2: 'Semplificata', 3: 'Ordinaria', 4: 'Rafforzata' } as Record<number, string>)[incStats.classeRischio] || incStats.misureLabel} (Classe {incStats.classeRischio}) — da ultima valutazione del rischio</strong>
                    <span className="block text-xs text-blue-600 mt-0.5">
                      Gli adempimenti obbligatori sono calibrati in base alla classe di rischio effettivo risultante dalla valutazione, ai sensi degli artt. 23-25 D.Lgs. 231/2007 e delle Regole Tecniche CNDCEC 2025, RT2.
                    </span>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                    <strong>Nessuna valutazione del rischio effettuata</strong>
                    <span className="block text-xs text-amber-600 mt-0.5">
                      La checklist è impostata sui requisiti minimi dell'adeguata verifica semplificata (Classe 1). Effettuare la valutazione del rischio per adeguare gli obblighi.
                      <br />Rif.: D.Lgs. 231/2007, art. 23; Regole Tecniche CNDCEC 2025, RT2.
                    </span>
                  </div>
                )}

                {/* Lista unica di tutti gli item */}
                <div className="space-y-1">
                  {CHECKLIST_AV2.map(item => renderCheckItem(item, allChecks[item.id] || false, incStats?.classeRischio ?? null, getCounter(item.id), getAutoLabel(item.id)))}
                </div>

                {/* Pannello misure applicabili */}
                {misura && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-indigo-800 mb-2">
                      Misure applicabili — Classe {incStats?.classeRischio} ({misura.label})
                    </h4>
                    <ul className="space-y-1">
                      {misura.checklist?.map((item: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-indigo-700">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          }

          // ---- VISTA LISTA ----
          return (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-medium">Check-list Fascicolo (AV.2)</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Verifica della completezza del fascicolo secondo l'Allegato AV.2 delle Linee Guida CNDCEC.
                </p>
              </div>

              {completezza.perIncarico.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Nessun incarico attivo. Creare un incarico per visualizzare la checklist.</p>
              ) : (
                <div className="space-y-2">
                  {completezza.perIncarico.map(inc => (
                    <button
                      key={inc.incaricoId}
                      onClick={() => setChecklistIncaricoAperto(inc.incaricoId)}
                      className="w-full text-left border rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{inc.codiceIncarico} — {inc.descrizione}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            {inc.classeRischio && (
                              <span>Classe {inc.classeRischio} · {inc.misureLabel}</span>
                            )}
                            {inc.prossimoControllo && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Prox: {formatDateWizard(inc.prossimoControllo)}
                              </span>
                            )}
                            {!inc.classeRischio && <span className="italic">Nessuna valutazione</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`text-sm font-bold px-2 py-0.5 rounded ${pctBg(inc.percentuale)}`}>
                            {inc.completati}/{inc.totali} ({inc.percentuale}%)
                          </span>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {activeTab === 'timeline' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Timeline Incarichi</h3>
            {incarichi.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Nessun incarico registrato.</div>
            ) : (
              <div className="space-y-5">
                {[...incarichi]
                  .sort((a, b) => new Date(a.created_at ?? a.data_inizio).getTime() - new Date(b.created_at ?? b.data_inizio).getTime())
                  .map(inc => {
                    const valIncarico = valutazioni
                      .filter(v => v.incarico_id === inc.id)
                      .sort((a, b) => new Date(a.data_valutazione).getTime() - new Date(b.data_valutazione).getTime());
                    const controlliIncarico = controlli
                      .filter(c => c.incarico_id === inc.id)
                      .sort((a, b) => new Date(a.data_controllo).getTime() - new Date(b.data_controllo).getTime());
                    const ultimaVal = valIncarico[valIncarico.length - 1];

                    // Calcolo scadenza corrente
                    let scadenzaDate: Date | null = null;
                    let periodicitaMesi: number | null = null;
                    let tipoVerifica: string | null = null;
                    if (ultimaVal) {
                      const cl = classificaRischioEffettivo(ultimaVal.rischio_effettivo);
                      periodicitaMesi = cl.periodicitaControlloMesi;
                      tipoVerifica = cl.tipoVerifica;
                      scadenzaDate = ultimaVal.prossimo_controllo
                        ? new Date(ultimaVal.prossimo_controllo)
                        : (() => { const d = new Date(ultimaVal.data_valutazione); d.setMonth(d.getMonth() + cl.periodicitaControlloMesi); return d; })();
                    } else if (inc.data_inizio) {
                      scadenzaDate = new Date(inc.data_inizio);
                      scadenzaDate.setMonth(scadenzaDate.getMonth() + 36);
                      periodicitaMesi = 36;
                    }

                    const today = new Date();
                    const isScaduta = scadenzaDate ? scadenzaDate < today : false;
                    const isVicina = scadenzaDate && !isScaduta
                      ? (scadenzaDate.getTime() - today.getTime()) < 60 * 24 * 3600 * 1000
                      : false;

                    const classeColors: Record<number, { dot: string; chip: string }> = {
                      1: { dot: 'bg-green-500', chip: 'bg-green-100 text-green-800 border-green-300' },
                      2: { dot: 'bg-teal-500',  chip: 'bg-teal-100 text-teal-800 border-teal-300' },
                      3: { dot: 'bg-orange-500', chip: 'bg-orange-100 text-orange-800 border-orange-300' },
                      4: { dot: 'bg-red-500',    chip: 'bg-red-100 text-red-800 border-red-300' },
                    };

                    type TLEvent = {
                      key: string;
                      date: Date;
                      label: string;
                      sublabel?: string;
                      chipClass: string;
                      dotClass: string;
                      dashed?: boolean;
                      ringClass?: string;
                      isRenewal?: boolean;
                      details: Record<string, string | undefined>;
                    };
                    const events: TLEvent[] = [];

                    // 1. Apertura
                    events.push({
                      key: `${inc.id}_open`,
                      date: new Date(inc.data_inizio ?? inc.created_at),
                      label: 'Apertura',
                      chipClass: 'bg-blue-100 text-blue-800 border-blue-300',
                      dotClass: 'bg-blue-500',
                      details: {
                        'Codice incarico': inc.codice_incarico,
                        'Descrizione': inc.descrizione || undefined,
                        'Tipologia prestazione': inc.tipologia_prestazione_id || undefined,
                        'Scopo / Natura': inc.scopo_natura || undefined,
                        'Data inizio': formatDate(inc.data_inizio),
                        'Registrato il': formatDateTime(inc.created_at ?? inc.data_inizio),
                        'Importo stimato': inc.importo_stimato ? `€ ${inc.importo_stimato.toLocaleString('it-IT')}` : undefined,
                        'Mezzi pagamento': inc.mezzi_pagamento || undefined,
                        'Provenienza fondi': inc.provenienza_fondi || undefined,
                      },
                    });

                    // 2. Valutazioni rischio + scadenze storiche intermedie
                    valIncarico.forEach((v, vi) => {
                      const cl = classificaRischioEffettivo(v.rischio_effettivo);
                      const cc = classeColors[cl.classe] ?? { dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-700 border-gray-300' };

                      // Calcolo scadenza della valutazione PRECEDENTE per rilevare rinnovi
                      let prevScadenza: Date | null = null;
                      if (vi > 0) {
                        const prevVal = valIncarico[vi - 1];
                        const prevCl = classificaRischioEffettivo(prevVal.rischio_effettivo);
                        prevScadenza = prevVal.prossimo_controllo
                          ? new Date(prevVal.prossimo_controllo)
                          : (() => { const d = new Date(prevVal.data_valutazione); d.setMonth(d.getMonth() + prevCl.periodicitaControlloMesi); return d; })();
                      } else if (inc.data_inizio) {
                        // Scadenza implicita iniziale (36 mesi da apertura)
                        prevScadenza = new Date(inc.data_inizio);
                        prevScadenza.setMonth(prevScadenza.getMonth() + 36);
                      }

                      const valDate = new Date(v.data_valutazione ?? v.created_at);//
                      const isAfterExpiry = prevScadenza && valDate > prevScadenza;
                      const isRenewal = vi > 0; // qualsiasi valutazione successiva alla prima è un rinnovo/revisione

                      // Se la valutazione precedente aveva una scadenza e questa è passata, inserisco un marker storico
                      if (prevScadenza && vi > 0) {
                        const prevExpired = prevScadenza < valDate;
                        events.push({
                          key: `${inc.id}_scad_hist_${vi}`,
                          date: prevScadenza,
                          label: prevExpired ? 'Scadenza superata' : 'Scadenza',
                          sublabel: prevExpired ? 'in ritardo' : 'rispettata',
                          chipClass: prevExpired
                            ? 'bg-red-50 text-red-600 border-red-300'
                            : 'bg-gray-100 text-gray-500 border-gray-300',
                          dotClass: prevExpired ? 'bg-red-400' : 'bg-gray-400',
                          dashed: true,
                          ringClass: prevExpired ? 'ring-red-300' : 'ring-gray-300',
                          details: {
                            'Data scadenza prevista': formatDate(prevScadenza.toISOString()),
                            'Esito': prevExpired ? 'Scadenza superata — revisione effettuata in ritardo' : 'Revisione effettuata entro i termini',
                          },
                        });
                      }

                      events.push({
                        key: `${inc.id}_val_${vi}`,
                        date: valDate,
                        label: isRenewal ? `Revisione Cl.${cl.classe}` : `Valutazione Cl.${cl.classe}`,
                        sublabel: isAfterExpiry ? 'post-scadenza' : undefined,
                        chipClass: cc.chip,
                        dotClass: cc.dot,
                        isRenewal,
                        details: {
                          'Data valutazione': formatDate(v.data_valutazione ?? v.created_at),// 
                          'Tipo': isRenewal ? 'Revisione / Rinnovo' : 'Valutazione iniziale',
                          'Classe rischio': `Classe ${cl.classe} – ${cl.label}`,
                          'Tipo verifica': cl.tipoVerifica,
                          'Rischio inerente': String(v.rischio_inerente_prestazione),
                          'Rischio specifico': String(v.rischio_specifico),
                          'Rischio effettivo': String(v.rischio_effettivo),
                          'Misure applicate': v.misure_applicate || undefined,
                          'Note': v.note || undefined,
                          'Prossimo controllo': v.prossimo_controllo ? formatDate(v.prossimo_controllo) : undefined,
                        },
                      });
                    });

                    // 3. Controlli costanti
                    controlliIncarico.forEach((c, ci) => {
                      const ok = c.esito === 'regolare' || c.esito === 'ok';
                      events.push({
                        key: `${inc.id}_ctrl_${ci}`,
                        date: new Date(c.data_controllo),
                        label: 'Controllo',
                        chipClass: ok ? 'bg-green-100 text-green-800 border-green-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300',
                        dotClass: ok ? 'bg-green-500' : 'bg-yellow-500',
                        details: {
                          'Data controllo': formatDate(c.data_controllo),
                          'Tipologia': c.tipologia || undefined,
                          'Esito': c.esito,
                          'Anomalie rilevate': c.anomalie_rilevate ? JSON.stringify(c.anomalie_rilevate) : undefined,
                          'Prossima scadenza': c.prossima_scadenza ? formatDate(c.prossima_scadenza) : undefined,
                        },
                      });
                    });

                    // 4. Chiusura (se presente)
                    if (inc.data_fine) {
                      events.push({
                        key: `${inc.id}_close`,
                        date: new Date(inc.data_fine),
                        label: 'Chiusura',
                        chipClass: 'bg-gray-100 text-gray-700 border-gray-300',
                        dotClass: 'bg-gray-400',
                        details: {
                          'Data chiusura': formatDate(inc.data_fine),
                          'Status finale': inc.status,
                        },
                      });
                    }

                    // 5. Prossima scadenza (nodo futuro, tratteggiato)
                    if (scadenzaDate && !inc.data_fine) {
                      events.push({
                        key: `${inc.id}_scad`,
                        date: scadenzaDate,
                        label: isScaduta ? 'Scaduta' : 'Prossima verifica',
                        sublabel: isScaduta ? 'azione richiesta' : isVicina ? 'in scadenza' : undefined,
                        chipClass: isScaduta
                          ? 'bg-red-100 text-red-800 border-red-400'
                          : isVicina
                          ? 'bg-yellow-100 text-yellow-800 border-yellow-400'
                          : 'bg-blue-50 text-blue-700 border-blue-300',
                        dotClass: isScaduta ? 'bg-red-500' : isVicina ? 'bg-yellow-400' : 'bg-blue-300',
                        dashed: true,
                        ringClass: isScaduta ? 'ring-red-400' : isVicina ? 'ring-yellow-400' : 'ring-blue-300',
                        details: {
                          'Data scadenza': formatDate(scadenzaDate.toISOString()),
                          'Tipo verifica': tipoVerifica ?? undefined,
                          'Periodicità': periodicitaMesi ? `ogni ${periodicitaMesi} mesi` : undefined,
                          'Nota': isScaduta ? 'Verifica scaduta — aggiornare la valutazione rischio.' : undefined,
                        },
                      });
                    }

                    events.sort((a, b) => a.date.getTime() - b.date.getTime());

                    const scadenzaBadgeClass = isScaduta
                      ? 'bg-red-100 text-red-700'
                      : isVicina
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-blue-50 text-blue-700';

                    const openEvent = events.find(e => expandedEvent === e.key) ?? null;

                    return (
                      <div key={inc.id} className="border rounded-lg p-3">
                        {/* Header incarico - compatto */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${
                              inc.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {inc.status}
                            </span>
                            <span className="font-semibold text-sm text-gray-800">{inc.codice_incarico}</span>
                            {inc.descrizione && <span className="text-xs text-gray-400 hidden sm:inline">— {inc.descrizione}</span>}
                          </div>
                          {scadenzaDate && !inc.data_fine && (
                            <span className={`text-[10px] px-2 py-0.5 rounded font-medium flex-shrink-0 ${scadenzaBadgeClass}`}>
                              {isScaduta ? '⚠ Scaduta' : isVicina ? '⏰ Scade' : 'Verifica:'}{' '}
                              {formatDate(scadenzaDate.toISOString())}
                            </span>
                          )}
                        </div>

                        {/* Timeline orizzontale compatta */}
                        <div className="overflow-x-auto -mx-1 px-1">
                          <div className="inline-flex items-center min-w-full py-1">
                            {events.map((ev, idx) => {
                              const isOpen = expandedEvent === ev.key;
                              const isLast = idx === events.length - 1;
                              return (
                                <div key={ev.key} className="inline-flex items-center flex-shrink-0">
                                  {/* Nodo evento: dot + label sotto, layout verticale centrato */}
                                  <button
                                    onClick={() => setExpandedEvent(isOpen ? null : ev.key)}
                                    className="flex flex-col items-center gap-0.5 group relative"
                                    title={`${ev.label} — ${formatDate(ev.date.toISOString())}`}
                                  >
                                    {/* Dot */}
                                    <div className={`w-3 h-3 rounded-full flex-shrink-0 transition-transform group-hover:scale-125 ${ev.dotClass} ${
                                      ev.dashed ? `opacity-80 ring-[1.5px] ring-offset-1 ${ev.ringClass ?? ''}` : ''
                                    } ${isOpen ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}>
                                      {ev.isRenewal && (
                                        <RotateCcw className="w-2 h-2 text-white m-[2px]" />
                                      )}
                                    </div>
                                    {/* Label + data compatta */}
                                    <span className={`text-[11px] font-medium leading-tight text-center max-w-[90px] truncate ${
                                      ev.dashed ? (ev.chipClass.includes('red') ? 'text-red-600' : 'text-gray-400') : 'text-gray-600'
                                    }`}>
                                      {ev.label}
                                    </span>
                                    <span className="text-[10px] text-gray-400 leading-none">
                                      {ev.date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                    </span>
                                    {ev.sublabel && (
                                      <span className={`text-[9px] font-medium leading-none ${
                                        ev.sublabel === 'in ritardo' || ev.sublabel === 'azione richiesta' || ev.sublabel === 'post-scadenza'
                                          ? 'text-red-500'
                                          : ev.sublabel === 'in scadenza' ? 'text-yellow-600' : 'text-green-600'
                                      }`}>
                                        {ev.sublabel}
                                      </span>
                                    )}
                                  </button>
                                  {/* Connettore orizzontale */}
                                  {!isLast && (
                                    <div className={`self-start mt-[4px] min-w-[20px] flex-1 ${
                                      events[idx + 1]?.dashed ? 'border-t border-dashed border-gray-300' : 'h-px bg-gray-300'
                                    }`} style={{ width: 'clamp(20px, 3vw, 48px)' }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Pannello dettagli compatto */}
                        {openEvent && (
                          <div className="mt-2 p-2.5 bg-gray-50 border border-gray-200 rounded text-xs">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${openEvent.chipClass} ${openEvent.dashed ? 'border-dashed' : ''}`}>
                                  {openEvent.isRenewal && <RotateCcw className="w-3 h-3 mr-0.5" />}
                                  {openEvent.label}
                                </span>
                                <span className="text-xs text-gray-400">{formatDate(openEvent.date.toISOString())}</span>
                              </div>
                              <button
                                onClick={() => setExpandedEvent(null)}
                                className="text-gray-400 hover:text-gray-600 text-xs"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                              {Object.entries(openEvent.details).map(([k, v]) =>
                                v !== undefined ? (
                                  <div key={k} className="flex gap-1.5 text-xs">
                                    <span className="font-medium text-gray-400 min-w-[120px] flex-shrink-0">{k}:</span>
                                    <span className="text-gray-700">{v}</span>
                                  </div>
                                ) : null
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

          </div>
        )}

        {activeTab === 'alert' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Alert e Scadenze</h3>
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Nessun alert per questo cliente.</div>
            ) : (
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div key={alert.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                    alert.status === 'open'
                      ? alert.priorita === 'high' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`w-4 h-4 ${
                        alert.status === 'open' ? 'text-red-500' : 'text-gray-400'
                      }`} />
                      <div>
                        <p className="text-sm font-medium">[{alert.tipo_rt}] {alert.messaggio}</p>
                        <p className="text-xs text-gray-500">{formatDate(alert.created_at)}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      alert.status === 'open' ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800'
                    }`}>
                      {alert.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modale download documenti incarico */}
      {downloadModalIncarico && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black bg-opacity-30" onClick={() => !isGeneratingDOCX && setDownloadModalIncarico(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Scarica Modelli</h3>
                <p className="text-sm text-gray-500 mt-0.5">{downloadModalIncarico.codice_incarico}</p>
              </div>
              <button
                onClick={() => setDownloadModalIncarico(null)}
                disabled={isGeneratingDOCX}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Indicatore step (1 di 2 / 2 di 2) */}
            <div className="flex items-center gap-2 px-5 pb-3 flex-shrink-0">
              <div className={`flex-1 h-1 rounded-full ${downloadView === 'allegati' ? 'bg-blue-500' : 'bg-blue-200'}`} />
              <div className={`flex-1 h-1 rounded-full ${downloadView === 'modulo' ? 'bg-blue-500' : 'bg-gray-200'}`} />
            </div>

            <div className="flex-1 overflow-y-auto">
            {/* VISTA 1 — Allegati */}
            {downloadView === 'allegati' && (
            <div className="px-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">1</span>
                <p className="text-sm font-semibold text-gray-700">Allegati <span className="text-gray-400 font-normal">(opzionale)</span></p>
              </div>
              <div className="text-xs text-gray-500 mb-2 ml-8">
                <p className="mb-1">Cosa succede ai documenti selezionati:</p>
                <ul className="list-disc pl-5 pr-5 space-y-0.5">
                  <li>Vengono elencati come allegati nei moduli che lo prevedono (<span className="font-semibold text-gray-700">AV.3</span>, <span className="font-semibold text-gray-700">AV.5</span>, <span className="font-semibold text-gray-700">AV.6</span>).</li>
                  <li>Se in formato digitale, vengono inclusi in un archivio <span className="font-semibold text-gray-700">.zip</span> insieme al modulo.</li>
                  <li>I documenti contrassegnati come <span className="font-semibold text-gray-700">Cartaceo</span> vengono solo citati nell'elenco del modulo: non essendo in formato digitale, non possono essere inclusi nell'archivio .zip.</li>
                </ul>
              </div>
              <div className="ml-8">
                {loadingAllegati ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento allegati...
                  </div>
                ) : allegatiIncarico.length === 0 ? (
                  <p className="text-sm text-gray-400 py-1">Nessun documento allegato disponibile per questo incarico.</p>
                ) : (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeAllegati}
                        onChange={(e) => {
                          setIncludeAllegati(e.target.checked);
                          setSelectedAllegatiIds(e.target.checked ? new Set(allegatiIncarico.map(d => d.id)) : new Set());
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Includi tutti i documenti allegati ({allegatiIncarico.length})
                        {(() => {
                          const cart = allegatiIncarico.filter(d => isCartaceo(d)).length;
                          return cart > 0 ? (
                            <span className="ml-1 text-xs font-normal text-amber-700">
                              · di cui {cart} cartace{cart === 1 ? 'o' : 'i'}
                            </span>
                          ) : null;
                        })()}
                      </span>
                    </label>
                    {!includeAllegati && (
                      <div className="ml-1 space-y-1.5 max-h-40 overflow-y-auto border-l-2 border-gray-100 pl-2 pr-1">
                        {allegatiIncarico.map(doc => {
                          const tipLabel = TIPOLOGIE_DOCUMENTO.find(t => t.value === doc.tipologia)?.label || doc.tipologia;
                          const cartaceo = isCartaceo(doc);
                          return (
                            <label key={doc.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedAllegatiIds.has(doc.id)}
                                onChange={(e) => {
                                  const next = new Set(selectedAllegatiIds);
                                  if (e.target.checked) next.add(doc.id); else next.delete(doc.id);
                                  setSelectedAllegatiIds(next);
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-600 truncate flex-1" title={`${tipLabel} — ${doc.nome_file}`}>
                                {tipLabel} — {doc.nome_file}
                              </span>
                              {cartaceo && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded flex-shrink-0" title="Documento cartaceo: apparirà solo nell'elenco del modulo DOCX, non nello ZIP">
                                  Cartaceo
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            )}

            {/* VISTA 2 — Scegli il modulo da scaricare */}
            {downloadView === 'modulo' && (
            <div className="px-5 pb-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">2</span>
                <p className="text-sm font-semibold text-gray-700">Scegli il modulo da scaricare</p>
              </div>
              <p className="text-xs text-gray-500 mb-3 ml-8">
                Clicca una delle opzioni sotto per avviare il download.
              </p>

              {/* Nota selezione allegati mantenuta */}
              {allegatiIncarico.length > 0 && (
                <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                  <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    {(() => {
                      const count = getSelectedAttachmentIds().length;
                      if (count === 0) return 'Nessun allegato selezionato.';
                      if (count === allegatiIncarico.length) return `Tutti gli allegati saranno inclusi nel download (${count}).`;
                      return `${count} ${count === 1 ? 'allegato selezionato' : 'allegati selezionati'} per il download.`;
                    })()}
                  </span>
                </div>
              )}

              {/* Adeguata Verifica — grid cards */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Adeguata Verifica</p>
              {(() => {
                const hasVal = valutazioni.some(v => v.incarico_id === downloadModalIncarico.id);
                return (
                  <div className={`mb-2 px-3 py-2 rounded-lg text-sm ${hasVal ? 'bg-gray-50 text-gray-500' : 'bg-amber-50 text-amber-700'}`}>
                    {hasVal
                      ? 'AV.1 conterrà la valutazione più recente'
                      : <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Nessuna valutazione — AV.1 verrà scaricato come modulo vuoto</span>
                    }
                  </div>
                );
              })()}
              <div className="grid grid-cols-3 gap-2">
                {([
                  { type: 'av1' as const, label: 'AV.1', desc: 'Valutazione rischio', border: 'border-indigo-200', bg: 'hover:bg-indigo-50', accent: 'text-indigo-600', iconBg: 'bg-indigo-100' },
                  { type: 'av3' as const, label: 'AV.3', desc: 'Istruttoria cliente', border: 'border-violet-200', bg: 'hover:bg-violet-50', accent: 'text-violet-600', iconBg: 'bg-violet-100' },
                  { type: 'av4' as const, label: 'AV.4', desc: 'Dichiarazione cliente', border: 'border-purple-200', bg: 'hover:bg-purple-50', accent: 'text-purple-600', iconBg: 'bg-purple-100' },
                ]).map(({ type, label, desc, border, bg, accent, iconBg }) => (
                  <button
                    key={type}
                    onClick={() => handleDownloadDOCX(downloadModalIncarico, type)}
                    disabled={isGeneratingDOCX}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border ${border} ${bg} disabled:opacity-50 transition-colors group text-center`}
                  >
                    <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center`}>
                      {isGeneratingDOCX && docxGenerationType === type ? (
                        <Loader2 className={`w-5 h-5 ${accent} animate-spin`} />
                      ) : (
                        <Download className={`w-5 h-5 ${accent}`} />
                      )}
                    </div>
                    <p className={`text-base font-semibold ${accent}`}>{label}</p>
                    <p className="text-xs text-gray-500 leading-tight">{desc}</p>
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleDownloadDOCX(downloadModalIncarico, 'all')}
                disabled={isGeneratingDOCX}
                className="w-full flex items-center justify-center gap-2 mt-2 px-4 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
              >
                {isGeneratingDOCX && docxGenerationType === 'all' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Scarica AV.1 + AV.3 + AV.4
              </button>

              {/* Attestazione / Astensione — grid cards */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2">Attestazione / Astensione</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { type: 'av5' as const, label: 'AV.5', desc: 'Attestazione professionista', border: 'border-teal-200', bg: 'hover:bg-teal-50', accent: 'text-teal-600', iconBg: 'bg-teal-100' },
                  { type: 'av6' as const, label: 'AV.6', desc: 'Dichiarazione di astensione', border: 'border-amber-200', bg: 'hover:bg-amber-50', accent: 'text-amber-600', iconBg: 'bg-amber-100' },
                ]).map(({ type, label, desc, border, bg, accent, iconBg }) => (
                  <button
                    key={type}
                    onClick={() => handleDownloadDOCX(downloadModalIncarico, type)}
                    disabled={isGeneratingDOCX}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border ${border} ${bg} disabled:opacity-50 transition-colors group text-center`}
                  >
                    <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center`}>
                      {isGeneratingDOCX && docxGenerationType === type ? (
                        <Loader2 className={`w-5 h-5 ${accent} animate-spin`} />
                      ) : (
                        <Download className={`w-5 h-5 ${accent}`} />
                      )}
                    </div>
                    <p className={`text-base font-semibold ${accent}`}>{label}</p>
                    <p className="text-xs text-gray-500 leading-tight">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
            )}
            </div>

            {/* Footer navigazione */}
            <div className="px-5 pb-5 pt-3 flex-shrink-0 border-t border-gray-100 bg-white flex items-center justify-between gap-3">
              {downloadView === 'allegati' ? (
                <>
                  <span className="text-xs text-gray-500">
                    {(() => {
                      const count = getSelectedAttachmentIds().length;
                      if (count === 0) return 'Nessun allegato selezionato';
                      if (count === 1) return '1 allegato selezionato';
                      return `${count} allegati selezionati`;
                    })()}
                  </span>
                  <button
                    onClick={() => setDownloadView('modulo')}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Continua
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setDownloadView('allegati')}
                  disabled={isGeneratingDOCX}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Indietro
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ==================== Utility Components ====================

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('it-IT');
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('it-IT');
  } catch {
    return dateStr;
  }
}

function PrestazioniSelectInline({ value, onChange }: { value: string; onChange: (v: string | null) => void }) {
  const prestazioniOrdinate = [...amlData.prestazioni_catalog].sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const [query, setQuery] = useState('');
  const filtered = query === ''
    ? prestazioniOrdinate
    : prestazioniOrdinate.filter(p => p.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <Combobox value={value} onChange={onChange}>
      <div className="relative">
        <Combobox.Button as="div" className="relative w-full cursor-pointer">
          <Combobox.Input
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
            displayValue={(id: string) => {
              const found = prestazioniOrdinate.find(p => p.id === id);
              return found ? `${found.label} (Rischio: ${found.inherentRisk})` : '';
            }}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Seleziona prestazione..."
          />
          <span className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
            <ChevronDown className="w-4 h-4 text-black" strokeWidth={3} />
          </span>
        </Combobox.Button>
        {filtered.length > 0 && (
          <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg border border-gray-200">
            {filtered.map((prest, index) => (
              <Fragment key={prest.id}>
                <Combobox.Option
                  value={prest.id}
                  className={({ active }) => `cursor-pointer select-none px-4 py-2 ${active ? 'bg-blue-100' : ''}`}
                >
                  {({ selected }) => (
                    <div className="flex items-center justify-between">
                      <span>{prest.label} (Rischio: {prest.inherentRisk})</span>
                      {selected && <Check className="w-4 h-4 text-blue-600" />}
                    </div>
                  )}
                </Combobox.Option>
                {index < filtered.length - 1 && <div className="border-t border-gray-200 mx-2" />}
              </Fragment>
            ))}
          </Combobox.Options>
        )}
      </div>
    </Combobox>
  );
}
