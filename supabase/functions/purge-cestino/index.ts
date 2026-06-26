// Supabase Edge Function: purge automatico del cestino.
// Chiamata dal cron (pg_cron + pg_net). Per ogni studio con auto-purge attivo,
// elimina definitivamente i batch scaduti (RPC purge_cestino_scaduti) e rimuove
// i relativi file dallo Storage. Vedi IMPLEMENTAZIONE_CESTINO.md §5.

// Type declarations for Deno runtime
declare const Deno: {
  env: { get(key: string): string | undefined };
};

// @ts-expect-error - Deno modules work at runtime but may show IDE errors
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';

serve(async (req: Request) => {
  // Autorizzazione: solo chi conosce il segreto del cron può invocare.
  const cronSecret = Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('x-cron-secret');
  if (!cronSecret || provided !== cronSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Elimina i batch scaduti (DB) e ottiene i file da rimuovere dallo Storage.
    const { data, error } = await supabase.rpc('purge_cestino_scaduti');
    if (error) throw error;

    const filePaths: string[] = (data?.file_paths ?? []).filter(Boolean);
    let filesRemoved = 0;
    if (filePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('file_allegati')
        .remove(filePaths);
      if (!storageError) filesRemoved = filePaths.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        eliminati: data?.eliminati ?? 0,
        file_rimossi: filesRemoved,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String((err as Error)?.message ?? err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
