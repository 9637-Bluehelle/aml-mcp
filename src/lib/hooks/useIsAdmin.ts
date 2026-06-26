import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  async function checkAdminStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      const role = profile?.role ?? '';
      setIsSuperAdmin(role === 'superadmin');
      setIsAdmin(role === 'admin' || role === 'superadmin');
    } catch (error) {
      console.error('Errore verifica admin:', error);
      setIsAdmin(false);
      setIsSuperAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  return { isAdmin, isSuperAdmin, loading };
}
