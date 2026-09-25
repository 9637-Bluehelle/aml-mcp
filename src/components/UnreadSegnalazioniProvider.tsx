import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

interface UnreadSegnalazioniContextType {
  unreadIds: Set<string>;
  unreadCount: number;
  markAsRead: (segnalazioneId: string) => Promise<void>;
  refresh: () => void;
}

const UnreadSegnalazioniContext = createContext<UnreadSegnalazioniContextType | null>(null);

export function UnreadSegnalazioniProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || !isMounted) return;

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (!isMounted) return;

      setUserId(user.id);
      setIsSuperadmin(profile?.role === 'superadmin');

      if (error) {
        console.error('Errore caricamento ruolo utente:', error);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const loadUnread = useCallback(async () => {
    if (!userId) return;

    try {
      // 1. Per i superadmin consideriamo tutte le segnalazioni; per gli altri solo le proprie.
      const segnalazioniQuery = isSuperadmin
        ? supabase.from('segnalazioni').select('id')
        : supabase.from('segnalazioni').select('id').eq('user_id', userId);

      const { data: segnalazioni } = await segnalazioniQuery;
      if (!segnalazioni || segnalazioni.length === 0) {
        setUnreadIds(new Set());
        return;
      }

      const segIds = segnalazioni.map(s => s.id);

      // 2. Prendi le letture (una sola query)
      const { data: letture, error: letturaErr } = await supabase
        .from('segnalazione_lettura')
        .select('segnalazione_id, last_read_at')
        .eq('user_id', userId)
        .in('segnalazione_id', segIds);

      // Se la tabella non esiste (404), disabilitiamo le query future
      if (letturaErr) {
        console.error('Errore caricamento letture:', letturaErr);
        setUnreadIds(new Set());
        return;
      }

      const letturaMap = new Map<string, string>();
      letture?.forEach(l => letturaMap.set(l.segnalazione_id, l.last_read_at));

      // 3. Prendi tutti i messaggi "dell'altro ruolo" in una sola query
      //    Per utente: is_admin = true, Per superadmin: is_admin = false
      const { data: messaggi } = await supabase
        .from('segnalazione_messaggi')
        .select('segnalazione_id, created_at')
        .in('segnalazione_id', segIds)
        .eq('is_admin', !isSuperadmin)
        .order('created_at', { ascending: false });

      if (!messaggi) {
        setUnreadIds(new Set());
        return;
      }

      // 4. Per ogni segnalazione: c'è almeno un messaggio dopo last_read_at?
      // Confronto su Date.getTime() e non su stringa: Supabase puo' tornare
      // timestamp con formato '+00:00' (server) o '.sssZ' (client toISOString)
      // e un ordinamento lessicografico tra i due e' sbagliato.
      const newUnread = new Set<string>();
      for (const msg of messaggi) {
        if (newUnread.has(msg.segnalazione_id)) continue; // già marcata
        const lastRead = letturaMap.get(msg.segnalazione_id);
        if (!lastRead || new Date(msg.created_at).getTime() > new Date(lastRead).getTime()) {
          newUnread.add(msg.segnalazione_id);
        }
      }

      setUnreadIds(newUnread);
    } catch (err) {
      console.error('Errore caricamento messaggi non letti:', err);
    }
  }, [userId, isSuperadmin]);

  useEffect(() => {
    if (!userId || isSuperadmin === null) return;
    loadUnread();
  }, [userId, isSuperadmin, loadUnread]);

  // Realtime: nuovi messaggi
  useEffect(() => {
    if (!userId || isSuperadmin === null) return;

    const channel = supabase
      .channel(`unread-segnalazioni-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'segnalazione_messaggi' },
        async (payload) => {
          const msg = payload.new as { segnalazione_id: string; is_admin: boolean; user_id: string };
          const isRelevant = isSuperadmin ? !msg.is_admin : msg.is_admin;

          if (!isRelevant || msg.user_id === userId) return;

          if (!isSuperadmin) {
            const { data: segnalazione } = await supabase
              .from('segnalazioni')
              .select('user_id')
              .eq('id', msg.segnalazione_id)
              .single();

            if (segnalazione?.user_id !== userId) return;
          }

          setUnreadIds(prev => new Set([...prev, msg.segnalazione_id]));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, isSuperadmin]);

  // Superadmin: toast globale per nuove segnalazioni e nuove richieste studio
  useEffect(() => {
    if (!userId || isSuperadmin !== true) return;

    const chSegnalazioni = supabase
      .channel(`global-nuove-segnalazioni-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'segnalazioni' },
        (payload) => {
          const seg = payload.new as { oggetto?: string };
          toast.success(`Nuova segnalazione: "${seg.oggetto || 'Senza oggetto'}"`);
        }
      )
      .subscribe();

    const chStudioReq = supabase
      .channel(`global-studio-requests-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'studio_requests' },
        (payload) => {
          const req = payload.new as { nome_studio?: string };
          toast.success(`Nuova richiesta studio: "${req.nome_studio || 'Senza nome'}"`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chSegnalazioni);
      supabase.removeChannel(chStudioReq);
    };
  }, [userId, isSuperadmin]);

  const markAsRead = useCallback(async (segnalazioneId: string) => {
    if (!userId) return;

    // Aggiorna UI subito (optimistic)
    setUnreadIds(prev => {
      const next = new Set(prev);
      next.delete(segnalazioneId);
      return next;
    });

    try {
      const { error } = await supabase
        .from('segnalazione_lettura')
        .upsert({
          segnalazione_id: segnalazioneId,
          user_id: userId,
          last_read_at: new Date().toISOString(),
        }, { onConflict: 'segnalazione_id,user_id' });

      if (error) {
        console.error('Errore mark as read:', error);
      }
    } catch (err) {
      console.error('Errore mark as read:', err);
    }
  }, [userId]);

  const refresh = useCallback(() => { loadUnread(); }, [loadUnread]);

  return (
    <UnreadSegnalazioniContext.Provider value={{
      unreadIds,
      unreadCount: unreadIds.size,
      markAsRead,
      refresh,
    }}>
      {children}
    </UnreadSegnalazioniContext.Provider>
  );
}

export function useUnreadSegnalazioni() {
  const ctx = useContext(UnreadSegnalazioniContext);
  if (!ctx) throw new Error('useUnreadSegnalazioni must be used within UnreadSegnalazioniProvider');
  return ctx;
}
