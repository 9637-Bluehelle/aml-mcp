// OAuth 2.1 — Dynamic Client Registration (RFC 7591), Fase 5. Client pubblici (PKCE, nessun
// secret). Crea la riga client via RPC SECURITY DEFINER e restituisce il client_id.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const url = process.env.VITE_SUPABASE_URL || process.env.MCP_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.MCP_SUPABASE_ANON_KEY;
  if (!url || !anon) { res.status(500).json({ error: 'server_error', error_description: 'Supabase non configurato.' }); return; }

  const body = (req.body || {}) as { client_name?: string; redirect_uris?: string[] };
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (redirectUris.length === 0) {
    res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris obbligatori.' });
    return;
  }
  if (redirectUris.length > 10) {
    res.status(400).json({ error: 'invalid_client_metadata', error_description: 'Troppi redirect_uris (max 10).' });
    return;
  }
  // Hardening anti-phishing (OAuth 2.1 §best practices): i redirect_uri devono essere URL ASSOLUTI
  // https (o loopback in chiaro per i client desktop). Blocca http remoti, schemi custom e URL
  // malformati → riduce la superficie di consent-phishing/open-redirect via client registrati ad-hoc.
  const isValidRedirect = (u: unknown): boolean => {
    if (typeof u !== 'string') return false;
    try {
      const url = new URL(u);
      if (url.protocol === 'https:') return true;
      return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
    } catch { return false; }
  };
  const invalid = redirectUris.filter((u) => !isValidRedirect(u));
  if (invalid.length) {
    res.status(400).json({ error: 'invalid_redirect_uri', error_description: `redirect_uri non ammessi (richiesto https o loopback): ${invalid.join(', ')}` });
    return;
  }

  const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc('mcp_oauth_register_client', {
    p_name: body.client_name ?? null,
    p_redirect_uris: redirectUris,
  });
  if (error || !data) {
    res.status(400).json({ error: 'invalid_client_metadata', error_description: error?.message || 'registrazione fallita' });
    return;
  }

  res.status(201).json({
    client_id: data,
    client_name: body.client_name,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  });
}
