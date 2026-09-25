import { useEffect, useState, useRef, useCallback } from 'react';
import { X, Clock, Wrench, CheckCircle, XCircle, Bug, Database, Lightbulb, AlertTriangle, MessageSquarePlus, ChevronDown, Send, ArrowLeft } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { useUnreadSegnalazioni } from './UnreadSegnalazioniProvider';
import { logAccess } from './LogUtente';

interface Segnalazione {
  id: string;
  categoria: 'bug' | 'dati' | 'suggerimento' | 'altro';
  oggetto: string;
  descrizione: string;
  sezione: string | null;
  stato: 'aperta' | 'in_lavorazione' | 'risolta' | 'chiusa';
  created_at: string;
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

interface MieSegnalazioniProps {
  show: boolean;
  onClose: () => void;
}

const categoriaConfig = {
  bug: { label: 'Bug', icon: Bug, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  dati: { label: 'Dati inesatti', icon: Database, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  suggerimento: { label: 'Suggerimento', icon: Lightbulb, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  altro: { label: 'Altro', icon: AlertTriangle, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' },
};

const statoConfig = {
  aperta: { label: 'Aperta', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-300' },
  in_lavorazione: { label: 'In lavorazione', icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-300' },
  risolta: { label: 'Risolta', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-300' },
  chiusa: { label: 'Chiusa', icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-300' },
};

export function MieSegnalazioni({ show, onClose }: MieSegnalazioniProps) {
  useScrollLock(show);
  const toast = useToast();
  const { unreadIds, markAsRead } = useUnreadSegnalazioni();
  const [segnalazioni, setSegnalazioni] = useState<Segnalazione[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeg, setSelectedSeg] = useState<Segnalazione | null>(null);
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ref per evitare stale closures nei callback realtime
  const selectedSegRef = useRef<Segnalazione | null>(null);
  useEffect(() => { selectedSegRef.current = selectedSeg; }, [selectedSeg]);

  const loadSegnalazioni = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('segnalazioni')
        .select('id, categoria, oggetto, descrizione, sezione, stato, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSegnalazioni(data || []);

      // Aggiorna selectedSeg se aperto, usando la ref
      const openId = selectedSegRef.current?.id;
      if (openId) {
        const updated = data?.find(s => s.id === openId);
        if (updated) setSelectedSeg(updated as Segnalazione);
      }
    } catch (err) {
      console.error('Errore caricamento segnalazioni:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (show) {
      loadSegnalazioni();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) setCurrentUserId(user.id);
      });
    } else {
      setSelectedSeg(null);
      setMessaggi([]);
    }
  }, [show, loadSegnalazioni]);

  // Realtime messaggi chat
  useEffect(() => {
    if (!selectedSeg) return;
    const segId = selectedSeg.id;

    const channel = supabase
      .channel(`user-chat-${segId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'segnalazione_messaggi',
          filter: `segnalazione_id=eq.${segId}`,
        },
        async (payload) => {
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
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedSeg?.id]);

  // Realtime aggiornamenti stato segnalazione
  useEffect(() => {
    if (!show) return;

    const channel = supabase
      .channel('segnalazioni_user_rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'segnalazioni' },
        () => { loadSegnalazioni(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [show, loadSegnalazioni]);

  // Auto-scroll su nuovi messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messaggi]);

  async function loadMessaggi(segnalazioneId: string) {
    setLoadingMsg(true);
    // Audit trail GDPR: accesso alla chat di una segnalazione (fire-and-forget).
    logAccess({
      action: 'Lettura chat segnalazione',
      action_type: 'READ',
      target_table: 'segnalazioni',
      target_id: segnalazioneId,
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
        is_admin: false,
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

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            {selectedSeg && (
              <button
                onClick={() => { setSelectedSeg(null); setMessaggi([]); }}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-gray-500" />
              </button>
            )}
            <div>
              {selectedSeg ? (
                <>
                  <h3 className="text-sm font-bold text-gray-900 truncate max-w-[350px]">{selectedSeg.oggetto}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs font-medium ${categoriaConfig[selectedSeg.categoria].color}`}>
                      {categoriaConfig[selectedSeg.categoria].label}
                    </span>
                    <span className="text-gray-300">·</span>
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border ${statoConfig[selectedSeg.stato].bg}`}>
                      {(() => { const StaIcon = statoConfig[selectedSeg.stato].icon; return <StaIcon className={`w-3 h-3 ${statoConfig[selectedSeg.stato].color}`} />; })()}
                      <span className={`font-medium ${statoConfig[selectedSeg.stato].color}`}>{statoConfig[selectedSeg.stato].label}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-gray-900">Le mie segnalazioni</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Seleziona una segnalazione per aprire la chat</p>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content: Lista o Chat */}
        {!selectedSeg ? (
          /* ============ LISTA SEGNALAZIONI ============ */
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <span className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : segnalazioni.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <MessageSquarePlus className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">Nessuna segnalazione inviata</p>
                <p className="text-sm mt-1">Le tue segnalazioni appariranno qui</p>
              </div>
            ) : (
              <div className="space-y-2">
                {segnalazioni.map((seg) => {
                  const catConf = categoriaConfig[seg.categoria];
                  const staConf = statoConfig[seg.stato];
                  const CatIcon = catConf.icon;
                  const StaIcon = staConf.icon;

                  return (
                    <div
                      key={seg.id}
                      className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-colors"
                      onClick={() => openChat(seg)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`flex items-center justify-center w-9 h-9 rounded-lg border ${catConf.bg}`}>
                            <CatIcon className={`w-4 h-4 ${catConf.color}`} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-gray-900 truncate">{seg.oggetto}</h4>
                            <p className="text-xs text-gray-500">
                              {new Date(seg.created_at).toLocaleDateString('it-IT', {
                                day: '2-digit', month: '2-digit', year: 'numeric'
                              })}
                              {seg.sezione && <span> · {seg.sezione}</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {unreadIds.has(seg.id) && (
                            <span className="flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-blue-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                            </span>
                          )}
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${staConf.bg}`}>
                            <StaIcon className={`w-3 h-3 ${staConf.color}`} />
                            <span className={`text-xs font-medium ${staConf.color}`}>{staConf.label}</span>
                          </div>
                          <ChevronDown className="w-4 h-4 text-gray-300" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ============ CHAT VIEW ============ */
          <>
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {loadingMsg ? (
                <div className="flex items-center justify-center py-12">
                  <span className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Initial description as system message */}
                  <div className="mb-4">
                    <div className="bg-gray-100 rounded-lg px-4 py-3 max-h-48 overflow-y-auto">
                      <p className="text-xs font-medium text-gray-500 mb-1.5">Descrizione iniziale</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedSeg.descrizione}</p>
                      <p className="text-[10px] text-gray-400 mt-2">
                        {new Date(selectedSeg.created_at).toLocaleDateString('it-IT', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>

                  {messaggi.length === 0 && (
                    <div className="text-center py-6 text-gray-400">
                      <p className="text-sm">Nessun messaggio ancora. Scrivi per iniziare la conversazione.</p>
                    </div>
                  )}

                  {messaggi.map((msg) => {
                    const isMe = !msg.is_admin;
                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`}>
                        <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                          isMe
                            ? 'bg-blue-600 text-white rounded-br-md'
                            : 'bg-gray-100 text-gray-900 rounded-bl-md'
                        }`}>
                          {msg.is_admin && msg.user_profiles && (
                            <p className={`text-[10px] font-semibold mb-0.5 ${isMe ? 'text-blue-200' : 'text-blue-600'}`}>
                              Supporto
                            </p>
                          )}
                          <p className="text-sm whitespace-pre-wrap">{msg.messaggio}</p>
                          <p className={`text-[10px] mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
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

            {/* Message input */}
            {selectedSeg.stato !== 'chiusa' ? (
              <div className="border-t border-gray-200 p-3 flex-shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Scrivi un messaggio..."
                    rows={1}
                    maxLength={5000}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none max-h-24 overflow-y-auto"
                    style={{ minHeight: '40px' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!newMessage.trim() || sending}
                    className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-xl transition-colors flex-shrink-0"
                  >
                    {sending ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-t border-gray-200 p-3 flex-shrink-0">
                <p className="text-center text-sm text-gray-400">Questa segnalazione è chiusa</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
