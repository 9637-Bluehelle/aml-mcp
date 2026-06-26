// Vercel Serverless Function – proxy per le chiamate all'API AML esterna.
// Il bearer token resta server-side e non viene mai esposto al client.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Autenticazione – verifica JWT Supabase
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase not configured on server' });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Leggi il body della richiesta
    const { vatOrCF } = req.body;
    if (!vatOrCF || typeof vatOrCF !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid vatOrCF parameter' });
    }

    // Sanitizza: solo alfanumerici
    const sanitized = vatOrCF.replace(/[^a-zA-Z0-9]/g, '');
    if (sanitized.length < 11 || sanitized.length > 16) {
      return res.status(400).json({ error: 'vatOrCF must be between 11 and 16 characters' });
    }

    // 3. Chiamata all'API esterna con il bearer token server-side
    const apiBaseUrl = process.env.AML_API_BASE_URL;
    const bearerToken = process.env.AML_API_BEARER_TOKEN; 

    if (!apiBaseUrl || !bearerToken) {
      return res.status(500).json({ error: 'AML API not configured on server' });
    }

    const apiResponse = await fetch(`${apiBaseUrl}${sanitized}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
    });

    // 4. Inoltra la risposta al client
    const responseBody = await apiResponse.text();
    res.status(apiResponse.status).setHeader('Content-Type', 'application/json').send(responseBody);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
}
