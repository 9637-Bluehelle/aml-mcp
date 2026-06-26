#!/usr/bin/env node
/**
 * AML MCP server — PoC stdio (Fase 2) con auth Meccanismo A (Fase 3).
 *
 * Espone un'unica operazione di scrittura whitelisted (`crea_bozza_cliente`) che riusa la
 * stessa logica della UI (`api/_lib/clienteService.ts`), dimostrando il flusso
 * client MCP → server → Supabase senza guidare la UI "a screenshot".
 *
 * AUTENTICAZIONE (Fase 3, §8.2):
 *  - Il client passa un PAT `aml_pat_…` in env `MCP_PAT`.
 *  - Il server lo risolve via RPC SECURITY DEFINER (anon key) e conia un JWT utente HS256 a
 *    breve durata col claim `origine='ai'` → la RLS per studio_id si applica gratis (mai
 *    service_role) e l'audit marca le scritture come source='ai' (§7.6).
 *  - Il `tier` del token (read|draft|modify) filtra quali tool sono esposti (§7.1): un token
 *    read-only non vede alcun tool di scrittura.
 *  - Lo `studio_id` è risolto server-side dal profilo dell'utente, mai dal client (§8.4).
 *  - `crea_bozza_cliente` crea SOLO bozze incomplete (esecuzione diretta ammessa, §7.2);
 *    attivazione/conferma in blocco sono Fase 4b.
 *
 * Transport: stdio. stdout = canale protocollo MCP → ogni log va su stderr (console.error).
 *
 * Avvio (env tipicamente dalla config del client MCP — vedi mcp/README.md):
 *   MCP_PAT=aml_pat_... SUPABASE_JWT_SECRET=... \
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... \
 *   npm run mcp:poc
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { authenticateMcp } from '../api/_lib/mcpAuth';
import { buildMcpServer } from '../api/_lib/mcpServerFactory';

const logErr = (...args: unknown[]) => console.error('[aml-mcp]', ...args);

const SUPABASE_URL = process.env.MCP_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.MCP_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const PAT = process.env.MCP_PAT;

function requireEnv() {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push('VITE_SUPABASE_URL (o MCP_SUPABASE_URL)');
  if (!SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY (o MCP_SUPABASE_ANON_KEY)');
  if (!JWT_SECRET) missing.push('SUPABASE_JWT_SECRET');
  if (!PAT) missing.push('MCP_PAT');
  if (missing.length > 0) {
    logErr('Env mancanti:', missing.join(', '));
    process.exit(1);
  }
  return { url: SUPABASE_URL!, anon: SUPABASE_ANON_KEY!, jwtSecret: JWT_SECRET!, pat: PAT! };
}

async function main() {
  const env = requireEnv();

  // Auth Meccanismo A: PAT → JWT utente coniato → client Supabase con RLS piena.
  const { client, userId, tier } = await authenticateMcp({
    supabaseUrl: env.url,
    supabaseAnonKey: env.anon,
    jwtSecret: env.jwtSecret,
    pat: env.pat,
  });
  logErr(`Autenticato: userId=${userId} tier=${tier}`);

  // Studio appuntato server-side dal profilo (mai dal client) — §8.4 mono-studio.
  const { data: profile } = await client
    .from('user_profiles')
    .select('studio_id, role')
    .eq('user_id', userId)
    .single();
  const studioId: string | null = profile?.studio_id ?? null;
  if (!studioId) {
    logErr('⚠️ Nessuno studio_id nel profilo: dedup anagrafica disattivata; gli INSERT dipendono da default/RLS del DB.');
  } else {
    logErr('Studio appuntato:', studioId, '| ruolo:', profile?.role);
  }

  // Whitelist tool condivisa con l'endpoint remoto (factory unica). Il tier filtra le scritture.
  const server = buildMcpServer(client, studioId, tier);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logErr(`AML MCP PoC server avviato su stdio (tier=${tier}). In attesa di richieste…`);
}

main().catch((err) => {
  logErr('Errore fatale:', err);
  process.exit(1);
});
