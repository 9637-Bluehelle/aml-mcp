import { Loader2 } from 'lucide-react';

/**
 * Indicatore discreto mostrato sotto una lista mentre i blocchi di dati successivi
 * al primo continuano ad arrivare in sottofondo (caricamento progressivo).
 */
export function LoadingMore({ label = 'Caricamento altri risultati…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-500">
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
    </div>
  );
}
