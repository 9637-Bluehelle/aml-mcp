import { useEffect } from 'react';

/**
 * Blocca lo scroll del body quando una modale è aperta.
 * Supporta modali multiple: usa un counter per ripristinare
 * lo scroll solo quando tutte le modali sono chiuse.
 */
let lockCount = 0;

export function useScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    lockCount++;
    document.body.style.overflow = 'hidden';

    return () => {
      lockCount--;
      if (lockCount === 0) {
        document.body.style.overflow = '';
      }
    };
  }, [isLocked]);
}
