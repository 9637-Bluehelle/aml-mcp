import { createContext, useContext } from 'react';

// API di sistema per il controllo/refresh degli alert, esposta dall'AlertProvider.
export interface AlertContextType {
  isCheckingAlerts: boolean;
  checkSystemAlerts: () => Promise<void>;
  ensureDailyCheck: () => Promise<void>;
  /** Esegue check_alerts senza toast UI. Pensato per essere invocato al
   *  mount di Layout (dunque ad ogni reload pagina) per sincronizzare
   *  gli alert alla sessione corrente. */
  runAlertCheckSilent: () => Promise<void>;
  /** Forza il refetch della lista alert (AlertPanel) e dei contatori.
   *  Usato dal listener realtime per propagare DELETE/UPDATE che non
   *  passano direttamente alla UI senza un bump. */
  bumpRefresh: () => void;
  lastCheckMessage: string;
  refreshToken: number;
}

// Il context vive in questo modulo foglia (solo React, nessuna dipendenza
// dall'app) così la sua identità resta stabile attraverso l'Hot Module
// Replacement di Vite. Vedi la nota analoga in ./alertCountsContext.
export const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function useSystemAlerts() {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error('useSystemAlerts must be used within an AlertProvider');
  }
  return context;
}
