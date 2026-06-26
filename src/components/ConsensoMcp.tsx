// Pagina di consenso OAuth 2.1 (Fase 5, §8.3) — atterraggio del redirect dall'authorization
// endpoint (`/?mcp_oauth=<ctx>`). L'utente, già loggato sulla piattaforma, autorizza un client MCP
// scegliendo il tier. Su "Autorizza" crea l'authorization code nella propria sessione (RLS) e
// reindirizza al redirect_uri del client con ?code=…&state=…. È il punto in cui l'identità è
// fornita "loggandosi sulla piattaforma", senza token da copia-incollare.

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, AlertTriangle, Bot } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Tier = 'read' | 'draft' | 'modify';
const TIER_LABEL: Record<Tier, string> = {
  read: 'Sola lettura',
  draft: 'Crea bozze',
  modify: 'Modifica (avanzato, include documenti)',
};

interface Ctx {
  client_id: string;
  redirect_uri: string;
  state?: string;
  code_challenge: string;
  scope?: string;
}

function decodeCtx(raw: string): Ctx | null {
  try {
    let s = raw.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4;
    if (pad) s += '='.repeat(4 - pad);
    const obj = JSON.parse(atob(s));
    if (!obj.client_id || !obj.redirect_uri || !obj.code_challenge) return null;
    return obj as Ctx;
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function ConsensoMcp({ ctxRaw, onClose }: { ctxRaw: string; onClose: () => void }) {
  const ctx = decodeCtx(ctxRaw);
  const [validClient, setValidClient] = useState<boolean | null>(null);
  // Default 'read' (minimo privilegio): se il client richiede uno scope o esiste già una
  // connessione, il useEffect sotto alza il tier di conseguenza. Così un fallback senza scope non
  // pre-seleziona un livello di scrittura (hardening anti consent-phishing).
  const [tier, setTier] = useState<Tier>('read');
  const [working, setWorking] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Re-valida client_id + redirect_uri lato DB (difesa contro link di consenso falsificati).
  const validate = useCallback(async () => {
    if (!ctx) { setValidClient(false); return; }
    const { data } = await supabase.rpc('mcp_oauth_client_redirect_uris', { p_client_id: ctx.client_id });
    setValidClient(Array.isArray(data) && data.includes(ctx.redirect_uri));
  }, [ctx]);

  useEffect(() => {
    validate();
    // Default del tier: priorità all'eventuale scope richiesto dal client; altrimenti, se esiste già
    // una connessione attiva per questo client, parti dal SUO livello (così riconnettere non azzera
    // la scelta precedente); in mancanza di entrambi resta il default minimo 'read'.
    if (ctx?.scope && ['read', 'draft', 'modify'].includes(ctx.scope)) {
      setTier(ctx.scope as Tier);
      return;
    }
    if (!ctx?.client_id) return;
    let annullato = false;
    (async () => {
      const { data } = await supabase
        .from('mcp_oauth_refresh')
        .select('tier')
        .eq('client_id', ctx.client_id)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);
      const corrente = Array.isArray(data) && data[0]?.tier;
      if (!annullato && corrente && ['read', 'draft', 'modify'].includes(corrente)) {
        setTier(corrente as Tier);
      }
    })();
    return () => { annullato = true; };
  }, [validate, ctx?.scope, ctx?.client_id]);

  const redirectBack = (params: Record<string, string>) => {
    if (!ctx) return;
    const u = new URL(ctx.redirect_uri);
    Object.entries(params).forEach(([k, v]) => { if (v) u.searchParams.set(k, v); });
    if (ctx.state) u.searchParams.set('state', ctx.state);
    window.location.href = u.toString();
  };

  async function autorizza() {
    if (!ctx) return;
    setErrore(null);
    setWorking(true);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) {
        setErrore('Sessione non valida o scaduta: rientra nella piattaforma e riprova ad autorizzare.');
        setWorking(false);
        return;
      }
      const code = randomCode();
      const code_hash = await sha256Hex(code);
      const { error } = await supabase.from('mcp_oauth_codes').insert({
        code_hash,
        user_id: user.id,
        tier,
        client_id: ctx.client_id,
        redirect_uri: ctx.redirect_uri,
        code_challenge: ctx.code_challenge,
      });
      if (error) {
        setErrore(`Autorizzazione non riuscita: ${error.message}`);
        setWorking(false);
        return;
      }
      redirectBack({ code });
    } catch (e: any) {
      setErrore(`Errore imprevisto durante l'autorizzazione: ${e?.message || String(e)}`);
      setWorking(false);
    }
  }

  function nega() {
    redirectBack({ error: 'access_denied' });
    onClose();
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Autorizza accesso AI</h2>
        </div>

        {!ctx || validClient === false ? (
          <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-lg p-4 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Richiesta di autorizzazione non valida o client non registrato. Chiudi questa pagina.</span>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              Un'applicazione MCP chiede di accedere ai dati del tuo studio <strong>a tuo nome</strong>.
              L'accesso è limitato al tuo studio e revocabile in qualsiasi momento.
            </p>
            <div className="text-xs text-gray-400 break-all bg-gray-50 rounded-lg p-3">
              client: {ctx.client_id}<br />redirect: {ctx.redirect_uri}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Livello di permesso</label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as Tier)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="read">{TIER_LABEL.read}</option>
                <option value="draft">{TIER_LABEL.draft}</option>
                <option value="modify">{TIER_LABEL.modify}</option>
              </select>
            </div>
            {errore && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-lg p-3 text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{errore}</span>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button
                onClick={autorizza}
                disabled={working || validClient === null}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                <ShieldCheck className="w-4 h-4" /> {working ? 'Autorizzo…' : 'Autorizza'}
              </button>
              <button
                onClick={nega}
                disabled={working}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm font-medium"
              >
                Nega
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
