import { useState, useEffect } from 'react';
import { Card } from './Card';
import { Eye, AlertTriangle, Save, Search, X, ChevronRight, ChevronDown, FileText, User, Briefcase, Shield, Download, Loader2, Clock, Calendar, Trash2 } from 'lucide-react';
import { generateBlobDOCX_CC } from '../lib/docx-converter';
import { supabase } from '../lib/supabase';
import { addMonths, /*classificaRischioEffettivo*/ } from '../lib/calculations';
import { formatDate, formatDateInv } from './cliente-wizard/components/forms/PersonaFisicaForm';
import { getPrestazione } from '../lib/aml-data';
import { findPersoneIdByCliente } from '../lib/personeHelper';
import { addUserLog } from './LogUtente.tsx';
import { Spinner } from './cliente-wizard/modals/Spinner';
import { useToast, useConfirm } from './Toast';
import { spostaNelCestino, clausolaRecuperoCestino } from '../lib/cestinoHelper';
import { useCestinaPermesso } from '../hooks/useCestinaPermesso';
import { useScrollLock } from '../hooks/useScrollLock';
import { useStudio } from '../lib/StudioContext';
import { TIPOLOGIE_DOCUMENTO } from './DocumentiAllegati';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface Incarico {
  id: string;
  codice_incarico: string;
  descrizione: string;
}

interface ControlloCompleto {
  id: string;
  created_at: string;
  data_controllo: string;
  tipologia: string;
  esito: string;
  azioni_intraprese: string;
  prossima_scadenza: string;
  checklist_cc?: Record<string, string>;
  esito_rischio?: string;
  annotazioni_cc?: string;
  nuovo_rischio_effettivo?: number;
  incarico_id?: string;
  incarico: {
    codice_incarico: string;
    descrizione: string;
  };
}

interface SosCompleto {
  id: string;
  created_at: string;
  incarico_id: string;
  data_valutazione: string;
  motivi_sospetto: string;
  decisione: string;
  data_invio?: string;
  protocollo_uif?: string;
  incarico: {
    codice_incarico: string;
    descrizione: string;
  };
}

