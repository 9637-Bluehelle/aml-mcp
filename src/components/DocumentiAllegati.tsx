/**
 * DocumentiAllegati - Componente riutilizzabile per upload e gestione documenti allegati
 *
 * Utilizzabile in qualsiasi punto del progetto dove si gestiscono incarichi.
 * Fornisce: dialog di upload, lista documenti, download e cancellazione.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Upload, Plus, X, Trash2, Download, RefreshCw, History, User, FolderOpen, ArrowRightLeft, HelpCircle } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { supabase } from '../lib/supabase';
import { validatePdfFile } from '../lib/fileValidation';
import { Spinner } from './cliente-wizard/modals/Spinner';
// import { useSystemAlerts } from './AlertPanel.tsx'; // [DEPRECATED 2026-04-22] Gestito dai trigger DB
import { useToast, useConfirm } from './Toast';
import { spostaNelCestino, clausolaRecuperoCestino } from '../lib/cestinoHelper';
import { useCestinaPermesso } from '../hooks/useCestinaPermesso';
import { formatDate } from './cliente-wizard/components/forms/PersonaFisicaForm';
import { addUserLog, logAccess } from './LogUtente';
// Enum tipologie + set scadenze: fonte di verità condivisa col server MCP (§9).
import { TIPOLOGIE_DOCUMENTO, TIPOLOGIE_CON_SCADENZA } from '../../api/_lib/documentoService';

export interface Documento {
  id: string;
  incarico_id: string | null;
  persona_id: string | null;
  tipologia: string;
  nome_file: string;
  descrizione: string;
  file_path: string;
  data_acquisizione: string;
  data_scadenza: string;
  rinnovo_di: string | null;
  incarichi?: { codice_incarico: string } | null;
  /** Nome della persona associata (riempito lato frontend quando si caricano doc persona) */
  _personaNome?: string;
}

export interface IncaricoRef {
  id: string;
  codice_incarico: string;
  descrizione: string;
}

// TIPOLOGIE_DOCUMENTO e TIPOLOGIE_CON_SCADENZA vivono ora in api/_lib/documentoService (condivisi
// col server MCP, §9). Importati sopra; TIPOLOGIE_DOCUMENTO è ri-esportato per i consumatori storici
// (docx-converter, FascicoloCliente, IncaricoDettModifica, RT3Monitoraggio).
export { TIPOLOGIE_DOCUMENTO };

/** Tipologie che appartengono al cliente (senza incarico_id) — include anche 'persona' */
const TIPOLOGIE_CLIENTE = new Set(
  TIPOLOGIE_DOCUMENTO.filter(t => t.level === 'cliente' || t.level === 'persona').map(t => t.value)
);

/** Tipologie che appartengono alla persona fisica (anagrafica) */
export const TIPOLOGIE_PERSONA = new Set(
  TIPOLOGIE_DOCUMENTO.filter(t => t.level === 'persona').map(t => t.value)
);

/** Tipologie disponibili per anagrafica di tipo azienda: persona-level + cliente-level */
export const TIPOLOGIE_AZIENDA = TIPOLOGIE_DOCUMENTO.filter(
  t => t.level === 'persona' || t.level === 'cliente'
);

/** Traduce errori dello storage Supabase in messaggi leggibili per l'utente. */
function friendlyStorageError(msg: string, fileName: string): string {
  const m = msg.toLowerCase();
  if (m.includes('row-level security') || m.includes('policy') || m.includes('restrictive')) {
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      return 'Sono ammessi solo file in formato PDF. Converti il documento e riprova.';
    }
    return 'Upload non consentito: permessi insufficienti o formato file non ammesso (solo PDF).';
  }
  if (m.includes('already exists') || m.includes('duplicate')) {
    return 'Esiste già un file con lo stesso nome. Rinominalo e riprova.';
  }
  if (m.includes('payload') || m.includes('too large') || m.includes('size')) {
    return 'File troppo grande. Riduci le dimensioni e riprova.';
  }
  return `Errore nel caricamento del file: ${msg}`;
}

interface DocumentiAllegatiProps {
  /** ID del cliente — obbligatorio tranne in modalità persona */
  clienteId?: string;
  /** Se fornito, filtra e associa i documenti a questo specifico incarico */
  incaricoId?: string;
  /** Lista di incarichi per il dropdown di selezione. Se non fornita e incaricoId è presente, il dropdown non viene mostrato */
  incarichi?: IncaricoRef[];
  /** Titolo della sezione (default: "Documenti Allegati") */
  titolo?: string;
  /** Callback chiamata dopo upload/eliminazione per ricaricare dati nel componente padre */
  onDocumentiChange?: () => void;
  /** Nasconde il bottone "Aggiungi Documento" interno (utile quando il bottone è nel Card header) */
  hideAddButton?: boolean;
  /** Ref callback per aprire il dialog di upload dall'esterno */
  onOpenUploadRef?: (fn: () => void) => void;
  /**
   * Ref callback per forzare il caricamento di un eventuale upload pendente
   * (dialog aperto con file/cartaceo selezionato ma non ancora salvato).
   * Ritorna `true` se non c'è nulla di pendente o se l'upload è andato a buon fine;
   * `false` se l'upload è pendente ma i campi obbligatori non sono validi o il salvataggio è fallito.
   */
  onFlushUploadRef?: (fn: () => Promise<boolean>) => void;
  /** When true, disables upload, renew, and delete. Download and history remain enabled. */
  readOnly?: boolean;
  /** IDs delle persone fisiche associate al cliente — i loro documenti vengono mostrati nella sezione "Documenti del Cliente" */
  personaIds?: string[];
  /** Modalità persona: mostra solo documenti di questa persona, upload va a persona_id. Nasconde checkbox cliente/incarico e bottone sposta. */
  personaId?: string;
  /** Filtra i documenti per tipologia (es. 'documento_identita'). Se non specificato, mostra tutti. */
  tipologiaFilter?: string;
  /**
   * Tipo di anagrafica quando in personaMode. 'persona_fisica' (default) vincola a
   * documento di identità singolo. 'azienda' sblocca la scelta delle tipologie
   * (persona + cliente level) e permette upload multipli.
   */
  soggettoTipo?: 'persona_fisica' | 'azienda';
  /**
   * Data di scadenza pre-compilata per il dialog di upload (formato HTML YYYY-MM-DD).
   * Quando cambia dall'esterno, sincronizza il campo "Data scadenza" del dialog.
   */
  defaultDataScadenza?: string;
}

