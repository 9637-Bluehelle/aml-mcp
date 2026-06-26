// MCP — OAuth 2.1 (Meccanismo D, §8.3). Evoluzione del Meccanismo A: stesso core/RLS, cambia solo
// come il client ottiene l'identità. Il client MCP fa un flow OAuth standard (authorization code +
// PKCE), l'utente autorizza loggandosi sulla piattaforma (pagina di consenso, sessione Supabase),
// il client riceve access/refresh token e li rinnova da solo. Revoca centralizzata.
//
// Scelta architetturale: l'**access token è un JWT Supabase coniato** (HS256, claim origine='ai' +
// tier), così `/api/mcp` lo verifica con SUPABASE_JWT_SECRET e lo usa direttamente come identità per
// la RLS — niente service_role, stesso modello di sicurezza di A (§8.1). I codici e i refresh token
// vivono in DB; la creazione del codice avviene nella sessione utente (RLS), lo scambio via RPC
// SECURITY DEFINER (path anon, niente service_role).
//
// Modulo neutro (no React, gira in Node).

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { McpTier } from './mcpAuth.js';

export const OAUTH_SCOPES_SUPPORTED = ['read', 'draft', 'modify'] as const;

/** SHA-256 esadecimale (hashing di codici/refresh token salvati in DB). */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Token opaco URL-safe (codici/refresh lato server). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function timingSafeStrEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Verifica PKCE S256: base64url(sha256(verifier)) === code_challenge. */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const computed = createHash('sha256').update(verifier).digest('base64url');
  return timingSafeStrEqual(computed, challenge);
}

/** Conia l'access token OAuth = JWT Supabase HS256 con claim origine='ai' + tier. */
export async function mintOAuthAccessToken(userId: string, tier: McpTier, jwtSecret: string, ttlSeconds = 3600): Promise<string> {
  const secret = new TextEncoder().encode(jwtSecret);
  const nowSec = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: 'authenticated', origine: 'ai', tier })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + ttlSeconds)
    .sign(secret);
}

/** Verifica l'access token OAuth e ne estrae userId + tier. Lancia se invalido/scaduto. */
export async function verifyOAuthAccessToken(token: string, jwtSecret: string): Promise<{ userId: string; tier: McpTier }> {
  const secret = new TextEncoder().encode(jwtSecret);
  const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
  if (!payload.sub) throw new Error('Access token senza subject.');
  return { userId: String(payload.sub), tier: ((payload as Record<string, any>).tier ?? 'read') as McpTier };
}

/** Client Supabase che usa il JWT fornito come identità (RLS piena). */
export function buildSupabaseClientFromJwt(url: string, anonKey: string, accessJwt: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessJwt}` } },
  });
}

// ---------------------------------------------------------------- Metadata discovery

/** Metadata Authorization Server (RFC 8414), servita su /.well-known/oauth-authorization-server. */
export function authServerMetadata(issuer: string) {
  const base = issuer.replace(/\/$/, '');
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/oauth-authorize`,
    token_endpoint: `${base}/api/oauth-token`,
    registration_endpoint: `${base}/api/oauth-register`,
    revocation_endpoint: `${base}/api/oauth-revoke`,
    scopes_supported: [...OAUTH_SCOPES_SUPPORTED],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}

/** Metadata Protected Resource (RFC 9728), servita su /.well-known/oauth-protected-resource. */
export function protectedResourceMetadata(issuer: string) {
  const base = issuer.replace(/\/$/, '');
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: [...OAUTH_SCOPES_SUPPORTED],
    bearer_methods_supported: ['header'],
  };
}

/** Origine pubblica del deployment (per issuer/redirect). */
export function getIssuer(): string {
  return (process.env.MCP_APP_BASE_URL || process.env.VITE_APP_BASE_URL || '').replace(/\/$/, '');
}
