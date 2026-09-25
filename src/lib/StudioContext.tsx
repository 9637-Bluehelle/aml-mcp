import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from './supabase';
import { getMyStudioId, setActiveStudioIdHolder } from './studioHelper';
import { Spinner } from '../components/cliente-wizard/modals/Spinner';

interface Studio {
  id: string;
  nome: string;
}

interface StudioContextType {
  activeStudioId: string | null;
  setActiveStudioId: (id: string) => void;
  studioList: Studio[];
  isSuperAdmin: boolean;
}

const StudioContext = createContext<StudioContextType | undefined>(undefined);

export function StudioProvider({ children, ruolo }: { children: ReactNode; ruolo: string }) {
  const [activeStudioId, setActiveStudioId] = useState<string | null>(null);
  const [myStudioId, setMyStudioId] = useState<string | null>(null);
  const [studioList, setStudioList] = useState<Studio[]>([]);
  const [ready, setReady] = useState(false);
  const isSuperAdmin = ruolo === 'superadmin';

  useEffect(() => {
    (async () => {
      const id = await getMyStudioId();
      setMyStudioId(id);
      setActiveStudioId(id);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      const { data } = await supabase
        .from('studi')
        .select('id, nome')
        .order('nome');
      if (data) setStudioList(data);
    })();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin && myStudioId) {
      setActiveStudioId(myStudioId);
    }
  }, [isSuperAdmin, myStudioId]);

  // Sincronizza l'holder a modulo: serve a moduli plain (personeHelper, ecc.)
  // che devono filtrare per studio attivo senza dipendere dal React context.
  useEffect(() => {
    setActiveStudioIdHolder(activeStudioId);
    return () => setActiveStudioIdHolder(null);
  }, [activeStudioId]);

  if (!ready) return <Spinner />;

  return (
    <StudioContext.Provider value={{ activeStudioId, setActiveStudioId, studioList, isSuperAdmin }}>
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error('useStudio must be used within StudioProvider');
  return context;
}
