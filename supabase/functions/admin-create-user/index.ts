// Edge Function — creazione utenti "privilegiata" (admin/superadmin), server-side.
//
// Sostituisce il vecchio flusso client `auth.signUp({ data: { role, studio_id, proprietario, ... }})`
// che era una falla CRITICA: `signUp` è pubblico e i metadata sono controllati dal client, quindi un
// anonimo poteva nascere superadmin (il trigger handle_new_user si fidava dei metadata).
//
// Qui: si VERIFICA server-side (con la service_role, fuori dalla portata del client) che il CHIAMANTE
// sia davvero admin/superadmin, si normalizzano ruolo/studio secondo i suoi privilegi, poi si crea
// l'utente con l'Admin API e si scrivono i campi privilegiati direttamente in user_profiles. Il
// trigger handle_new_user crea sempre un utente "user" non approvato; è questa funzione (autorizzata)
// a promuoverlo. Bonus: l'Admin API NON crea una sessione per il nuovo utente, quindi l'admin che
// crea NON viene più sloggato (difetto del vecchio signUp dal browser).

declare const Deno: { env: { get(key: string): string | undefined } };

// @ts-expect-error - Deno runtime import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js'; //import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://www.adeguataverifica.pro',
  'https://adeguataverifica.pro',
  'https://aml-mcp.vercel.app',
  'http://localhost:5173',
];

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

const ASSIGNABLE_ROLES = ['user', 'collaboratore', 'admin']; // mai 'superadmin' da qui

interface CreateUserBody {
  email?: string;
  password?: string;
  nome?: string;
  cognome?: string;
  role?: string;
  studio_id?: string | null;
  proprietario?: boolean;
  temp_password?: string;
}

serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // 1) Autenticazione del CHIAMANTE (prima di parsing/DB).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !anonKey || !serviceKey) return json({ error: 'server_misconfigured' }, 500);

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
  if (authError || !caller) return json({ error: 'Unauthorized' }, 401);

  // 2) Service-role (bypassa RLS) — usata SOLO dopo aver autorizzato il chiamante.
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 3) Il chiamante deve essere admin o superadmin; ne leggiamo ruolo e studio.
  const { data: callerProfile, error: profErr } = await admin
    .from('user_profiles')
    .select('role, studio_id')
    .eq('user_id', caller.id)
    .maybeSingle();
  if (profErr) return json({ error: 'profile_lookup_failed' }, 500);
  const callerRole = callerProfile?.role;
  if (callerRole !== 'admin' && callerRole !== 'superadmin') {
    return json({ error: 'forbidden', error_description: 'Solo admin o superadmin possono creare utenti.' }, 403);
  }
  const isSuper = callerRole === 'superadmin';

  let body: CreateUserBody;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!email || !password) return json({ error: 'invalid_request', error_description: 'email e password obbligatori.' }, 400);

  const requestedRole = (body.role || 'collaboratore').trim();
  if (!ASSIGNABLE_ROLES.includes(requestedRole)) {
    return json({ error: 'invalid_role', error_description: `Ruolo non assegnabile: ${requestedRole}.` }, 400);
  }

  // 4) Normalizzazione privilegi SERVER-SIDE (il client non può scavalcarli):
  //  - admin: lo studio è SEMPRE il suo; non può conferire 'proprietario' (solo il superadmin).
  //  - superadmin: può scegliere studio e proprietario.
  const studioId = isSuper ? (body.studio_id ?? null) : (callerProfile?.studio_id ?? null);
  const proprietario = isSuper ? (!!body.proprietario && requestedRole === 'admin') : false;

  if (!studioId && requestedRole !== 'user') {
    return json({ error: 'invalid_request', error_description: 'studio_id richiesto per ruoli collaboratore/admin.' }, 400);
  }

  // 5) Crea l'utente (Admin API: nessuna sessione creata, nessun metadata privilegiato fidato).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      nome: body.nome ?? '',
      cognome: body.cognome ?? '',
      ...(body.temp_password ? { temp_password: body.temp_password } : {}),
    },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message || 'creazione fallita';
    const already = /already (been )?registered|exists/i.test(msg);
    return json({ error: already ? 'already_exists' : 'create_failed', error_description: msg }, already ? 409 : 400);
  }
  const newUserId = created.user.id;

  // 6) Promozione: scriviamo i campi privilegiati (il trigger ha creato un 'user' non approvato).
  const { error: updErr } = await admin
    .from('user_profiles')
    .update({
      nome: body.nome ?? '',
      cognome: body.cognome ?? '',
      role: requestedRole,
      studio_id: studioId,
      approved: true, // creato da un admin → già approvato
      proprietario,
    })
    .eq('user_id', newUserId);
  if (updErr) {
    // Rollback: rimuovi l'utente appena creato per non lasciare un account a metà.
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    return json({ error: 'profile_update_failed', error_description: updErr.message }, 500);
  }

  // 7) Collaboratore dello studio (se previsto).
  if (studioId) {
    await admin
      .from('collaboratori')
      .upsert({ collaboratore_id: newUserId, email_collaboratore: email, studio_id: studioId },
              { onConflict: 'collaboratore_id,studio_id', ignoreDuplicates: true });
  }

  return json({ ok: true, user_id: newUserId, email, role: requestedRole, studio_id: studioId, proprietario });
});
