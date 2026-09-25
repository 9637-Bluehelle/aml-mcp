import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';

// Contatori alert per categoria (badge di navigazione).
export interface AlertCountsType {
  no_incarichi: number;
  no_valutazioni: number;
  draft: number;
  scadenza: number;
  rt1_scadenza: number;
  doc_scadenza: number;
  controlli_scadenza: number;
}

export interface AlertCountsContextType {
  alertCounts: AlertCountsType;
  setAlertCounts: Dispatch<SetStateAction<AlertCountsType>>;
}

// Il context vive in questo modulo foglia (nessuna dipendenza dall'app) così la
// sua identità resta stabile attraverso l'Hot Module Replacement di Vite: se
// stesse nel file del provider (AlertPanel.tsx, che si ricarica spesso a caldo),
// ogni reload rieseguirebbe createContext creando un oggetto diverso, e i
// consumer non ricaricati (es. Dashboard) leggerebbero il context vecchio →
// "useAlertCounts must be used within an AlertCountsProvider".
export const AlertCountsContext = createContext<AlertCountsContextType | undefined>(undefined);

export const useAlertCounts = () => {
  const context = useContext(AlertCountsContext);
  if (!context) {
    throw new Error('useAlertCounts must be used within an AlertCountsProvider');
  }
  return context;
};
