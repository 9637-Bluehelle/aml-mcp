#!/usr/bin/env node
/**
 * Genera un PAT (`aml_pat_…`) per l'accesso MCP e lo inserisce in `mcp_access_tokens`.
 *
 * Azione una-tantum, lato operatore: fa login come l'utente (email/password) e inserisce la riga
 * del token sotto la sua RLS (nessuna service_role). In DB finisce solo lo SHA-256; il PAT in
 * chiaro è stampato **una sola volta** su stdout — copialo nella config del client MCP (`MCP_PAT`).
 *
 * In Fase 4 questo passaggio sarà sostituito dalla pagina Impostazioni → "Accesso AI / MCP".
 *
 * Uso:
 *   MCP_USER_EMAIL=... MCP_USER_PASSWORD=... \
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... \
 *   [MCP_TOKEN_TIER=draft] [MCP_TOKEN_LABEL="..."] [MCP_TOKEN_TTL_DAYS=30] \
 *   npx tsx mcp/genera-pat.ts
 */

import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PAT_PREFIX, hashPat, type McpTier } from '../api/_lib/mcpAuth';

const log = (...a: unknown[]) => console.error('[genera-pat]', ...a);

const URL = process.env.MCP_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON = process.env.MCP_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.MCP_USER_EMAIL;
const PASSWORD = process.env.MCP_USER_PASSWORD;
const TIER = (process.env.MCP_TOKEN_TIER || 'draft') as McpTier;
const LABEL = process.env.MCP_TOKEN_LABEL || 'PAT generato da CLI';
const TTL_DAYS = process.env.MCP_TOKEN_TTL_DAYS ? Number(process.env.MCP_TOKEN_TTL_DAYS) : null;

async function main() {
  const missing: string[] = [];
  if (!URL) missing.push('VITE_SUPABASE_URL');
  if (!ANON) missing.push('VITE_SUPABASE_ANON_KEY');
  if (!EMAIL) missing.push('MCP_USER_EMAIL');
  if (!PASSWORD) missing.push('MCP_USER_PASSWORD');
  if (missing.length) {
    log('Env mancanti:', missing.join(', '));
    process.exit(1);
  }
  if (!['read', 'draft', 'modify'].includes(TIER)) {
    log(`MCP_TOKEN_TIER non valido: ${TIER} (ammessi: read|draft|modify)`);
    process.exit(1);
  }

  const supabase = createClient(URL!, ANON!, { auth: { persistSession: false } });

  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: EMAIL!,
    password: PASSWORD!,
  });
  if (authErr || !auth.user) {
    log('Login fallito:', authErr?.message || 'utente non trovato');
    process.exit(1);
  }

  // Genera il PAT in chiaro (mostrato una sola volta) e salva solo l'hash.
  const pat = PAT_PREFIX + randomBytes(32).toString('base64url');
  const expiresAt = TTL_DAYS ? new Date(Date.now() + TTL_DAYS * 86_400_000).toISOString() : null;

  const { error: insErr } = await supabase.from('mcp_access_tokens').insert({
    user_id: auth.user.id,
    token_hash: hashPat(pat),
    tier: TIER,
    label: LABEL,
    expires_at: expiresAt,
  });
  if (insErr) {
    log('Insert token fallita:', insErr.message);
    process.exit(1);
  }

  log(`Token creato per ${auth.user.email} | tier=${TIER} | scadenza=${expiresAt ?? 'nessuna'}`);
  log('Copia il PAT qui sotto (mostrato UNA SOLA VOLTA) nella config del client MCP come MCP_PAT:');
  // stdout: il solo valore, per facilitare la copia / pipe.
  console.log(pat);
}

main().catch((err) => {
  log('Errore fatale:', err);
  process.exit(1);
});
