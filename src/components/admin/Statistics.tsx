import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, FileText, Briefcase, TrendingUp, AlertTriangle, Building2 } from 'lucide-react';
import { Spinner } from '../cliente-wizard/modals/Spinner';

interface Stats {
  totalUsers: number;
  totalClienti: number;
  totalIncarichi: number;
  totalValutazioni: number;
  totalAlerts: number;
  activeUsers30Days: number;
}

interface Studio {
  id: string;
  nome: string;
}

interface Props {
  isSuperAdmin: boolean;
}

export function Statistics({ isSuperAdmin }: Props) {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalClienti: 0,
    totalIncarichi: 0,
    totalValutazioni: 0,
    totalAlerts: 0,
    activeUsers30Days: 0
  });
  const [loading, setLoading] = useState(true);
  const [studi, setStudi] = useState<Studio[]>([]);
  const [selectedStudioId, setSelectedStudioId] = useState<string>('');
  // Carica studi e default per superadmin
  useEffect(() => {
    (async () => {
      if (isSuperAdmin) {
        const [{ data: studiData }, { data: { user } }, { data: profiles }] = await Promise.all([
          supabase.from('studi').select('id, nome').order('nome'),
          supabase.auth.getUser(),
          supabase.from('user_profiles').select('user_id, studio_id'),
        ]);
        setStudi(studiData || []);

        // Default: studio del superadmin
        const myProfile = (profiles || []).find((p: any) => p.user_id === user?.id);
        if (myProfile?.studio_id) {
          setSelectedStudioId(myProfile.studio_id);
        } else {
          loadStatistics(null);
        }
      } else {
        loadStatistics(null);
      }
    })();
  }, [isSuperAdmin]);

  // Quando cambia lo studio selezionato, ricarica le statistiche
  useEffect(() => {
    if (!isSuperAdmin) return;
    loadStatistics(selectedStudioId || null);
  }, [selectedStudioId]);

  async function loadStatistics(studioId: string | null) {
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      let usersQ = supabase.from('user_profiles').select('user_id', { count: 'exact', head: true });
      let clientiQ = supabase.from('clienti').select('id', { count: 'exact', head: true });
      let incarichiQ = supabase.from('incarichi').select('id', { count: 'exact', head: true });
      let valutazioniQ = supabase.from('valutazioni_rischio').select('id', { count: 'exact', head: true });
      let alertsQ = supabase.from('alert').select('id', { count: 'exact', head: true }).eq('status', 'open');
      let userLogsQ = supabase.from('user_logs').select('user_id').gte('created_at', thirtyDaysAgo);

      if (studioId) {
        // Filtra direttamente per studio_id (tutte le tabelle ora hanno studio_id)
        usersQ = usersQ.eq('studio_id', studioId);
        clientiQ = clientiQ.eq('studio_id', studioId);
        incarichiQ = incarichiQ.eq('studio_id', studioId);
        valutazioniQ = valutazioniQ.eq('studio_id', studioId);
        alertsQ = alertsQ.eq('studio_id', studioId);
        userLogsQ = userLogsQ.eq('studio_id', studioId);
      }

      const [users, clienti, incarichi, valutazioni, alerts, recentUserLogs] = await Promise.all([
        usersQ, clientiQ, incarichiQ, valutazioniQ, alertsQ, userLogsQ,
      ]);

      const totalValutazioni = valutazioni.count || 0;

      const activeUserIds = new Set<string>();
      (recentUserLogs.data || []).forEach((l: any) => { if (l.user_id) activeUserIds.add(l.user_id); });

      setStats({
        totalUsers: users.count || 0,
        totalClienti: clienti.count || 0,
        totalIncarichi: incarichi.count || 0,
        totalValutazioni,
        totalAlerts: alerts.count || 0,
        activeUsers30Days: activeUserIds.size
      });
    } catch (error) {
      console.error('Errore caricamento statistiche:', error);
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    { title: 'Utenti Totali', value: stats.totalUsers, icon: Users, color: 'from-blue-600 to-blue-700', bgColor: 'bg-blue-500/10' },
    { title: 'Utenti Attivi (30gg)', value: stats.activeUsers30Days, icon: TrendingUp, color: 'from-green-600 to-green-700', bgColor: 'bg-green-500/10' },
    { title: 'Clienti', value: stats.totalClienti, icon: Users, color: 'from-purple-600 to-purple-700', bgColor: 'bg-purple-500/10' },
    { title: 'Incarichi', value: stats.totalIncarichi, icon: Briefcase, color: 'from-orange-600 to-orange-700', bgColor: 'bg-orange-500/10' },
    { title: 'Valutazioni', value: stats.totalValutazioni, icon: FileText, color: 'from-cyan-600 to-cyan-700', bgColor: 'bg-cyan-500/10' },
    { title: 'Alert Aperti', value: stats.totalAlerts, icon: AlertTriangle, color: 'from-red-600 to-red-700', bgColor: 'bg-red-500/10' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Statistiche Sistema</h1>
          <p className="text-slate-400 mt-1">Panoramica generale della piattaforma</p>
        </div>

        {/* Filtro studio (solo superadmin) */}
        {isSuperAdmin && studi.length > 0 && (
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus-within:ring-2 focus-within:ring-amber-500 focus-within:border-transparent">
            <select
              value={selectedStudioId}
              onChange={(e) => setSelectedStudioId(e.target.value)}
              className="w-full bg-slate-800 text-white text-sm focus:outline-none focus:ring-0"
            >
              <option value="">Tutti gli studi</option>
              {studi.map(s => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className={`${card.bgColor} border border-slate-700 rounded-lg p-6`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`flex items-center justify-center w-12 h-12 bg-gradient-to-br ${card.color} rounded-lg`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <p className="text-sm text-slate-400 mb-1">{card.title}</p>
                  <p className="text-3xl font-bold text-white">{card.value}</p>
                </div>
              );
            })}
          </div>

          {/* Percentuali e metriche */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Media per Utente</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Clienti per utente</span>
                  <span className="text-xl font-bold text-white">
                    {stats.totalUsers > 0 ? (stats.totalClienti / stats.totalUsers).toFixed(1) : '0'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Incarichi per utente</span>
                  <span className="text-xl font-bold text-white">
                    {stats.totalUsers > 0 ? (stats.totalIncarichi / stats.totalUsers).toFixed(1) : '0'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Valutazioni per utente</span>
                  <span className="text-xl font-bold text-white">
                    {stats.totalUsers > 0 ? (stats.totalValutazioni / stats.totalUsers).toFixed(1) : '0'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Engagement</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Tasso attività (30gg)</span>
                  <span className="text-xl font-bold text-white">
                    {stats.totalUsers > 0
                      ? `${((stats.activeUsers30Days / stats.totalUsers) * 100).toFixed(0)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Incarichi con valutazione</span>
                  <span className="text-xl font-bold text-white">
                    {stats.totalIncarichi > 0
                      ? `${((stats.totalValutazioni / stats.totalIncarichi) * 100).toFixed(0)}%`
                      : '0%'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
