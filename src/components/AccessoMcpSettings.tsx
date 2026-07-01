// Pagina "Accesso AI / MCP" (§13.3, superficie UI #1 della Fase 4).
//
// Permette all'utente di generare/listare/revocare i propri PAT (`aml_pat_…`) per il server MCP
// remoto. Il PAT in chiaro è mostrato UNA SOLA VOLTA: in DB salviamo solo lo SHA-256 (stesso
// hashing del server, su mcp_access_tokens). Mostra anche l'URL endpoint e uno snippet di config.
//
// Self-contained: gestisce il proprio stato, non tocca il dirty-tracking di Impostazioni.
 
import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Trash2, Copy, ShieldCheck, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, PlusIcon, MoreHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
 
type Tier = 'read' | 'draft' | 'modify';
 
interface TokenRow {
  id: string;
  label: string | null;
  tier: Tier;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}
 
interface ConnRow {
  token_hash: string;
  tier: Tier;
  client_id: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
}
 
const TIER_LABEL: Record<Tier, string> = {
  read: 'Sola lettura',
  draft: 'Crea bozze',
  modify: 'Modifica (avanzato)',
};
 
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
 
function generaPat(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `aml_pat_${b64}`;
}
 
function fmtDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return s;
  }
}
 
export function AccessoMcpSettings() {
  const toast = useToast();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [conns, setConns] = useState<ConnRow[]>([]);
  const [connBusy, setConnBusy] = useState<string | null>(null); // token_hash dell'azione in corso
  const [revokingId, setRevokingId] = useState<string | null>(null); // id del PAT in fase di revoca
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // reload successivi: non nasconde la lista già mostrata
  const [tableMissing, setTableMissing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false); // sezione token collassata: feature avanzata, rara
  const [desktopOpen, setDesktopOpen] = useState(false); // guida connettore Claude Desktop (consigliata)
 
  const [label, setLabel] = useState('');
  const [tier, setTier] = useState<Tier>('draft');
  const [ttlDays, setTtlDays] = useState<number | ''>(30);
 
  const [newPat, setNewPat] = useState<string | null>(null);
 
  const endpointUrl = `${window.location.origin}/api/mcp`;
 
  const reload = useCallback(async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const { data, error } = await supabase
      .from('mcp_access_tokens')
      .select('id, label, tier, created_at, expires_at, revoked_at, last_used_at')
      .order('created_at', { ascending: false });
    if (error) {
      // Tabella non ancora creata (migrazione non applicata) o altro errore.
      setTableMissing(true);
    } else {
      setTableMissing(false);
      setTokens((data as TokenRow[]) ?? []);
    }
 
    // Connessioni OAuth attive (connettore Claude): refresh token non revocati e non scaduti. La
    // rotazione oraria mantiene UNA riga attiva per concessione; le revocate/scadute sono storia e
    // non si mostrano. Indipendente dalla tabella PAT: se manca solo questa, l'elenco resta vuoto.
    const { data: connData } = await supabase
      .from('mcp_oauth_refresh')
      .select('token_hash, tier, client_id, created_at, last_used_at, expires_at')
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    setConns((connData as ConnRow[]) ?? []);
 
    if (background) {
      setRefreshing(false);
    } else {
      setLoading(false);
    }
  }, []);
 
  useEffect(() => { reload(); }, [reload]);
 
  async function handleCreate() {
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Sessione scaduta: rieffettua il login.');
        return;
      }
      const pat = generaPat();
      const token_hash = await sha256Hex(pat);
      const expires_at = ttlDays && Number(ttlDays) > 0
        ? new Date(Date.now() + Number(ttlDays) * 86_400_000).toISOString()
        : null;
 
      const { error } = await supabase.from('mcp_access_tokens').insert({
        user_id: user.id,
        token_hash,
        tier,
        label: label.trim() || null,
        expires_at,
      });
      if (error) {
        toast.error(`Creazione token fallita: ${error.message}`);
        return;
      }
      setNewPat(pat); // mostrato una sola volta
      setLabel('');
      toast.success('Token creato. Copialo ora: non sarà più mostrato.');
      await reload(true);
    } finally {
      setCreating(false);
    }
  }
 
  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      const { error } = await supabase
        .from('mcp_access_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        toast.error(`Revoca fallita: ${error.message}`);
        return;
      }
      toast.success('Token revocato.');
      await reload(true);
    } finally {
      setRevokingId(null);
    }
  }
 
  // Cambia il livello di permesso di una connessione AI senza riconnettere: aggiorna il tier sul
  // refresh token attivo; la rotazione (mcp_oauth_exchange_refresh) lo porta avanti, così al
  // prossimo rinnovo dell'access token (≤ 1h) l'AI opera col nuovo livello. RLS: l'utente può
  // aggiornare solo le proprie righe.
  async function handleChangeTier(tokenHash: string, newTier: Tier) {
    setConnBusy(tokenHash);
    const { error } = await supabase
      .from('mcp_oauth_refresh')
      .update({ tier: newTier })
      .eq('token_hash', tokenHash)
      .is('revoked_at', null);
    setConnBusy(null);
    if (error) { toast.error(`Modifica permessi fallita: ${error.message}`); return; }
    toast.success('Permessi aggiornati. L\'AI userà il nuovo livello al prossimo rinnovo (entro ~1 ora).');
    await reload(true);
  }
 
  // Revoca una connessione AI: l'AI non potrà più rinnovare il proprio accesso. L'access token già
  // emesso resta valido fino a scadenza (≤ 1h, è auto-contenuto), poi l'accesso cessa.
  async function handleRevokeConn(tokenHash: string) {
    setConnBusy(tokenHash);
    const { error } = await supabase
      .from('mcp_oauth_refresh')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash);
    setConnBusy(null);
    if (error) { toast.error(`Revoca fallita: ${error.message}`); return; }
    toast.success('Connessione revocata. L\'accesso dell\'AI cessa entro ~1 ora (alla scadenza del token in corso).');
    await reload(true);
  }
 
  const copy = (text: string, msg: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(msg),
      () => toast.error('Copia non riuscita.'),
    );
  };
 
  const configSnippet = (pat: string) => JSON.stringify(
    { mcpServers: { aml: { url: endpointUrl, headers: { Authorization: `Bearer ${pat}` } } } },
    null,
    2,
  );
 
  const statoToken = (t: TokenRow): { testo: string; classe: string } => {
    if (t.revoked_at) return { testo: 'Revocato', classe: 'bg-red-50 text-red-600' };
    if (t.expires_at && new Date(t.expires_at) < new Date()) return { testo: 'Scaduto', classe: 'bg-amber-50 text-amber-600' };
    return { testo: 'Attivo', classe: 'bg-green-50 text-green-700' };
  };
 
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Key className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-bold text-gray-900">Accesso AI</h3>
      </div>
      <p className="text-sm text-gray-500">
        Per collegare un assistente AI al tuo account usa
        l'endpoint qui sotto. L'accesso avviene solo dopo la tua autorizzazione con il <strong>tuo login</strong>. Resta limitato al tuo studio e ai tuoi permessi.
      </p>
 
      {/* Endpoint */}
      <div className="bg-gray-50 rounded-lg p-3 text-sm flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-gray-400">Endpoint MCP</div>
          <code className="text-gray-800 break-all">{endpointUrl}</code>
        </div>
        <button
          onClick={() => copy(endpointUrl, 'Endpoint copiato.')}
          className="shrink-0 p-2 rounded-lg hover:bg-gray-200 text-gray-500"
          title="Copia endpoint"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>
 
      {/* Guida Claude Desktop via connettore (OAuth) — via consigliata, senza token. */}
      <div className="border border-gray-200 rounded-lg">
        <button
          onClick={() => setDesktopOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sm font-medium text-gray-800">Come collegare Claude </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">consigliato</span>
          </div>
          {desktopOpen
            ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        </button>
        {desktopOpen && (
          <div className="border-t border-gray-200 p-4 text-sm text-gray-600 space-y-2">
            <p>Il modo più semplice: nessun token da generare, l'accesso avviene con il tuo login.</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li className="flex items-start gap-2">
                <span>1. Apri <strong>Claude</strong> (app desktop o su claude.ai nel browser) → <strong>Impostazioni</strong> → <strong>Connettori</strong>.</span>
              </li>
              <li className="flex items-center gap-2">
                2. Clicca su <PlusIcon className="w-5 h-5"/> (Aggiungi connettore) →  <MoreHorizontal className="w-5 h-5"/> <strong>Aggiungi connettore personalizzato</strong>.
              </li>
              <li className="flex items-start gap-2">
                <span>3. Dai un <strong>Nome</strong> al connettore <span className="text-blue-900">(es. AML)</span> e <strong>incolla l'URL</strong> dell'endpoint <code className="px-1 py-0.5 bg-gray-100 rounded text-[13px] break-all">{endpointUrl}</code> nel campo URL del server MCP remoto. Puoi ignorare le impostazioni avanzate e cliccare su <strong>Aggiungi</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span>4. Ora si aprirà la pagina di autorizzazione della piattaforma AdeguataVerifica.Pro  → <strong>autorizza l'accesso</strong> (scegli i permessi).</span>
              </li>
              <li className="flex items-start gap-2">
                <span>5. Fatto: Ora puoi tornare sulla chat di Claude e formulare la tua richiesta <span className="text-blue-900">(es. "Nella piattaforma AML cataloga tutti i file in attesa nella sezione Documenti da catalogare")</span>. Ricorda che ogni modifica richiesta da un'AI non viene eseguita automaticamente, ma deve essere <strong>approvata manualmente</strong> da te in piattaforma.</span>
              </li>
            </ol>
          </div>
        )}
      </div>
 
      {/* Connessioni AI attive (OAuth/connettore): vedi il livello, cambialo o revoca. */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-semibold text-gray-800">Connessioni AI attive</h4>
          </div>
          <button onClick={() => reload(true)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" title="Aggiorna">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Assistenti AI collegati al tuo account tramite login (connettore). Qui puoi <strong>cambiare il
          livello di permesso</strong> o <strong>revocare</strong> l'accesso in qualsiasi momento.
        </p>
 
        {loading ? (
          <div className="text-sm text-gray-400 py-3">Caricamento…</div>
        ) : conns.length === 0 ? (
          <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg p-4 text-center">
            Nessuna connessione AI attiva. Collega un assistente seguendo la guida “Come collegare Claude” qui sopra.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {conns.map((c) => {
              const busy = connBusy === c.token_hash;
              return (
                <div key={c.token_hash} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">Assistente AI</div>
                    {/* La rotazione oraria del refresh token rigenera la riga: created_at = ultimo
                        rinnovo (proxy di attività recente), non l'orario della prima autorizzazione. */}
                    <div className="text-xs text-gray-400 mt-0.5">
                      Ultimo rinnovo {fmtDate(c.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="sr-only" htmlFor={`tier-${c.token_hash}`}>Livello di permesso</label>
                    <select
                      id={`tier-${c.token_hash}`}
                      value={c.tier}
                      disabled={busy}
                      onChange={(e) => handleChangeTier(c.token_hash, e.target.value as Tier)}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs bg-white disabled:opacity-50"
                      title="Cambia livello di permesso"
                    >
                      <option value="read">{TIER_LABEL.read}</option>
                      <option value="draft">{TIER_LABEL.draft}</option>
                      <option value="modify">{TIER_LABEL.modify}</option>
                    </select>
                    <button
                      onClick={() => handleRevokeConn(c.token_hash)}
                      disabled={busy}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Revoca
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-gray-400">
          Il cambio di livello ha effetto al prossimo rinnovo automatico del token (entro circa un'ora).<br/>
          Per applicarlo <strong>subito</strong>, disconnetti e subito dopo riconnetti il connettore nell'assistente AI.
        </p>
      </div>
 
      {/* Token di accesso — feature avanzata, raramente necessaria: collassata di default. */}
      {/*<div className="border border-gray-200 rounded-lg">
        <button
          onClick={() => setTokensOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Key className="w-4 h-4 text-gray-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800">Token di accesso (uso avanzato)</div>
              <div className="text-xs text-gray-400">
                Serve solo per client che non supportano il login OAuth e si configurano a mano con URL +
                token — es. Gemini CLI, MCP Inspector, script da terminale. Con il connettore di Claude non serve.
              </div>
            </div>
          </div>
          {tokensOpen
            ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        </button>
 
        {tokensOpen && (
          <div className="border-t border-gray-200 p-4 space-y-4">
            <p className="text-xs text-gray-500">
              Un token personale (PAT) autentica un client MCP tramite l'header <code>Authorization: Bearer …</code>
              Opera sempre con i <strong>tuoi permessi</strong>, resta limitato al tuo studio e puoi revocarlo in qualsiasi momento.
            </p>
 
            {tableMissing ? (
              <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-lg p-3 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Tabella token non disponibile: applica la migrazione
                  <code className="mx-1">20260618000000_mcp_access_tokens.sql</code>
                  al database per abilitare la gestione dei token.
                </span>
              </div>
            ) : (
              <>
                {/* PAT appena creato (mostrato una sola volta) *
                {newPat && (
                  <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2 text-green-800 font-medium text-sm">
                      <ShieldCheck className="w-4 h-4" /> Token creato — copialo ora, non sarà più mostrato.
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white border border-green-200 rounded px-3 py-2 text-sm break-all">{newPat}</code>
                      <button onClick={() => copy(newPat, 'Token copiato.')} className="p-2 rounded-lg hover:bg-green-100 text-green-700" title="Copia token">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Snippet config client MCP</div>
                      <pre className="bg-white border border-green-200 rounded p-3 text-xs overflow-auto">{configSnippet(newPat)}</pre>
                      <button onClick={() => copy(configSnippet(newPat), 'Config copiata.')} className="mt-2 text-xs text-green-700 hover:underline">
                        Copia config
                      </button>
                    </div>
                  </div>
                )}
 
                /* Form creazione *
                <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Etichetta</label>
                      <input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="es. Gemini CLI"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Permessi (tier)</label>
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
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Scadenza (giorni)</label>
                      <input
                        type="number"
                        min={1}
                        value={ttlDays}
                        onChange={(e) => setTtlDays(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="nessuna"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" /> {creating ? 'Creazione…' : 'Genera token'}
                  </button>
                </div>
 
                /* Configurazione manuale a token, per client non-OAuth. *
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-2">
                  <div className="font-medium text-gray-700">Configurare un client con un token</div>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Genera un token qui sopra e <strong>copia lo snippet</strong> mostrato subito dopo.</li>
                    <li>Incollalo nella configurazione del tuo client MCP <span className="text-gray-400">(es. Gemini CLI, MCP Inspector, script da terminale)</span>, unendolo alla chiave <code>mcpServers</code> se esiste già.</li>
                    <li>Riavvia il client: comparirà il server <code>aml</code>.</li>
                  </ol>
                  <p className="text-gray-400">
                    Vale per i client che supportano URL + header di autorizzazione. Per <strong>Claude</strong> non serve il token:
                    usa il connettore (vedi “Come collegare Claude Desktop” in alto).
                  </p>
                </div>
 
                /* Lista token *
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-700">Token esistenti</h4>
                    <button onClick={() => reload(true)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" title="Aggiorna">
                      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  {loading ? (
                    <div className="text-sm text-gray-400 py-4">Caricamento…</div>
                  ) : tokens.length === 0 ? (
                    <div className="text-sm text-gray-400 py-4">Nessun token. Generane uno qui sopra.</div>
                  ) : (
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                      {tokens.map((t) => {
                        const stato = statoToken(t);
                        const revocabile = !t.revoked_at;
                        return (
                          <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-800 truncate">{t.label || '(senza etichetta)'}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{TIER_LABEL[t.tier]}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${stato.classe}`}>{stato.testo}</span>
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                Creato {fmtDate(t.created_at)} · Scadenza {fmtDate(t.expires_at)} · Ultimo uso {fmtDate(t.last_used_at)}
                              </div>
                            </div>
                            {revocabile && (
                              <button
                                onClick={() => handleRevoke(t.id)}
                                disabled={revokingId === t.id}
                                className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {revokingId === t.id
                                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />}
                                {revokingId === t.id ? 'Revoca…' : 'Revoca'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>*/}
    </div>
  );
}
