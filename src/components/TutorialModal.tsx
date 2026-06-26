import { useState, type ReactNode } from 'react';
import {
  X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Shield, Users, BookOpen, FileCheck, FolderOpen, Eye, AlertTriangle,
  User, Settings, Plus, Edit3, Trash2, Download, Save, Search,
  Archive, RefreshCw, ArrowRightLeft, History, Upload, Lock,
  Briefcase, AlertCircle, Clock, FileText, CheckCircle,
  MessageSquarePlus, ClipboardList, GraduationCap, HelpCircle,
  UserRoundCog, Copy, ScrollText, RotateCcw, Cookie, MoreVertical,
  Bot, Sparkles, type LucideIcon,
} from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';

/* ------------------------------------------------------------------ */
/*  Inline icon helper                                                 */
/* ------------------------------------------------------------------ */
function Ico({ icon: Icon, className = 'w-4 h-4 inline-block align-text-bottom mx-0.5' }: { icon: LucideIcon; className?: string }) {
  return <Icon className={className} />;
}

/* ------------------------------------------------------------------ */
/*  Collapsible detail block                                           */
/*  Reset is handled by the parent via a step-scoped `key` prop.       */
/* ------------------------------------------------------------------ */
function Dettaglio({ titolo, children, defaultOpen = false }: { titolo: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
      >
        {titolo}
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="px-3 py-2 text-sm text-gray-600 space-y-2 bg-white">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bullet with optional icon                                          */
/* ------------------------------------------------------------------ */
interface Bullet {
  text: ReactNode;
  icon?: LucideIcon;
  /** If set, bullet is only shown for these roles. Omit = shown to everyone. */
  roles?: string[];
}

/* ------------------------------------------------------------------ */
/*  Step definition                                                    */
/* ------------------------------------------------------------------ */
interface TutorialStep {
  id: string;
  title: string;
  icon: LucideIcon;
  color: string;
  content: ReactNode[];
  bullets?: Bullet[];
  details?: { titolo: string; body: ReactNode; defaultOpen?: boolean; roles?: string[] }[];
  /** If set, the step is only shown for these roles. Omit = shown to everyone. */
  roles?: string[];
}

/* ------------------------------------------------------------------ */
/*  TUTORIAL STEPS                                                     */
/* ------------------------------------------------------------------ */
const TUTORIAL_STEPS: TutorialStep[] = [
  /* 0 ── Intro ---------------------------------------------------- */
  {
    id: 'intro',
    title: 'Benvenuto in AdeguataVerifica.Pro',
    icon: Shield,
    color: 'text-blue-600 bg-blue-100',
    content: [
      'AdeguataVerifica.Pro è la piattaforma di gestione degli adempimenti antiriciclaggio del tuo studio, conforme al D.Lgs. 231/2007 e alle Regole Tecniche CNDCEC 2025.',
      'Funziona come un vero e proprio registro operativo: centralizza i dati dei clienti, documenta ogni attività svolta e ti segnala automaticamente scadenze e situazioni da gestire.',
      'Il flusso operativo si articola in questi passaggi:',
    ],
    bullets: [
      { text: <>Registrazione del cliente e degli incarichi nel <strong>Fascicolo Cliente</strong></>, icon: BookOpen },
      { text: <>Compilazione dell'<strong>Autovalutazione dello Studio (RT1)</strong> (solo per gli amministratori)</>, icon: FileCheck },
      { text: <>Valutazione del rischio tramite l'<strong>Adeguata Verifica (RT2)</strong></>, icon: FolderOpen },
      { text: <>Registrazione dei controlli nel <strong>Monitoraggio Continuo (RT3)</strong></>, icon: Eye },
      { text: <><strong>Alert automatici</strong> &mdash; il sistema segnala scadenze e dati mancanti</>, icon: AlertTriangle },
    ],
    details: [
      {
        titolo: 'Come navigare nell\'applicazione',
        body: (
          <>
            <p>La barra di navigazione in alto ti permette di accedere a tutte le sezioni. Ogni sezione è identificata da un'icona:</p>
            <ul className="list-none space-y-1 mt-1">
              <li><Ico icon={Shield} /> Dashboard &mdash; panoramica generale</li>
              <li><Ico icon={Users} /> Anagrafica &mdash; registro persone</li>
              <li><Ico icon={BookOpen} /> Fascicolo &mdash; gestione clienti</li>
              <li><Ico icon={FileCheck} /> RT1 &mdash; autovalutazione studio (solo per gli amministratori)</li>
              <li><Ico icon={FolderOpen} /> RT2 &mdash; adeguata verifica</li>
              <li><Ico icon={Eye} /> RT3 &mdash; monitoraggio continuo</li>
              <li><Ico icon={AlertTriangle} /> Alert &mdash; notifiche e scadenze</li>
            </ul>
            <p className="mt-2">In alto a destra trovi:</p>
            <ul className="list-none space-y-1 mt-1">
              <li><Ico icon={HelpCircle} /> Menu Aiuto &mdash; segnalazioni, guida</li>
              <li><Ico icon={User} /> Menu Utente &mdash; profilo, impostazioni, logout</li>
            </ul>
          </>
        ),
      },
    ],
  },

  /* 1 ── Dashboard ------------------------------------------------- */
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: Shield,
    color: 'text-blue-600 bg-blue-100',
    content: [
      'La Dashboard offre una panoramica immediata dello stato del tuo studio:',
    ],
    bullets: [
      { text: <>Card <strong>Collaboratori</strong> <Ico icon={UserRoundCog} /> &mdash; numero e attività recente di ogni membro dello studio</>, icon: UserRoundCog, roles: ['admin', 'superadmin'] },
      { text: <>Card <strong>Clienti</strong> <Ico icon={Users} /> &mdash; totale clienti registrati</>, icon: Users },
      { text: <>Card <strong>Incarichi Attivi</strong> <Ico icon={Briefcase} /> &mdash; incarichi correnti</>, icon: Briefcase },
      { text: <>Card <strong>Alert Aperti</strong> <Ico icon={AlertCircle} /> &mdash; numero di alert da gestire (rosso se &gt; 0)</>, icon: AlertCircle },
      { text: <>Card <strong>Rischio Residuo RT1</strong> <Ico icon={Shield} /> &mdash; punteggio corrente con badge colorato</>, icon: Shield, roles: ['admin', 'superadmin'] },
      { text: <>Card <strong>Rischio Residuo RT1</strong> <Ico icon={Shield} /> &mdash; punteggio dell'autovalutazione dello studio, gestita dall'amministratore</>, icon: Shield, roles: ['user'] },
    ],
    details: [
      {
        titolo: 'Dettaglio card Collaboratori',
        roles: ['admin', 'superadmin'],
        body: (
          <>
            <p>La lista Collaboratori mostra per ogni membro dello studio:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>L'<strong>ultima attività</strong> registrata <Ico icon={ScrollText} /> con la data, visibile direttamente sotto il nome</li>
              <li>Cliccando sulla riga <Ico icon={ChevronRight} /> puoi visualizzare le <strong>ultime 15 attività</strong> con dettaglio azione e data/ora</li>
              <li>I log si aggiornano in <strong>tempo reale</strong>.</li>
            </ul>
          </>
        ),
      },
      {
        titolo: 'Card RT1 e Riferimenti Normativi',
        body: (
          <>
            <p>La card RT1 mostra i punteggi di rischio attuali (Inerente, Vulnerabilità, Residuo) e la data di validità con avvisi di scadenza <Ico icon={Clock} />.</p>
            <p className="mt-1">In basso trovi la sezione <strong>Riferimenti Normativi</strong> con i rimandi a D.Lgs. 231/2007 (Artt. 16-36) e Regole Tecniche CNDCEC 2025 (RT1-4).</p>
          </>
        ),
      },
    ],
  },

  /* 2 ── Anagrafica ------------------------------------------------ */
  {
    id: 'anagrafica',
    title: 'Anagrafica',
    icon: Users,
    color: 'text-indigo-600 bg-indigo-100',
    content: [
      'La sezione Anagrafica è il registro di tutte le persone fisiche di cui lo studio ha traccia. Non è un passaggio obbligatorio nel flusso di lavoro: i dati anagrafici vengono estratti automaticamente quando crei un cliente (dalla persona fisica stessa, dai titolari effettivi di un\'impresa, dal rappresentante legale, ecc.).',
      'L\'Anagrafica ti permette di consultare e gestire questi dati in un unico punto, e di verificare se la stessa persona è coinvolta in più clienti o ruoli diversi.',
    ],
    bullets: [
      { text: <>Crea manualmente una nuova persona con <Ico icon={Plus} /> <strong>Nuova Persona</strong></>, icon: Plus },
      { text: <>Cerca per nome o codice fiscale tramite la barra <Ico icon={Search} /></>, icon: Search },
      { text: <>Modifica i dati con <Ico icon={Edit3} /> sulla card della persona</>, icon: Edit3 },
      { text: <>Verifica i <strong>clienti associati</strong> a ciascuna persona (la card si capovolge mostrando tutti i collegamenti)</>, icon: Users },
    ],
    details: [
      {
        titolo: 'Come si popola l\'Anagrafica',
        body: (
          <>
            <p>L'Anagrafica si alimenta automaticamente quando crei un cliente :</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Cliente Persona Fisica</strong> &mdash; i dati della persona vengono registrati in Anagrafica</li>
              <li><strong>Cliente Impresa</strong> &mdash; vengono registrati i Titolari Effettivi e il Rappresentante Legale</li>
              <li><strong>Cliente Professionista</strong> &mdash; come per la persona fisica</li>
            </ul>
            <p className="mt-1">Puoi comunque aggiungere persone manualmente se necessario.</p>
          </>
        ),
      },
      {
        titolo: 'Dati gestiti per ogni persona',
        body: (
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Dati anagrafici:</strong> Nome, Cognome, Codice Fiscale (con auto-parse della data/luogo di nascita), Professione, Nazionalità</li>
            <li><strong>Residenza:</strong> indirizzo strutturato (Italia/Estero)</li>
            <li><strong>Documento d'identità:</strong> Tipo (Carta d'identità, Passaporto, Patente), Numero, Date rilascio/scadenza, Ente</li>
          </ul>
        ),
      },
      {
        titolo: 'Codice Fiscale: compilazione automatica e riutilizzo',
        body: (
          <>
            <p>Inserendo un codice fiscale italiano valido di 16 caratteri, il sistema compila automaticamente la <strong>data di nascita</strong>, il <strong>luogo di nascita</strong> e la <strong>provincia</strong> (tramite la tabella ufficiale dei codici Belfiore dei Comuni).</p>
            <p className="mt-2">Nei form di creazione cliente e titolare effettivo trovi il pulsante <Ico icon={UserRoundCog} /> <strong>Importa da anagrafica</strong>: ti permette di cercare per nome o codice fiscale una persona già presente e riutilizzarne i dati (anagrafici, residenza, documento d'identità, stato PEP e sanzioni), senza reinserirli.</p>
            <p className="mt-1 text-xs text-gray-500">Puoi comunque modificare manualmente i campi auto-compilati se necessario (es. per persone nate all'estero).</p>
          </>
        ),
      },
      {
        titolo: 'Clienti associati (retro della card)',
        body: (
          <>
            <p>Cliccando <Ico icon={ChevronUp} /> <strong>Clienti associati</strong> la card si capovolge e mostra tutti i clienti collegati a quella persona con il ruolo:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><span className="text-blue-600 font-medium">Cliente</span> &mdash; persona registrata direttamente come cliente</li>
              <li><span className="text-purple-600 font-medium">Titolare Effettivo</span> &mdash; beneficiario effettivo di un'impresa</li>
              <li><span className="text-emerald-600 font-medium">Rapp. Legale</span> &mdash; rappresentante legale di un'impresa</li>
            </ul>
            <p className="mt-1">Questo permette di individuare immediatamente se la stessa persona è coinvolta in più clienti o con ruoli diversi.</p>
          </>
        ),
      },
    ],
  },

  /* 3 ── Fascicolo Cliente ----------------------------------------- */
  {
    id: 'fascicolo',
    title: 'Fascicolo Cliente',
    icon: BookOpen,
    color: 'text-emerald-600 bg-emerald-100',
    content: [
      'Il Fascicolo Cliente raccoglie tutta la documentazione relativa al rapporto professionale, organizzata in tab:',
    ],
    bullets: [
      { text: <><strong>Anagrafica Cliente</strong> &mdash; dati del cliente con stato e dettagli PEP</>, icon: User },
      { text: <><strong>Titolari Effettivi</strong> &mdash; beneficiari effettivi</>, icon: Users },
      { text: <><strong>Incarichi</strong> &mdash; mandati professionali attivi e storici</>, icon: Briefcase },
      { text: <><strong>Documenti</strong> &mdash; allegati con gestione scadenze e rinnovi</>, icon: FileText },
      { text: <><strong>Checklist AV.2</strong> &mdash; lista di controllo per conformità adeguata verifica</>, icon: CheckCircle },
      { text: <><strong>Timeline</strong> &mdash; storico completo delle modifiche</>, icon: History },
      { text: <><strong>Alert</strong> &mdash; scadenze e dati mancanti relative al cliente specifico</>, icon: AlertTriangle },
    ],
    details: [
      {
        titolo: 'Creazione nuovo cliente',
        body: (
          <>
            <p>Per creare un nuovo cliente clicca <Ico icon={Plus} /> <strong>Nuovo Cliente</strong>. La scheda è suddivisa in 3 passi:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li><strong>Dati Cliente</strong> &mdash; scegli il tipo (Persona Fisica, Impresa, Professionista) e compila i dati. Inserendo il <strong>codice fiscale</strong> data, luogo e provincia di nascita vengono auto-compilati; con <Ico icon={UserRoundCog} /> <strong>Importa da anagrafica</strong> puoi invece riutilizzare una persona già registrata (cercandola per nome o CF). Per le <strong>Imprese</strong> puoi utilizzare la <strong>ricerca API</strong> per importare automaticamente i dati aziendali da fonti esterne (Open API), inserendo semplicemente la partita IVA.</li>
              <li><strong>Titolari Effettivi</strong> &mdash; aggiungi i beneficiari effettivi con dati e quote <Ico icon={Plus} />; anche qui è disponibile <Ico icon={UserRoundCog} /> <strong>Importa da anagrafica</strong> per riutilizzare persone già registrate.</li>
              <li><strong>Riepilogo</strong> &mdash; rivedi tutti i dati prima del salvataggio finale</li>
            </ol>
          </>
        ),
      },
      {
        titolo: 'Ricerca e filtri',
        body: (
          <>
            <p>Nella lista clienti puoi:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><Ico icon={Search} /> Cercare per nome o codice cliente</li>
              <li><Ico icon={Archive} /> Filtrare tra clienti <strong>Attivi</strong> e <strong>Archiviati</strong></li>
              <li>Ordinare per data, nome o codice (A→Z / Z→A)</li>
            </ul>
          </>
        ),
      },
      {
        titolo: 'Gestione Incarichi',
        body: (
          <>
            <p>La tab Incarichi mostra la lista dei mandati professionali con l'eventuale valutazione del rischio e la data del prossimo controllo. Dalla lista puoi:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><Ico icon={Plus} /> Creare un nuovo incarico con codice, tipologia prestazione, scopo, importo, provenienza fondi</li>
              <li>Cliccare sulla riga dell'incarico per aprire il <strong>dettaglio</strong>, dove puoi modificare i dati <Ico icon={Edit3} /> e gestire le valutazioni del rischio</li>
              <li><Ico icon={Download} /> <strong>Scarica Modelli</strong> &mdash; genera i documenti DOCX (AV.1, AV.3, AV.4)</li>
              <li><Ico icon={Archive} /> <strong>Archivia</strong> l'incarico, oppure <Ico icon={RotateCcw} /> <strong>Ripristina</strong> un incarico archiviato</li>
            </ul>
          </>
        ),
      },
      {
        titolo: 'Gestione Documenti e Rinnovi',
        body: (
          <>
            <p>La tab Documenti organizza gli allegati in due sezioni:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Documenti del Cliente</strong> &mdash; condivisi tra tutti gli incarichi (es. carta d'identità, visura, codice fiscale)</li>
              <li><strong>Documenti per Incarico</strong> &mdash; legati a uno specifico incarico (es. mandato, dichiarazione AV.4, provenienza fondi)</li>
            </ul>
            <p className="mt-2">Per ogni documento puoi:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><Ico icon={Upload} /> Caricare un nuovo documento scegliendo tipologia, descrizione e scadenza (obbligatoria per alcuni tipi). È possibile registrare anche un <strong>documento cartaceo</strong> non disponibile digitalmente</li>
              <li><Ico icon={Download} /> Scaricare il file</li>
              <li><Ico icon={RefreshCw} /> <strong>Rinnova</strong> &mdash; caricare una nuova versione con nuova scadenza; la versione precedente viene conservata nello storico</li>
              <li><Ico icon={ArrowRightLeft} /> <strong>Sposta</strong> &mdash; cambiare l'associazione del documento da cliente a incarico specifico, o viceversa</li>
              <li><Ico icon={History} /> <strong>Storico</strong> &mdash; visualizzare le versioni precedenti (appare quando il documento è stato rinnovato almeno una volta)</li>
              <li><Ico icon={Trash2} /> <strong>Sposta nel cestino</strong> &mdash; disponibile su ogni documento (è l'ultima icona della riga): sposta il documento nel <strong>Cestino</strong>, da dove può essere ripristinato o eliminato definitivamente</li>
            </ul>
            <p className="mt-2">Le scadenze sono evidenziate con colori: <span className="text-red-600 font-medium">rosso</span> se scaduto, <span className="text-green-600 font-medium">verde</span> se valido.</p>
          </>
        ),
      },
      {
        titolo: 'Checklist AV.2',
        body: (
          <>
            <p>La Checklist AV.2 verifica la completezza del fascicolo secondo l'Allegato AV.2 delle Linee Guida CNDCEC. È organizzata <strong>per incarico</strong>: per ciascuno viene mostrata la percentuale di completamento degli adempimenti obbligatori, con un indicatore colorato (<span className="text-green-600">verde</span>, <span className="text-yellow-600">giallo</span>, <span className="text-red-600">rosso</span>).</p>
            <p className="mt-1">Cliccando su un incarico si apre il dettaglio con tutti gli adempimenti suddivisi per categoria (Identificazione, Titolare Effettivo, Compliance, Approfondimenti, Dichiarazioni, Rischio, Prestazione, Monitoraggio). Ogni voce indica se è soddisfatta o mancante e se è obbligatoria per la classe di rischio dell'incarico.</p>
            <p className="mt-1">La checklist è di <strong>sola consultazione</strong>: riflette automaticamente lo stato di dati, documenti e valutazioni già inseriti nel fascicolo. Gli obblighi si adeguano alla classe di rischio risultante dalla valutazione RT2.</p>
          </>
        ),
      },
    ],
  },

  /* 4 ── RT1 ------------------------------------------------------- */
  {
    id: 'rt1',
    title: 'RT1 - Autovalutazione dello Studio',
    icon: FileCheck,
    color: 'text-violet-600 bg-violet-100',
    roles: ['admin', 'superadmin'],
    content: [
      'La sezione RT1 è dedicata all\'autovalutazione del rischio dello studio professionale secondo le Regole Tecniche CNDCEC. Qui si registra il profilo di rischio dello studio e si documenta il livello di esposizione:',
    ],
    bullets: [
      { text: <>Crea una nuova autovalutazione con <Ico icon={Plus} /> <strong>Nuova Autovalutazione</strong></>, icon: Plus },
      { text: <>Visualizza le autovalutazioni esistenti con stato: <span className="text-yellow-600">BOZZA</span>, <span className="text-green-600">CORRENTE</span>, {/*<span className="text-gray-500">ARCHIVIATA</span>,*/} <span className="text-red-600">SCADUTA</span></>, icon: FileCheck },
      { text: <>Modifica una bozza <Ico icon={Edit3} />, visualizza <Ico icon={Eye} />o duplica <Ico icon={Copy} /> {/*o elimina <Ico icon={Trash2} />*/}</>, icon: Edit3 },
      { text: <>Scarica il documento DOCX (AV.0) completo <Ico icon={Download} /></>, icon: Download },
      { text: <>Il sistema calcola automaticamente i punteggi di rischio (Inerente, Vulnerabilità, Residuo)</>, icon: Shield },
      { text: <>Puoi salvare bozze <Ico icon={Save} /> e riprendere la compilazione in qualsiasi momento</>, icon: Save },
    ],
    details: [
      {
        titolo: 'La creazione dell\'autovalutazione è suddivisa in 8 step',
        body: (
          <ol className="list-decimal pl-4 space-y-1">
            <li><strong>Descrizione Studio</strong> &mdash; informazioni generali, tipo organizzazione</li>
            <li><strong>Tipologia Clientela</strong> &mdash; questionario sulla composizione della clientela</li>
            <li><strong>Area Geografica</strong> &mdash; valutazione del rischio geografico</li>
            <li><strong>Canali Distributivi</strong> &mdash; modalità di acquisizione clienti</li>
            <li><strong>Servizi Professionali</strong> &mdash; tipologie di prestazioni offerte</li>
            <li><strong>Formazione</strong> &mdash; formazione e aggiornamento AML dello studio</li>
            <li><strong>Organizzazione Adempimenti</strong> &mdash; procedure e presidi interni</li>
            <li><strong>Riepilogo</strong> &mdash; revisione finale con punteggi calcolati</li>
          </ol>
        ),
      },
      {
        titolo: 'Punteggi di rischio',
        body: (
          <>
            <p>Al completamento, il sistema calcola tre punteggi visualizzati con badge colorati:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Rischio Inerente</strong> &mdash; media dei 4 fattori di rischio intrinseco (tipologia clientela, area geografica, canali distributivi, servizi professionali)</li>
              <li><strong>Vulnerabilità</strong> &mdash; media dei 4 fattori organizzativi (formazione, procedure, organizzazione adempimenti, ecc.)</li>
              <li><strong>Rischio Residuo</strong> &mdash; calcolato automaticamente come 40% Inerente + 60% Vulnerabilità</li>
            </ul>
            <p className="mt-1">I colori indicano il livello di significatività: <span className="text-green-600">verde</span> = non significativa, <span className="text-yellow-600">giallo</span> = poco significativa, <span className="text-orange-500">arancione</span> = abbastanza significativa, <span className="text-red-600">rosso</span> = molto significativa.</p>
            <p className="mt-1">Una volta completata, l'autovalutazione resta valida per <strong>3 anni</strong>. La data di scadenza è sempre visibile e il sistema avvisa con un alert quando si avvicina.</p>
          </>
        ),
      },
    ],
  },

  /* 5 ── RT2 ------------------------------------------------------- */
  {
    id: 'rt2',
    title: 'RT2 - Adeguata Verifica',
    icon: FolderOpen,
    color: 'text-orange-600 bg-orange-100',
    content: [
      'La sezione RT2 offre una vista sintetica sull\'adeguata verifica della clientela. Con un layout a due colonne, permette di consultare rapidamente la lista clienti e i relativi incarichi con le valutazioni del rischio associate. ',
    ],
    bullets: [],
    details: [
      {
        titolo: 'Cosa puoi fare da RT2',
        defaultOpen: true,
        body: (
          <>
            <p>Oltre a consultare clienti e incarichi, anche in questa sezione puoi:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Creare nuovi <strong>clienti</strong> e <strong>incarichi</strong> direttamente</li>
              <li>Aprire il <strong>dettaglio di un incarico</strong> per visualizzare o modificare le valutazioni associate</li>
              <li><strong>Archiviare e ripristinare</strong> clienti e incarichi dalla sezione dedicata</li>
            </ul>
          </>
        ),
      },
    ],
  },

  /* 6 ── RT3 ------------------------------------------------------- */
  {
    id: 'rt3',
    title: 'RT3 - Monitoraggio Continuo',
    icon: Eye,
    color: 'text-cyan-600 bg-cyan-100',
    content: [
      'La sezione RT3 è il registro del monitoraggio continuo dei rapporti professionali. Qui si documentano i controlli periodici e le eventuali segnalazioni di operazioni sospette. È divisa in due aree:',
    ],
    bullets: [
      { text: <><strong>Controlli Costanti</strong> &mdash; verifiche periodiche sugli incarichi attivi del cliente</>, icon: Eye },
      { text: <><strong>Segnalazioni SOS</strong> &mdash; registro delle operazioni sospette rilevate e delle eventuali segnalazioni effettuate alla UIF</>, icon: AlertTriangle },
    ],
    details: [
      {
        titolo: 'Controlli Costanti',
        body: (
          <>
            <p>Per ogni controllo periodico registri:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Incarico di riferimento (seleziona con <Ico icon={Search} />)</li>
              <li>Data del controllo e tipologia (periodico, su evento, ecc.)</li>
              <li>Esito e azioni intraprese</li>
              <li><strong>Prossima scadenza</strong> &mdash; calcolata automaticamente in base alla classe di rischio (6, 12, 24 o 36 mesi)</li>
            </ul>
            <p className="mt-1">Il sistema genera un alert <Ico icon={AlertTriangle} /> quando il prossimo controllo è in scadenza.</p>
          </>
        ),
      },
      {
        titolo: 'Segnalazioni SOS (Operazioni Sospette)',
        body: (
          <>
            <p>Se rilevi un'operazione sospetta puoi annotarla come promemoria per lo studio, registrando:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Incarico di riferimento</li>
              <li>Data della valutazione</li>
              <li>Motivi del sospetto</li>
              <li>Stato: in attesa / segnalata / non fondata</li>
              <li>Se segnalata alla UIF: data e protocollo di riferimento</li>
            </ul>
            <p className="mt-1 text-xs text-gray-500">La registrazione ha valore di promemoria interno: non comporta l'invio automatico alla UIF.</p>
          </>
        ),
      },
    ],
  },

  /* 7 ── Alert ----------------------------------------------------- */
  {
    id: 'alert',
    title: 'Sistema di Alert',
    icon: AlertTriangle,
    color: 'text-red-600 bg-red-100',
    content: [
      'Il sistema di Alert funziona come un promemoria automatico: monitora lo stato dei clienti, incarichi e documenti e segnala tutto ciò che richiede attenzione. Il badge nella barra di navigazione mostra il conteggio totale degli alert aperti.',
    ],
    bullets: [
      { text: <>Cliente in <span className="text-yellow-600">bozza</span> da completare</>, icon: Edit3 },
      { text: <>Cliente <strong>senza incarichi</strong> attivi</>, icon: Briefcase },
      { text: <>Incarico <strong>senza valutazione</strong> del rischio</>, icon: FileCheck },
      { text: <>Autovalutazione RT1 in <strong>scadenza</strong> o scaduta <Ico icon={Clock} /></>, icon: Clock, roles: ['admin', 'superadmin'] },
      { text: <>Documenti in <strong>scadenza</strong> o scaduti <Ico icon={Clock} /></>, icon: FileText },
      { text: <>Verifiche e controlli periodici in <strong>scadenza</strong></>, icon: Eye },
    ],
    details: [
      {
        titolo: 'Come risolvere gli alert',
        roles: ['admin', 'superadmin'],
        body: (
          <>
            <p>Ogni alert è collegato al cliente/incarico di riferimento. Per risolverlo:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Cliente in bozza</strong> → completa i dati nel Fascicolo e attiva il cliente</li>
              <li><strong>Senza incarichi</strong> → crea un nuovo incarico nel Fascicolo</li>
              <li><strong>Senza valutazione</strong> → crea la valutazione del rischio in RT2</li>
              <li><strong>RT1 in scadenza</strong> → crea una nuova autovalutazione in RT1</li>
              <li><strong>Documenti scaduti</strong> → rinnova il documento con <Ico icon={RefreshCw} /> nel Fascicolo</li>
              <li><strong>Controlli scaduti</strong> → registra un nuovo controllo in RT3</li>
            </ul>
            <p className="mt-1">Una volta risolta la condizione, l'alert si chiude automaticamente.</p>
          </>
        ),
      },
      {
        titolo: 'Come risolvere gli alert',
        roles: ['user'],
        body: (
          <>
            <p>Ogni alert è collegato al cliente/incarico di riferimento. Per risolverlo:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Cliente in bozza</strong> → completa i dati nel Fascicolo e attiva il cliente</li>
              <li><strong>Senza incarichi</strong> → crea un nuovo incarico nel Fascicolo</li>
              <li><strong>Senza valutazione</strong> → crea la valutazione del rischio in RT2</li>
              <li><strong>Documenti scaduti</strong> → rinnova il documento con <Ico icon={RefreshCw} /> nel Fascicolo</li>
              <li><strong>Controlli scaduti</strong> → registra un nuovo controllo in RT3</li>
            </ul>
            <p className="mt-1">Una volta risolta la condizione, l'alert si chiude automaticamente.</p>
          </>
        ),
      },
    ],
  },

  /* 8 ── Generazione Documenti DOCX -------------------------------- */
  {
    id: 'docx',
    title: 'Generazione Documenti DOCX',
    icon: Download,
    color: 'text-teal-600 bg-teal-100',
    content: [
      'L\'applicazione genera automaticamente documenti DOCX conformi alle Regole Tecniche, precompilati con i dati di clienti e incarichi:',
    ],
    bullets: [  
      { text: <><strong>AV.0</strong> &mdash; Autovalutazione completa dello studio (da RT1)</>, icon: FileCheck, roles: ['admin', 'superadmin'] },
      { text: <><strong>AV.1</strong> &mdash; Valutazione del Rischio (da RT2 / Fascicolo)</>, icon: FileText },
      { text: <><strong>AV.3</strong> &mdash; Scheda Adeguata Verifica (da RT2 / Fascicolo)</>, icon: FileText },
      { text: <><strong>AV.4</strong> &mdash; Dichiarazione del Cliente (da RT2 / Fascicolo)</>, icon: FileText },
      { text: <><strong>AV.5</strong> &mdash; Attestazione del Professionista (da RT2 / Fascicolo)</>, icon: FileText },
      { text: <><strong>AV.6</strong> &mdash; Dichiarazione di astenzione del professionista (da RT2 / Fascicolo)</>, icon: FileText },
      { text: <><strong>AV.7</strong> &mdash; Procedure di controllo costante (da RT3)</>, icon: FileText },
    ],
    details: [
      {
        titolo: 'Da dove scaricare i documenti',
        roles: ['admin', 'superadmin'],
        body: (
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Dal Fascicolo Cliente</strong> → Seleziona il cliente → tab Incarichi & Rischio → clicca <Ico icon={Download} /> sull'incarico</li>
            <li><strong>Da RT1</strong> → Ogni autovalutazione eseguita contiene un apposito bottone  <Ico icon={Download} /></li>
            <li><strong>Da RT2</strong> → Dalla lista incarico, seleziona l'incarico → clicca <Ico icon={Download} /></li>
            <li><strong>Da RT3</strong> → Ogni controllo eseguito contiene un apposito bottone <Ico icon={Download} /></li>
          </ul>
        ),
      },
      {
        titolo: 'Da dove scaricare i documenti',
        roles: ['user'],
        body: (
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Dal Fascicolo Cliente</strong> → tab Incarichi → clicca <Ico icon={Download} /> sull'incarico</li>
            <li><strong>Da RT2</strong> → Dalla lista incarico, seleziona l'incarico → clicca <Ico icon={Download} /></li>
            <li><strong>Da RT3</strong> → Ogni controllo eseguito contiene un apposito bottone  <Ico icon={Download} /></li>
          </ul>
        ),
      },
    ],
  },

  /* 8b ── Assistente AI (MCP) -------------------------------------- */
  {
    id: 'assistente-ai',
    title: 'Assistente AI',
    icon: Bot,
    color: 'text-blue-600 bg-blue-100',
    content: [
      'Puoi collegare un assistente AI (es. Claude) : l\'AI legge le informazioni e ti propone le operazioni, ma sei sempre tu a confermarle. Agisce con i tuoi permessi ed è limitato al tuo studio.',
      'È ovviamente una funzione opzionale.',
    ],
    bullets: [
      { text: <>L'AI può <strong>consultare</strong> clienti, incarichi e alert (in sola lettura)</>, icon: Eye },
      { text: <>Può <strong>proporre</strong>: bozze cliente, soggetti in anagrafica, incarichi, valutazioni del rischio (RT2) e la catalogazione dei documenti</>, icon: Sparkles },
      { text: <><strong>Nulla viene scritto senza la tua approvazione</strong>: quando l'AI propone qualcosa compare una modale (ovunque nell'app) con il dettaglio e il pulsante <strong>Approva ed esegui</strong></>, icon: CheckCircle },
      { text: <>Prima di approvare puoi <strong>correggere una proposta</strong>: modifica i campi dal dettaglio, oppure chiedi all'AI di aggiornarla </>, icon: Edit3 },
      { text: <><strong>Azioni AI in attesa</strong> <Ico icon={Bot} /> &mdash; se chiudi la modale, ritrovi qui le proposte da approvare in un secondo momento (con badge nella barra in alto)</>, icon: Bot },
      { text: <><strong>Documenti da catalogare</strong> &mdash; carichi i PDF una sola volta (anche un'intera cartella) e l'AI propone tipologia e collegamento; tu approvi e vengono allegati</>, icon: Upload },
    ],
    details: [
      {
        titolo: 'Come collegare un assistente AI',
        body: (
          <>
            <p>Il collegamento si configura da <Ico icon={Settings} /> <strong>Impostazioni → Accesso AI</strong> (disponibile a tutti i ruoli; l'AI opera sempre con i tuoi permessi):</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Il modo più semplice è il <strong>connettore di Claude</strong>: incolli l'indirizzo (endpoint) e accedi con il tuo login &mdash; nessun codice da copiare.</li>
              <li>Per client più tecnici (es. da terminale) puoi generare un <strong>token</strong> personale, revocabile in qualsiasi momento.</li>
            </ul>
          </>
        ),
      },
      {
        titolo: 'Sicurezza: il controllo resta a te',
        body: (
          <>
            <p>L'assistente non può modificare nulla da solo:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Ogni scrittura proposta passa da una <strong>conferma</strong> nella modale (Approva / Rifiuta).</li>
              <li>L'AI <strong>non può auto-approvare</strong>: l'approvazione avviene solo dall'app.</li>
              <li>Prima di approvare puoi aprire <strong>“Mostra dettagli”</strong> per vedere con precisione cosa verrà creato o modificato.</li>
              <li>L'accesso è limitato al <strong>tuo studio</strong> e ai <strong>tuoi permessi</strong>.</li>
            </ul>
          </>
        ),
      },
    ],
  },

  /* 9 ── Segnalazioni e Aiuto ------------------------------------- */
  {
    id: 'segnalazioni',
    title: 'Segnalazioni e Assistenza',
    icon: MessageSquarePlus,
    color: 'text-pink-600 bg-pink-100',
    content: [
      'Dal menu di aiuto in alto a destra puoi inviare segnalazioni e accedere alla guida:',
    ],
    bullets: [
      { text: <><strong>Invia segnalazione</strong> &mdash; segnala un problema o suggerisci un miglioramento (categoria: bug, dati inesatti, suggerimento, altro)</>, icon: MessageSquarePlus },
      { text: <><strong>Le mie segnalazioni</strong> &mdash; visualizza lo stato (<span className="text-amber-600">aperta</span>, <span className="text-blue-600">in lavorazione</span>, <span className="text-emerald-600">risolta</span>, <span className="text-gray-500">chiusa</span>) e dialoga in <strong>chat</strong> con l'assistenza direttamente sulla segnalazione</>, icon: ClipboardList },
      { text: <><strong>Guida all'uso</strong> &mdash; questa guida che stai leggendo!</>, icon: GraduationCap },
    ],
    details: [
      {
        titolo: 'Chat sulla segnalazione',
        body: (
          <>
            <p>Aprendo una segnalazione dalla lista <Ico icon={ClipboardList} /> trovi una sezione per i <strong>messaggi</strong>:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Puoi aggiungere nuovi messaggi per fornire dettagli o rispondere alle richieste dell'assistenza</li>
              <li>I nuovi messaggi dell'assistenza arrivano <strong>in tempo reale</strong> e sono evidenziati con un pallino di notifica sulla segnalazione non ancora letta</li>
              <li>Lo stato della segnalazione viene aggiornato dall'assistenza man mano che il problema viene preso in carico</li>
            </ul>
          </>
        ),
      },
    ],
  },

  /* 10 ── Profilo --------------------------------------------------- */
  {
    id: 'profilo',
    title: 'Profilo Utente',
    icon: User,
    color: 'text-gray-600 bg-gray-100',
    content: [
      'Dalla sezione Profilo puoi gestire le tue informazioni personali:',
    ],
    bullets: [
      { text: <>Tab <strong>Anagrafica</strong> &mdash; nome, cognome, contatti, codice fiscale, P.IVA, PEC, SDI</>, icon: User },
      { text: <>Cambio password con generazione password <Ico icon={Lock} /></>, icon: Lock },
    ],
  },/* {text: <>Tab <strong>Fatturazione</strong> &mdash; dati di fatturazione (intestazione, indirizzo, CAP, città)</>, icon: FileText }*/

  /* 11 ── Impostazioni (visibile a tutti; studio in sola lettura per i collaboratori) ----- */
  {
    id: 'impostazioni',
    title: 'Impostazioni Studio',
    icon: Settings,
    color: 'text-gray-600 bg-gray-100',
    content: [
      'Dal menu utente accedi alle Impostazioni dello studio. I formati di codice (cliente e incarico) e i permessi del Cestino sono definiti dagli amministratori; l\'Accesso AI è invece personale e disponibile a tutti i ruoli.',
    ],
    bullets: [
      { text: <><strong>Formato Codice Cliente</strong> &mdash; Manuale, Sequenziale (001, 002...), Codice Fiscale, o Nome cliente</>, icon: Settings },
      { text: <><strong>Formato Codice Incarico</strong> &mdash; stesse opzioni del codice cliente</>, icon: Settings },
      { text: <>Prefissi personalizzati per codici</>, icon: Edit3 },
      { text: <>Numero iniziale per codici sequenziali</>, icon: Edit3 },
      { text: <>Anteprima in tempo reale del formato generato</>, icon: Eye },
      { text: <><strong>Permessi del Cestino</strong> <Ico icon={Trash2} /> &mdash; chi può spostare nel cestino, ripristinare ed eliminare definitivamente</>, icon: Trash2 },
      { text: <><strong>Accesso AI</strong> <Ico icon={Bot} /> &mdash; collega un assistente AI al tuo studio (vedi la sezione <strong>Assistente AI</strong>)</>, icon: Bot },
    ],
    details: [
      {
        titolo: 'Come accedere',
        roles: ['admin', 'superadmin'],
        body: (
          <p>Clicca sull'icona utente <Ico icon={User} /> in alto a destra, poi seleziona <Ico icon={Settings} /> <strong>Impostazioni</strong>. Le modifiche si salvano con <Ico icon={Save} /> e si applicano a tutti i nuovi clienti/incarichi.</p>
        ),
      },
      {
        titolo: 'Cosa puoi fare come collaboratore',
        roles: ['user'],
        body: (
          <>
            <p>Clicca sull'icona utente <Ico icon={User} /> in alto a destra, poi <Ico icon={Settings} /> <strong>Impostazioni</strong>. Qui:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>I <strong>formati di codice</strong> e i <strong>permessi del Cestino</strong> sono in <strong>sola lettura</strong>: li imposta l'amministratore dello studio.</li>
              <li>Puoi però gestire il tuo <strong>Accesso AI</strong> <Ico icon={Bot} />: collegare un assistente, cambiarne il livello di permesso o revocarlo.</li>
            </ul>
          </>
        ),
      },
      {
        titolo: 'Permessi e svuotamento automatico del Cestino',
        roles: ['admin', 'superadmin'],
        body: (
          <>
            <p>Nella sezione <strong>Cestino</strong> delle Impostazioni decidi chi nello studio può:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Spostare nel cestino</strong> &mdash; <em>tutti</em> i collaboratori oppure <em>solo gli amministratori</em> (default: tutti)</li>
              <li><strong>Ripristinare</strong> gli elementi cestinati (default: tutti)</li>
              <li><strong>Eliminare definitivamente / svuotare</strong> il cestino (default: solo amministratori)</li>
            </ul>
            <p className="mt-2">Puoi inoltre attivare lo <strong>svuotamento automatico</strong> <Ico icon={Clock} />: gli elementi nel cestino da più giorni del valore impostato vengono eliminati definitivamente. È <strong>disattivato di default</strong>: senza attivarlo, nulla viene mai cancellato senza un'azione esplicita.</p>
          </>
        ),
      },
    ],
  },

  /* 12 ── Cestino --------------------------------------------------- */
  {
    id: 'cestino',
    title: 'Cestino',
    icon: Trash2,
    color: 'text-gray-600 bg-gray-100',
    content: [
      'Il Cestino è una rete di sicurezza: quando elimini un cliente, un incarico o un altro elemento, questo non viene cancellato subito ma spostato nel cestino, da dove puoi recuperarlo in qualsiasi momento.',
      'È diverso dall\'Archiviazione: archiviare significa conservare a lungo termine un dato ancora valido (senza scadenza); cestinare significa avviare la rimozione di un dato, con possibilità di ripensarci.',
    ],
    bullets: [
      { text: <>Apri il cestino dall'icona <Ico icon={Trash2} /> nella barra in alto; il <strong>badge</strong> indica quanti elementi contiene</>, icon: Trash2 },
      { text: <><strong>Sposta nel cestino</strong> &mdash; l'elemento sparisce dall'applicazione ma resta recuperabile in qualsiasi momento</>, icon: Trash2 },
      { text: <><Ico icon={RotateCcw} /> <strong>Ripristina</strong> &mdash; riporta l'elemento (e tutti i suoi dati collegati) esattamente dov'era</>, icon: RotateCcw },
      { text: <><strong>Elimina definitivamente</strong> / <strong>Svuota cestino</strong> &mdash; cancella per sempre dati e documenti collegati (di norma riservato all'amministratore)</>, icon: Trash2, roles: ['admin', 'superadmin'] },
    ],
    details: [
      {
        titolo: 'Da dove si sposta nel cestino',
        body: (
          <>
            <p>L'azione <strong>Sposta nel cestino</strong> è disponibile in tutta l'applicazione. La trovi:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Su <strong>cliente</strong> e <strong>incarico</strong>, nel menu azioni <Ico icon={MoreVertical} /> (in alto nel dettaglio)</li>
              <li>Sul singolo <strong>documento</strong>, <strong>anagrafica</strong>, autovalutazione <strong>RT1</strong>, valutazione <strong>RT2</strong>, controllo e segnalazione <strong>RT3</strong></li>
            </ul>
            <p className="mt-2">Cestinando un cliente o un incarico finiscono nel cestino, insieme, anche tutti i dati collegati (documenti, valutazioni, controlli...): un unico ripristino li riporta tutti indietro.</p>
            <p className="mt-1 text-xs text-gray-500">Le anagrafiche collegate anche ad altri clienti non vengono mai cestinate: restano conservate e te lo segnaliamo nel dettaglio della voce.</p>
          </>
        ),
      },
      {
        titolo: 'Cosa vedi nel cestino',
        body: (
          <>
            <p>Ogni voce mostra cosa contiene, chi l'ha eliminata e quando. Cliccando <Ico icon={ChevronRight} /> la espandi per vedere nel dettaglio tutti gli elementi collegati che verrebbero ripristinati o cancellati.</p>
            <p className="mt-1">Se l'amministratore ha attivato lo <strong>svuotamento automatico</strong>, sulla voce compare un avviso <Ico icon={Clock} /> con i giorni che mancano alla cancellazione definitiva.</p>
          </>
        ),
      },
      {
        titolo: 'Storico Modifiche (menu ⋮)',
        body: (
          <>
            <p>Sempre dal menu azioni <Ico icon={MoreVertical} /> di un cliente o di un incarico trovi <Ico icon={History} /> <strong>Storico Modifiche</strong>: un pannello laterale che mostra, in ordine di tempo, ogni modifica fatta a quel dato (campo cambiato, valore precedente e nuovo, autore e data).</p>
            <p className="mt-1">È utile per ricostruire chi ha cambiato cosa e quando, ed è di sola consultazione.</p>
          </>
        ),
      },
    ],
  },

  /* 13 ── Privacy e cookie ----------------------------------------- */
  {
    id: 'privacy',
    title: 'Privacy e cookie',
    icon: Shield,
    color: 'text-blue-600 bg-blue-100',
    content: [
      'La piattaforma utilizza esclusivamente cookie tecnici/necessari, indispensabili al funzionamento del servizio. Ai sensi dell\'art. 122 del Codice Privacy non è richiesto il tuo consenso: il banner che vedi è una semplice informativa di presa visione (pulsante "Ho capito").',
      'Non sono installati cookie di profilazione, di marketing o di analisi statistica.',
    ],
    bullets: [
      { text: <><strong>Quando appare il banner</strong> &mdash; alla prima visita o quando vengono aggiornati i documenti legali</>, icon: Clock },
      { text: <><strong>Come riaprirlo in qualsiasi momento</strong> &mdash; menu utente <Ico icon={User} /> in alto a destra → <strong>Privacy & Cookie</strong></>, icon: Cookie },
      { text: <>Dal banner trovi anche i link a <strong>Privacy Policy</strong>, <strong>Cookie Policy</strong> e <strong>Termini e Condizioni</strong></>, icon: ScrollText },
    ],
    details: [
      {
        titolo: 'Cookie e dati di sessione effettivamente utilizzati',
        body: (
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Sessione di autenticazione</strong> (Supabase) &mdash;
              ti tiene autenticato durante l'utilizzo della piattaforma. <em>Senza questo cookie non
              puoi rimanere loggato e accedere ai dati protetti.</em> Durata: la sessione, con rinnovo
              automatico.
            </li>
            <li>
              <strong>Presa visione dell'informativa</strong> &mdash;
              memorizza la conferma di lettura di questa informativa. <em>Necessario per non
              ripresentarti il banner ad ogni accesso.</em> Persistente fino all'aggiornamento dei
              documenti legali.
            </li>
            <li>
              <strong>Stato di navigazione tra le viste</strong> &mdash;
              trasporta temporaneamente l'ID dell'incarico o del fascicolo quando passi da una
              sezione all'altra (ad esempio aprendo un fascicolo o un'adeguata verifica da un alert).
              <em>Indispensabile per portarti alla sezione corretta durante la navigazione interna.</em>
              {' '}Viene cancellato alla chiusura della scheda del browser.
            </li>
            <li>
              <strong>Notifica di errore di autenticazione</strong> &mdash;
              segnala al form di login un errore durante l'autenticazione o la reimpostazione della
              password. <em>Necessario per mostrarti il messaggio di errore se un link di conferma
              email o di reset è scaduto.</em> Cancellato alla chiusura della scheda del browser.
            </li>
          </ul>
        ),
      },
      {
        titolo: 'Perché questi cookie sono obbligatori',
        body: (
          <p>
            Tutti i cookie elencati rientrano nella categoria <strong>tecnici/necessari</strong> ai sensi
            dell'art. 122 del Codice Privacy: senza di essi la piattaforma non funzionerebbe (non
            potresti rimanere autenticato, navigare tra le sezioni o ricevere messaggi di errore).
            Per legge questi cookie <strong>non richiedono il tuo consenso</strong> e non possono
            essere disattivati senza compromettere il servizio.
          </p>
        ),
      },
    ],
  },
];

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */
interface TutorialModalProps {
  show: boolean;
  onClose: () => void;
  ruolo: string;
}

export function TutorialModal({ show, onClose, ruolo }: TutorialModalProps) {
  useScrollLock(show);
  const [currentStep, setCurrentStep] = useState(0);

  // Filter steps by role
  const steps = TUTORIAL_STEPS.filter(s => !s.roles || s.roles.includes(ruolo));

  const step = steps[currentStep] ?? steps[0];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const Icon = step.icon;

  // Filter bullets and details that are role-gated
  const visibleBullets = step.bullets?.filter(b => !b.roles || b.roles.includes(ruolo));
  const visibleDetails = step.details?.filter(d => !d.roles || d.roles.includes(ruolo));

  const handleClose = () => {
    setCurrentStep(0);
    onClose();
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 h-[85vh] flex flex-col md:flex-row overflow-hidden">

        {/* ── Sidebar navigation ── */}
        <nav className="hidden md:flex flex-col w-56 flex-shrink-0 bg-gray-50 border-r border-gray-200 py-3 overflow-y-auto">
          {steps.map((s, i) => {
            const SIcon = s.icon;
            const active = i === currentStep;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentStep(i)}
                className={`flex items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <SIcon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="truncate">{s.title}</span>
              </button>
            );
          })}
        </nav>

        {/* ── Main panel ── */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${step.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
                <p className="text-xs text-gray-500">
                  Passo {currentStep + 1} di {steps.length}
                </p>
              </div>
            </div>
            <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 overflow-y-auto flex-1">
            {step.content.map((node, i) => (
              <p key={i} className="text-sm text-gray-700 mb-3">{node}</p>
            ))}

            {visibleBullets && visibleBullets.length > 0 && (
              <ul className="space-y-2 mt-2">
                {visibleBullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                    {b.icon ? (
                      <Ico icon={b.icon} className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
                    ) : (
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                    <span>{b.text}</span>
                  </li>
                ))}
              </ul>
            )}

            {visibleDetails?.map((d, i) => (
              <Dettaglio key={`${currentStep}-${i}`} titolo={d.titolo} defaultOpen={d.defaultOpen}>
                {d.body}
              </Dettaglio>
            ))}
          </div>

          {/* Footer / Navigation */}
          <div className="flex items-center justify-between p-4 border-t border-gray-100">
            <button
              onClick={() => setCurrentStep((s) => s - 1)}
              disabled={isFirst}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Indietro
            </button>

            {/* Step dots — visible only on mobile where sidebar is hidden */}
            <div className="flex gap-1.5 md:hidden">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === currentStep ? 'bg-blue-600 w-4' : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                />
              ))}
            </div>

            {isLast ? (
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Ho capito!
              </button>
            ) : (
              <button
                onClick={() => setCurrentStep((s) => s + 1)}
                className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Avanti
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
