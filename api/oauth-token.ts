// OAuth 2.1 — Token endpoint (Fase 5). grant_type=authorization_code (con PKCE) e refresh_token.
// Emette un access token = JWT Supabase coniato (origine='ai' + tier) + un refresh token rotante.
// Path anon: gli scambi avvengono via RPC SECURITY DEFINER (niente service_role, §8.1).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sha256Hex, mintOAuthAccessToken } from './_lib/mcpOAuth.js';
import type { McpTier } from './_lib/mcpAuth.js';

const ACCESS_TTL = 3600;

function err(res: VercelResponse, code: string, desc?: string, status = 400) {
  res.status(status).json({ error: code, error_description: desc });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { err(res, 'invalid_request', 'Usare POST.', 405); return; }

  const url = process.env.VITE_SUPABASE_URL || process.env.MCP_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.MCP_SUPABASE_ANON_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!url || !anon || !jwtSecret) { err(res, 'server_error', 'Server non configurato.', 500); return; }

  const body = (req.body || {}) as Record<string, string>;
  const grant = body.grant_type;
  const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

  const issue = async (userId: string, tier: McpTier, refresh: string) => {
    const access = await mintOAuthAccessToken(userId, tier, jwtSecret, ACCESS_TTL);
    res.status(200).json({
      access_token: access,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL,
      refresh_token: refresh,
      scope: tier,
    });
  };

  if (grant === 'authorization_code') {
    const { code, code_verifier, client_id, redirect_uri } = body;
    if (!code || !code_verifier || !client_id || !redirect_uri) { err(res, 'invalid_request', 'Parametri mancanti.'); return; }
    const { data, error } = await supabase.rpc('mcp_oauth_exchange_code', {
      p_code_hash: sha256Hex(code),
      p_client_id: client_id,
      p_redirect_uri: redirect_uri,
      p_code_verifier: code_verifier,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.user_id) { err(res, 'invalid_grant', 'Codice non valido, scaduto o PKCE errato.'); return; }
    await issue(row.user_id, (row.tier ?? 'read') as McpTier, row.refresh_token);
    return;
  }

  if (grant === 'refresh_token') {
    const { refresh_token, client_id } = body;
    if (!refresh_token || !client_id) { err(res, 'invalid_request', 'Parametri mancanti.'); return; }
    const { data, error } = await supabase.rpc('mcp_oauth_exchange_refresh', {
      p_token_hash: sha256Hex(refresh_token),
      p_client_id: client_id,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.user_id) { err(res, 'invalid_grant', 'Refresh token non valido, scaduto o revocato.'); return; }
    await issue(row.user_id, (row.tier ?? 'read') as McpTier, row.refresh_token);
    return;
  }

  err(res, 'unsupported_grant_type');
}
