// Endpoint MCP remoto (Fase 4) — Streamable HTTP **stateless** su Vercel.
//
// Le function Vercel sono request/response: per ogni richiesta autentichiamo il PAT
// (header Authorization: Bearer aml_pat_…), coniamo il JWT utente, costruiamo il server con la
// whitelist filtrata per tier (stessa factory dello stdio) e lo serviamo con un transport
// stateless monouso. Auth = §8.2, RLS piena (mai service_role, §8.1), studio appuntato (§8.4).
//
// Env (Vercel): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET.
// Runtime: Node (usa node:crypto + `jose` per i JWT — ESM-native), NON edge.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticateMcp, PAT_PREFIX, type McpTier } from './_lib/mcpAuth.js';
import { buildMcpServer } from './_lib/mcpServerFactory.js';
import { verifyOAuthAccessToken, buildSupabaseClientFromJwt, getIssuer } from './_lib/mcpOAuth.js';
import type { SupabaseClient } from '@supabase/supabase-js';

function rpcError(res: VercelResponse, httpStatus: number, code: number, message: string) {
  res.status(httpStatus).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS minimale (utile per client MCP browser-based; innocuo per quelli desktop).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  // Stateless: solo POST porta messaggi JSON-RPC; GET (SSE standalone) non è supportato.
  if (req.method !== 'POST') {
    rpcError(res, 405, -32000, 'Method not allowed: usare POST.');
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.MCP_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.MCP_SUPABASE_ANON_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!supabaseUrl || !supabaseAnonKey || !jwtSecret) {
    rpcError(res, 500, -32002, 'Server MCP non configurato (Supabase URL/anon/JWT secret mancanti).');
    return;
  }

  // Token dall'header Authorization (mai dal body). Due meccanismi accettati:
  //  - Meccanismo A: PAT `aml_pat_…` → risolto + JWT utente coniato per-richiesta.
  //  - Meccanismo D (OAuth 2.1): access token = JWT Supabase coniato → verificato e usato com'è.
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  if (!token) {
    // Indica al client dove scoprire l'OAuth (RFC 9728 / MCP auth).
    const issuer = getIssuer() || `https://${req.headers.host}`;
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource"`);
    rpcError(res, 401, -32001, 'Authorization mancante: PAT "aml_pat_…" o access token OAuth richiesto.');
    return;
  }

  let auth: { client: SupabaseClient; userId: string; tier: McpTier };
  try {
    if (token.startsWith(PAT_PREFIX)) {
      auth = await authenticateMcp({ supabaseUrl, supabaseAnonKey, jwtSecret, pat: token });
    } else {
      // OAuth: l'access token È un JWT Supabase coniato → verifica e usalo come identità (RLS piena).
      const { userId, tier } = await verifyOAuthAccessToken(token, jwtSecret);
      auth = { client: buildSupabaseClientFromJwt(supabaseUrl, supabaseAnonKey, token), userId, tier };
    }
  } catch (e: any) {
    const issuer = getIssuer() || `https://${req.headers.host}`;
    res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", resource_metadata="${issuer}/.well-known/oauth-protected-resource"`);
    rpcError(res, 401, -32001, e?.message || 'Token non valido.');
    return;
  }

  // Studio appuntato server-side dal profilo (mai dal client) — §8.4.
  const { data: profile } = await auth.client
    .from('user_profiles')
    .select('studio_id')
    .eq('user_id', auth.userId)
    .single();
  const studioId: string | null = profile?.studio_id ?? null;

  const server = buildMcpServer(auth.client, studioId, auth.tier);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  // Transport e server sono monouso (stateless): chiusi a fine richiesta per evitare leak.
  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e: any) {
    if (!res.headersSent) {
      rpcError(res, 500, -32603, `Errore interno: ${e?.message || String(e)}`);
    }
  }
}
