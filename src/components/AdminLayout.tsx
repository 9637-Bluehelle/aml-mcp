import { ReactNode } from 'react';
import { Shield, Users, Activity, BarChart3, Settings, ArrowLeft, Crown, Building2, ClipboardList, MessageSquarePlus, Home } from 'lucide-react';

interface AdminLayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onBackToApp: () => void;
  isSuperAdmin: boolean;
}

export function AdminLayout({ children, activeTab, onTabChange, onBackToApp, isSuperAdmin }: AdminLayoutProps) {
  const usersTab = { id: 'users', label: 'Utenti', icon: Users };
  const myStudioTab = { id: 'my-studio', label: 'Il mio Studio', icon: Home };
  const sharedTabs = [
    { id: 'stats', label: 'Statistiche', icon: BarChart3 },
    { id: 'logs', label: 'Activity Log', icon: Activity },
  ];

  const superAdminTabs = [
    { id: 'studi', label: 'Studi', icon: Building2 },
    { id: 'richieste', label: 'Richieste Studi', icon: ClipboardList },
    { id: 'segnalazioni', label: 'Segnalazioni', icon: MessageSquarePlus },
    { id: 'system', label: 'Sistema', icon: Settings },
  ];

  const tabs = isSuperAdmin
    ? [usersTab, ...sharedTabs, ...superAdminTabs]
    : [usersTab, myStudioTab, ...sharedTabs];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header Admin */}
      <header className="bg-slate-800 border-b border-slate-700 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${isSuperAdmin ? 'bg-gradient-to-br from-amber-500 to-amber-600' : 'bg-gradient-to-br from-red-600 to-red-700'}`}>
                {isSuperAdmin ? <Crown className="w-6 h-6 text-white" /> : <Shield className="w-6 h-6 text-white" />}
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">
                  {isSuperAdmin ? 'Super Admin Panel' : 'Admin Panel'}
                </h1>
                <p className="text-xs text-slate-400">
                  {isSuperAdmin ? 'Gestione Piattaforma Completa' : 'Gestione Studio'}
                </p>
              </div>
            </div>

            <button
              onClick={onBackToApp}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Torna all'App
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-slate-800 border-b border-slate-700">
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
                      ? isSuperAdmin
                        ? 'border-amber-500 text-white bg-slate-700/50'
                        : 'border-red-500 text-white bg-slate-700/50'
                      : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-700/30'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-slate-800 border-t border-slate-700 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-xs text-slate-500 text-center">
            {isSuperAdmin ? '👑 Super Admin Panel - Accesso Piattaforma' : '🔒 Admin Panel - Accesso Studio'}
          </p>
        </div>
      </footer>
    </div>
  );
}
