#!/usr/bin/env node
/**
 * MCP locale — uploader file (Fase 4d, §5.1.2). Espone il solo tool `upload_file`, che carica un
 * PDF dal disco locale direttamente sullo Storage Supabase usando un signed upload token ottenuto
 * dal server AML via `prepara_upload_documento`. Il byte del file **non transita mai nel contesto
 * dell'AI**: l'AI passa solo il percorso locale e il token.
 *
 * Gira accanto al filesystem MCP ufficiale (read-only). Non richiede credenziali utente: il token
 * firmato autorizza la singola upload sul path già calcolato/validato server-side.
 *
 * Avvio (env tipicamente dalla config del client MCP):
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npx tsx mcp/upload-file-server.ts
 *
 * stdout = canale protocollo MCP → ogni log va su stderr.
 */

import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const logErr = (...a: unknown[]) => console.error('[aml-upload]', ...a);

const SUPABASE_URL = process.env.MCP_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.MCP_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    logErr('Env mancanti: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const server = new McpServer(
    { name: 'aml-upload-locale', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'upload_file',
    {
      title: 'Carica file su Storage (signed upload)',
      description:
        'Carica un PDF dal disco locale sullo Storage usando i parametri (file_path, upload_token) ottenuti da ' +
        'prepara_upload_documento. Il file resta sul disco/Storage: i suoi byte non vengono letti nel contesto. ' +
        'Dopo questo, fai approvare l\'associazione nell\'inbox e chiama conferma_upload_documento.',
      inputSchema: {
        path_locale: z.string().min(1).describe('Percorso assoluto del PDF sul disco locale.'),
        file_path: z.string().min(1).describe('Path Storage di destinazione (da prepara_upload_documento).'),
        upload_token: z.string().min(1).describe('Token di upload firmato (da prepara_upload_documento).'),
        bucket: z.string().optional().describe("Bucket (default 'file_allegati')."),
      },
    },
    async (args) => {
      try {
        const bucket = args.bucket || 'file_allegati';
        let buf: Buffer;
        try {
          buf = await readFile(args.path_locale);
        } catch (e: any) {
          return { isError: true, content: [{ type: 'text', text: `Impossibile leggere il file locale: ${e?.message || String(e)}` }] };
        }
        if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
          return { isError: true, content: [{ type: 'text', text: 'Il file locale non è un PDF valido.' }] };
        }

        const { error } = await supabase.storage
          .from(bucket)
          .uploadToSignedUrl(args.file_path, args.upload_token, buf, { contentType: 'application/pdf' });
        if (error) {
          return { isError: true, content: [{ type: 'text', text: `Upload fallito: ${error.message}` }] };
        }
        return { content: [{ type: 'text', text: `✅ File caricato su ${bucket}/${args.file_path} (${buf.length} byte). Ora fai approvare l'associazione e chiama conferma_upload_documento.` }] };
      } catch (e: any) {
        return { isError: true, content: [{ type: 'text', text: `Errore upload_file: ${e?.message || String(e)}` }] };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logErr('AML upload MCP server avviato su stdio. In attesa di richieste…');
}

main().catch((err) => {
  logErr('Errore fatale:', err);
  process.exit(1);
});
