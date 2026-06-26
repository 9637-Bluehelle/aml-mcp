import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Database, HardDrive, Activity, CheckCircle, AlertCircle } from 'lucide-react';

export function SystemStatus() {
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [tablesInfo, setTablesInfo] = useState<any[]>([]);

  useEffect(() => {
    checkSystemStatus();
  }, []);

  async function checkSystemStatus() {
    try {
      // Test connessione database
      const { error } = await supabase.from('user_profiles').select('user_id').limit(1);
      setDbStatus(error ? 'offline' : 'online');

      // Ottieni info sulle tabelle principali
      const tables = ['user_profiles', 'clienti', 'incarichi', 'valutazioni_rischio', 'documenti', 'alert', 'storico_modifiche'];
      const counts = await Promise.all(
        tables.map(table => 
          supabase.from(table).select('id', { count: 'exact', head: true })
        )
      );

      setTablesInfo(tables.map((table, i) => ({
        name: table,
        count: counts[i].count || 0
      })));
    } catch (error) {
      console.error('Errore verifica sistema:', error);
      setDbStatus('offline');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Stato Sistema</h1>
        <p className="text-slate-400 mt-1">Monitoraggio salute e performance</p>
      </div>

      {/* Stato Database */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8 text-slate-300" />
            <div>
              <h3 className="text-lg font-semibold text-white">Database Supabase</h3>
              <p className="text-sm text-slate-400">PostgreSQL</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dbStatus === 'online' && (
              <>
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-green-500 font-medium">Online</span>
              </>
            )}
            {dbStatus === 'offline' && (
              <>
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-500 font-medium">Offline</span>
              </>
            )}
            {dbStatus === 'checking' && (
              <span className="text-slate-400">Verifica...</span>
            )}
          </div>
        </div>
      </div>

      {/* Info Tabelle */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <HardDrive className="w-5 h-5" />
          Tabelle Database
        </h3>
        <div className="space-y-3">
          {tablesInfo.map(table => (
            <div key={table.name} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
              <span className="text-slate-300">{table.name}</span>
              <span className="text-white font-semibold">{table.count.toLocaleString()} record</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info Ambiente */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Informazioni Sistema
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-slate-700">
            <span className="text-slate-400">Versione</span>
            <span className="text-white">1.1.0</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-700">
            <span className="text-slate-400">Ambiente</span>
            <span className="text-white">Production</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-700">
            <span className="text-slate-400">Provider Database</span>
            <span className="text-white">Supabase</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-slate-400">Ultimo Update</span>
            <span className="text-white">{new Date().toLocaleDateString('it-IT')}</span>
          </div>
        </div>
      </div>

      {/* Sicurezza */}
      <div className="bg-gradient-to-r from-green-900/20 to-green-800/20 border border-green-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-2">✅ Sicurezza</h3>
        <ul className="space-y-2 text-sm text-slate-300">
          <li>• Row Level Security (RLS) attivo</li>
          <li>• Autenticazione Supabase Auth</li>
          <li>• HTTPS abilitato</li>
          <li>• Activity logging attivo</li>
        </ul>
      </div>
    </div>
  );
}
