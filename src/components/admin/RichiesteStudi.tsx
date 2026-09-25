import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Building2, Clock, CheckCircle, XCircle, Mail, Phone, MessageSquare, Calendar, Eye, UserPlus, MapPin } from 'lucide-react';
import { Spinner } from '../cliente-wizard/modals/Spinner';
import { useToast } from '../Toast';

interface StudioRequest {
  id: string;
  nome_studio: string;
  nome_referente: string;
  cognome_referente: string;
  email: string;
  telefono: string | null;
  messaggio: string | null;
  stato: 'pending' | 'approved' | 'rejected';
  note_admin: string | null;
  created_at: string;
  reviewed_at: string | null;
  comune_sede: string | null;
  provincia_sede: string | null;
  via_piazza_sede: string | null;
  numero_civico_sede: string | null;
}

interface SedeBuffer {
  comune_sede: string;
  provincia_sede: string;
  via_piazza_sede: string;
  numero_civico_sede: string;
}

export function RichiesteStudi() {
  const toast = useToast();
  const [requests, setRequests] = useState<StudioRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteAdmin, setNoteAdmin] = useState('');
  const [sedeBuffer, setSedeBuffer] = useState<SedeBuffer>({ comune_sede: '', provincia_sede: '', via_piazza_sede: '', numero_civico_sede: '' });
  const [processing, setProcessing] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ email: string; studio: string } | null>(null);

  function generatePassword(length = 12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
      .map(b => chars[b % chars.length])
      .join('');
  }

  useEffect(() => {
    loadRequests();

    // Sottoscrizione Realtime: ricevi nuove richieste in tempo reale
    const channel = supabase
      .channel('studio_requests_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'studio_requests' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReq = payload.new as StudioRequest;
            setRequests(prev => [newReq, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as StudioRequest;
            setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: string };
            setRequests(prev => prev.filter(r => r.id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadRequests() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('studio_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err: any) {
      console.error('Errore caricamento richieste:', err);
      toast.error('Errore nel caricamento delle richieste');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(id: string, stato: 'approved' | 'rejected') {
    setProcessing(id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('studio_requests')
        .update({
          stato,
          note_admin: noteAdmin.trim() || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
        })
        .eq('id', id);

      if (error) throw error;

      if (stato === 'approved') {
        const req = requests.find(r => r.id === id);
        if (req) {
          // 1. Crea lo studio
          const { data: studioData, error: studioError } = await supabase
            .from('studi')
            .insert({
              nome: req.nome_studio,
              created_by: user?.id,
              comune_sede: sedeBuffer.comune_sede.trim() || null,
              provincia_sede: sedeBuffer.provincia_sede.trim().toUpperCase() || null,
              via_piazza_sede: sedeBuffer.via_piazza_sede.trim() || null,
              numero_civico_sede: sedeBuffer.numero_civico_sede.trim() || null,
            })
            .select('id')
            .single();

          if (studioError) {
            toast.error('Errore nella creazione dello studio: ' + studioError.message);
            return;
          }

          // 2. Crea l'utente admin proprietario via Edge Function (verifica server-side il chiamante
          //    superadmin). Sostituisce auth.signUp+metadata, scavalcabile dal client.
          const tempPassword = generatePassword();
          const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-create-user', {
            body: {
              email: req.email,
              password: tempPassword,
              nome: req.nome_referente,
              cognome: req.cognome_referente,
              role: 'admin',
              studio_id: studioData.id,
              proprietario: true,
              temp_password: tempPassword,
            },
          });

          if (fnError || !fnData?.ok) {
            let msg = fnError?.message || fnData?.error_description;
            try {
              const ctx = await (fnError as any)?.context?.json?.();
              if (ctx?.error_description || ctx?.error) msg = ctx.error_description || ctx.error;
            } catch { /* corpo non JSON */ }
            toast.error('Studio creato ma errore nella creazione utente: ' + (msg || 'sconosciuto'));
            return;
          }

          setSuccessInfo({ email: req.email, studio: req.nome_studio });
        }
      } else {
        toast.success('Richiesta rifiutata');
      }

      setNoteAdmin('');
      setExpandedId(null);
      await loadRequests();
    } catch (err: any) {
      toast.error(err.message || 'Errore durante l\'aggiornamento');
    } finally {
      setProcessing(null);
    }
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.stato === filter);
  const pendingCount = requests.filter(r => r.stato === 'pending').length;

  const statoConfig = {
    pending: { label: 'In attesa', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/40' },
    approved: { label: 'Approvata', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/40' },
    rejected: { label: 'Rifiutata', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/40' },
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Richieste Registrazione Studi</h1>
          <p className="text-slate-400 mt-1">Gestisci le richieste di nuovi studi sulla piattaforma</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/40 rounded-lg">
            <Clock className="w-5 h-5 text-amber-400" />
            <span className="text-lg font-bold text-amber-400">{pendingCount}</span>
            <span className="text-sm text-amber-300">in attesa</span>
          </div>
        )}
      </div>

      {/* Filtri */}
      <div className="flex gap-2">
        {(['pending', 'all', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filter === f
                ? 'bg-amber-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {f === 'all' ? 'Tutte' : f === 'pending' ? 'In attesa' : f === 'approved' ? 'Approvate' : 'Rifiutate'}
            {f === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Lista richieste */}
      <div className="space-y-3">
        {filtered.map((req) => {
          const config = statoConfig[req.stato];
          const StatusIcon = config.icon;
          const isExpanded = expandedId === req.id;

          return (
            <div
              key={req.id}
              className={`bg-slate-800 border rounded-lg transition-colors ${
                req.stato === 'pending' ? 'border-amber-500/30' : 'border-slate-700'
              }`}
            >
              <div
                className="p-5 cursor-pointer"
                onClick={() => {
                  if (isExpanded) {
                    setExpandedId(null);
                  } else {
                    setExpandedId(req.id);
                    setNoteAdmin('');
                    setSedeBuffer({
                      comune_sede: req.comune_sede || '',
                      provincia_sede: req.provincia_sede || '',
                      via_piazza_sede: req.via_piazza_sede || '',
                      numero_civico_sede: req.numero_civico_sede || '',
                    });
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg">
                      <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">{req.nome_studio}</h3>
                      <p className="text-sm text-slate-400">
                        {req.nome_referente} {req.cognome_referente} &middot; {req.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${config.bg}`}>
                      <StatusIcon className={`w-4 h-4 ${config.color}`} />
                      <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-400">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(req.created_at).toLocaleDateString('it-IT')}</span>
                    </div>
                    <Eye className={`w-4 h-4 transition-transform ${isExpanded ? 'text-white' : 'text-slate-500'}`} />
                  </div>
                </div>
              </div>

              {/* Dettaglio espanso */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-slate-700 pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <a href={`mailto:${req.email}`} className="text-blue-400 hover:underline">{req.email}</a>
                    </div>
                    {req.telefono && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-300">{req.telefono}</span>
                      </div>
                    )}
                  </div>

                  {req.messaggio && (
                    <div className="bg-slate-900 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-slate-400 mt-0.5" />
                        <p className="text-sm text-slate-300">{req.messaggio}</p>
                      </div>
                    </div>
                  )}

                  {req.note_admin && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                      <p className="text-sm text-blue-300"><strong>Note admin:</strong> {req.note_admin}</p>
                    </div>
                  )}

                  {req.reviewed_at && (
                    <p className="text-xs text-slate-500">
                      Esaminata il {new Date(req.reviewed_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}

                  {/* Sede studio (solo lettura quando non in pending) */}
                  {req.stato !== 'pending' && (req.comune_sede || req.via_piazza_sede) && (
                    <div className="bg-slate-900 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                        <p className="text-sm text-slate-300">
                          {[req.via_piazza_sede, req.numero_civico_sede].filter(Boolean).join(' ')}
                          {(req.via_piazza_sede || req.numero_civico_sede) && (req.comune_sede || req.provincia_sede) ? ', ' : ''}
                          {req.comune_sede}
                          {req.provincia_sede ? ` (${req.provincia_sede})` : ''}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Azioni per richieste in attesa */}
                  {req.stato === 'pending' && (
                    <div className="space-y-3 pt-2">
                      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-slate-400" />
                          <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Sede studio (opzionale)</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2">
                            <label className="block text-xs text-slate-400 mb-1">Comune</label>
                            <input
                              type="text"
                              value={sedeBuffer.comune_sede}
                              onChange={(e) => setSedeBuffer({ ...sedeBuffer, comune_sede: e.target.value })}
                              placeholder="Es. Milano"
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Prov.</label>
                            <input
                              type="text"
                              value={sedeBuffer.provincia_sede}
                              onChange={(e) => setSedeBuffer({ ...sedeBuffer, provincia_sede: e.target.value.toUpperCase().slice(0, 2) })}
                              placeholder="MI"
                              maxLength={2}
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent uppercase"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2">
                            <label className="block text-xs text-slate-400 mb-1">Via / Piazza</label>
                            <input
                              type="text"
                              value={sedeBuffer.via_piazza_sede}
                              onChange={(e) => setSedeBuffer({ ...sedeBuffer, via_piazza_sede: e.target.value })}
                              placeholder="Es. Via Roma"
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">N. civico</label>
                            <input
                              type="text"
                              value={sedeBuffer.numero_civico_sede}
                              onChange={(e) => setSedeBuffer({ ...sedeBuffer, numero_civico_sede: e.target.value })}
                              placeholder="10/A"
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Note (opzionale)</label>
                        <textarea
                          value={expandedId === req.id ? noteAdmin : ''}
                          onChange={(e) => setNoteAdmin(e.target.value)}
                          placeholder="Note interne sulla richiesta..."
                          rows={2}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                        />
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleUpdateStatus(req.id, 'approved')}
                          disabled={processing === req.id}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium text-sm"
                        >
                          {processing === req.id ? (
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <UserPlus className="w-4 h-4" />
                          )}
                          Approva, Crea Studio e Admin
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(req.id, 'rejected')}
                          disabled={processing === req.id}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium text-sm"
                        >
                          <XCircle className="w-4 h-4" />
                          Rifiuta
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            {filter === 'pending' ? 'Nessuna richiesta in attesa' : 'Nessuna richiesta trovata'}
          </div>
        )}
      </div>

      {/* Modale credenziali dopo approvazione */}
      {successInfo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-emerald-500/40 rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-emerald-500/20 rounded-full">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Studio e Admin Creati</h3>
                <p className="text-sm text-slate-400">Operazione completata con successo</p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Studio</p>
                <p className="text-sm font-medium text-white">{successInfo.studio}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Email</p>
                <p className="text-sm font-medium text-white">{successInfo.email}</p>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <p className="text-xs text-amber-200">
                L'utente riceverà un'email con una password temporanea auto-generata. Ricorda al referente dello studio di controllare anche la cartella <span className="font-bold underline decoration-amber-500/30 underline-offset-2">SPAM</span>.
              </p>
            </div>

            <button
              onClick={() => setSuccessInfo(null)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
