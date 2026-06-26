import { ReactNode, useState, useEffect, useRef } from 'react';
import { Shield, FileCheck, FolderOpen, Eye, AlertTriangle, LogOut, User, ChevronDown, BookOpen, Settings, Users, HelpCircle, MessageSquarePlus, GraduationCap, ClipboardList, WifiOff, Cookie, Trash2, Bot } from 'lucide-react';
import { contaCestino } from '../lib/cestinoHelper';
import { openPrivacyBanner } from './PrivacyBanner';
import { createPortal } from 'react-dom';
import { useSystemAlerts } from './alertContext';
import { useAlertCounts } from './alertCountsContext';
import { useToast } from './Toast';
import { supabase } from '../lib/supabase';
import { SegnalazioneModal } from './SegnalazioneModal';
import { MieSegnalazioni } from './MieSegnalazioni';
import { TutorialModal } from './TutorialModal';
import { useStudio } from '../lib/StudioContext';
import { useUnreadSegnalazioni } from './UnreadSegnalazioniProvider';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  alertCount?: number;
  ruolo:string;
}

export function Layout({ children, activeTab, onTabChange, ruolo }: LayoutProps) {

  const toast = useToast();
  const { runAlertCheckSilent, isCheckingAlerts } = useSystemAlerts();
  const { alertCounts } = useAlertCounts();
  const { unreadCount } = useUnreadSegnalazioni();
  const { activeStudioId, setActiveStudioId, studioList, isSuperAdmin } = useStudio();

  // Esegui check_alerts una volta per sessione di tab per ogni studio.
  // sessionStorage persiste su F5 ma non sopravvive alla chiusura del tab,
  // quindi ricaricare la pagina non rilancia il sync (ci pensano i trigger
  // DB), mentre aprire una nuova sessione lo rilancia. Cambiare studio
  // forza il sync per il nuovo studio.
  useEffect(()=>{
    if (!activeStudioId) return;
    const key = `alert_check_done_${activeStudioId}`;
    if (sessionStorage.getItem(key) === '1') return;
    sessionStorage.setItem(key, '1');
    runAlertCheckSilent();
  },[runAlertCheckSilent, activeStudioId])


  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const [showSegnalazione, setShowSegnalazione] = useState(false);
  const [showMieSegnalazioni, setShowMieSegnalazioni] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showStudioSelect, setShowStudioSelect] = useState(false);
  const [cestinoCount, setCestinoCount] = useState(0);
  const [mcpPendingCount, setMcpPendingCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const studioSelectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      toast.error('Connessione a Internet assente. Alcune funzionalità potrebbero non essere disponibili.');
    };
    const handleOnline = () => {
      setIsOffline(false);
      toast.success('Connessione a Internet ripristinata.');
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [toast]);

  // Blocca lo scroll del body quando la modale offline è visibile
  useEffect(() => {
    if (isOffline) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOffline]);

  const allTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Shield },
    { id: 'anagrafica', label: 'Anagrafica', icon: Users },
    { id: 'fascicolo', label: 'Fascicolo Cliente', icon: BookOpen },
    { id: 'rt1', label: 'RT1 - Autovalutazione', icon: FileCheck },
    { id: 'rt2', label: 'RT2 - Adeguata Verifica', icon: FolderOpen },
    { id: 'rt3', label: 'RT3 - Monitoraggio', icon: Eye },
    { id: 'alert', label: 'Alert', icon: AlertTriangle, badge: (alertCounts.no_incarichi ?? 0)+(alertCounts.no_valutazioni ?? 0)+(alertCounts.draft ?? 0)+(alertCounts.scadenza ?? 0)+(alertCounts.rt1_scadenza ?? 0)+(alertCounts.doc_scadenza ?? 0)+(alertCounts.controlli_scadenza ?? 0)},
  ];

  const tabs = allTabs.filter(tab => {
    if (tab.id === 'rt1' && ruolo === 'user') {
      return false; // Esclude il tab RT1 se l'utente è un collaboratore
    }
    return true;
  });

  // Gestione click fuori dal menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (helpMenuRef.current && !helpMenuRef.current.contains(event.target as Node)) {
        setIsHelpMenuOpen(false);
      }
    }

    if (isUserMenuOpen || isHelpMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isUserMenuOpen, isHelpMenuOpen]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        setShowStudioSelect(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!showStudioSelect) return;
    function handleClickOutside(event: MouseEvent) {
      if (studioSelectRef.current && !studioSelectRef.current.contains(event.target as Node)) {
        setShowStudioSelect(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStudioSelect]);

  // Conteggio elementi nel cestino per il badge, con aggiornamento realtime.
  useEffect(() => {
    if (!activeStudioId) return;
    let attivo = true;
    const aggiorna = () => { contaCestino(activeStudioId).then(n => { if (attivo) setCestinoCount(n); }); };
    aggiorna();
    window.addEventListener('cestino-changed', aggiorna);
    const channel = supabase
      .channel('cestino-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cestino' }, aggiorna)
      .subscribe();
    return () => { attivo = false; window.removeEventListener('cestino-changed', aggiorna); supabase.removeChannel(channel); };
  }, [activeStudioId]);

  // Conteggio piani AI in attesa (badge "Azioni AI"), con aggiornamento realtime. La RLS
  // limita ai propri piani; non dipende dallo studio. Se la tabella non esiste, resta 0.
  useEffect(() => {
    let attivo = true;
    const aggiorna = async () => {
      const [{ count: piani }, { count: documenti }] = await Promise.all([
        supabase
          .from('mcp_pending_plans')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString()),
        supabase
          .from('documenti')
          .select('id', { count: 'exact', head: true })
          .eq('mcp_stato', 'pending'),
      ]);
      if (attivo) setMcpPendingCount((piani || 0) + (documenti || 0));
    };
    aggiorna();
    const channel = supabase
      .channel('mcp-plans-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mcp_pending_plans' }, aggiorna)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documenti' }, aggiorna)
      .subscribe();
    return () => { attivo = false; supabase.removeChannel(channel); };
  }, []);

  const handleLogoutClick = () => {
    setIsUserMenuOpen(false);
    setShowLogoutConfirm(true);
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setShowLogoutConfirm(false);
    } catch (error) {
      console.error('Errore durante il logout:', error);
      toast.error('Errore durante il logout. Riprova.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleProfileClick = () => {
    setIsUserMenuOpen(false);
    onTabChange('profilo');
  };

  return (
    
    <div className="min-h-screen bg-gray-50">
      <>
        <div
          className={`
            fixed top-14 right-6 z-50
            transition-all duration-300 ease-out
            ${isCheckingAlerts
              ? 'translate-x-0 opacity-100'
              : 'translate-x-full opacity-0 pointer-events-none'
            }
          `}
        >
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-lg shadow-lg">
            <AlertTriangle className="w-5 h-5 animate-pulse" />
            <span className="text-sm font-medium">
              Aggiornamento alert in corso...
            </span>
          </div>
        </div>
      </>
      <div className="sticky top-0 z-30">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">AdeguataVerifica.Pro</h1>
                <p className="text-xs text-gray-500">CNDCEC RT 2025 | D.Lgs. 231/2007</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
            {/* Indicatore stato connessione */}
            {isOffline && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 mr-1 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-medium"
                title="Connessione a Internet assente"
              >
                <WifiOff className="w-4 h-4" />
                <span>Offline</span>
              </div>
            )}
            {/* Cestino */}
            <button
              onClick={() => onTabChange('cestino')}
              className={`relative flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'cestino'
                  ? 'text-blue-700 bg-blue-50'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              }`}
              title="Cestino"
            >
              <Trash2 className="w-4 h-4" />
              {cestinoCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 text-[0.65rem] font-bold text-white bg-red-500 rounded-full">
                  {cestinoCount > 99 ? '99+' : cestinoCount}
                </span>
              )}
            </button>

            {/* Azioni AI in attesa */}
            <button
              onClick={() => onTabChange('azioni_ai')}
              className={`relative flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'azioni_ai'
                  ? 'text-blue-700 bg-blue-50'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              }`}
              title="Azioni AI in attesa"
            >
              <Bot className="w-4 h-4" />
              {mcpPendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 text-[0.65rem] font-bold text-white bg-red-500 rounded-full">
                  {mcpPendingCount > 99 ? '99+' : mcpPendingCount}
                </span>
              )}
            </button>

            {/* Menu Assistenza */}
            <div className="relative" ref={helpMenuRef}>
              <button
                onClick={() => { setIsHelpMenuOpen(!isHelpMenuOpen); setIsUserMenuOpen(false); }}
                className="relative flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Assistenza"
              >
                <HelpCircle className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 -right-0.5 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                  </span>
                )}
              </button>

              {isHelpMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <button
                    onClick={() => { setIsHelpMenuOpen(false); setShowSegnalazione(true); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    Invia segnalazione
                  </button>
                  <button
                    onClick={() => { setIsHelpMenuOpen(false); setShowMieSegnalazioni(true); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <ClipboardList className="w-4 h-4" />
                    Le mie segnalazioni
                    {unreadCount > 0 && (
                      <span className="flex h-2.5 w-2.5 ml-auto">
                        <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                      </span>
                    )}
                  </button>
                  <div className="border-t border-gray-200 my-1"></div>
                  <button
                    onClick={() => { setIsHelpMenuOpen(false); setShowTutorial(true); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <GraduationCap className="w-4 h-4" />
                    Guida all'uso
                  </button>
                </div>
              )}
            </div>

            {/* Menu Utente con Dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => { setIsUserMenuOpen(!isUserMenuOpen); setIsHelpMenuOpen(false); }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <User className="w-4 h-4" />
                <ChevronDown className={`w-4 h-4 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <button
                    onClick={handleProfileClick}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <User className="w-4 h-4" />
                    Profilo
                  </button>
                  {/* Impostazioni: visibile a tutti. I collaboratori vedono le impostazioni di studio
                      in sola lettura e gestiscono il proprio Accesso AI. */}
                  <button
                    onClick={() => { setIsUserMenuOpen(false); onTabChange('impostazioni'); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Impostazioni
                  </button>
                  <div className="border-t border-gray-200 my-1"></div>
                  <button
                    onClick={() => { setIsUserMenuOpen(false); openPrivacyBanner(); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Cookie className="w-4 h-4" />
                    Privacy & Cookie
                  </button>
                  <div className="border-t border-gray-200 my-1"></div>
                  <button
                    onClick={handleLogoutClick}
                    disabled={isLoggingOut}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50"
                  >
                    <LogOut className="w-4 h-4" />
                    {isLoggingOut ? 'Uscita...' : 'Esci'}
                  </button>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                    ${activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="ml-1 px-2 py-0.5 text-xs font-semibold text-white bg-red-500 rounded-full">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
      </div>

      <main className="max-w-7xl mx-auto min-h-[670px] px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-xs text-gray-500 text-center">
            Sistema di gestione conformità AML - Ver. 1.2.0 - Ultimo aggiornamento: 25/06/2026
          </p>
        </div>
      </footer>

      {showStudioSelect && isSuperAdmin && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center pt-24" onClick={() => setShowStudioSelect(false)}>
          <div
            ref={studioSelectRef}
            className="bg-white border border-gray-300 rounded-lg shadow-xl p-4 w-80"
            onClick={e => e.stopPropagation()}
          >
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seleziona studio
            </label>
            <select
              value={activeStudioId || ''}
              onChange={e => {
                setActiveStudioId(e.target.value);
                setShowStudioSelect(false);
              }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {studioList.map(s => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <SegnalazioneModal show={showSegnalazione} onClose={() => setShowSegnalazione(false)} />
      <MieSegnalazioni show={showMieSegnalazioni} onClose={() => setShowMieSegnalazioni(false)} />
      <TutorialModal show={showTutorial} onClose={() => setShowTutorial(false)} ruolo={ruolo} />

      {/* Modale conferma logout */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-gray-600 bg-opacity-45 flex items-center justify-center p-4 transition-opacity duration-300">
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full transform transition-all duration-300 scale-100 opacity-100"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-modal-title"
          >
            <div className="p-6 sm:p-8">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-red-100 p-3 rounded-full">
                  <LogOut className="h-6 w-6 text-red-600" aria-hidden="true" />
                </div>
                <div className="ml-4 text-left">
                  <h3 className="text-lg leading-6 font-bold text-gray-900" id="logout-modal-title">
                    Conferma Logout
                  </h3>
                </div>
              </div>
              <div className="mt-4">
                <h2 className="text-sm text-gray-500">
                  Sei sicuro di voler uscire dalla piattaforma?
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Eventuali modifiche non salvate andranno perse. Dovrai effettuare nuovamente l'accesso per continuare.
                </p>
              </div>
            </div>
            <div className="px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse sm:gap-3 rounded-b-xl bg-gray-100">
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm transition-colors disabled:opacity-50"
              >
                {isLoggingOut ? 'Uscita...' : 'Sì, Esci'}
              </button>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                disabled={isLoggingOut}
                className="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm transition-colors disabled:opacity-50"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale offline: si sovrappone a qualsiasi view quando la connessione è assente */}
      {isOffline && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/1 backdrop-blur-sm overflow-hidden">
          <div className="flex flex-col items-center gap-3 px-8 py-6 bg-white border-2 border-blue-500 rounded-xl shadow-xl max-w-md mx-4">
            <WifiOff className="w-12 h-12 text-blue-600" />
            <p className="text-blue-700 text-center font-medium">
              Connessione a Internet assente
            </p>
            <p className="text-blue-600 text-sm text-center">
              Alcune informazioni potrebbero non essere aggiornate. La piattaforma tornerà operativa automaticamente al ripristino della connessione.
            </p>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
