import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  MessageSquarePlus, Clock, Wrench, CheckCircle, XCircle,
  Bug, Database, Lightbulb, AlertTriangle, Calendar,
  Send, ChevronDown, Filter, ArrowLeft
} from 'lucide-react';
import { Spinner } from '../cliente-wizard/modals/Spinner';
import { useToast } from '../Toast';
import { useUnreadSegnalazioni } from '../UnreadSegnalazioniProvider';
import { logAccess } from '../LogUtente';

interface Segnalazione {
  id: string;
  user_id: string;
  studio_id: string | null;
  categoria: 'bug' | 'dati' | 'suggerimento' | 'altro';
  oggetto: string;
  descrizione: string;
  sezione: string | null;
  stato: 'aperta' | 'in_lavorazione' | 'risolta' | 'chiusa';
  nota_admin: string | null;
  created_at: string;
  updated_at: string;
  user_profiles?: { nome: string; cognome: string; email: string } | null;
  studi?: { nome: string } | null;
}

interface Messaggio {
  id: string;
  segnalazione_id: string;
  user_id: string;
  messaggio: string;
  is_admin: boolean;
  created_at: string;
  user_profiles?: { nome: string; cognome: string } | null;
}

type StatoFilter = 'tutte' | 'aperta' | 'in_lavorazione' | 'risolta' | 'chiusa';

