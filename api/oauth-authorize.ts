// OAuth 2.1 — Authorization endpoint (Fase 5). Valida i parametri (response_type=code, PKCE S256,
// client_id + redirect_uri registrati) e reindirizza alla pagina di consenso dell'app, dove
// l'utente loggato autorizza (creando il code nella propria sessione). Non emette nulla qui.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getIssuer } from './_lib/mcpOAuth.js';

function q(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const client_id = q(req.query.client_id);
  const redirect_uri = q(req.query.redirect_uri);
  const response_type = q(req.query.response_type);
  const code_challenge = q(req.query.code_challenge);
  const code_challenge_method = q(req.query.code_challenge_method);
  const state = q(req.query.state);
  const scope = q(req.query.scope);

  // Errori di parametri non redirigibili → risposta diretta.
  if (response_type !== 'code') { res.status(400).json({ error: 'unsupported_response_type' }); return; }
  if (!client_id || !redirect_uri) { res.status(400).json({ error: 'invalid_request', error_description: 'client_id e redirect_uri obbligatori.' }); return; }
  if (!code_challenge || code_challenge_method !== 'S256') { res.status(400).json({ error: 'invalid_request', error_description: 'PKCE S256 obbligatorio.' }); return; }

  const url = process.env.VITE_SUPABASE_URL || process.env.MCP_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.MCP_SUPABASE_ANON_KEY;
  if (!url || !anon) { res.status(500).json({ error: 'server_error' }); return; }

  // Verifica client + redirect_uri registrati.
  const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: uris } = await supabase.rpc('mcp_oauth_client_redirect_uris', { p_client_id: client_id });
  if (!Array.isArray(uris) || !uris.includes(redirect_uri)) {
    res.status(400).json({ error: 'invalid_request', error_description: 'client_id o redirect_uri non registrati.' });
    return;
  }

  // Reindirizza alla pagina di consenso dell'app col contesto della richiesta (no segreti).
  const issuer = getIssuer() || `https://${req.headers.host}`;
  const ctx = Buffer.from(JSON.stringify({ client_id, redirect_uri, state, code_challenge, scope })).toString('base64url');
  res.statusCode = 302;
  res.setHeader('Location', `${issuer}/?mcp_oauth=${ctx}`);
  res.end();
}
