// MCP — Autenticazione (Meccanismo A, §8.2): PAT → JWT utente coniato a breve durata.
//
// Flusso, identico per stdio (Fase 2/3) e per il futuro endpoint remoto (Fase 4):
//   1. il client invia un PAT `aml_pat_<random>`;
//   2. lo risolviamo via la RPC SECURITY DEFINER `mcp_resolve_token` usando la sola ANON key
//      (la service_role NON entra mai nel path della richiesta — §8.1);
//   3. coniamo un JWT HS256 firmato con SUPABASE_JWT_SECRET, claims:
//        sub=user_id, role='authenticated', aud='authenticated', exp=now+~5min,
//        + claim custom `origine='ai'` (mappato dai trigger su source='ai' — §7.6);
//   4. creiamo un client Supabase con quell'identità nell'header Authorization → RLS piena.
//
// Modulo neutro (no React, no singleton). Pensato per girare in Node.

import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const PAT_PREFIX = 'aml_pat_';

export type McpTier = 'read' | 'draft' | 'modify';
const TIER_RANK: Record<McpTier, number> = { read: 0, draft: 1, modify: 2 };

/** Vero se il tier effettivo del token copre quello richiesto da un tool. */
export function tierAllows(actual: McpTier, required: McpTier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[required];
}

/** SHA-256 esadecimale del PAT in chiaro: è ciò che viene confrontato col DB. */
export function hashPat(pat: string): string {
  return createHash('sha256').update(pat, 'utf8').digest('hex');
}

/**
 * Conia un JWT utente HS256 (Supabase) per l'identità `userId`, col claim custom `origine='ai'`
 * usato dai trigger di audit (§7.6). Claims: sub, role='authenticated', aud='authenticated', exp.
 * Usa `jose` (ESM-native): `jsonwebtoken` (CommonJS) crasha al load sul runtime serverless ESM.
 */
export async function mintUserJwt(userId: string, jwtSecret: string, ttlSeconds = 300): Promise<string> {
  const secret = new TextEncoder().encode(jwtSecret);
  const nowSec = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: 'authenticated', origine: 'ai' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + ttlSeconds)
    .sign(secret);
}

export interface McpAuthConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Segreto simmetrico HS256 del progetto (env server, mai sul client). */
  jwtSecret: string;
  /** PAT ricevuto dal client (`aml_pat_…`). */
  pat: string;
  /** Durata del JWT coniato, in secondi (default 300 = 5 min). */
  jwtTtlSeconds?: number;
}

export interface McpAuthResult {
  /** Client Supabase autenticato come l'utente del token (RLS piena). */
  client: SupabaseClient;
  userId: string;
  tier: McpTier;
}

/**
 * Risolve il PAT e restituisce un client Supabase autenticato come l'utente proprietario,
 * più il suo tier. Lancia se il PAT è malformato, non valido, scaduto o revocato.
 */
export async function authenticateMcp(cfg: McpAuthConfig): Promise<McpAuthResult> {
  if (!cfg.pat || !cfg.pat.startsWith(PAT_PREFIX)) {
    throw new Error(`PAT non valido: deve iniziare con "${PAT_PREFIX}".`);
  }
  if (!cfg.jwtSecret) {
    throw new Error('SUPABASE_JWT_SECRET mancante: impossibile coniare il JWT utente.');
  }

  const tokenHash = hashPat(cfg.pat);

  // 1. Risoluzione via RPC SECURITY DEFINER con client ANON (niente service_role nel path).
  const anon = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.rpc('mcp_resolve_token', { p_token_hash: tokenHash });
  if (error) {
    throw new Error(`Risoluzione token fallita: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.user_id) {
    throw new Error('Token non valido, scaduto o revocato.');
  }
  const userId: string = row.user_id;
  const tier: McpTier = (row.tier ?? 'read') as McpTier;

  // 2. Conio del JWT utente HS256, con claim custom origine='ai' per l'audit (§7.6).
  const minted = await mintUserJwt(userId, cfg.jwtSecret, cfg.jwtTtlSeconds ?? 300);

  // 3. Client con l'identità coniata nell'header → auth.uid()/get_my_studio_id() e RLS funzionano.
  const client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${minted}` } },
  });

  return { client, userId, tier };
}