const categoriaConfig = {
  bug: { label: 'Bug', icon: Bug, color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/40' },
  dati: { label: 'Dati inesatti', icon: Database, color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/40' },
  suggerimento: { label: 'Suggerimento', icon: Lightbulb, color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/40' },
  altro: { label: 'Altro', icon: AlertTriangle, color: 'text-slate-400', bg: 'bg-slate-500/20 border-slate-500/40' },
};

const statoConfig = {
  aperta: { label: 'Aperta', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/40' },
  in_lavorazione: { label: 'In lavorazione', icon: Wrench, color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/40' },
  risolta: { label: 'Risolta', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/40' },
  chiusa: { label: 'Chiusa', icon: XCircle, color: 'text-slate-400', bg: 'bg-slate-500/20 border-slate-500/40' },
};

const STATI_OPTIONS: Array<{ value: Segnalazione['stato']; label: string }> = [
  { value: 'aperta', label: 'Aperta' },
  { value: 'in_lavorazione', label: 'In lavorazione' },
  { value: 'risolta', label: 'Risolta' },
  { value: 'chiusa', label: 'Chiusa' },
];

export function SegnalazioniManagement() {
  const toast = useToast();
  const { unreadIds, markAsRead } = useUnreadSegnalazioni();
  const [segnalazioni, setSegnalazioni] = useState<Segnalazione[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatoFilter>('aperta');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('tutte');

  // Chat state
  const [selectedSeg, setSelectedSeg] = useState<Segnalazione | null>(null);
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [updatingStato, setUpdatingStato] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ref per evitare stale closures nei callback realtime
  const selectedSegRef = useRef<Segnalazione | null>(null);
  useEffect(() => { selectedSegRef.current = selectedSeg; }, [selectedSeg]);

  const loadSegnalazioni = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('segnalazioni')
        .select('*, user_profiles!segnalazioni_user_profile_fkey(nome, cognome, email), studi(nome)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSegnalazioni((data as Segnalazione[]) || []);

      // Aggiorna selectedSeg se è aperto usando la ref
      const openId = selectedSegRef.current?.id;
      if (openId) {
        const updated = (data as Segnalazione[])?.find(s => s.id === openId);
        if (updated) setSelectedSeg(updated);
      }
    } catch (err: any) {
      console.error('Errore caricamento segnalazioni:', err);
    }
  }, []);

  // Init + realtime segnalazioni (lista)
  useEffect(() => {
    setLoading(true);
    loadSegnalazioni().finally(() => setLoading(false));

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });

    const channel = supabase
      .channel('segnalazioni_list_rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'segnalazioni' },
        () => { loadSegnalazioni(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadSegnalazioni]);

  // Realtime messaggi chat - si ri-crea quando cambia la segnalazione selezionata
  useEffect(() => {
    if (!selectedSeg) return;
    const segId = selectedSeg.id;

    const channel = supabase
      .channel(`admin-chat-${segId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'segnalazione_messaggi',
          filter: `segnalazione_id=eq.${segId}`,
        },
        async (payload) => {
          // Fetch il messaggio completo con profilo utente
          const { data } = await supabase
            .from('segnalazione_messaggi')
            .select('*, user_profiles!segnalazione_messaggi_user_profile_fkey(nome, cognome)')
            .eq('id', (payload.new as any).id)
            .single();

          if (data) {
            setMessaggi((prev) => {
              if (prev.some((m) => m.id === data.id)) return prev;
              return [...prev, data as Messaggio];
            });
            // Se è un messaggio dell'utente, mostra toast e segna come letto (siamo nella chat)
            const msg = data as Messaggio;
            if (!msg.is_admin) {
              const name = msg.user_profiles
                ? `${msg.user_profiles.nome} ${msg.user_profiles.cognome}`
                : 'Utente';
              toast.success(`Nuovo messaggio da ${name}`);
              markAsRead(segId);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedSeg?.id]);

  // Auto-scroll su nuovi messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messaggi]);

  async function loadMessaggi(segnalazioneId: string) {
    setLoadingMsg(true);
    // Audit trail GDPR: l'accesso admin a una segnalazione utente e'
    // l'evento piu' sensibile da tracciare per compliance.
    logAccess({
      action: 'Lettura chat segnalazione (admin)',
      action_type: 'READ',
      target_table: 'segnalazioni',
      target_id: segnalazioneId,
      metadata: { admin_view: true },
    });
    try {
      const { data, error } = await supabase
        .from('segnalazione_messaggi')
        .select('*, user_profiles!segnalazione_messaggi_user_profile_fkey(nome, cognome)')
        .eq('segnalazione_id', segnalazioneId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessaggi((data as Messaggio[]) || []);
    } catch (err) {
      console.error('Errore caricamento messaggi:', err);
    } finally {
      setLoadingMsg(false);
    }
  }

  async function handleSend() {
    if (!newMessage.trim() || !selectedSeg || !currentUserId || sending) return;

    setSending(true);
    try {
      const { error } = await supabase.from('segnalazione_messaggi').insert({
        segnalazione_id: selectedSeg.id,
        user_id: currentUserId,
        messaggio: newMessage.trim(),
        is_admin: true,
      });

      if (error) throw error;
      setNewMessage('');
      textareaRef.current?.focus();
    } catch (err: any) {
      toast.error('Errore nell\'invio del messaggio');
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  async function handleStatoChange(newStato: Segnalazione['stato']) {
    if (!selectedSeg || newStato === selectedSeg.stato) return;

    setUpdatingStato(true);
    try {
      const { error } = await supabase
        .from('segnalazioni')
        .update({ stato: newStato })
        .eq('id', selectedSeg.id);

      if (error) throw error;
      toast.success(`Stato aggiornato a "${statoConfig[newStato].label}"`);
      setSelectedSeg({ ...selectedSeg, stato: newStato });
    } catch (err: any) {
      console.error('Errore aggiornamento stato:', err);
      toast.error(err.message || 'Errore aggiornamento stato');
    } finally {
      setUpdatingStato(false);
    }
  }

  function openChat(seg: Segnalazione) {
    setSelectedSeg(seg);
    loadMessaggi(seg.id);
    markAsRead(seg.id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const filtered = segnalazioni.filter(s => {
    if (filter !== 'tutte' && s.stato !== filter) return false;
    if (categoriaFilter !== 'tutte' && s.categoria !== categoriaFilter) return false;
    return true;
  });

  const aperteCount = segnalazioni.filter(s => s.stato === 'aperta').length;
  const inLavorazioneCount = segnalazioni.filter(s => s.stato === 'in_lavorazione').length;

  if (loading && !selectedSeg) return <Spinner />;

  // ============ CHAT VIEW ============
  if (selectedSeg) {
    const userName = selectedSeg.user_profiles
      ? `${selectedSeg.user_profiles.nome} ${selectedSeg.user_profiles.cognome}`
      : 'Utente sconosciuto';
    const userEmail = selectedSeg.user_profiles?.email || '';
    const studioName = selectedSeg.studi?.nome || '—';
    const catConf = categoriaConfig[selectedSeg.categoria];
    const staConf = statoConfig[selectedSeg.stato];

    return (
      <div className="space-y-4">
        {/* Back + Stato header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button
            onClick={() => { setSelectedSeg(null); setMessaggi([]); }}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Torna alla lista</span>
          </button>

          {/* Stato selector inline */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">Stato:</span>
            <div className="flex gap-1.5">
              {STATI_OPTIONS.map(opt => {
                const optConf = statoConfig[opt.value];
                const isActive = selectedSeg.stato === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleStatoChange(opt.value)}
                    disabled={updatingStato}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      isActive
                        ? `${optConf.bg} ${optConf.color} ring-1 ring-current`
                        : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 cursor-pointer'
                    }`}
                  >
                    {updatingStato ? '...' : opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Info card */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={`flex items-center justify-center w-10 h-10 rounded-lg border ${catConf.bg}`}>
              {(() => { const CatIcon = catConf.icon; return <CatIcon className={`w-5 h-5 ${catConf.color}`} />; })()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-white truncate">{selectedSeg.oggetto}</h2>
              <p className="text-sm text-slate-400">
                {userName} {userEmail && <span className="text-slate-500">({userEmail})</span>} · {studioName}
                {selectedSeg.sezione && <span> · {selectedSeg.sezione}</span>}
              </p>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${staConf.bg}`}>
              {(() => { const StaIcon = staConf.icon; return <StaIcon className={`w-3.5 h-3.5 ${staConf.color}`} />; })()}
              <span className={`text-xs font-medium ${staConf.color}`}>{staConf.label}</span>
            </div>
          </div>
          <div className="bg-slate-900 rounded-lg p-3 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium text-slate-500 mb-1.5">Descrizione iniziale</p>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{selectedSeg.descrizione}</p>
            <p className="text-[10px] text-slate-500 mt-2">
              {new Date(selectedSeg.created_at).toLocaleDateString('it-IT', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </p>
          </div>
        </div>

        {/* Chat area */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg flex flex-col" style={{ height: 'calc(100vh - 400px)', minHeight: '300px' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loadingMsg ? (
              <div className="flex items-center justify-center py-12">
                <span className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {messaggi.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <p className="text-sm">Nessun messaggio. Rispondi all'utente qui sotto.</p>
                  </div>
                )}

                {messaggi.map((msg) => {
                  const isAdmin = msg.is_admin;
                  const senderName = msg.user_profiles
                    ? `${msg.user_profiles.nome} ${msg.user_profiles.cognome}`
                    : 'Utente';
                  return (
                    <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'} mb-1`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                        isAdmin
                          ? 'bg-amber-600 text-white rounded-br-md'
                          : 'bg-slate-700 text-slate-100 rounded-bl-md'
                      }`}>
                        <p className={`text-[10px] font-semibold mb-0.5 ${
                          isAdmin ? 'text-amber-200' : 'text-slate-400'
                        }`}>
                          {isAdmin ? 'Tu (Admin)' : senderName}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{msg.messaggio}</p>
                        <p className={`text-[10px] mt-1 ${isAdmin ? 'text-amber-200' : 'text-slate-500'}`}>
                          {new Date(msg.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-slate-700 p-3 flex-shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Rispondi all'utente..."
                rows={1}
                maxLength={5000}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none max-h-24 overflow-y-auto"
                style={{ minHeight: '40px' }}
              />
              <button
                onClick={handleSend}
                disabled={!newMessage.trim() || sending}
                className="p-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:hover:bg-amber-600 text-white rounded-xl transition-colors flex-shrink-0"
              >
                {sending ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ LISTA SEGNALAZIONI ============
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Segnalazioni Utenti</h1>
          <p className="text-slate-400 mt-1">Gestisci bug report, suggerimenti e segnalazioni dalla piattaforma</p>
        </div>
        <div className="flex items-center gap-3">
          {aperteCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/40 rounded-lg">
              <Clock className="w-5 h-5 text-amber-400" />
              <span className="text-lg font-bold text-amber-400">{aperteCount}</span>
              <span className="text-sm text-amber-300">aperte</span>
            </div>
          )}
          {inLavorazioneCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 border border-blue-500/40 rounded-lg">
              <Wrench className="w-5 h-5 text-blue-400" />
              <span className="text-lg font-bold text-blue-400">{inLavorazioneCount}</span>
              <span className="text-sm text-blue-300">in lavorazione</span>
            </div>
          )}
        </div>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-2">
          {(['aperta', 'in_lavorazione', 'tutte', 'risolta', 'chiusa'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                filter === f
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {f === 'tutte' ? 'Tutte' : statoConfig[f].label}
              {f === 'aperta' && aperteCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">{aperteCount}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus-within:ring-2 focus-within:ring-amber-500 focus-within:border-amber-500 transition-shadow">
          <select
            value={categoriaFilter}
            onChange={(e) => setCategoriaFilter(e.target.value)}
            className="w-full bg-slate-800 text-sm text-slate-300 rounded-lg focus:outline-none focus:ring-0"
          >
            <option value="tutte">Tutte le categorie</option>
            <option value="bug">Bug</option>
            <option value="dati">Dati inesatti</option>
            <option value="suggerimento">Suggerimenti</option>
            <option value="altro">Altro</option>
          </select>
          </div>
        </div>
      </div>

      {/* Lista segnalazioni */}
      <div className="space-y-3">
        {filtered.map((seg) => {
          const catConf = categoriaConfig[seg.categoria];
          const staConf = statoConfig[seg.stato];
          const CatIcon = catConf.icon;
          const StaIcon = staConf.icon;
          const userName = seg.user_profiles
            ? `${seg.user_profiles.nome} ${seg.user_profiles.cognome}`
            : 'Utente sconosciuto';
          const studioName = seg.studi?.nome || '—';

          return (
            <div
              key={seg.id}
              className={`bg-slate-800 border rounded-lg transition-colors cursor-pointer hover:bg-slate-750 ${
                seg.stato === 'aperta' ? 'border-amber-500/30' : 'border-slate-700'
              }`}
              onClick={() => openChat(seg)}
            >
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-lg border ${catConf.bg}`}>
                      <CatIcon className={`w-5 h-5 ${catConf.color}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-white truncate">{seg.oggetto}</h3>
                      <p className="text-sm text-slate-400">
                        {userName} · {studioName}
                        {seg.sezione && <span> · {seg.sezione}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${catConf.bg}`}>
                      <span className={`text-xs font-medium ${catConf.color}`}>{catConf.label}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${staConf.bg}`}>
                      <StaIcon className={`w-3.5 h-3.5 ${staConf.color}`} />
                      <span className={`text-xs font-medium ${staConf.color}`}>{staConf.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-400">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(seg.created_at).toLocaleDateString('it-IT')}</span>
                    </div>
                    {unreadIds.has(seg.id) && (
                      <span className="flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                      </span>
                    )}
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <MessageSquarePlus className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nessuna segnalazione trovata</p>
          </div>
        )}
      </div>
    </div>
  );
}
