import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { User, Calendar, Building2 } from 'lucide-react';
import { Spinner } from '../cliente-wizard/modals/Spinner';


interface ActivityLogEntry {
  id: string;
  user_id: string;
  user_email: string;
  studio_id: string | null;
  action: string;
  created_at: string;
}

interface Studio {
  id: string;
  nome: string;
}

interface Props {
  isSuperAdmin: boolean;
}

export function ActivityLog({ isSuperAdmin }: Props) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [studi, setStudi] = useState<Studio[]>([]);
  const [selectedStudioId, setSelectedStudioId] = useState<string>('');
  const [profileMap, setProfileMap] = useState<Record<string, { name: string; studio_id: string | null }>>({});

  // Carica profili e studi al mount
  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, email, nome, cognome, studio_id');

      const map: Record<string, { name: string; studio_id: string | null }> = {};
      (profiles || []).forEach((p: any) => {
        const name = [p.nome, p.cognome].filter(Boolean).join(' ');
        map[p.user_id] = { name: name || p.email || 'Utente', studio_id: p.studio_id };
      });
      setProfileMap(map);

      if (isSuperAdmin) {
        const { data: studiData } = await supabase.from('studi').select('id, nome').order('nome');
        setStudi(studiData || []);

        // Default: studio del superadmin
        const { data: { user } } = await supabase.auth.getUser();
        if (user && map[user.id]?.studio_id) {
          setSelectedStudioId(map[user.id].studio_id!);
        }
      }
    })();
  }, [isSuperAdmin]);

  // Ricarica log quando cambiano filtri
  useEffect(() => {
    if (Object.keys(profileMap).length > 0) {
      loadLogs();
    }
  }, [filter, selectedStudioId, profileMap]);

  async function loadLogs() {
    setLoading(true);
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const since = oneWeekAgo.toISOString();

      const { data: userLogsData } = await supabase
        .from('user_logs')
        .select('id, user_id, action, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      let merged: ActivityLogEntry[] = (userLogsData || []).map((l: any) => ({
        id: l.id,
        user_id: l.user_id,
        user_email: profileMap[l.user_id]?.name || 'Utente',
        studio_id: profileMap[l.user_id]?.studio_id || null,
        action: l.action,
        created_at: l.created_at,
      }));

      // Filtra per studio (superadmin)
      if (isSuperAdmin && selectedStudioId) {
        merged = merged.filter(l => l.studio_id === selectedStudioId);
      }

      // Filtra per azione
      if (filter === 'creat') {
        merged = merged.filter(l => {
          const lower = l.action.toLowerCase();
          return lower.includes('creat') || lower.includes('nuovo');
        });
      } else if (filter !== 'all') {
        merged = merged.filter(l => l.action.toLowerCase().includes(filter.toLowerCase()));
      }

      setLogs(merged);
    } catch (error) {
      console.error('Errore caricamento logs:', error);
    } finally {
      setLoading(false);
    }
  }

  const getActionIcon = (action: string) => {
    const lower = action.toLowerCase();
    if (lower.includes('creato') || lower.includes('aggiunt') || lower.includes('create') || lower.includes('nuovo')) return '➕';
    if (lower.includes('modificat') || lower.includes('update')) return '✏️';
    if (lower.includes('eliminat') || lower.includes('delete')) return '🗑️';
    if (lower.includes('pdf') || lower.includes('docx') || lower.includes('genera')) return '📄';
    if (lower.includes('archiviat')) return '📦';
    if (lower.includes('ripristinat')) return '♻️';
    if (lower.includes('valutazione')) return '📊';
    if (lower.includes('controllo') || lower.includes('sos')) return '🔍';
    if (lower.includes('admin')) return '🔒';
    return '📋';
  };

  if (loading && Object.keys(profileMap).length === 0) {
    return <Spinner/>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Activity Log</h1>
          <p className="text-slate-400 mt-1">Attività degli ultimi 7 giorni ({logs.length} eventi)</p>
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

      {/* Filtri azione */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { key: 'all', label: 'Tutti' },
          { key: 'creat', label: '➕ Creazioni' },
          { key: 'modificat', label: '✏️ Modifiche' },
          { key: 'valutazione', label: '📊 Valutazioni' },
          { key: 'archiviat', label: '📦 Archiviazioni' },
          { key: 'ripristinat', label: '♻️ Ripristinati' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              filter === f.key
                ? 'bg-red-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Log Entries */}
      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="flex items-center justify-center w-10 h-10 bg-slate-700 rounded-lg text-lg">
                    {getActionIcon(log.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm leading-relaxed">{log.action}</p>
                    <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
                      <User className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{log.user_email}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0 ml-3">
                  <Calendar className="w-3 h-3" />
                  <span>{new Date(log.created_at).toLocaleString('it-IT')}</span>
                </div>
              </div>
            </div>
          ))}

          {logs.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              Nessuna attività registrata negli ultimi 7 giorni
            </div>
          )}
        </div>
      )}
    </div>
  );
}
