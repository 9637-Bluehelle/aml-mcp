// OAuth 2.1 — Token Revocation (RFC 7009), Fase 5. Revoca un refresh token. Risponde 200 anche se
// il token è sconosciuto (come da spec, per non rivelare validità).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sha256Hex } from './_lib/mcpOAuth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const url = process.env.VITE_SUPABASE_URL || process.env.MCP_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.MCP_SUPABASE_ANON_KEY;
  if (!url || !anon) { res.status(500).json({ error: 'server_error' }); return; }

  const token = (req.body || {}).token as string | undefined;
  if (token) {
    const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    try {
      await supabase.rpc('mcp_oauth_revoke_refresh', { p_token_hash: sha256Hex(token) });
    } catch { /* RFC 7009: rispondi 200 a prescindere */ }
  }
  res.status(200).json({}); // sempre 200 (RFC 7009)
}
