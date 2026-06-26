// Supabase Edge Function per generare PDF AML (AV.3 e AV.4)

// Type declarations for Deno runtime
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// @ts-expect-error - Deno modules work at runtime but may show IDE errors
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { getAMLData } from './queries.ts';
import { generatePDF_AV3, generatePDF_AV4 } from './pdf-generator.ts';
import { PDFRequest, DocumentType } from './types.ts';

// CORS: solo le origini in whitelist sono ammesse.
// L'header Access-Control-Allow-Origin ammette un solo valore: echoing
// dell'Origin della richiesta quando e' nella whitelist.
const ALLOWED_ORIGINS = [
  'https://www.adeguataverifica.pro',
  'https://adeguataverifica.pro',
  'http://localhost:5173',
];

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth PRIMA di qualsiasi parsing/query: evita di consumare il body e di
    // colpire il DB per richieste non autenticate (fonte di timing side-channel
    // e di DB queries sprecate).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body solo dopo che il caller è autenticato
    let body: PDFRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { clienteId, incaricoId, documentType } = body;

    // Validate input
    if (!clienteId || !incaricoId || !documentType) {
      return new Response(
        JSON.stringify({
          error: 'Missing required parameters: clienteId, incaricoId, documentType'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!['av3', 'av4', 'both'].includes(documentType)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid documentType. Must be: av3, av4, or both'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client with service role for DB access
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify caller's studio owns the requested client
    const { data: callerProfile } = await supabaseClient
      .from('user_profiles')
      .select('studio_id, role')
      .eq('user_id', user.id)
      .single();

    if (!callerProfile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Superadmin can access any client; others must match studio_id
    if (callerProfile.role !== 'superadmin') {
      const { data: cliente } = await supabaseClient
        .from('clienti')
        .select('studio_id')
        .eq('id', clienteId)
        .single();

      if (!cliente || cliente.studio_id !== callerProfile.studio_id) {
        return new Response(
          JSON.stringify({ error: 'Access denied: client belongs to a different studio' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Coerenza incarico↔cliente: previene IDOR cross-cliente combinando
    // clienteId di un cliente legittimo con incaricoId di un altro (anche
    // intra-studio: il PDF deve riflettere SOLO l'incarico del cliente richiesto).
    // Vale anche per superadmin: una combinazione mismatch è sempre un errore.
    const { data: incarico } = await supabaseClient
      .from('incarichi')
      .select('cliente_id')
      .eq('id', incaricoId)
      .single();

    if (!incarico || incarico.cliente_id !== clienteId) {
      return new Response(
        JSON.stringify({ error: 'Access denied: incarico does not belong to the requested client' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Audit trail GDPR/AML: esportazione PDF = evento EXPORT tracciabile.
    // Compliance D.Lgs.231/2007: l'audit DEVE essere bloccante. Se non riusciamo
    // a registrare l'export, non possiamo rilasciare il PDF (requisito di
    // tracciabilita' delle azioni su dati sensibili).
    // service role bypassa RLS; user_id e IP passati esplicitamente perche'
    // la RPC client-side (log_user_action) userebbe auth.uid()/request.headers
    // che da edge function non puntano al caller reale.
    const clientIp = (req.headers.get('x-forwarded-for') ?? '')
      .split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
    const docLabel = documentType === 'both' ? 'AV.3 + AV.4' : documentType.toUpperCase();

    // Idempotency: se l'utente ritenta lo stesso export (rete instabile, click
    // doppio, retry automatico) non vogliamo duplicare la riga di audit. Cerchiamo
    // un log identico (stesso user/target/tipo/incarico/documento) negli ultimi
    // 60 secondi: se c'è, riusiamo quello e proseguiamo con la generazione.
    const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: existingLog } = await supabaseClient
      .from('user_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('action_type', 'EXPORT')
      .eq('target_table', 'clienti')
      .eq('target_id', clienteId)
      .eq('metadata->>incarico_id', incaricoId)
      .eq('metadata->>document_type', documentType)
      .gte('created_at', sixtySecondsAgo)
      .limit(1)
      .maybeSingle();

    if (!existingLog) {
      const { error: auditError } = await supabaseClient.from('user_logs').insert({
        user_id: user.id,
        action: `Esportazione PDF ${docLabel} per cliente ${clienteId}`,
        action_type: 'EXPORT',
        target_table: 'clienti',
        target_id: clienteId,
        ip: clientIp,
        metadata: {
          incarico_id: incaricoId,
          document_type: documentType,
        },
      });
      if (auditError) {
        console.error('Audit log insert failed, aborting export:', auditError);
        return new Response(
          JSON.stringify({ error: 'Audit trail non disponibile. Riprovare o contattare il supporto.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get data from database
    console.log(`Fetching data for cliente: ${clienteId}, incarico: ${incaricoId}, caller: ${user.email}`);
    const amlData = await getAMLData(supabaseClient, clienteId, incaricoId);
    console.log(`Data fetched successfully. Titolari: ${amlData.titolari_effettivi.length}`);

    // Generate PDF(s) based on documentType
    if (documentType === 'both') {
      // Generate both AV.3 and AV.4
      const pdf_av3 = await generatePDF_AV3(amlData);
      const pdf_av4 = await generatePDF_AV4(amlData);

      // Return as ZIP or combined response (for now, return AV.4 with a note)
      // TODO: Implement ZIP generation for "both"
      return new Response(pdf_av4 as BodyInit, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="AML_Documenti_${amlData.incarico.codice_incarico}.pdf"`,
        },
      });
    } else if (documentType === 'av3') {
      // Generate AV.3 - Istruttoria Cliente
      const pdfBuffer = await generatePDF_AV3(amlData);

      return new Response(pdfBuffer as BodyInit, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="AV3_Istruttoria_${amlData.incarico.codice_incarico}.pdf"`,
        },
      });
    } else {
      // Generate AV.4 - Dichiarazione Cliente
      const pdfBuffer = await generatePDF_AV4(amlData);

      return new Response(pdfBuffer as BodyInit, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="AV4_Dichiarazione_${amlData.incarico.codice_incarico}.pdf"`,
        },
      });
    }

  } catch (error) {
    // Log completo server-side per debug
    console.error('Error generating PDF:', error);

    // Al client solo messaggio generico — nessun dettaglio interno
    return new Response(
      JSON.stringify({
        error: 'Errore nella generazione del PDF. Riprovare o contattare il supporto.'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
