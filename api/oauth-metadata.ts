// OAuth 2.1 discovery metadata (Fase 5, §8.3). Una function serve sia la metadata
// dell'Authorization Server (?type=as) sia quella della Protected Resource (default), mappate
// dai path /.well-known/* via i rewrite in vercel.json.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authServerMetadata, protectedResourceMetadata, getIssuer } from './_lib/mcpOAuth.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const issuer = getIssuer() || `https://${req.headers.host}`;
  const meta = req.query.type === 'as' ? authServerMetadata(issuer) : protectedResourceMetadata(issuer);
  res.status(200).json(meta);
}
