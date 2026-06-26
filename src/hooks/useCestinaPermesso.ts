import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Permesso "sposta nel cestino" dell'utente corrente, per nascondere i pulsanti
// di cestinamento a chi non può (coerente con come il Cestino nasconde
// Ripristina/Svuota). admin/superadmin: sempre true; collaboratore: secondo
// impostazioni_studio.cestino_chi_cestina.
//
// Il permesso è stabile nella sessione → una sola RPC, in cache a livello di
// modulo e condivisa da tutti i componenti.
// ---------------------------------------------------------------------------

let cache: Promise<boolean> | null = null;

export function caricaPermessoCestina(): Promise<boolean> {
  if (!cache) {
    // Avvolto in una Promise nativa: il builder Supabase è solo un PromiseLike (niente `.catch`),
    // così l'errore di rete viene catturato e il permesso è ottimisticamente `true` (vedi sotto).
    cache = (async () => {
      try {
        const { data, error } = await supabase.rpc('cestino_puo', { p_azione: 'cestina' });
        return error ? true : data !== false;
      } catch {
        return true;
      }
    })();
  }
  return cache;
}

/** Invalida la cache (es. dopo un cambio delle impostazioni cestino). */
export function invalidaPermessoCestina(): void {
  cache = null;
}

/**
 * True se l'utente può spostare nel cestino. Mentre carica ritorna `true`
 * (ottimistico: evita flicker per la maggioranza che ha il permesso; il gate
 * server-side resta comunque la difesa finale). Dopo il primo caricamento il
 * valore è in cache, quindi i render successivi sono immediati.
 */
export function useCestinaPermesso(): boolean {
  const [puo, setPuo] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    caricaPermessoCestina().then(v => { if (active) setPuo(v); });
    return () => { active = false; };
  }, []);
  return puo ?? true;
}
