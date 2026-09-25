import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

/**
 * Chi amministra il proprio studio, e può quindi aprire l'Admin Panel.
 *
 * Comprende il superadmin, che di uno studio fa parte come tutti: dentro
 * l'applicazione non ha più poteri di un admin, e quello che gli spetta in più
 * lo esercita dalla console. Esponeva anche un `isSuperAdmin`, usato per gli
 * strumenti di servizio del wizard cliente e per il ramo superadmin del
 * pannello: entrambi non ci sono più, e tenere in vita quel flag avrebbe
 * invitato a rimettere in piedi qui qualcosa che ha già il suo posto altrove.
 *
 * Questa è una comodità per l'interfaccia, non un controllo di sicurezza: a
 * decidere cosa si può fare davvero sono le RLS e le guardie delle RPC.
 */
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  async function checkAdminStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      const role = profile?.role ?? '';
      setIsAdmin(role === 'admin' || role === 'superadmin');
    } catch (error) {
      console.error('Errore verifica admin:', error);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  return { isAdmin, loading };
}
