import { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { RT1Autovalutazione } from './components/RT1Autovalutazione';
import { RT2AdeguataVerifica } from './components/RT2AdeguataVerifica';
import { RT3Monitoraggio } from './components/RT3Monitoraggio';
import { AlertPanel, AlertProvider, AlertCountsProvider } from './components/AlertPanel.tsx';
import { ProfiloUtente } from './components/ProfiloUtente';
import { FascicoloCliente } from './components/FascicoloCliente';
import { AdminPanel } from './components/AdminPanel';
import { UnreadSegnalazioniProvider } from './components/UnreadSegnalazioniProvider';
import { Impostazioni } from './components/Impostazioni';
import { AnagraficaPersone } from './components/AnagraficaPersone';
import { Cestino } from './components/Cestino';
import { Login } from './components/Login';
import { PendingApproval } from './components/PendingApproval';
import { PianoApprovazione } from './components/PianoApprovazione';
import { AzioniAiInAttesa } from './components/AzioniAiInAttesa';
import { AzioniAiModale } from './components/AzioniAiModale';
import { ConsensoMcp } from './components/ConsensoMcp';
import { RichiestaRegistrazione } from './components/RichiestaRegistrazione';
import { EmailConfirmed } from './components/EmailConfirmed';
import { supabase } from './lib/supabase';
import type { User } from '@supabase/supabase-js';
import { Spinner } from './components/cliente-wizard/modals/Spinner';
import { ToastProvider } from './components/Toast';
import { StudioProvider } from './lib/StudioContext';
import { WifiOff } from 'lucide-react';
import { createPortal } from 'react-dom';
import { PrivacyBanner } from './components/PrivacyBanner';
import { retryConsentPersistIfNeeded } from './lib/legal/consentLog';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [previousTab, setPreviousTab] = useState('dashboard');
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [rt3OpenIncaricoId, setRt3OpenIncaricoId] = useState<string | undefined>();
  const impostazioniDirtyRef = useRef(false);
  const [view, setView] = useState<'app' | 'admin'>('app');
  const [alertCount, setAlertCount] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [isApproved, setIsApproved] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ruolo, setRuolo] = useState<string>('');
  const [showRegistrazione, setShowRegistrazione] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  // Link breve "Azione AI in attesa" (Fase 4b): ?mcp_plan=<id> apre la pagina di approvazione.
  // Letto sincronicamente dall'URL prima che eventuali replaceState lo ripuliscano.
  const [mcpPlanId, setMcpPlanId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('mcp_plan'),
  );
  // Consenso OAuth 2.1 (Fase 5): ?mcp_oauth=<ctx> apre la pagina di autorizzazione del client MCP.
  const [mcpOauthCtx, setMcpOauthCtx] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('mcp_oauth'),
  );
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const hasInitialSession = useRef(false);
  // "Latch": una volta visto lo stato offline durante il caricamento, resta vero
  // fino al termine di checkSession. Serve a tenere la modale stabile anche se
  // navigator.onLine oscilla (Windows spara eventi online/offline spuri al reload).
  const hasSeenOfflineRef = useRef(!navigator.onLine);

  // Ref con i flag di bootstrap: letti dai listener online/offline per evitare
  // stale closure senza dover ri-registrare i listener a ogni cambio di stato.
  const bootstrapStateRef = useRef({ isLoading, user, isApproved });
  useEffect(() => {
    bootstrapStateRef.current = { isLoading, user, isApproved };
  }, [isLoading, user, isApproved]);

  useEffect(() => {
    const handleOffline = () => {
      hasSeenOfflineRef.current = true;
      setIsOffline(true);
    };
    const handleOnline = () => {
      setIsOffline(false);
      // Ricarica la sessione se non abbiamo ancora completato il bootstrap:
      // - isLoading: primo caricamento non ancora chiuso
      // - user && isApproved===null: sessione da cache ma profilo non validato
      const s = bootstrapStateRef.current;
      if (s.isLoading || (s.user && s.isApproved === null)) {
        checkSession();
      }
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    // Gestione token dalla conferma email: se l'URL contiene token Supabase,
    // la sessione viene stabilita automaticamente dal client.
    // Puliamo l'hash dall'URL per evitare che resti visibile.
    // Se l'URL contiene token di conferma email, il client Supabase
    // li processerà automaticamente. Non chiamiamo checkSession() subito
    // perché la sessione non è ancora pronta: aspettiamo onAuthStateChange.
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const hasAuthCallback = (hash && hash.includes('access_token')) || params.get('code');

    if (hasAuthCallback) {
      // Rileva tipo di conferma dall'hash (type=signup)
      const hashParams = new URLSearchParams(hash.replace('#', ''));
      const authType = hashParams.get('type');
      if (authType === 'signup') {
        setEmailConfirmed(true);
      }

      // Flow PKCE: scambia il codice manualmente. Se fallisce, segnaliamo a
      // Login via sessionStorage (il ToastProvider non e' ancora montato qui).
      if (params.get('code')) {
        supabase.auth.exchangeCodeForSession(params.get('code')!)
          .then(({ error }) => {
            if (error) {
              console.error('PKCE exchange failed:', error);
              sessionStorage.setItem('pkce_error', error.message || 'exchange_failed');
            }
          })
          .catch((err) => {
            console.error('PKCE exchange threw:', err);
            sessionStorage.setItem('pkce_error', 'exchange_threw');
          });
      }
      // Puliamo l'URL (il client Supabase ha già letto i token)
      window.history.replaceState(null, '', window.location.pathname);
    }

    // Se siamo offline al mount, NON chiamare checkSession: resterebbe pendente
    // e alla prima fluttuazione del flag online verrebbe mostrato lo spinner.
    // Il listener online più sotto la richiamerà al ripristino della connessione.
    if (navigator.onLine) {
      checkSession();
    }

    // Ascolta i cambiamenti di autenticazione
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      if (newUser) {
        if (event === 'SIGNED_IN') {
          if (!hasInitialSession.current) {
            // Primo login o conferma email: vai alla dashboard
            hasInitialSession.current = true;
            setActiveTab('dashboard');
            setShowRegistrazione(false);
            setIsApproved(null);
            checkSession();
          }
          // Se hasInitialSession è già true, è un recupero sessione
          // dopo cambio tab: non navigare e non resettare lo stato
          void retryConsentPersistIfNeeded();
        } else if (event === 'INITIAL_SESSION') {
          hasInitialSession.current = true;
          void retryConsentPersistIfNeeded();
        }
        // TOKEN_REFRESHED: aggiorna solo lo user, non navigare e non resettare lo stato
      } else {
        hasInitialSession.current = false;
        setIsApproved(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);
  

  useEffect(() => {
    const getRuolo = async() => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user?.id)
        .maybeSingle();

      if(error){
        console.error('Errore recupero ruolo:', error);
      }else if(data){
        setRuolo(String(data.role))
      }
    }
    if(user) getRuolo();
  },[user])
  
    
  // Ref stabile per l'id utente, evita restart inutili del polling
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);

  useEffect(() => {
    if (!user || isApproved) return;

    // Polling di fallback ogni 5 secondi
    const interval = setInterval(() => {
      checkSession();
    }, 5000);

    // Realtime subscription per rilevare immediatamente il cambio di approvazione
    const channel = supabase
      .channel('approval-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_profiles',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const newApproved = payload.new?.approved;
          if (newApproved === true) {
            setIsApproved(true);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user?.id, isApproved]);

  useEffect(() => {
    if (user) {
      loadAlertCount();

      const subscription = supabase
        .channel('alerts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alert' }, () => {
          loadAlertCount();
        })
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user]);

  async function checkSession() {
    try {
      // Usa getUser() per validare la sessione lato server (non solo dalla cache locale)
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        // Sessione non valida o scaduta: prova a recuperarla dal storage
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setUser(null);
          setIsApproved(null);
          return;
        }
        // Se c'è una sessione nello storage ma getUser fallisce,
        // non cambiare isApproved per evitare reset errati su errori transienti
        setUser(session.user);
        return;
      }

      setUser(currentUser);

      // Se l'utente è autenticato, controlla lo stato di approvazione
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('approved')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (profileError) {
        console.error('Errore nel recupero del profilo:', profileError);
        // Su errori transienti (rete, token scaduto), non resettare isApproved a false
        // se l'utente era già in uno stato noto — evita blocchi errati
        if (isApproved === null) {
          setIsApproved(false);
        }
      } else {
        setIsApproved(profile?.approved ?? false);
      }
    } catch (error) {
      console.error('Errore nel controllo della sessione:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAlertCount() {
    const { count } = await supabase
      .from('alert')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open');

    setAlertCount(count || 0);
  }

  function handleTabChange(tab: string) {
    // Impostazioni è consultabile da TUTTI i ruoli: i collaboratori vedono le impostazioni di studio
    // in sola lettura (vedi prop `ruolo` di Impostazioni) e gestiscono il proprio Accesso AI.
    if (tab === 'impostazioni') {
      setPreviousTab(activeTab);
    }
    // If leaving impostazioni with unsaved changes, block and let the modal handle it
    if (activeTab === 'impostazioni' && tab !== 'impostazioni' && impostazioniDirtyRef.current) {
      setPendingTab(tab);
      return;
    }
    setPendingTab(null);
    // Deep-link RT3: leggi incarico da localStorage prima del cambio tab
    if (tab === 'rt3') {
      const rt3Inc = sessionStorage.getItem('alert_navigate_rt3');
      if (rt3Inc) {
        sessionStorage.removeItem('alert_navigate_rt3');
        setRt3OpenIncaricoId(rt3Inc);
      } else {
        setRt3OpenIncaricoId(undefined);
      }
    }
    setActiveTab(tab);
    loadAlertCount(); // Aggiorna il contatore ad ogni cambio tab
  }

  function handleLoginSuccess() {
    checkSession();
  }

  // Defense-in-depth: l'AdminPanel è accessibile solo con ruolo server-verificato.
  // Il ruolo proviene da user_profiles via RLS; il gate qui protegge da manipolazioni
  // di stato lato client (es. React DevTools che forza view='admin').
  const canAccessAdmin = ruolo === 'admin' || ruolo === 'superadmin';
  const openAdminView = () => {
    if (canAccessAdmin) setView('admin');
  };

  useEffect(() => {
    if (view === 'admin' && ruolo && !canAccessAdmin) {
      setView('app');
    }
  }, [ruolo, view, canAccessAdmin]);

  function renderContent() {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'anagrafica':
        return <AnagraficaPersone />;
      case 'fascicolo':
        return <FascicoloCliente />;//onNavigate={handleTabChange}
      case 'rt1':
        if (ruolo === 'collaboratore') {
          return <></>;
        }
        return <RT1Autovalutazione />;
      case 'rt2':
        return <RT2AdeguataVerifica onNavigate={handleTabChange} />;
      case 'rt3':
        return <RT3Monitoraggio openIncaricoId={rt3OpenIncaricoId} />;
      case 'alert':
        return <AlertPanel onNavigate={handleTabChange} />;
      case 'cestino':
        return <Cestino />;
      case 'azioni_ai':
        return <AzioniAiInAttesa />;
      case 'profilo':
        return <ProfiloUtente onOpenAdmin={openAdminView} />;
      case 'impostazioni':
        return (
          <Impostazioni
            ruolo={ruolo}
            onBack={() => handleTabChange(previousTab)}
            pendingNavigation={pendingTab}
            onConfirmLeave={() => {
              const target = pendingTab || previousTab;
              setPendingTab(null);
              impostazioniDirtyRef.current = false;
              setActiveTab(target);
              loadAlertCount();
            }}
            onCancelLeave={() => setPendingTab(null)}
            onDirtyChange={(dirty: boolean) => { impostazioniDirtyRef.current = dirty; }}
          />
        );
      default:
        return <Dashboard />;
    }
  }

  // Se manca la connessione durante il caricamento iniziale OPPURE durante
  // la validazione del profilo (sessione presa dalla cache localStorage ma
  // fetch di approved/ruolo fallito), blocca qualunque spinner e mostra la
  // modale con messaggio in blu.
  // Uso il latch hasSeenOfflineRef per evitare che la modale venga sostituita
  // dallo spinner se navigator.onLine oscilla durante le chiamate Supabase.
  const isAwaitingRemoteData = isLoading || (!!user && isApproved === null);

  // Il banner privacy/cookie viene montato a livello root: deve essere visibile
  // anche su Login/Registrazione/landing e indipendentemente dal ruolo, così la
  // prima visita può raccogliere il consenso prima dell'autenticazione.
  const renderRoot = (inner: React.ReactNode) => (
    <>
      {inner}
      <PrivacyBanner />
    </>
  );

  if (isAwaitingRemoteData && (isOffline || hasSeenOfflineRef.current)) {
    return renderRoot(createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-3 px-8 py-6 bg-white border-2 border-blue-500 rounded-xl shadow-xl max-w-md mx-4">
          <WifiOff className="w-12 h-12 text-blue-600" />
          <p className="text-blue-700 text-center font-medium">
            Connessione a Internet assente. Impossibile caricare l'applicazione.
          </p>
          <p className="text-blue-600 text-sm text-center">
            Verifica la tua connessione: la piattaforma si avvierà automaticamente al ripristino.
          </p>
        </div>
      </div>,
      document.body
    ));
  }

  if (isLoading) {
    return renderRoot(<Spinner/>);
  }

  if (!user) {
    if (emailConfirmed) {
      return renderRoot(<EmailConfirmed onGoToLogin={() => setEmailConfirmed(false)} />);
    }
    if (showRegistrazione) {
      return renderRoot(<ToastProvider><RichiestaRegistrazione onBack={() => setShowRegistrazione(false)} /></ToastProvider>);
    }
    return renderRoot(<ToastProvider><Login onLoginSuccess={handleLoginSuccess} onRequestRegistration={() => setShowRegistrazione(true)} /></ToastProvider>);
  }

  if (user && isApproved === null) {
    return renderRoot(<Spinner />);
  }

  if (user && isApproved === false) {
    return renderRoot(<PendingApproval />);
  }

  // Consenso OAuth 2.1 (Fase 5): l'utente loggato autorizza un client MCP.
  if (user && isApproved && mcpOauthCtx) {
    return renderRoot(
      <ToastProvider>
        <ConsensoMcp
          ctxRaw={mcpOauthCtx}
          onClose={() => {
            window.history.replaceState(null, '', window.location.pathname);
            setMcpOauthCtx(null);
          }}
        />
      </ToastProvider>,
    );
  }

  // Link breve di approvazione piano AI (Fase 4b): mostra la pagina dedicata a tutto schermo.
  if (user && isApproved && mcpPlanId) {
    return renderRoot(
      <ToastProvider>
        <PianoApprovazione
          planId={mcpPlanId}
          onClose={() => {
            window.history.replaceState(null, '', window.location.pathname);
            setMcpPlanId(null);
          }}
        />
      </ToastProvider>,
    );
  }

  if (view === 'admin' && canAccessAdmin) {
    return renderRoot(<ToastProvider><UnreadSegnalazioniProvider><AdminPanel ruolo={ruolo} onBackToApp={() => setView('app')} /></UnreadSegnalazioniProvider></ToastProvider>);
  }

  return renderRoot(
    <ToastProvider>
      <StudioProvider ruolo={ruolo}>
        <AlertProvider>
          <AlertCountsProvider>
            <UnreadSegnalazioniProvider>
              <Layout activeTab={activeTab} onTabChange={handleTabChange} alertCount={alertCount} ruolo={ruolo}>
                {renderContent()}
              </Layout>
              {/* Conferme azioni AI come modale globale: compaiono ovunque, in tempo reale. */}
              <AzioniAiModale />
            </UnreadSegnalazioniProvider>
          </AlertCountsProvider>
        </AlertProvider>
      </StudioProvider>
    </ToastProvider>
  );
}

export default App;