export function RT3Monitoraggio({ openIncaricoId }: { openIncaricoId?: string } = {}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { activeStudioId } = useStudio();
  const puoCestina = useCestinaPermesso();

  const handleCestinaControllo = async (id: string) => {
    const clausola = await clausolaRecuperoCestino();
    const ok = await confirm({
      message: `Spostare questo controllo costante nel cestino? ${clausola}`,
      variant: 'danger',
      confirmText: 'Sposta nel cestino',
    });
    if (!ok) return;
    try {
      await spostaNelCestino('controllo', id);
      toast.success('Controllo spostato nel cestino');
      await loadControlli();
    } catch (err: any) {
      toast.error(err?.message || 'Errore nello spostamento nel cestino');
    }
  };

  const handleCestinaSegnalazione = async (id: string) => {
    const clausola = await clausolaRecuperoCestino();
    const ok = await confirm({
      message: `Spostare questa segnalazione SOS nel cestino? ${clausola}`,
      variant: 'danger',
      confirmText: 'Sposta nel cestino',
    });
    if (!ok) return;
    try {
      await spostaNelCestino('segnalazione', id);
      toast.success('Segnalazione spostata nel cestino');
      await loadSegnalazioni();
    } catch (err: any) {
      toast.error(err?.message || 'Errore nello spostamento nel cestino');
    }
  };
  const [loading, setLoading] = useState(true);
  const [incarichi, setIncarichi] = useState<Incarico[]>([]);
  const [controlli, setControlli] = useState<ControlloCompleto[]>([]);
  const [segnalazioni, setSegnalazioni] = useState<SosCompleto[]>([]);
  const [view, setView] = useState<'list' | 'controllo' | 'sos'>('list');
  const [editingSosId, setEditingSosId] = useState<string | null>(null);
  const [newSosStatus, setNewSosStatus] = useState<string>('');
  const [newSosDataInvio, setNewSosDataInvio] = useState<string>('');
  const [newSosProtocollo, setNewSosProtocollo] = useState<string>('');

  // Stati separati per selezione incarico - Controllo
  const [selectedIncaricoControllo, setSelectedIncaricoControllo] = useState('');
  const [incaricoSearchQueryControllo, setIncaricoSearchQueryControllo] = useState('');
  const [showIncaricoSuggestionsControllo, setShowIncaricoSuggestionsControllo] = useState(false);
  const [selectedIncaricoNomeControllo, setSelectedIncaricoNomeControllo] = useState('');

  // Stati separati per selezione incarico - SOS
  const [selectedIncaricoSos, setSelectedIncaricoSos] = useState('');
  const [incaricoSearchQuerySos, setIncaricoSearchQuerySos] = useState('');
  const [showIncaricoSuggestionsSos, setShowIncaricoSuggestionsSos] = useState(false);
  const [selectedIncaricoNomeSos, setSelectedIncaricoNomeSos] = useState('');

  // Definizione dei 15 controlli per la checklist CC
  const CHECKLIST_CC_ITEMS = [
    { key: 'cc_1', num: '1', testo: 'La complessiva operatività del cliente (operazioni e attività) risulta coerente rispetto alla conoscenza del medesimo e al profilo di rischio assegnato?' },
    { key: 'cc_2', num: '2', testo: 'Nell\'ambito della prestazione professionale svolta sono state riscontrate infrazioni del contante/titoli o anomalie rilevanti ai fini della SOS?' },
    { key: 'cc_3', num: '3', testo: 'Permane la coerenza dello scopo e natura delle prestazioni professionali dichiarate dal cliente all\'atto del conferimento dell\'incarico con le informazioni acquisite nel corso dello svolgimento dell\'incarico?' },
    { key: 'cc_3_1', num: '3.1', testo: 'Viene confermata la funzionalità del rapporto cliente/esecutore e cliente/titolare effettivo alla gestione dell\'attività?' },
    { key: 'cc_4', num: '4', testo: 'Risulta coerente la provenienza dei fondi e risorse nella disponibilità del cliente con il suo profilo (in funzione del rischio)?' },
    { key: 'cc_5', num: '5', testo: 'Sono state rilevate incongruenze negli atti/comportamenti del cliente rispetto alla sua capacità economica/finanziaria/patrimoniale?' },
    { key: 'cc_6', num: '6', testo: 'L\'individuazione dei titolari effettivi è aggiornata?' },
    { key: 'cc_6_1', num: '6.1', testo: 'I dati identificativi dei titolari effettivi sono aggiornati?' },
    { key: 'cc_6_2', num: '6.2', testo: 'Acquisizione dati identificativi nuovi titolari effettivi' },
    { key: 'cc_7', num: '7', testo: 'I dati identificativi del cliente (ex art. 1, co. 2, lett. n) D.Lgs. 231/2007) sono aggiornati?' },
    { key: 'cc_7_1', num: '7.1', testo: 'I dati identificativi dell\'esecutore sono aggiornati?' },
    { key: 'cc_7_2', num: '7.2', testo: 'Si è reso necessario acquisire un nuovo documento di identità del cliente?' },
    { key: 'cc_7_3', num: '7.3', testo: 'Si è reso necessario acquisire un nuovo documento di identità dell\'esecutore?' },
    { key: 'cc_8', num: '8', testo: 'Si sono resi necessari approfondimenti o ulteriori verifiche sul cliente/prestazione sulla base di informazioni acquisite o possedute in ragione dell\'esercizio dell\'attività (art. 19 co. 1 lett. d) D.Lgs. 231/2007)?' },
    { key: 'cc_8_1', num: '8.1', testo: 'In caso di risposta positiva al precedente campo di controllo, sono emerse incongruenze o anomalie dalle nuove informazioni assunte?' },
  ];

  const emptyChecklist = () => CHECKLIST_CC_ITEMS.reduce((acc, item) => ({ ...acc, [item.key]: '' }), {} as Record<string, string>);

  const [controllo, setControllo] = useState({
    data_controllo: formatDateToItalian(new Date()),
    tipologia: 'periodic',
    esito: '',
    azioni_intraprese: '',
    prossima_scadenza_mesi: 12,
    checklist_cc: emptyChecklist(),
    esito_rischio: '' as '' | 'confermato' | 'aumentato' | 'ridotto',
    annotazioni_cc: '',
    nuovo_rischio_effettivo: '' as string | number
  });

  const [sos, setSos] = useState({
    data_valutazione: formatDateToItalian(new Date()),
    motivi_sospetto: '',
    decisione: 'pending'
  });

  // AV.7 download con allegati
  interface AllegatoDownload { id: string; tipologia: string; nome_file: string; file_path: string; }
  const [av7ModalCtrl, setAv7ModalCtrl] = useState<ControlloCompleto | null>(null);
  const [av7Allegati, setAv7Allegati] = useState<AllegatoDownload[]>([]);
  const [av7IncludeAllegati, setAv7IncludeAllegati] = useState(true);
  const [av7SelectedIds, setAv7SelectedIds] = useState<Set<string>>(new Set());
  const [av7LoadingAllegati, setAv7LoadingAllegati] = useState(false);
  const [av7Downloading, setAv7Downloading] = useState(false);

  useScrollLock(!!av7ModalCtrl);

  // Stato: l'incarico selezionato ha una valutazione?
  const [incaricoHasValutazione, setIncaricoHasValutazione] = useState<boolean | null>(null);

  // Riepilogo incarico per il form controllo
  const [recapData, setRecapData] = useState<any>(null);
  const [recapOpen, setRecapOpen] = useState(false);

  // Carica dati di riepilogo per il form controllo
  async function loadRecapData(incaricoId: string) {
    const [incRes, valRes, ctrlRes] = await Promise.all([
      supabase.from('incarichi')
        .select('*, clienti(ragione_sociale, codice_cliente, codice_fiscale, partita_iva, tipo_cliente, natura_giuridica, paese, pep, sanzioni, professione, residenza)')
        .eq('id', incaricoId).single(),
      supabase.from('valutazioni_rischio')
        .select('data_valutazione, rischio_effettivo, classe_rischio, rischio_specifico, rischio_inerente_prestazione, misure_applicate, note, prossimo_controllo')
        .eq('incarico_id', incaricoId)
        .order('data_valutazione', { ascending: false }).limit(2),
      supabase.from('controlli_costanti')
        .select('data_controllo, tipologia, esito, azioni_intraprese, prossima_scadenza, esito_rischio')
        .eq('incarico_id', incaricoId)
        .order('data_controllo', { ascending: false }).limit(1),
    ]);

    const incarico = incRes.data;
    const valutazione = valRes.data?.[0] || null;
    const valutazionePrecedente = valRes.data?.[1] || null;
    const prevControllo = ctrlRes.data?.[0] || null;
    const cliente = (incarico as any)?.clienti || null;
    const prestazione = incarico?.tipologia_prestazione_id ? getPrestazione(incarico.tipologia_prestazione_id) : null;
    const esito = valutazione && valutazionePrecedente ? 
      valutazione.classe_rischio > valutazionePrecedente.classe_rischio ? 'aumentato' : 
      valutazione.classe_rischio < valutazionePrecedente.classe_rischio? 'ridotto' : 
      'confermato' : '' ;

    setRecapData({ incarico, cliente, valutazione, valutazionePrecedente, prevControllo, prestazione });
    setRecapOpen(true);
    setControllo(prev => ({ 
      ...prev, 
      esito_rischio: esito,  
      nuovo_rischio_effettivo: (esito === 'aumentato' || esito === 'ridotto') ? (valutazione?.rischio_effettivo || '') : '' 
    }));
  }

  // Auto-calcola periodicità dal rischio dell'incarico selezionato
  async function loadSuggestedPeriodicita(incaricoId: string) {
    const { data } = await supabase
      .from('valutazioni_rischio')
      .select('classe_rischio')
      .eq('incarico_id', incaricoId)
      .order('data_valutazione', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const classe = data[0].classe_rischio;
      const mesi = classe >= 4 ? 6 : classe >= 3 ? 12 : classe >= 2 ? 24 : 36;
      setControllo(prev => ({ ...prev, prossima_scadenza_mesi: mesi }));
      setIncaricoHasValutazione(true);
    } else {
      setIncaricoHasValutazione(false);
      setControllo(prev => ({ ...prev, prossima_scadenza_mesi: 12 }));
    }
  }

  // Helper per formattare data in italiano
  function formatDateToItalian(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // Validazione data formato gg/mm/aaaa
  function isValidDate(dateStr: string): boolean {
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
  }

  // Converti data da gg/mm/aaaa a yyyy-mm-dd per il DB
  function formatDateForDB(displayDate: string): string {
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
  }

  useEffect(() => {
    loadData();
  }, [activeStudioId]);

  async function loadData() {
    setLoading(true);
    await Promise.all([
      loadIncarichi(),
      loadControlli(),
      loadSegnalazioni()
    ]);
    setLoading(false);
  }

  async function loadIncarichi() {
    let q = supabase
      .from('incarichi')
      .select('id, codice_incarico, descrizione')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('codice_incarico');
    if (activeStudioId) q = q.eq('studio_id', activeStudioId);
    const { data } = await q;

    if (data) {
      setIncarichi(data);
      // Deep-link: apri form controllo con incarico pre-selezionato
      if (openIncaricoId) {
        const inc = data.find(i => i.id === openIncaricoId);
        if (inc) {
          setView('controllo');
          setSelectedIncaricoControllo(inc.id);
          setSelectedIncaricoNomeControllo(`${inc.codice_incarico} - ${inc.descrizione}`);
          loadSuggestedPeriodicita(inc.id);
          loadRecapData(inc.id);
        }
      }
    }
  }

  async function loadControlli() {
    let q = supabase
      .from('controlli_costanti')
      .select(`
        id,
        created_at,
        data_controllo,
        tipologia,
        esito,
        azioni_intraprese,
        prossima_scadenza,
        checklist_cc,
        esito_rischio,
        annotazioni_cc,
        nuovo_rischio_effettivo,
        incarico_id,
        incarichi!inner(codice_incarico, descrizione)
      `)
      .is('deleted_at', null)
      .order('data_controllo', { ascending: false });
    if (activeStudioId) q = q.eq('studio_id', activeStudioId);
    const { data, error } = await q;

    if (error) {
      console.error('Errore nel caricamento controlli:', error);
      return;
    }

    if (data) {
      const formattedData = data.map(item => ({
        ...item,
        incarico: Array.isArray(item.incarichi) ? item.incarichi[0] : item.incarichi
      }));
      setControlli(formattedData as any);
    }
  }

  function isCartaceo(doc: { file_path: string }): boolean {
    return !doc.file_path || doc.file_path.startsWith('*');
  }

  async function openAv7Modal(ctrl: ControlloCompleto) {
    setAv7ModalCtrl(ctrl);
    setAv7IncludeAllegati(true);
    setAv7SelectedIds(new Set());
    setAv7LoadingAllegati(true);
    try {
      const { data: incData } = await supabase
        .from('incarichi').select('*, clienti(*)').eq('id', ctrl.incarico_id).single();
      const clienteId = (incData as any)?.clienti?.id || (incData as any)?.cliente_id;
      if (!clienteId) { setAv7Allegati([]); return; }
      const { data: docs } = await supabase
        .from('documenti').select('id, tipologia, nome_file, file_path')
        .eq('cliente_id', clienteId)
        .or(`incarico_id.is.null,incarico_id.eq.${ctrl.incarico_id}`);
      const pIds = await findPersoneIdByCliente(String(clienteId));
      let personaDocs: AllegatoDownload[] = [];
      if (pIds.length > 0) {
        const { data: pDocs } = await supabase
          .from('documenti').select('id, tipologia, nome_file, file_path')
          .in('persona_id', pIds)
          .or(`incarico_id.is.null,incarico_id.eq.${ctrl.incarico_id}`);
        personaDocs = pDocs || [];
      }
      const all = [...(docs || []), ...personaDocs];
      const unique = Array.from(new Map(all.map(d => [d.id, d])).values());
      setAv7Allegati(unique);
      setAv7SelectedIds(new Set(unique.map(d => d.id)));
    } catch {
      setAv7Allegati([]);
    } finally {
      setAv7LoadingAllegati(false);
    }
  }

  async function handleDownloadCC() {
    const ctrl = av7ModalCtrl;
    if (!ctrl) return;
    setAv7Downloading(true);
    try {
      const { data: incData } = await supabase
        .from('incarichi').select('*, clienti(*)').eq('id', ctrl.incarico_id).single();
      if (!incData) { toast.error('Impossibile caricare i dati dell\'incarico'); return; }

      const clienteId = (incData as any).clienti?.id || (incData as any).cliente_id;
      const { data: teData } = await supabase.from('titolari_effettivi').select('*').eq('cliente_id', clienteId);
      const { data: valData } = await supabase
        .from('valutazioni_rischio').select('*').eq('incarico_id', ctrl.incarico_id)
        .order('data_valutazione', { ascending: false }).limit(1);

      // Determina allegati da includere
      const attachIds = av7IncludeAllegati
        ? av7Allegati.map(d => d.id)
        : av7Allegati.filter(d => av7SelectedIds.has(d.id)).map(d => d.id);

      // Usa la selezione utente per l'elenco allegati nel DOCX AV.7
      const selectedDocs = av7Allegati.filter(d => attachIds.includes(d.id));

      const amlData = {
        cliente: (incData as any).clienti || {},
        titolari_effettivi: teData || [],
        incarico: incData,
        valutazione: valData?.[0] || undefined,
        documenti: selectedDocs.map(d => ({ tipologia: d.tipologia, nome_file: d.nome_file })),
      };

      const { blob, filename } = await generateBlobDOCX_CC(amlData as any, {
        data_controllo: ctrl.data_controllo,
        tipologia: ctrl.tipologia,
        esito: ctrl.esito,
        azioni_intraprese: ctrl.azioni_intraprese,
        prossima_scadenza: ctrl.prossima_scadenza,
        checklist_cc: ctrl.checklist_cc || {},
        esito_rischio: ctrl.esito_rischio || '',
        annotazioni_cc: ctrl.annotazioni_cc || '',
        nuovo_rischio_effettivo: ctrl.nuovo_rischio_effettivo ?? undefined,
      });

      // Solo i digitali finiscono nello ZIP
      const digitalIds = attachIds.filter(id => {
        const d = av7Allegati.find(x => x.id === id);
        return d && !isCartaceo(d);
      });

      if (digitalIds.length > 0) {
        const toDownload = av7Allegati.filter(d => digitalIds.includes(d.id));
        const attachments: { name: string; blob: Blob }[] = [];
        for (const doc of toDownload) {
          try {
            const { data, error } = await supabase.storage.from('file_allegati').download(doc.file_path);
            if (!error && data) attachments.push({ name: doc.nome_file, blob: data });
          } catch { /* skip */ }
        }
        const zip = new JSZip();
        zip.folder('Moduli')!.file(filename, blob);
        if (attachments.length > 0) {
          const allegatiFolder = zip.folder('Allegati')!;
          for (const a of attachments) allegatiFolder.file(a.name, a.blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `AV7_${(incData as any).codice_incarico || 'CC'}.zip`);
      } else {
        saveAs(blob, filename);
      }

      toast.success('Documento AV.7 scaricato');
      addUserLog(`Esportazione AV.7 per incarico ${(incData as any).codice_incarico}`);
    } catch (error) {
      console.error('Errore download AV.7:', error);
      toast.error('Errore durante la generazione del documento');
    } finally {
      setAv7Downloading(false);
      setAv7ModalCtrl(null);
    }
  }

  async function loadSegnalazioni() {
    let q = supabase
      .from('segnalazioni_sos')
      .select(`
        id,
        created_at,
        incarico_id,
        data_valutazione,
        motivi_sospetto,
        decisione,
        data_invio,
        protocollo_uif,
        incarichi!inner(codice_incarico, descrizione)
      `)
      .is('deleted_at', null)
      .order('data_valutazione', { ascending: false });
    if (activeStudioId) q = q.eq('studio_id', activeStudioId);
    const { data, error } = await q;

    if (error) {
      console.error('Errore nel caricamento segnalazioni:', error);
      return;
    }

    if (data) {
      const formattedData = data.map(item => ({
        ...item,
        incarico: Array.isArray(item.incarichi) ? item.incarichi[0] : item.incarichi
      }));
      setSegnalazioni(formattedData as any);
    }
  }

  // Filtro incarichi per il form controllo
  const filteredIncarichiControllo = incarichi.filter(incarico => {
    const query = incaricoSearchQueryControllo.toLowerCase();
    return (
      incarico.codice_incarico.toLowerCase().includes(query) ||
      incarico.descrizione.toLowerCase().includes(query)
    );
  });

  // Filtro incarichi per il form SOS
  const filteredIncarichiSos = incarichi.filter(incarico => {
    const query = incaricoSearchQuerySos.toLowerCase();
    return (
      incarico.codice_incarico.toLowerCase().includes(query) ||
      incarico.descrizione.toLowerCase().includes(query)
    );
  });

  async function handleSaveControllo() {
    if (!selectedIncaricoControllo) {
      toast.warning('Selezionare un incarico');
      return;
    }

    if (!controllo.esito.trim()) {
      toast.warning('Compilare l\'esito del controllo');
      return;
    }

    // Valida e converti la data
    if (!isValidDate(controllo.data_controllo)) {
      toast.warning('Formato data non valido. Utilizzare il formato gg/mm/aaaa');
      return;
    }

    const dataControlloISO = formatDateForDB(controllo.data_controllo);
    if (!dataControlloISO) {
      toast.error('Errore nella conversione della data');
      return;
    }

    const prossima = addMonths(new Date(dataControlloISO), controllo.prossima_scadenza_mesi);

    const { error } = await supabase.from('controlli_costanti').insert({
      incarico_id: selectedIncaricoControllo,
      data_controllo: dataControlloISO,
      tipologia: controllo.tipologia,
      esito: controllo.esito,
      azioni_intraprese: controllo.azioni_intraprese,
      prossima_scadenza: prossima.toISOString().split('T')[0],
      checklist_cc: controllo.checklist_cc,
      esito_rischio: controllo.esito_rischio,
      annotazioni_cc: controllo.annotazioni_cc,
      nuovo_rischio_effettivo: controllo.nuovo_rischio_effettivo ? parseFloat(String(controllo.nuovo_rischio_effettivo)) : null
    });

    if (error) {
      toast.error('Errore nel salvataggio');
      return;
    }

    toast.success('Controllo registrato con successo');
    await loadControlli();
    addUserLog(`Controllo (${controllo.tipologia}) registrato per incarico ${selectedIncaricoNomeControllo}`)
    setView('list');
    setSelectedIncaricoControllo('');
    setSelectedIncaricoNomeControllo('');
    setIncaricoSearchQueryControllo('');
    setIncaricoHasValutazione(null);
    setControllo({
      data_controllo: formatDateToItalian(new Date()),
      tipologia: 'periodic',
      esito: '',
      azioni_intraprese: '',
      prossima_scadenza_mesi: 12,
      checklist_cc: emptyChecklist(),
      esito_rischio: '' as '' | 'confermato' | 'aumentato' | 'ridotto',
      annotazioni_cc: '',
      nuovo_rischio_effettivo: ''
    });
  }

  async function handleSaveSos() {
    if (!selectedIncaricoSos) {
      toast.warning('Selezionare un incarico');
      return;
    }

    if (!sos.motivi_sospetto.trim()) {
      toast.warning('Descrivere i motivi di sospetto');
      return;
    }

    // Valida e converti la data
    if (!isValidDate(sos.data_valutazione)) {
      toast.warning('Formato data non valido. Utilizzare il formato gg/mm/aaaa');
      return;
    }

    const dataValutazioneISO = formatDateForDB(sos.data_valutazione);
    if (!dataValutazioneISO) {
      toast.error('Errore nella conversione della data');
      return;
    }

    const { error } = await supabase.from('segnalazioni_sos').insert({
      incarico_id: selectedIncaricoSos,
      data_valutazione: dataValutazioneISO,
      motivi_sospetto: sos.motivi_sospetto,
      decisione: sos.decisione
    });

    if (error) {
      toast.error('Errore nel salvataggio');
      return;
    }

    toast.success('Valutazione SOS registrata con successo');
    await loadSegnalazioni();
    addUserLog(`Valutazione SOS registrata per incarico ${selectedIncaricoNomeSos}`)
    setView('list');
    setSelectedIncaricoSos('');
    setSelectedIncaricoNomeSos('');
    setIncaricoSearchQuerySos('');
    setSos({
      data_valutazione: formatDateToItalian(new Date()),
      motivi_sospetto: '',
      decisione: 'pending'
    });
  }

  async function handleUpdateSosStatus(sosId: string, codIncarico: string, newStatus: string) {
    const updateData: any = { decisione: newStatus };
    // [DEPRECATED 2026-05-07] currentSos/oldStatus servivano al diff client-side
    // ora gestito dal trigger log_storico_segnalazioni_sos.
    // const currentSos = segnalazioni.find(s => s.id === sosId);
    // const oldStatus = currentSos?.decisione || '';

    // Se lo stato è "sent", salva anche data_invio e protocollo_uif
    if (newStatus === 'sent') {
      if (!newSosDataInvio) {
        toast.warning('Inserire la data di invio alla UIF');
        return;
      }
      updateData.data_invio = newSosDataInvio;
      if (newSosProtocollo.trim()) {
        updateData.protocollo_uif = newSosProtocollo.trim();
      }
    }

    const { error } = await supabase
      .from('segnalazioni_sos')
      .update(updateData)
      .eq('id', sosId);

    if (error) {
      toast.error('Errore nell\'aggiornamento dello stato');
      console.error(error);
      return;
    }

    // [DEPRECATED 2026-05-07] Cambio decisione SOS tracciato dal trigger
    // log_storico_segnalazioni_sos sull'UPDATE di segnalazioni_sos.
    // Vedi migrazione 20260508000000_audit_storico_db_triggers.sql.
    // if (currentSos?.incarico_id) {
    //   await supabase.from('storico_modifiche').insert({
    //     entity_type: 'incarico',
    //     entity_id: currentSos.incarico_id,
    //     campo: 'decisione_sos',
    //     valore_precedente: oldStatus,
    //     valore_nuovo: newStatus,
    //   });
    // }

    toast.success('Stato aggiornato con successo');
    await loadSegnalazioni();
    addUserLog(`Stato aggiornato nella valutazione SOS ${codIncarico}`)
    setEditingSosId(null);
    setNewSosStatus('');
    setNewSosDataInvio('');
    setNewSosProtocollo('');
  }

  function startEditingSos(sosId: string, currentStatus: string) {
    setEditingSosId(sosId);
    setNewSosStatus(currentStatus);
    setNewSosDataInvio('');
    setNewSosProtocollo('');
  }

  function cancelEditingSos() {
    setEditingSosId(null);
    setNewSosStatus('');
    setNewSosDataInvio('');
    setNewSosProtocollo('');
  }

  if (view === 'controllo') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Nuovo Controllo Costante</h1>
          <button
            onClick={() => {
              setView('list');
              setSelectedIncaricoControllo('');
              setSelectedIncaricoNomeControllo('');
              setIncaricoSearchQueryControllo('');
              setIncaricoHasValutazione(null);
              setRecapData(null);
              setRecapOpen(false);
              setControllo({
                data_controllo: formatDateToItalian(new Date()),
                tipologia: 'periodic',
                esito: '',
                azioni_intraprese: '',
                prossima_scadenza_mesi: 12,
                checklist_cc: emptyChecklist(),
                esito_rischio: '' as '' | 'confermato' | 'aumentato' | 'ridotto',
                annotazioni_cc: '',
                nuovo_rischio_effettivo: ''
              });
            }}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Annulla
          </button>
        </div>

        <Card title="Dettagli Controllo">
          <div className="space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Incarico *
              </label>
              
              {/* Incarico selezionato */}
              {selectedIncaricoControllo && selectedIncaricoNomeControllo && (
                <div className="mb-2 flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900">{selectedIncaricoNomeControllo}</p>
                    <p className="text-xs text-blue-600">Incarico selezionato</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedIncaricoControllo('');
                      setSelectedIncaricoNomeControllo('');
                      setIncaricoSearchQueryControllo('');
                      setShowIncaricoSuggestionsControllo(false);
                      setIncaricoHasValutazione(null);
                      setRecapData(null);
                      setRecapOpen(false);
                    }}
                    className="text-blue-600 hover:text-blue-800 p-1"
                    title="Cambia incarico"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Campo di ricerca */}
              {!selectedIncaricoControllo && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Cerca incarico per codice o descrizione..."
                      value={incaricoSearchQueryControllo}
                      onChange={(e) => {
                        setIncaricoSearchQueryControllo(e.target.value);
                        setShowIncaricoSuggestionsControllo(true);
                      }}
                      onFocus={() => setShowIncaricoSuggestionsControllo(true)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  {/* Lista suggerimenti */}
                  {showIncaricoSuggestionsControllo && incaricoSearchQueryControllo && filteredIncarichiControllo.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredIncarichiControllo.slice(0, 10).map(incarico => (
                        <button
                          key={incarico.id}
                          onClick={() => {
                            setSelectedIncaricoControllo(incarico.id);
                            setSelectedIncaricoNomeControllo(`${incarico.codice_incarico} - ${incarico.descrizione}`);
                            setIncaricoSearchQueryControllo('');
                            setShowIncaricoSuggestionsControllo(false);
                            loadSuggestedPeriodicita(incarico.id);
                            loadRecapData(incarico.id);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                        >
                          <p className="font-medium text-gray-900">{incarico.codice_incarico}</p>
                          <p className="text-sm text-gray-600">{incarico.descrizione}</p>
                        </button>
                      ))}
                      {filteredIncarichiControllo.length > 10 && (
                        <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50">
                          Mostrando 10 di {filteredIncarichiControllo.length} risultati
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Nessun risultato */}
                  {showIncaricoSuggestionsControllo && incaricoSearchQueryControllo && filteredIncarichiControllo.length === 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
                      Nessun incarico trovato
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Riepilogo incarico - pannello apribile */}
            {recapData && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setRecapOpen(!recapOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-700">Riepilogo Incarico</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${recapOpen ? 'rotate-180' : ''}`} />
                </button>

                {recapOpen && (
                  <div className="px-4 py-4 space-y-4 text-sm">
                    {/* === CLIENTE === */}
                    {recapData.cliente && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4 text-blue-500" />
                          <h4 className="font-semibold text-gray-800">Cliente</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 pl-6">
                          <div><span className="text-gray-500">Ragione sociale:</span> <span className="font-medium">{recapData.cliente.ragione_sociale}</span></div>
                          <div><span className="text-gray-500">Codice:</span> {recapData.cliente.codice_cliente}</div>
                          <div><span className="text-gray-500">Tipo:</span> {recapData.cliente.tipo_cliente === 'persona_fisica' ? 'Persona Fisica' : recapData.cliente.tipo_cliente === 'impresa' ? 'Impresa' : 'Professionista'}</div>
                          {recapData.cliente.codice_fiscale && <div><span className="text-gray-500">C.F.:</span> {recapData.cliente.codice_fiscale}</div>}
                          {recapData.cliente.partita_iva && <div><span className="text-gray-500">P.IVA:</span> {recapData.cliente.partita_iva}</div>}
                          {recapData.cliente.natura_giuridica && <div><span className="text-gray-500">Natura giuridica:</span> {recapData.cliente.natura_giuridica}</div>}
                          {recapData.cliente.professione && <div><span className="text-gray-500">Professione:</span> {recapData.cliente.professione}</div>}
                          {recapData.cliente.paese && <div><span className="text-gray-500">Paese:</span> {recapData.cliente.paese}</div>}
                          {recapData.cliente.residenza && <div className="col-span-2"><span className="text-gray-500">Residenza:</span> {recapData.cliente.residenza}</div>}
                          <div className="col-span-2 flex gap-3 mt-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${recapData.cliente.pep ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {recapData.cliente.pep ? '⚠️ PEP' : '✓ Non PEP'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${recapData.cliente.sanzioni ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {recapData.cliente.sanzioni ? '⚠️ Sanzioni' : '✓ No Sanzioni'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* === INCARICO === */}
                    {recapData.incarico && (
                      <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Briefcase className="w-4 h-4 text-green-500" />
                          <h4 className="font-semibold text-gray-800">Incarico</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 pl-6">
                          <div><span className="text-gray-500">Codice:</span> <span className="font-medium">{recapData.incarico.codice_incarico}</span></div>
                          <div className="col-span-2"><span className="text-gray-500">Descrizione:</span> {recapData.incarico.descrizione}</div>
                          {recapData.prestazione && <div className="col-span-2"><span className="text-gray-500">Prestazione:</span> {recapData.prestazione.label}</div>}
                          {recapData.incarico.scopo_natura && <div className="col-span-2"><span className="text-gray-500">Scopo/Natura:</span> {recapData.incarico.scopo_natura}</div>}
                          <div><span className="text-gray-500">Data inizio:</span> {recapData.incarico.data_inizio ? formatDate(recapData.incarico.data_inizio) : 'N/D'}</div>
                          {recapData.incarico.data_fine && <div><span className="text-gray-500">Data fine:</span> {formatDate(recapData.incarico.data_fine)}</div>}
                          {recapData.incarico.importo_stimato && <div><span className="text-gray-500">Importo:</span> €{Number(recapData.incarico.importo_stimato).toLocaleString('it-IT')}</div>}
                        </div>
                      </div>
                    )}

                    {/* === VALUTAZIONI DEL RISCHIO (ultime 2) === */}
                    {recapData.valutazione ? (
                      <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Shield className="w-4 h-4 text-purple-500" />
                          <h4 className="font-semibold text-gray-800">Valutazioni del Rischio</h4>
                          {recapData.valutazionePrecedente && recapData.valutazione.classe_rischio !== recapData.valutazionePrecedente.classe_rischio && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              recapData.valutazione.classe_rischio > recapData.valutazionePrecedente.classe_rischio
                                ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}>
                              Classe {recapData.valutazione.classe_rischio > recapData.valutazionePrecedente.classe_rischio ? 'aumentata' : 'diminuita'}
                            </span>
                          )}
                          {recapData.valutazionePrecedente && recapData.valutazione.classe_rischio === recapData.valutazionePrecedente.classe_rischio && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Classe invariata</span>
                          )}
                        </div>
                        <div className="pl-6 space-y-3">
                          {/* Valutazione attuale */}
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Ultima valutazione</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                              <div><span className="text-gray-500">Data:</span> {formatDate(recapData.valutazione.data_valutazione)}</div>
                              <div><span className="text-gray-500">Rischio inerente:</span> {recapData.valutazione.rischio_inerente_prestazione?.toFixed(2) ?? 'N/D'}</div>
                              <div><span className="text-gray-500">Rischio specifico:</span> {recapData.valutazione.rischio_specifico?.toFixed(2) ?? 'N/D'}</div>
                              <div>
                                <span className="text-gray-500">Rischio effettivo:</span>{' '}
                                <span className={`font-semibold ${
                                  recapData.valutazione.classe_rischio >= 4 ? 'text-red-600' :
                                  recapData.valutazione.classe_rischio >= 3 ? 'text-orange-600' :
                                  recapData.valutazione.classe_rischio >= 2 ? 'text-yellow-600' : 'text-green-600'
                                }`}>
                                  {recapData.valutazione.rischio_effettivo?.toFixed(2)} — Classe {recapData.valutazione.classe_rischio}
                                </span>
                              </div>
                              {recapData.valutazione.prossimo_controllo && <div><span className="text-gray-500">Prossimo controllo:</span> {formatDate(recapData.valutazione.prossimo_controllo)}</div>}
                              {recapData.valutazione.misure_applicate && <div className="col-span-3"><span className="text-gray-500">Misure applicate:</span> {recapData.valutazione.misure_applicate}</div>}
                              {recapData.valutazione.note && <div className="col-span-3"><span className="text-gray-500">Note:</span> {recapData.valutazione.note}</div>}
                            </div>
                          </div>
                          {/* Valutazione precedente */}
                          {recapData.valutazionePrecedente ? (
                            <div className="border-t border-dashed border-gray-200 pt-2">
                              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Valutazione precedente</p>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-gray-500">
                                <div>Data: {formatDate(recapData.valutazionePrecedente.data_valutazione)}</div>
                                <div>Rischio inerente: {recapData.valutazionePrecedente.rischio_inerente_prestazione?.toFixed(2) ?? 'N/D'}</div>
                                <div>Rischio specifico: {recapData.valutazionePrecedente.rischio_specifico?.toFixed(2) ?? 'N/D'}</div>
                                <div>
                                  Rischio effettivo:{' '}
                                  <span className={`font-semibold ${
                                    recapData.valutazionePrecedente.classe_rischio >= 4 ? 'text-red-500' :
                                    recapData.valutazionePrecedente.classe_rischio >= 3 ? 'text-orange-500' :
                                    recapData.valutazionePrecedente.classe_rischio >= 2 ? 'text-yellow-500' : 'text-green-500'
                                  }`}>
                                    {recapData.valutazionePrecedente.rischio_effettivo?.toFixed(2)} — Classe {recapData.valutazionePrecedente.classe_rischio}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="border-t border-dashed border-gray-200 pt-2">
                              <p className="text-xs text-gray-400 italic">Nessuna valutazione precedente — questa è la prima valutazione per l'incarico</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-500 italic">Nessuna valutazione del rischio registrata</span>
                        </div>
                      </div>
                    )}

                    {/* === PRECEDENTE CONTROLLO === */}
                    {recapData.prevControllo ? (
                      <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Eye className="w-4 h-4 text-amber-500" />
                          <h4 className="font-semibold text-gray-800">Precedente Controllo Costante</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 pl-6">
                          <div><span className="text-gray-500">Data:</span> {formatDate(recapData.prevControllo.data_controllo)}</div>
                          <div><span className="text-gray-500">Tipologia:</span> {recapData.prevControllo.tipologia === 'periodic' ? 'Periodico' : 'Su evento'}</div>
                          {recapData.prevControllo.prossima_scadenza && <div><span className="text-gray-500">Scadenza prev.:</span> {formatDate(recapData.prevControllo.prossima_scadenza)}</div>}
                          {recapData.prevControllo.esito && <div className="col-span-3"><span className="text-gray-500">Esito:</span> {recapData.prevControllo.esito}</div>}
                          {recapData.prevControllo.azioni_intraprese && <div className="col-span-3"><span className="text-gray-500">Azioni intraprese:</span> {recapData.prevControllo.azioni_intraprese}</div>}
                          {recapData.prevControllo.esito_rischio && (
                            <div>
                              <span className="text-gray-500">Esito rischio:</span>{' '}
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                recapData.prevControllo.esito_rischio === 'confermato' ? 'bg-green-100 text-green-700' :
                                recapData.prevControllo.esito_rischio === 'aumentato' ? 'bg-red-100 text-red-700' :
                                recapData.prevControllo.esito_rischio === 'ridotto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {recapData.prevControllo.esito_rischio === 'confermato' ? 'Confermato' :
                                 recapData.prevControllo.esito_rischio === 'aumentato' ? 'Aumentato' :
                                 recapData.prevControllo.esito_rischio === 'ridotto' ? 'Ridotto' : recapData.prevControllo.esito_rischio}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-500 italic">Nessun controllo costante precedente</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data Controllo * (gg/mm/aaaa)
                </label>
                <input
                  type="date"
                  onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                  value={formatDateInv(controllo.data_controllo)}
                  onChange={(e) => {
                    const formattedDate = formatDate(e.target.value)
                    setControllo({ ...controllo, data_controllo:formattedDate })
                  }}
                  placeholder="gg/mm/aaaa"
                  maxLength={10}
                  className={`w-full px-3 pt-2 pb-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    controllo.data_controllo && !isValidDate(controllo.data_controllo)
                      ? 'border-red-500'
                      : 'border-gray-300'
                  }`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipologia *
                </label>
                <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow"> 
                  <select
                    value={controllo.tipologia}
                    onChange={(e) => {setControllo({ ...controllo, tipologia: e.target.value })}}
                    className="w-full rounded-lg focus:outline-none focus:ring-0"
                  >
                    <option value="periodic">Periodico</option>
                    <option value="event-driven">Evento Specifico</option>
                  </select>
                </div>
              </div>
            </div>

            {/* =================== CHECKLIST CONTROLLO COSTANTE =================== */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Checklist Controllo Costante
              </label>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] bg-gray-100 text-xs font-semibold text-gray-600 border-b border-gray-200">
                  <div className="px-3 py-2">Controllo</div>
                  <div className="px-1 py-2 text-center">Sì</div>
                  <div className="px-1 py-2 text-center">No</div>
                  <div className="px-1 py-2 text-center">N.a.</div>
                </div>
                {/* Righe */}
                {CHECKLIST_CC_ITEMS.map((item) => (
                  <div key={item.key} className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                    <div className="px-3 py-2 text-sm text-gray-700">{item.testo}</div>
                    {(['si', 'no', 'na'] as const).map((val) => (
                      <div key={val} className="flex items-center justify-center">
                        <input
                          type="radio"
                          name={item.key}
                          checked={controllo.checklist_cc[item.key] === val}
                          onChange={() => setControllo(prev => ({
                            ...prev,
                            checklist_cc: { ...prev.checklist_cc, [item.key]: val }
                          }))}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 italic mt-1"> * N.a. = Non applicabile</p>
            </div>

            {/* =================== ANNOTAZIONI =================== */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Annotazioni
              </label>
              <textarea
                value={controllo.annotazioni_cc}
                onChange={(e) => setControllo({ ...controllo, annotazioni_cc: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ove opportuno, descrivere/motivare i controlli (es. provenienza fondi, incongruenze riscontrate, approfondimenti effettuati)..."
              />
            </div>

            {/* =================== ESITO LIVELLO DI RISCHIO =================== */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Esito livello di rischio
              </label>
              <div className="flex gap-6">
                {([
                  { value: 'confermato', label: 'Confermato' },
                  { value: 'aumentato', label: 'Aumentato' },
                  { value: 'ridotto', label: 'Ridotto' },
                ] as const).map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="esito_rischio"
                      checked={controllo.esito_rischio === opt.value}
                      onChange={() => {
                        setControllo(prev => ({ 
                          ...prev, 
                          esito_rischio: opt.value, 
                          // Se è aumentato/ridotto mettiamo il valore attuale, se confermato svuotiamo
                          nuovo_rischio_effettivo: (opt.value === 'aumentato' || opt.value === 'ridotto') 
                            ? (recapData?.valutazione?.rischio_effettivo || '') 
                            : '' 
                        }));
                      }}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>
              {(controllo.esito_rischio === 'aumentato' || controllo.esito_rischio === 'ridotto') && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nuovo valore rischio effettivo *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="4"
                    step="0.1"
                    value={controllo.nuovo_rischio_effettivo}
                    onChange={(e) => setControllo({ ...controllo, nuovo_rischio_effettivo: e.target.value })}
                    className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="es. 2.8"
                  />
                  <p className="text-xs text-gray-500 mt-1">Inserire un valore tra 1 e 4 (scala rischio effettivo)</p>
                </div>
              )}
            </div>

            {/* =================== ESITO DEL CONTROLLO (testo libero) =================== */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Esito del Controllo *
              </label>
              <textarea
                value={controllo.esito}
                onChange={(e) => setControllo({ ...controllo, esito: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Descrivere l'esito del controllo..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Azioni Intraprese
              </label>
              <textarea
                value={controllo.azioni_intraprese}
                onChange={(e) => setControllo({ ...controllo, azioni_intraprese: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Eventuali azioni correttive..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prossimo Controllo
              </label>
              {incaricoHasValutazione === false && (
                <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-800 font-medium">Questo incarico non ha ancora una valutazione del rischio.</p>
                  <p className="text-xs text-amber-600 mt-0.5">La periodicità non può essere calcolata automaticamente. Seleziona manualmente il periodo.</p>
                </div>
              )}
              {incaricoHasValutazione === false ? (
                <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                  <select
                    value={controllo.prossima_scadenza_mesi}
                    onChange={(e) => setControllo({ ...controllo, prossima_scadenza_mesi: parseInt(e.target.value) })}
                    className="w-full rounded-lg focus:outline-none focus:ring-0"
                  >
                    <option value="6">6 mesi (Rischio Alto)</option>
                    <option value="12">12 mesi (Rischio Medio)</option>
                    <option value="24">24 mesi (Rischio Basso)</option>
                    <option value="36">36 mesi (Rischio Molto Basso)</option>
                  </select>
                </div>
              ) : incaricoHasValutazione === true ? (
                <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 font-medium">
                  {controllo.prossima_scadenza_mesi} mesi
                  <span className="text-blue-500 font-normal ml-1">(calcolato dalla classe di rischio)</span>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Seleziona un incarico per calcolare la periodicità</p>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSaveControllo}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Save className="w-4 h-4" />
                Salva Controllo
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (view === 'sos') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Valutazione Operazione Sospetta</h1>
          <button
            onClick={() => setView('list')}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Annulla
          </button>
        </div>

        <Card>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-900">
                <p className="font-semibold mb-1">Attenzione - Procedura SOS</p>
                <p>La segnalazione di operazioni sospette è un obbligo normativo ai sensi dell'art. 35 D.Lgs. 231/2007. Compilare con massima attenzione e riservatezza.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Incarico *
              </label>
              
              {/* Incarico selezionato */}
              {selectedIncaricoSos && selectedIncaricoNomeSos && (
                <div className="mb-2 flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900">{selectedIncaricoNomeSos}</p>
                    <p className="text-xs text-red-600">Incarico selezionato</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedIncaricoSos('');
                      setSelectedIncaricoNomeSos('');
                      setIncaricoSearchQuerySos('');
                      setShowIncaricoSuggestionsSos(false);
                    }}
                    className="text-red-600 hover:text-red-800 p-1"
                    title="Cambia incarico"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Campo di ricerca */}
              {!selectedIncaricoSos && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Cerca incarico per codice o descrizione..."
                      value={incaricoSearchQuerySos}
                      onChange={(e) => {
                        setIncaricoSearchQuerySos(e.target.value);
                        setShowIncaricoSuggestionsSos(true);
                      }}
                      onFocus={() => setShowIncaricoSuggestionsSos(true)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  {/* Lista suggerimenti */}
                  {showIncaricoSuggestionsSos && incaricoSearchQuerySos && filteredIncarichiSos.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredIncarichiSos.slice(0, 10).map(incarico => (
                        <button
                          key={incarico.id}
                          onClick={() => {
                            setSelectedIncaricoSos(incarico.id);
                            setSelectedIncaricoNomeSos(`${incarico.codice_incarico} - ${incarico.descrizione}`);
                            setIncaricoSearchQuerySos('');
                            setShowIncaricoSuggestionsSos(false);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                        >
                          <p className="font-medium text-gray-900">{incarico.codice_incarico}</p>
                          <p className="text-sm text-gray-600">{incarico.descrizione}</p>
                        </button>
                      ))}
                      {filteredIncarichiSos.length > 10 && (
                        <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50">
                          Mostrando 10 di {filteredIncarichiSos.length} risultati
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Nessun risultato */}
                  {showIncaricoSuggestionsSos && incaricoSearchQuerySos && filteredIncarichiSos.length === 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
                      Nessun incarico trovato
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data Valutazione * (gg/mm/aaaa)
              </label>
              <input
                type="date"
                value={formatDateInv(sos.data_valutazione)}
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                onChange={(e) => {
                  const formattedData = formatDate(e.target.value)
                  setSos({ ...sos, data_valutazione: formattedData })}}
                placeholder="gg/mm/aaaa"
                maxLength={10}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  sos.data_valutazione && !isValidDate(sos.data_valutazione)
                    ? 'border-red-500'
                    : 'border-gray-300'
                }`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Motivi di Sospetto *
              </label>
              <textarea
                value={sos.motivi_sospetto}
                onChange={(e) => setSos({ ...sos, motivi_sospetto: e.target.value })}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Descrivere dettagliatamente i motivi che hanno generato il sospetto di riciclaggio o finanziamento del terrorismo..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Includere: incoerenza con profilo economico, strutturazione importi, paesi ad alto rischio, informazioni anomale
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Decisione
              </label>
              <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow"> 
                  <select
                    value={sos.decisione}
                    onChange={(e) => {
                      setSos({ ...sos, decisione: e.target.value }) 
                    }}
                    className="w-full rounded-lg focus:outline-none focus:ring-0"
                  >
                    <option value="pending">In Valutazione</option>
                    <option value="archived">Archiviata (Sospetto Non Fondato)</option>
                    <option value="sent">Segnalazione Inviata a UIF</option>
                  </select>
                </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSaveSos}
                className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Save className="w-4 h-4" />
                Salva Valutazione
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">RT3- Controllo Costante e Monitoraggio</h1>
        <p className="text-gray-600 mt-1">
          Gestione controlli periodici, astensione e segnalazioni operazioni sospette (Art. 19, 23, 35 D.Lgs. 231/2007)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <div className="text-center py-8">
            <Eye className="w-16 h-16 text-blue-500 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Controllo Costante</h3>
            <p className="text-sm text-gray-600 mb-6">
              Monitoraggio periodico proporzionato al rischio dell'incarico
            </p>
            <button
              onClick={() => setView('controllo')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Registra Controllo
            </button>
          </div>
        </Card>

        <Card>
          <div className="text-center py-8">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Segnalazione SOS</h3>
            <p className="text-sm text-gray-600 mb-6">
              Valutazione e gestione operazioni sospette
            </p>
            <button
              onClick={() => setView('sos')}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Valuta SOS
            </button>
          </div>
        </Card>
      </div>

      <Card title="Frequenze Controllo Costante">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold">
                4
              </div>
              <span className="font-semibold text-gray-900">Rischio Molto Significativo</span>
            </div>
            <p className="text-sm text-gray-600">Frequenza: 6-12 mesi</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold">
                3
              </div>
              <span className="font-semibold text-gray-900">Rischio Abbastanza Significativo</span>
            </div>
            <p className="text-sm text-gray-600">Frequenza: 12-24 mesi</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center text-sm font-bold">
                2
              </div>
              <span className="font-semibold text-gray-900">Rischio Poco Significativo</span>
            </div>
            <p className="text-sm text-gray-600">Frequenza: 24-36 mesi</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-bold">
                1
              </div>
              <span className="font-semibold text-gray-900">Rischio Non Significativo</span>
            </div>
            <p className="text-sm text-gray-600">Regole di condotta semplificate</p>
          </div>
        </div>
      </Card>

      <Card title="Quando astenersi o segnalare un'operazione sospetta">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Astensione</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">•</span>
                <span>Impossibilità persistente di identificare cliente o titolare effettivo</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">•</span>
                <span>Rifiuto di fornire informazioni essenziali</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">•</span>
                <span>Sospetto di finalità di riciclaggio/FT</span>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Segnalazione SOS</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                <span>Operazioni incoerenti con profilo economico</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                <span>Strutturazione per eludere obblighi</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                <span>Coinvolgimento paesi ad alto rischio</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                <span>Informazioni che generano sospetto ragionevole</span>
              </li>
            </ul>
          </div>
        </div>
      </Card>

      <Card title="Controlli Costanti Registrati">
        {controlli.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Nessun controllo registrato</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              // Raggruppa per incarico e ordina i gruppi per scadenza più urgente.
              type Gruppo = {
                key: string;
                codice: string;
                descrizione: string;
                controlli: ControlloCompleto[];
                minScad: string;
              };
              const mappa = new Map<string, Gruppo>();
              for (const c of controlli) {
                const key = c.incarico_id || c.incarico.codice_incarico;
                const g = mappa.get(key);
                if (g) {
                  g.controlli.push(c);
                  if (c.prossima_scadenza && (!g.minScad || c.prossima_scadenza < g.minScad)) {
                    g.minScad = c.prossima_scadenza;
                  }
                } else {
                  mappa.set(key, {
                    key,
                    codice: c.incarico.codice_incarico,
                    descrizione: c.incarico.descrizione,
                    controlli: [c],
                    minScad: c.prossima_scadenza || '',
                  });
                }
              }
              const gruppi = Array.from(mappa.values()).sort((a, b) => {
                if (!a.minScad && !b.minScad) return 0;
                if (!a.minScad) return 1;
                if (!b.minScad) return -1;
                return a.minScad.localeCompare(b.minScad);
              });
              return gruppi.map((g) => {
                // Ordina i controlli del gruppo dal più recente (per data_controllo DESC)
                const controlliOrdinati = [...g.controlli].sort(
                  (a, b) => new Date(b.data_controllo).getTime() - new Date(a.data_controllo).getTime()
                );
                const ultimo = controlliOrdinati[0];
                // Calcolo stato scadenza del controllo più recente per header
                const ultimoScad = new Date(ultimo.prossima_scadenza);
                const oggi = new Date();
                ultimoScad.setHours(0, 0, 0, 0);
                oggi.setHours(0, 0, 0, 0);
                const ultimoDiffDays = Math.ceil((ultimoScad.getTime() - oggi.getTime()) / (1000 * 3600 * 24));
                const ultimoScaduta = ultimoDiffDays <= 0;
                const ultimoInScadenza = !ultimoScaduta && ultimoDiffDays <= 30;
                const ultimoColor = ultimoScaduta ? 'text-red-600' : ultimoInScadenza ? 'text-orange-600' : 'text-gray-500';
                const UltimoIcon = (ultimoScaduta || ultimoInScadenza) ? Clock : Calendar;
                return (
                <details key={g.key} className="group/grp border border-gray-200 rounded-lg">
                  <summary className="p-3 cursor-pointer hover:bg-gray-50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center gap-3">
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform group-open/grp:rotate-90" />
                      <Briefcase className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-gray-900">{g.codice}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            ultimo.tipologia === 'periodic'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}>
                            {ultimo.tipologia === 'periodic' ? 'Periodico' : 'Evento Specifico'}
                          </span>
                          {g.descrizione && (
                            <span className="text-xs text-gray-500 truncate">— {g.descrizione}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Ultimo: {new Date(ultimo.data_controllo).toLocaleDateString('it-IT')}</span>
                          <span className={`inline-flex items-center gap-1 ${ultimoColor}`}>
                            <UltimoIcon className="w-3 h-3" />
                            Prossimo: {ultimoScad.toLocaleDateString('it-IT')}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 font-normal whitespace-nowrap">
                        {g.controlli.length} controll{g.controlli.length === 1 ? 'o' : 'i'}
                      </span>
                    </div>
                  </summary>
                  <div className="px-3 pb-3 pt-2 border-t border-gray-200 space-y-2">
                  {controlliOrdinati.map((ctrl) => (
              <details key={ctrl.id} className="group border border-gray-200 rounded-lg">
                <summary className="p-4 cursor-pointer hover:bg-gray-50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center gap-3">
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform group-open:rotate-90" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          ctrl.tipologia === 'periodic'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {ctrl.tipologia === 'periodic' ? 'Periodico' : 'Evento Specifico'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>Data: {new Date(ctrl.data_controllo).toLocaleDateString('it-IT')}</span>
                        {(() => {
                          const scad = new Date(ctrl.prossima_scadenza);
                          const today = new Date();
                          scad.setHours(0, 0, 0, 0);
                          today.setHours(0, 0, 0, 0);
                          const diffDays = Math.ceil((scad.getTime() - today.getTime()) / (1000 * 3600 * 24));
                          const isScaduta = diffDays <= 0;
                          const isInScadenza = !isScaduta && diffDays <= 30;
                          const colorClass = isScaduta ? 'text-red-600' : isInScadenza ? 'text-orange-600' : 'text-gray-500';
                          const Icon = (isScaduta || isInScadenza) ? Clock : Calendar;
                          return (
                            <span className={`inline-flex items-center gap-1 ${colorClass}`}>
                              <Icon className="w-3 h-3" />
                              Prossimo: {scad.toLocaleDateString('it-IT')}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); openAv7Modal(ctrl); }}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-emerald-300 text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors text-xs font-medium"
                    >
                      <Download className="w-3.5 h-3.5" />
                      AV.7
                    </button>
                    {puoCestina && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCestinaControllo(ctrl.id); }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Sposta nel cestino"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    )}
                  </div>
                </summary>
                <div className="px-4 pb-4 border-t border-gray-200 pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1">Esito del Controllo</p>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{ctrl.esito}</p>
                    </div>
                    {ctrl.esito_rischio && (
                      <div>
                        <p className="text-xs font-medium text-gray-700 mb-1">Esito Valutazione Rischio</p>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          ctrl.esito_rischio === 'confermato' ? 'bg-green-100 text-green-700' :
                          ctrl.esito_rischio === 'aumentato' ? 'bg-red-100 text-red-700' :
                          ctrl.esito_rischio === 'ridotto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {ctrl.esito_rischio === 'confermato' ? 'Rischio Confermato' :
                           ctrl.esito_rischio === 'aumentato' ? 'Rischio Aumentato' :
                           ctrl.esito_rischio === 'ridotto' ? 'Rischio Ridotto' : ctrl.esito_rischio}
                        </span>
                      </div>
                    )}
                    {ctrl.azioni_intraprese && (
                      <div>
                        <p className="text-xs font-medium text-gray-700 mb-1">Azioni Intraprese</p>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{ctrl.azioni_intraprese}</p>
                      </div>
                    )}
                    {ctrl.annotazioni_cc && (
                      <div>
                        <p className="text-xs font-medium text-gray-700 mb-1">Annotazioni</p>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{ctrl.annotazioni_cc}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    Registrato il {new Date(ctrl.created_at).toLocaleDateString('it-IT', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </details>
                  ))}
                  </div>
                </details>
                );
              });
            })()}
          </div>
        )}
      </Card>

      <Card title="Segnalazioni Operazioni Sospette Registrate">
        {segnalazioni.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Nessuna segnalazione registrata</p>
          </div>
        ) : (
          <div className="space-y-3">
            {segnalazioni.map((sos) => (
              <details key={sos.id} className="group border border-gray-200 rounded-lg">
                <summary className="p-4 cursor-pointer hover:bg-gray-50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center gap-3">
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform group-open:rotate-90" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{sos.incarico.codice_incarico}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          sos.decisione === 'sent'
                            ? 'bg-red-100 text-red-700'
                            : sos.decisione === 'archived'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {sos.decisione === 'sent' ? 'Inviata a UIF' :
                           sos.decisione === 'archived' ? 'Archiviata' :
                           'In Valutazione'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{sos.incarico.descrizione}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        Data valutazione: {new Date(sos.data_valutazione).toLocaleDateString('it-IT')}
                      </p>
                    </div>
                    {puoCestina && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCestinaSegnalazione(sos.id); }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors self-start"
                      title="Sposta nel cestino"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    )}
                  </div>
                </summary>
                <div className="px-4 pb-4 border-t border-gray-200 pt-4 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-1">Motivi di Sospetto</p>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{sos.motivi_sospetto}</p>
                  </div>
                  {sos.decisione === 'sent' && (sos.data_invio || sos.protocollo_uif) && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-1">
                      {sos.data_invio && (
                        <p className="text-xs text-red-700">
                          <span className="font-medium">Data invio UIF:</span> {new Date(sos.data_invio).toLocaleDateString('it-IT')}
                        </p>
                      )}
                      {sos.protocollo_uif && (
                        <p className="text-xs text-red-700">
                          <span className="font-medium">Protocollo UIF:</span> {sos.protocollo_uif}
                        </p>
                      )}
                    </div>
                  )}
                  {sos.decisione !== 'sent' && (
                    <div className="pt-3 border-t border-gray-200">
                      {editingSosId === sos.id ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Aggiorna Stato
                            </label>
                            <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                              <select
                                value={newSosStatus}
                                onChange={(e) => setNewSosStatus(e.target.value)}
                                className="w-full rounded-lg focus:outline-none focus:ring-0"
                              >
                                <option value="pending">In Valutazione</option>
                                <option value="archived">Archiviata (Sospetto Non Fondato)</option>
                                <option value="sent">Segnalazione Inviata a UIF</option>
                              </select>
                            </div>
                          </div>
                          {newSosStatus === 'sent' && (
                            <div className="space-y-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                              <div>
                                <label className="block text-xs font-medium text-red-700 mb-1">Data Invio a UIF * (gg/mm/aaaa)</label>
                                <input
                                  type="date"
                                  value={newSosDataInvio}
                                  onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                                  onChange={(e) => setNewSosDataInvio(e.target.value)}
                                  className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-red-700 mb-1">Protocollo UIF</label>
                                <input
                                  type="text"
                                  value={newSosProtocollo}
                                  onChange={(e) => setNewSosProtocollo(e.target.value)}
                                  placeholder="Numero protocollo UIF (opzionale)"
                                  className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                />
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdateSosStatus(sos.id, sos.incarico.codice_incarico, newSosStatus)}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              <Save className="w-3 h-3" />
                              Salva
                            </button>
                            <button
                              onClick={cancelEditingSos}
                              className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditingSos(sos.id, sos.decisione)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Modifica Stato
                        </button>
                      )}
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500">
                    Registrata il {new Date(sos.created_at).toLocaleDateString('it-IT', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric', 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>

      {/* Modale download AV.7 con allegati */}
      {av7ModalCtrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black bg-opacity-30" onClick={() => !av7Downloading && setAv7ModalCtrl(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Scarica AV.7</h3>
                <p className="text-sm text-gray-500 mt-0.5">Controllo Costante</p>
              </div>
              <button
                onClick={() => setAv7ModalCtrl(null)}
                disabled={av7Downloading}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Allegati */}
            <div className="flex-1 overflow-y-auto px-5 pb-3">
              <p className="text-sm font-semibold text-gray-700 mb-1">Documenti allegati <span className="text-gray-400 font-normal">(opzionale)</span></p>
              <div className="text-xs text-gray-500 mb-3">
                <p className="mb-1">Cosa succede ai documenti selezionati:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>Vengono elencati come allegati nel modulo <span className="font-semibold text-gray-700">AV.7</span>.</li>
                  <li>Se in formato digitale, vengono inclusi in un archivio <span className="font-semibold text-gray-700">.zip</span> insieme al modulo.</li>
                  <li>I documenti contrassegnati come <span className="font-semibold text-gray-700">Cartaceo</span> vengono solo citati nell'elenco del modulo: non essendo in formato digitale, non possono essere inclusi nell'archivio .zip.</li>
                </ul>
              </div>
              {av7LoadingAllegati ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento allegati...
                </div>
              ) : av7Allegati.length === 0 ? (
                <p className="text-sm text-gray-400 py-1">Nessun documento allegato disponibile.</p>
              ) : (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={av7IncludeAllegati}
                      onChange={(e) => {
                        setAv7IncludeAllegati(e.target.checked);
                        setAv7SelectedIds(e.target.checked ? new Set(av7Allegati.map(d => d.id)) : new Set());
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Includi tutti i documenti allegati ({av7Allegati.length})
                    </span>
                  </label>
                  <p className="text-xs text-gray-400 ml-6 -mt-1">
                    {av7IncludeAllegati ? 'Tutti gli allegati verranno inclusi nello ZIP.' : 'Seleziona qui sotto i documenti da includere.'}
                  </p>
                  {!av7IncludeAllegati && (
                    <div className="ml-1 space-y-1.5 max-h-40 overflow-y-auto border-l-2 border-gray-100 pl-2 pr-1">
                      {av7Allegati.map(doc => {
                        const tipLabel = TIPOLOGIE_DOCUMENTO.find(t => t.value === doc.tipologia)?.label || doc.tipologia;
                        const cartaceo = isCartaceo(doc);
                        return (
                          <label key={doc.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={av7SelectedIds.has(doc.id)}
                              onChange={(e) => {
                                const next = new Set(av7SelectedIds);
                                if (e.target.checked) next.add(doc.id); else next.delete(doc.id);
                                setAv7SelectedIds(next);
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

            {/* Pulsante scarica */}
            <div className="px-5 pb-5 pt-2 flex-shrink-0 border-t border-gray-100 bg-white">
              <button
                onClick={handleDownloadCC}
                disabled={av7Downloading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {av7Downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {av7Downloading ? 'Generazione in corso...' : 'Scarica AV.7'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