export function DocumentiAllegati({
  clienteId = '',
  incaricoId,
  incarichi = [],
  titolo = 'Documenti Allegati',
  onDocumentiChange,
  hideAddButton = false,
  onOpenUploadRef,
  onFlushUploadRef,
  readOnly = false,
  personaIds = [],
  personaId,
  tipologiaFilter,
  soggettoTipo = 'persona_fisica',
  defaultDataScadenza,
}: DocumentiAllegatiProps) {
  const isPersonaMode = !!personaId;
  const isAziendaAnagrafica = isPersonaMode && soggettoTipo === 'azienda';
  const puoCestina = useCestinaPermesso();
  // const { checkSystemAlerts } = useSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
  const toast = useToast();
  const confirm = useConfirm();
  // In persona mode senza clienteId, risali al cliente associato per lo storage path
  const [resolvedClienteId, setResolvedClienteId] = useState(clienteId);
  useEffect(() => {
    if (clienteId) { setResolvedClienteId(clienteId); return; }
    if (!personaId) return;
    supabase.from('clienti').select('id').eq('persona_id', personaId).limit(1).maybeSingle()
      .then(({ data }) => { if (data) setResolvedClienteId(data.id); });
  }, [clienteId, personaId]);
  const [documenti, setDocumenti] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [renewingDoc, setRenewingDoc] = useState<Documento | null>(null);
  const [renewFile, setRenewFile] = useState<File | null>(null);
  const [renewScadenza, setRenewScadenza] = useState('');
  const [renewLoading, setRenewLoading] = useState(false);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [renewCartaceo, setRenewCartaceo] = useState(false);
  const [renewDescrizione, setRenewDescrizione] = useState('');
  const [movingDoc, setMovingDoc] = useState<Documento | null>(null);
  const [moveTargetIncarico, setMoveTargetIncarico] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const uploadDialogRef = useRef<HTMLDivElement>(null);
  const [personeNomi, setPersoneNomi] = useState<{ id: string; nome_cognome: string }[]>([]);
  useScrollLock(!!historyKey || showHelpModal || !!renewingDoc);

  // Carica nomi persone associate per il dropdown di selezione
  useEffect(() => {
    if (personaIds.length > 0 && !isPersonaMode) {
      supabase.from('anagrafica_soggetti').select('id, nome_cognome').in('id', personaIds)
        .then(({ data }) => setPersoneNomi(data || []));
    } else {
      setPersoneNomi([]);
    }
  }, [personaIds.join(','), isPersonaMode]);

  const defaultIncaricoId = incaricoId || (incarichi.length === 1 ? incarichi[0].id : '');

  const [uploadForm, setUploadForm] = useState({
    tipologia: 'documento_identita',
    descrizione: '',
    data_scadenza: '',
    incarico_id: defaultIncaricoId,
    is_cartaceo: false,
    is_documento_cliente: TIPOLOGIE_CLIENTE.has('documento_identita'),
    persona_id: '',
  });

  // Aggiorna default incarico_id quando cambiano le props
  useEffect(() => {
    const newDefault = incaricoId || (incarichi.length === 1 ? incarichi[0].id : '');
    if (newDefault && !uploadForm.incarico_id) {
      setUploadForm(prev => ({ ...prev, incarico_id: newDefault }));
    }
  }, [incaricoId, incarichi]);

  // Sincronizza data scadenza quando il padre la cambia (es. utente edita
  // documento_data_scadenza nella sezione Documento di Identità della modale anagrafica)
  useEffect(() => {
    if (defaultDataScadenza !== undefined) {
      setUploadForm(prev => prev.data_scadenza === defaultDataScadenza ? prev : { ...prev, data_scadenza: defaultDataScadenza });
    }
  }, [defaultDataScadenza]);

  // Auto-seleziona persona_id se c'è una sola persona e la tipologia è persona-level;
  // resetta persona_id se la tipologia non è persona-level
  useEffect(() => {
    if (isPersonaMode) return;
    if (TIPOLOGIE_PERSONA.has(uploadForm.tipologia)) {
      if (personeNomi.length === 1) {
        setUploadForm(prev => prev.persona_id !== personeNomi[0].id ? { ...prev, persona_id: personeNomi[0].id } : prev);
      }
    } else {
      setUploadForm(prev => prev.persona_id ? { ...prev, persona_id: '' } : prev);
    }
  }, [personeNomi, uploadForm.tipologia, isPersonaMode]);

  // Carica documenti
  useEffect(() => {
    if (isPersonaMode || clienteId) loadDocumenti();
  }, [clienteId, incaricoId, personaIds.join(','), personaId]);

  async function loadDocumenti() {
    setLoading(true);

    // --- Modalità persona: documenti di questa persona ---
    // Per le aziende con bridge UUID condiviso (clienti.id == anagrafica.id) i documenti
    // possono essere ancorati a `persona_id` (caricati da Anagrafica) o a `cliente_id`
    // (caricati dal Fascicolo Cliente). Li uniamo per dare la stessa vista da entrambe le parti.
    if (isPersonaMode) {
      const filterField = isAziendaAnagrafica
        ? `persona_id.eq.${personaId},cliente_id.eq.${personaId}`
        : `persona_id.eq.${personaId}`;
      let pQuery = supabase
        .from('documenti')
        .select('*, incarichi(codice_incarico)')
        .is('deleted_at', null)
        .or(filterField);
      if (tipologiaFilter) pQuery = pQuery.eq('tipologia', tipologiaFilter);
      const { data } = await pQuery
        .order('data_acquisizione', { ascending: false })
        .order('created_at', { ascending: false });
      setDocumenti(data || []);
      setLoading(false);
      return;
    }

    // --- Modalità cliente: documenti del cliente + persone associate ---
    // 1. Documenti classici legati al cliente
    let query = supabase
      .from('documenti')
      .select('*, incarichi(codice_incarico)')
      .eq('cliente_id', clienteId)
      .is('deleted_at', null)
      .order('data_acquisizione', { ascending: false })
      .order('created_at', { ascending: false });

    if (incaricoId) {
      query = query.or(`incarico_id.is.null,incarico_id.eq.${incaricoId}`);
    }

    const { data: clienteDocs } = await query;

    // 2. Documenti legati alle persone associate (persona_id)
    let personaDocs: Documento[] = [];
    if (personaIds.length > 0) {
      const { data: persone } = await supabase
        .from('anagrafica_soggetti')
        .select('id, nome_cognome')
        .in('id', personaIds);
      const nomeMap = new Map((persone || []).map(p => [p.id, p.nome_cognome]));

      let pDocsQuery = supabase
        .from('documenti')
        .select('*, incarichi(codice_incarico)')
        .is('deleted_at', null)
        .in('persona_id', personaIds);
      // Se siamo nel contesto di un incarico specifico, mostra solo i documenti persona
      // senza incarico (del cliente) o di questo incarico — non di altri incarichi
      if (incaricoId) {
        pDocsQuery = pDocsQuery.or(`incarico_id.is.null,incarico_id.eq.${incaricoId}`);
      }
      const { data: pDocs } = await pDocsQuery
        .order('data_acquisizione', { ascending: false })
        .order('created_at', { ascending: false });

      personaDocs = (pDocs || []).map(d => ({
        ...d,
        _personaNome: nomeMap.get(d.persona_id) || '',
      }));
    }

    // Unisci evitando duplicati
    const allIds = new Set((clienteDocs || []).map(d => d.id));
    const merged = [
      ...(clienteDocs || []),
      ...personaDocs.filter(d => !allIds.has(d.id)),
    ];

    setDocumenti(merged);
    setLoading(false);
  }

  function resetUploadForm() {
    const currentDefault = incaricoId || (incarichi.length === 1 ? incarichi[0].id : '');
    setUploadForm({
      tipologia: 'documento_identita',
      descrizione: '',
      // Mantieni la scadenza precompilata se fornita dal padre (es. modifica anagrafica)
      data_scadenza: defaultDataScadenza || '',
      incarico_id: currentDefault,
      is_cartaceo: false,
      is_documento_cliente: TIPOLOGIE_CLIENTE.has('documento_identita'),
      persona_id: '',
    });
    setSelectedFile(null);
    setShowUploadDialog(false);
  }

  async function handleUploadDocumento(): Promise<boolean> {
    setUploadLoading(true);
    try {
      const timestamp = Date.now();
      let storagePath = '';
      const uploadPersonaId = isPersonaMode ? personaId : (uploadForm.persona_id || null);
      // Il primo segmento del path deve essere un UUID (cliente o persona_fisica
      // dello stesso studio) per soddisfare le policy RLS su storage.objects.
      const folder = resolvedClienteId || uploadPersonaId;

      if (selectedFile) {
        const validation = await validatePdfFile(selectedFile);
        if (!validation.ok) {
          toast.error(validation.error ?? 'File non valido');
          setUploadLoading(false);
          return false;
        }
        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, m => m.toLowerCase());
        storagePath = `${folder}/${timestamp}_${safeName}`;

        const { error: storageError } = await supabase.storage
          .from('file_allegati')
          .upload(storagePath, selectedFile);

        if (storageError) {
          toast.error(friendlyStorageError(storageError.message, selectedFile.name));
          setUploadLoading(false);
          return false;
        }
      }

      const effectiveIncaricoId = isPersonaMode ? null : (needsIncarico ? (uploadForm.incarico_id || incaricoId) : null);

      const { error: dbError } = await supabase.from('documenti').insert({
        cliente_id: uploadPersonaId ? null : clienteId,
        persona_id: uploadPersonaId || null,
        incarico_id: effectiveIncaricoId,
        tipologia: uploadForm.tipologia,
        nome_file: uploadForm.is_cartaceo
          ? (TIPOLOGIE_DOCUMENTO.find(t => t.value === uploadForm.tipologia)?.label || uploadForm.tipologia) + ' (cartaceo)'
          : selectedFile?.name,
        descrizione: uploadForm.descrizione,
        file_path: uploadForm.is_cartaceo ? '*Non disponibile perchè acquisito in formato cartaceo*' : storagePath,
        data_scadenza: uploadForm.data_scadenza || null,
      });

      if (dbError) {
        toast.error('Errore salvataggio documento: ' + dbError.message);
        // Niente file orfano: se l'insert DB fallisce dopo un upload riuscito, rimuovi il file.
        if (!uploadForm.is_cartaceo && storagePath) {
          await supabase.storage.from('file_allegati').remove([storagePath]);
        }
        setUploadLoading(false);
        return false;
      }

      const logMsg = `Documento caricato: ${uploadForm.tipologia}${selectedFile ? ' - ' + selectedFile.name : ' (cartaceo)'}`;
      resetUploadForm();
      await loadDocumenti();
      onDocumentiChange?.();
      // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
      addUserLog(logMsg);
      setUploadLoading(false);
      return true;
    } catch (err: any) {
      toast.error('Errore: ' + err.message);
      setUploadLoading(false);
      return false;
    }
  }

  async function handleDeleteDocumento(doc: Documento) {
    const clausola = await clausolaRecuperoCestino();
    if (!(await confirm({
      message: `Spostare il documento "${doc.nome_file}" nel cestino? ${clausola}`,
      variant: 'danger',
      confirmText: 'Sposta nel cestino',
    }))) return;

    // Soft-delete: il documento (e il suo file) restano per il ripristino.
    // La cancellazione definitiva avviene dal Cestino.
    try {
      await spostaNelCestino('documento', doc.id);
    } catch (err: any) {
      toast.error('Errore: ' + (err?.message || 'spostamento nel cestino non riuscito'));
      return;
    }
    await loadDocumenti();
    onDocumentiChange?.();
    addUserLog(`Documento spostato nel cestino: ${doc.nome_file}`);
  }

  async function handleDownloadDocumento(doc: Documento) {
    if (!doc.file_path || doc.file_path.startsWith('*')) return;
    const { data, error } = await supabase.storage.from('file_allegati').download(doc.file_path);
    if (error || !data) {
      toast.error('Errore download: ' + (error?.message || 'file non trovato'));
      return;
    }
    // Audit trail GDPR/AML: download documento = evento di lettura tracciabile.
    logAccess({
      action: `Download documento: ${doc.nome_file}`,
      action_type: 'READ',
      target_table: 'documenti',
      target_id: doc.id,
      metadata: { nome_file: doc.nome_file, tipologia: doc.tipologia },
    });
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.nome_file;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isCartaceo = (doc: Documento) => doc.file_path?.startsWith('*');

  // Raggruppa documenti per catena di rinnovo esplicita (rinnovo_di).
  // Documenti indipendenti (rinnovo_di=null e nessuno li rinnova) appaiono singolarmente.
  // Lo storico si forma SOLO quando un documento è stato esplicitamente rinnovato.
  // Trova la radice della catena di rinnovo risalendo rinnovo_di
  const docById = new Map(documenti.map(d => [d.id, d]));
  function findChainRoot(doc: Documento, seen: Set<string> = new Set()): string {
    // `seen` evita ricorsione infinita / stack overflow se i `rinnovo_di` formano un ciclo (dati corrotti).
    if (!doc.rinnovo_di || seen.has(doc.id)) return doc.id;
    seen.add(doc.id);
    const parent = docById.get(doc.rinnovo_di);
    return parent ? findChainRoot(parent, seen) : doc.id;
  }

  const grouped = documenti.reduce<Record<string, Documento[]>>((acc, doc) => {
    const root = findChainRoot(doc);
    if (!acc[root]) acc[root] = [];
    acc[root].push(doc);
    return acc;
  }, {});

  // Per ogni gruppo: primo = più recente (già ordinati desc per data_acquisizione)
  const latestDocs = Object.entries(grouped).map(([key, docs]) => ({
    key,
    latest: docs[0],
    history: docs.slice(1),
  }));

  const historyDocs = historyKey ? grouped[historyKey] || [] : [];

  function openRinnovo(doc: Documento) {
    setRenewingDoc(doc);
    setRenewScadenza('');
    setRenewFile(null);
    setRenewCartaceo(isCartaceo(doc));
    setRenewDescrizione(doc.descrizione || '');
  }

  function closeRinnovo() {
    setRenewingDoc(null);
    setRenewScadenza('');
    setRenewFile(null);
    setRenewCartaceo(false);
    setRenewDescrizione('');
  }

  async function handleRinnovaDocumento() {
    if (!renewingDoc || !renewScadenza) return;
    setRenewLoading(true);
    try {
      let storagePath = '';
      let nomeFile = renewingDoc.nome_file;

      if (renewCartaceo) {
        // Rinnovo come cartaceo
        storagePath = '*Non disponibile perchè acquisito in formato cartaceo*';
        nomeFile = (TIPOLOGIE_DOCUMENTO.find(t => t.value === renewingDoc.tipologia)?.label || renewingDoc.tipologia) + ' (cartaceo)';
      } else {
        // Rinnovo come digitale — serve un file
        if (!renewFile) {
          toast.warning('Selezionare il nuovo file');
          setRenewLoading(false);
          return;
        }
        const renewValidation = await validatePdfFile(renewFile);
        if (!renewValidation.ok) {
          toast.error(renewValidation.error ?? 'File non valido');
          setRenewLoading(false);
          return;
        }
        const timestamp = Date.now();
        const safeName = renewFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, m => m.toLowerCase());
        const folder = resolvedClienteId || renewingDoc.persona_id;
        storagePath = `${folder}/${timestamp}_${safeName}`;

        const { error: storageError } = await supabase.storage
          .from('file_allegati')
          .upload(storagePath, renewFile);

        if (storageError) {
          toast.error(friendlyStorageError(storageError.message, renewFile.name));
          setRenewLoading(false);
          return;
        }
        nomeFile = renewFile.name;
      }

      const desc = renewDescrizione.trim() || `Rinnovo del ${new Date().toLocaleDateString('it-IT')}`;

      const { error } = await supabase.from('documenti').insert({
        cliente_id: renewingDoc.persona_id ? null : clienteId,
        persona_id: renewingDoc.persona_id || null,
        incarico_id: renewingDoc.incarico_id,
        tipologia: renewingDoc.tipologia,
        nome_file: nomeFile,
        descrizione: desc,
        file_path: storagePath,
        data_scadenza: renewScadenza,
        rinnovo_di: renewingDoc.id,
      });

      if (error) {
        toast.error('Errore salvataggio: ' + error.message);
        setRenewLoading(false);
        return;
      }

      // Elimina gli alert DOC-SCADENZA legati al documento vecchio e ricalcola
      await supabase
        .from('alert')
        .delete()
        .eq('tipo_rt', 'DOC-SCADENZA')
        .eq('riferimento_id', renewingDoc.id);

      closeRinnovo();
      await loadDocumenti();
      onDocumentiChange?.();
      // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
      addUserLog(`Documento rinnovato: ${renewingDoc.tipologia} - ${nomeFile}`);
    } catch (err: any) {
      toast.error('Errore: ' + err.message);
    }
    setRenewLoading(false);
  }

  // Sposta documento tra cliente e incarico
  async function handleMoveDoc(doc: Documento, targetIncaricoId: string | null) {
    const { error } = await supabase
      .from('documenti')
      .update({ incarico_id: targetIncaricoId })
      .eq('id', doc.id);
    if (error) {
      toast.error('Errore spostamento: ' + error.message);
      return;
    }
    setMovingDoc(null);
    setMoveTargetIncarico('');
    await loadDocumenti();
    onDocumentiChange?.();
  }

  // funzione per aprire il dialog dall'esterno
  const openUpload = useCallback(() => setShowUploadDialog(true), []);
  useEffect(() => {
    onOpenUploadRef?.(openUpload);
  }, [onOpenUploadRef, openUpload]);

  // L'utente decide se il documento è del cliente o dell'incarico tramite il checkbox
  const needsIncarico = !isPersonaMode && !uploadForm.is_documento_cliente;
  // Mostra il dropdown incarichi solo per documenti dell'incarico e quando serve scegliere
  const showIncaricoSelect = needsIncarico && !incaricoId && incarichi.length > 0;
  // Tipologia persona richiede la selezione della persona (se ci sono persone associate)
  const needsPersona = !isPersonaMode && TIPOLOGIE_PERSONA.has(uploadForm.tipologia) && personeNomi.length > 0;
  const hasValidPersona = !needsPersona || !!uploadForm.persona_id;
  // L'upload è valido se il doc è del cliente/persona oppure se c'è un incarico selezionato
  const hasValidIncarico = isPersonaMode || !needsIncarico || !!(uploadForm.incarico_id || incaricoId);

  // Flush di un eventuale upload pendente (dialog aperto con file/cartaceo selezionati
  // ma non ancora salvati). Il ref viene aggiornato ad ogni render così da leggere
  // sempre lo stato più recente quando il genitore lo invoca.
  const flushStateRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));
  flushStateRef.current = async () => {
    if (!showUploadDialog) return true;
    // Niente da caricare: dialog aperto ma senza file né cartaceo → no-op.
    if (!selectedFile && !uploadForm.is_cartaceo) return true;
    const scadenzaMancante = TIPOLOGIE_CON_SCADENZA.has(uploadForm.tipologia) && !uploadForm.data_scadenza;
    if (!hasValidIncarico || !hasValidPersona || scadenzaMancante) {
      toast.warning('Completa i campi obbligatori del documento o chiudi il modulo di caricamento prima di salvare.');
      return false;
    }
    return await handleUploadDocumento();
  };
  const flushPendingUpload = useCallback(() => flushStateRef.current(), []);
  useEffect(() => {
    onFlushUploadRef?.(flushPendingUpload);
  }, [onFlushUploadRef, flushPendingUpload]);

  return (
    <div className="space-y-4">
      {(!hideAddButton || titolo) && (
        <div className="flex items-center justify-between">
          {titolo && (
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{titolo}</h3>
              <button
                onClick={() => setShowHelpModal(true)}
                className="p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                title="Guida alle funzionalità"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
          )}
          {!hideAddButton && !readOnly && !(isPersonaMode && !isAziendaAnagrafica && documenti.length > 0) && (
            <button
              onClick={() => {
                setShowUploadDialog(true);
                setTimeout(() => uploadDialogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
              }}
              className="flex items-center gap-2 px-4 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              <Plus className="w-4 h-4" />
              Aggiungi Documento
            </button>
          )}
        </div>
      )}

      {/* Dialog upload */}
      {showUploadDialog && (
        <div ref={uploadDialogRef} className="border-2 border-blue-200 bg-blue-50 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-blue-900 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Carica o Registra Documento
            </h4>
            <button onClick={resetUploadForm} className="p-1 hover:bg-blue-100 rounded">
              <X className="w-4 h-4 text-blue-700" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipologia *</label>
              {isPersonaMode && !isAziendaAnagrafica ? (
                <div className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                  {TIPOLOGIE_DOCUMENTO.find(t => t.level === 'persona')?.label || 'Documento di identità'}
                </div>
              ) : (
              <div className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                <select
                  value={uploadForm.tipologia}
                  onChange={e => {
                    const val = e.target.value;
                    setUploadForm(f => ({ ...f, tipologia: val, is_documento_cliente: TIPOLOGIE_CLIENTE.has(val) }));
                  }}
                  className="w-full rounded-lg bg-white text-sm focus:outline-none focus:ring-0"
                  required
                >
                  {(isAziendaAnagrafica ? TIPOLOGIE_AZIENDA : TIPOLOGIE_DOCUMENTO).map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              )}
            </div>

            {/* Checkbox: documento del cliente vs dell'incarico — nascosto in modalità persona */}
            {!isPersonaMode && (
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uploadForm.is_documento_cliente}
                  onChange={e => setUploadForm(f => ({ ...f, is_documento_cliente: e.target.checked }))}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">Documento del cliente</span>
              </label>
              <p className="text-xs text-gray-400 italic ml-6 mt-0.5">
                {uploadForm.is_documento_cliente
                  ? '(Condiviso tra tutti gli incarichi del cliente — es. documento identità, visura, codice fiscale)'
                  : '(Associato a un singolo incarico — es. mandato, dichiarazione AV.4, provenienza fondi)'}
              </p>
            </div>
            )}

            {/* Selezione persona — per tipologie persona-level in modalità cliente */}
            {!isPersonaMode && TIPOLOGIE_PERSONA.has(uploadForm.tipologia) && personeNomi.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Persona associata *
                </label>
                {personeNomi.length === 1 ? (
                  <div className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                    {personeNomi[0].nome_cognome}
                  </div>
                ) : (
                <div className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                  <select
                    value={uploadForm.persona_id}
                    onChange={e => setUploadForm(f => ({ ...f, persona_id: e.target.value }))}
                    className="w-full rounded-lg text-sm bg-white focus:outline-none focus:ring-0"
                    required
                  >
                    <option value="">Seleziona persona...</option>
                    {personeNomi.map(p => (
                      <option key={p.id} value={p.id}>{p.nome_cognome}</option>
                    ))}
                  </select>
                </div>
                )}
              </div>
            )}

            {!isPersonaMode && showIncaricoSelect && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Incarico associato *
                </label>
                <div className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                  <select
                    value={uploadForm.incarico_id}
                    onChange={e => setUploadForm(f => ({ ...f, incarico_id: e.target.value }))}
                    className="w-full rounded-lg text-sm bg-white focus:outline-none focus:ring-0"
                    required
                  >
                    <option value="">Seleziona</option>
                    {incarichi.map(i => (
                      <option key={i.id} value={i.id}>
                        {i.codice_incarico} - {i.descrizione}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data scadenza {TIPOLOGIE_CON_SCADENZA.has(uploadForm.tipologia) ? '*' : '(facoltativa)'} (gg/mm/aaaa)
              </label>
              <input
                type="date"
                value={uploadForm.data_scadenza}
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                onChange={e => setUploadForm(f => ({ ...f, data_scadenza: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
              <input
                type="text"
                value={uploadForm.descrizione}
                onChange={e => setUploadForm(f => ({ ...f, descrizione: e.target.value }))}
                placeholder="Descrizione opzionale..."
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              id="file_cartaceo"
              checked={uploadForm.is_cartaceo || false}
              onChange={e => setUploadForm(f => ({ ...f, is_cartaceo: e.target.checked }))}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="file_cartaceo" className="text-sm font-medium text-gray-700 cursor-pointer">
              Documento cartaceo (non disponibile digitalmente)
            </label>
          </div>

          <div className={uploadForm.is_cartaceo ? "opacity-50 pointer-events-none" : ""}>
            <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
            <p className="text-xs text-gray-500 mb-2">
              Sono supportati esclusivamente file in formato <strong>PDF</strong> o <strong>PDF/A</strong>.
            </p>
            <input
              type="file"
              disabled={uploadForm.is_cartaceo}
              onChange={e => setSelectedFile(e.target.files?.[0] || null)}
              className="w-full text-sm border rounded-lg px-3 py-2 file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-blue-100 file:text-blue-700 file:text-sm file:cursor-pointer"
              accept=".pdf"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={resetUploadForm}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
              Annulla
            </button>
            <button
              onClick={handleUploadDocumento}
              disabled={(!uploadForm.is_cartaceo && !selectedFile) || !hasValidIncarico || !hasValidPersona || (TIPOLOGIE_CON_SCADENZA.has(uploadForm.tipologia) && !uploadForm.data_scadenza) || uploadLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploadLoading ? (
                <Spinner />
              ) : (
                <><Upload className="w-4 h-4" /> {uploadForm.is_cartaceo ? 'Salva' : 'Carica'}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Lista documenti — separata in Documenti del Cliente e Documenti dell'Incarico */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : latestDocs.length === 0 && !showUploadDialog ? (
        <div className="text-center py-8 text-gray-500">
          Nessun documento allegato.
        </div>
      ) : isPersonaMode ? (
        // --- Modalità persona: lista piatta senza sezioni ---
        <div className="space-y-2">
          {latestDocs.map(entry => {
            const { key, latest: doc, history } = entry;
            return (
              <div key={key} className="border rounded-lg hover:bg-gray-50">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="w-5 h-5 flex-shrink-0 text-blue-500" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{doc.nome_file}</p>
                      <p className="text-xs text-gray-500">
                        {TIPOLOGIE_DOCUMENTO.find(t => t.value === doc.tipologia)?.label || doc.tipologia}
                        {' | '}{formatDate(doc.data_acquisizione)}
                        {doc.descrizione && ` | ${doc.descrizione}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {doc.data_scadenza && (
                      <span className={`text-xs px-2 py-1 rounded ${
                        new Date(doc.data_scadenza) < new Date() ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}>
                        Scad: {formatDate(doc.data_scadenza)}
                      </span>
                    )}
                    {doc.file_path && !doc.file_path.startsWith('*') && (
                      <button onClick={() => handleDownloadDocumento(doc)} className="p-1.5 hover:bg-blue-100 rounded text-blue-600" title="Scarica">
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    {history.length > 0 && (
                      <button onClick={() => setHistoryKey(key)} className="p-1.5 hover:bg-gray-200 rounded text-gray-500" title={`Storico (${history.length} versioni precedenti)`}>
                        <History className="w-4 h-4" />
                      </button>
                    )}
                    {!readOnly && (
                      <button onClick={() => openRinnovo(doc)} className="p-1.5 hover:bg-orange-100 rounded text-orange-600" title={isCartaceo(doc) ? 'Aggiorna scadenza' : 'Rinnova documento'}>
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    {!readOnly && puoCestina && (
                      <button onClick={() => handleDeleteDocumento(doc)} className="p-1.5 hover:bg-red-100 rounded text-red-500" title="Sposta nel cestino">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (() => {
        const clientDocs = latestDocs.filter(({ latest }) => !latest.incarico_id);
        const incaricoDocs = latestDocs.filter(({ latest }) => !!latest.incarico_id);

        // Raggruppa documenti incarico per incarico_id
        const incaricoGroups = new Map<string, typeof latestDocs>();
        incaricoDocs.forEach(item => {
          const key = item.latest.incarico_id!;
          if (!incaricoGroups.has(key)) incaricoGroups.set(key, []);
          incaricoGroups.get(key)!.push(item);
        });

        // Risolvi codice_incarico dall'array incarichi o dal join
        const getIncaricoLabel = (incaricoId_: string) => {
          const fromProp = incarichi.find(i => i.id === incaricoId_);
          if (fromProp) return fromProp.codice_incarico + (fromProp.descrizione ? ` - ${fromProp.descrizione}` : '');
          // Fallback dal join dei documenti
          const firstDoc = incaricoDocs.find(({ latest }) => latest.incarico_id === incaricoId_);
          return firstDoc?.latest.incarichi?.codice_incarico || incaricoId_;
        };

        const renderDocRow = (entry: typeof latestDocs[0]) => {
          const { key, latest: doc, history } = entry;
          return (
            <div key={key} className="border rounded-lg hover:bg-gray-50">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="w-5 h-5 flex-shrink-0 text-blue-500" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {doc.nome_file}
                    </p>
                    <p className="text-xs text-gray-500">
                      {TIPOLOGIE_DOCUMENTO.find(t => t.value === doc.tipologia)?.label || doc.tipologia}
                      {' | '}{formatDate(doc.data_acquisizione)}
                      {!incaricoId && doc.incarichi?.codice_incarico && ` | Incarico: ${doc.incarichi.codice_incarico}`}
                      {doc._personaNome && ` | ${doc._personaNome}`}
                      {doc.descrizione && ` | ${doc.descrizione}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {doc.data_scadenza && (
                    <span className={`text-xs px-2 py-1 rounded ${
                      new Date(doc.data_scadenza) < new Date() ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      Scad: {formatDate(doc.data_scadenza)}
                    </span>
                  )}
                  {doc.file_path && !doc.file_path.startsWith('*') && (
                    <button
                      onClick={() => handleDownloadDocumento(doc)}
                      className="p-1.5 hover:bg-blue-100 rounded text-blue-600"
                      title="Scarica"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  {history.length > 0 && (
                    <button
                      onClick={() => setHistoryKey(key)}
                      className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                      title={`Storico (${history.length} versioni precedenti)`}
                    >
                      <History className="w-4 h-4" />
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      onClick={() => openRinnovo(doc)}
                      className="p-1.5 hover:bg-orange-100 rounded text-orange-600"
                      title={isCartaceo(doc) ? 'Aggiorna scadenza' : 'Rinnova documento'}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  {!readOnly && !isPersonaMode && (
                    <button
                      onClick={() => {
                        if (!doc.incarico_id) {
                          // Da cliente → incarico: se c'è un solo incarico o incaricoId fisso, sposta direttamente
                          const target = incaricoId || (incarichi.length === 1 ? incarichi[0].id : '');
                          if (target) {
                            handleMoveDoc(doc, target);
                          } else {
                            setMovingDoc(doc);
                            setMoveTargetIncarico('');
                          }
                        } else {
                          // Da incarico → cliente: conferma e sposta
                          handleMoveDoc(doc, null);
                        }
                      }}
                      className="p-1.5 hover:bg-purple-100 rounded text-purple-600"
                      title={doc.incarico_id ? 'Sposta a documento del cliente' : 'Associa a un incarico'}
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                    </button>
                  )}
                  {!readOnly && puoCestina && (
                    <button
                      onClick={() => handleDeleteDocumento(doc)}
                      className="p-1.5 hover:bg-red-100 rounded text-red-500"
                      title="Sposta nel cestino"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Mini-dialog per scegliere incarico di destinazione */}
              {movingDoc?.id === doc.id && (
                <div className="mx-3 mb-3 p-2 bg-purple-50 border border-purple-200 rounded-lg flex items-center gap-2">
                  <select
                    value={moveTargetIncarico}
                    onChange={e => setMoveTargetIncarico(e.target.value)}
                    className="flex-1 border rounded px-2 py-1 text-sm bg-white"
                  >
                    <option value="">Seleziona incarico...</option>
                    {incarichi.map(i => (
                      <option key={i.id} value={i.id}>{i.codice_incarico} - {i.descrizione}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => moveTargetIncarico && handleMoveDoc(doc, moveTargetIncarico)}
                    disabled={!moveTargetIncarico}
                    className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 disabled:opacity-50"
                  >
                    Sposta
                  </button>
                  <button
                    onClick={() => { setMovingDoc(null); setMoveTargetIncarico(''); }}
                    className="p-1 hover:bg-purple-100 rounded"
                  >
                    <X className="w-3 h-3 text-purple-600" />
                  </button>
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="space-y-6">
            {/* Sezione: Documenti del Cliente */}
            <div>
              <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-200">
                <User className="w-4 h-4 text-indigo-500" />
                <h4 className="text-sm font-semibold text-gray-700">Documenti del Cliente</h4>
                <span className="text-xs text-gray-400">({clientDocs.length})</span>
              </div>
              {clientDocs.length === 0 ? (
                <p className="text-xs text-gray-400 italic pl-6">Nessun documento del cliente.</p>
              ) : (
                <div className="space-y-2">
                  {clientDocs.map(entry => renderDocRow(entry))}
                </div>
              )}
            </div>

            {/* Sezione: Documenti dell'Incarico (singolo) / per Incarico (fascicolo) */}
            <div>
              <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-200">
                <FolderOpen className="w-4 h-4 text-blue-500" />
                <h4 className="text-sm font-semibold text-gray-700">
                  {incaricoId ? "Documenti dell'Incarico" : 'Documenti per Incarico'}
                </h4>
                <span className="text-xs text-gray-400">({incaricoDocs.length})</span>
              </div>
              {incaricoDocs.length === 0 ? (
                <p className="text-xs text-gray-400 italic pl-6">Nessun documento associato a incarichi.</p>
              ) : incaricoId ? (
                /* Vista singolo incarico: lista piatta senza sotto-intestazione */
                <div className="space-y-2">
                  {incaricoDocs.map(entry => renderDocRow(entry))}
                </div>
              ) : (
                /* Vista fascicolo: raggruppati per incarico */
                <div className="space-y-3">
                  {Array.from(incaricoGroups.entries()).map(([incId, docs]) => (
                    <div key={incId}>
                      <p className="text-xs font-medium text-blue-600 mb-1 pl-6">
                        {getIncaricoLabel(incId)}
                      </p>
                      <div className="space-y-2">
                        {docs.map(entry => renderDocRow(entry))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modale storico versioni */}
      {historyKey && historyDocs.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <History className="w-4 h-4 text-gray-600" />
                Storico documento — {TIPOLOGIE_DOCUMENTO.find(t => t.value === historyDocs[0]?.tipologia)?.label || historyDocs[0]?.tipologia}
                <span className="bg-gray-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
                  {historyDocs.length}
                </span>
              </h4>
              <button onClick={() => setHistoryKey(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2 flex-1">
              {historyDocs.map((doc, idx) => (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between p-3 border rounded-lg ${idx === 0 ? 'border-blue-300 bg-blue-50' : 'bg-gray-50'}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className={`w-5 h-5 flex-shrink-0 ${idx === 0 ? 'text-blue-500' : 'text-gray-400'}`} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {doc.nome_file}
                        {idx === 0 && <span className="ml-2 text-xs text-blue-600 font-semibold">ATTUALE</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        Acquisito: {formatDate(doc.data_acquisizione)}
                        {doc.data_scadenza && ` | Scadenza: ${formatDate(doc.data_scadenza)}`}
                        {doc.descrizione && ` | ${doc.descrizione}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {doc.file_path && !doc.file_path.startsWith('*') && (
                      <button
                        onClick={() => handleDownloadDocumento(doc)}
                        className="p-1.5 hover:bg-blue-100 rounded text-blue-600"
                        title="Scarica"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    {doc.file_path?.startsWith('*') && (
                      <span className="text-xs text-gray-400 italic">Cartaceo</span>
                    )}
                    {!readOnly && puoCestina && (
                      <button
                        onClick={() => handleDeleteDocumento(doc)}
                        className="p-1.5 hover:bg-red-100 rounded text-red-500"
                        title="Sposta nel cestino"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* Modale guida icone */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-500" />
                Guida — Gestione Documenti
              </h4>
              <button onClick={() => setShowHelpModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-3 flex-1 text-sm text-gray-700">
              {!isPersonaMode && (
              <div className="space-y-2">
                <h5 className="font-semibold text-gray-900 text-xs uppercase tracking-wide border-b pb-1">Sezioni</h5>
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                  <div><strong>Documenti del Cliente</strong> — Documenti condivisi tra tutti gli incarichi (es. carta d'identità, visura, codice fiscale). Vengono salvati senza associazione a un incarico specifico.</div>
                </div>
                <div className="flex items-start gap-3">
                  <FolderOpen className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div><strong>Documenti per Incarico</strong> — Documenti legati a uno specifico incarico (es. mandato, dichiarazione AV.4, provenienza fondi). Raggruppati per incarico nella vista fascicolo.</div>
                </div>
              </div>
              )}

              <div className="space-y-2">
                <h5 className="font-semibold text-gray-900 text-xs uppercase tracking-wide border-b pb-1">Azioni sui documenti</h5>
                <div className="flex items-start gap-3">
                  <Download className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div><strong>Scarica</strong> — Scarica il file del documento. Disponibile solo per documenti caricati digitalmente.</div>
                </div>
                <div className="flex items-start gap-3">
                  <History className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div><strong>Storico</strong> — Visualizza le versioni precedenti del documento. Appare solo quando il documento è stato rinnovato almeno una volta.</div>
                </div>
                <div className="flex items-start gap-3">
                  <RefreshCw className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div><strong>Rinnova</strong> — Carica una nuova versione del documento con una nuova data di scadenza. Il documento precedente viene conservato nello storico.</div>
                </div>
                {!isPersonaMode && (
                <div className="flex items-start gap-3">
                  <ArrowRightLeft className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div><strong>Sposta</strong> — Cambia l'associazione del documento: da documento del cliente a documento di un incarico specifico, o viceversa.</div>
                </div>
                )}
                {puoCestina && (
                <div className="flex items-start gap-3">
                  <Trash2 className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div><strong>Sposta nel cestino</strong> — Sposta il documento nel cestino, da cui può essere ripristinato o eliminato definitivamente.</div>
                </div>
                )}
              </div>

              <div className="space-y-2">
                <h5 className="font-semibold text-gray-900 text-xs uppercase tracking-wide border-b pb-1">Indicatori</h5>
                <div className="flex items-start gap-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 mt-0.5 flex-shrink-0 whitespace-nowrap">Scad: gg/mm/aaaa</span>
                  <div><strong>Scadenza</strong> — Data di scadenza del documento. Verde se valido, rosso se scaduto.</div>
                </div>
              </div>

              {/*<div className="space-y-2">
                <h5 className="font-semibold text-gray-900 text-xs uppercase tracking-wide border-b pb-1">Upload</h5>
                <p>Durante il caricamento, il checkbox <strong>"Documento del cliente"</strong> determina se il file sarà condiviso tra tutti gli incarichi o associato a uno specifico. Il sistema suggerisce automaticamente l'impostazione in base alla tipologia scelta, ma è sempre modificabile.</p>
              </div>*/}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                Ho capito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog rinnovo documento */}
      {renewingDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-orange-600" />
                Rinnova documento
              </h4>
              <button onClick={closeRinnovo} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
              <p><strong>Documento:</strong> {renewingDoc.nome_file}</p>
              <p><strong>Tipologia:</strong> {TIPOLOGIE_DOCUMENTO.find(t => t.value === renewingDoc.tipologia)?.label || renewingDoc.tipologia}</p>
              {renewingDoc.data_scadenza && (
                <p><strong>Scadenza attuale:</strong> {formatDate(renewingDoc.data_scadenza)}</p>
              )}
            </div>

            <p className="text-xs text-gray-500">
              Il documento precedente verrà conservato nello storico.
            </p>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="renew_cartaceo"
                checked={renewCartaceo}
                onChange={e => { setRenewCartaceo(e.target.checked); setRenewFile(null); }}
                className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
              />
              <label htmlFor="renew_cartaceo" className="text-sm font-medium text-gray-700 cursor-pointer">
                Documento cartaceo (non disponibile digitalmente)
              </label>
            </div>

            <div className={renewCartaceo ? "opacity-50 pointer-events-none" : ""}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nuovo file (PDF) {!renewCartaceo && '*'}</label>
              <input
                type="file"
                disabled={renewCartaceo}
                onChange={e => setRenewFile(e.target.files?.[0] || null)}
                className="w-full text-sm border rounded-lg px-3 py-2 file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-orange-100 file:text-orange-700 file:text-sm file:cursor-pointer"
                accept=".pdf"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nuova data di scadenza * (gg/mm/aaaa)
              </label>
              <input
                type="date"
                value={renewScadenza}
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                onChange={e => setRenewScadenza(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrizione
              </label>
              <input
                type="text"
                value={renewDescrizione}
                onChange={e => setRenewDescrizione(e.target.value)}
                placeholder={`Rinnovo del ${new Date().toLocaleDateString('it-IT')}`}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={closeRinnovo}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={handleRinnovaDocumento}
                disabled={renewLoading || !renewScadenza || (!renewCartaceo && !renewFile)}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {renewLoading ? (
                  <Spinner />
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Rinnova</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
