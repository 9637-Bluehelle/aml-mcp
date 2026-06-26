import { useState } from 'react';
import { spostaNelCestino } from '../lib/cestinoHelper';

// NB: "eliminare" qui significa SPOSTARE NEL CESTINO (soft-delete reversibile).
// La cancellazione definitiva avviene solo dal Cestino (svuotamento) o, se
// abilitato per lo studio, dall'auto-purge a scadenza. Vedi IMPLEMENTAZIONE_CESTINO.md

export function useIncaricoDelete(
  incaricoId?: string,
) {
  const [isDeletingI, setIsDeleting] = useState(false);
  const [deleteErrorI, setDeleteError] = useState<string | null>(null);

  const deleteIncarico = async (onSuccess?: () => void) => {
    if (!incaricoId) {
      setDeleteError('ID incarico non valido');
      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError(null);

      await spostaNelCestino('incarico', incaricoId);

      onSuccess?.();
    } catch (err: any) {
      setDeleteError(`Errore: ${err.message || 'Errore durante lo spostamento nel cestino'}`);
      console.log('❌ Errore spostamento incarico nel cestino', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    deleteIncarico,
    isDeletingI,
    deleteErrorI,
  };
}


export function useClienteDelete(clienteId?: string) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteCliente = async (onSuccess?: () => void) => {
    if (!clienteId) {
      setDeleteError('ID cliente non valido');
      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError(null);

      await spostaNelCestino('cliente', clienteId);

      onSuccess?.();
    } catch (err: any) {
      setDeleteError(err.message || 'Errore durante lo spostamento nel cestino');
      console.log('❌ Errore spostamento cliente nel cestino', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    deleteCliente,
    isDeleting,
    deleteError,
  };
}
