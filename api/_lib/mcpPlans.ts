// MCP — Conferma in blocco (Fase 4b, §7.3-7.4): proponi → (approvazione umana) → esegui.
//
// Garanzia server-side: `esegui_piano` esegue le azioni SOLO se il piano è in stato `approved`.
// L'approvazione avviene esclusivamente dalla UI (pagina di approvazione): NON esiste un tool MCP
// per approvare, quindi l'AI non può auto-approvarsi. Le azioni sono validate al momento della
// proposta e ri-eseguite con il client autenticato (RLS piena, audit source='ai').

import type { SupabaseClient } from '@supabase/supabase-js';
import { salvaCliente } from './clienteService.js';
import { creaSoggettoWithClient } from './personeService.js';
import { salvaIncarico, type IncaricoArgs } from './incaricoService.js';
import { salvaValutazione, type ValutazioneArgs } from './valutazioneService.js';
import { AZIONI_PIANO_SCHEMAS, mapArgsToWizardData, mapArgsToPersona } from './mcpTools.js';

export interface AzionePiano {
  tool: string;
  args: Record<string, any>;
}

function buildApprovalLink(planId: string): string {
  const base = process.env.MCP_APP_BASE_URL || process.env.VITE_APP_BASE_URL || '';
  const path = `/?mcp_plan=${planId}`;
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
}

/** Esegue una singola azione del piano riusando i servizi condivisi. Lancia su tool non ammesso. */
async function executeAzione(
  client: SupabaseClient,
  studioId: string | null,
  azione: AzionePiano,
): Promise<{ ok: boolean; tool: string; id?: string | null; created?: boolean }> {
  if (azione.tool === 'crea_bozza_cliente') {
    const r = await salvaCliente(client, mapArgsToWizardData(azione.args), {
      isComplete: false,
      activeStudioId: studioId,
    });
    return { ok: true, tool: azione.tool, id: r.cliente?.id ?? null };
  }
  if (azione.tool === 'crea_soggetto') {
    const r = await creaSoggettoWithClient(client, mapArgsToPersona(azione.args), studioId);
    return { ok: true, tool: azione.tool, id: r.id, created: r.created };
  }
  if (azione.tool === 'crea_incarico') {
    const r = await salvaIncarico(client, azione.args as IncaricoArgs, studioId);
    return { ok: true, tool: azione.tool, id: r.incarico_id };
  }
  if (azione.tool === 'crea_valutazione') {
    const r = await salvaValutazione(client, azione.args as ValutazioneArgs, studioId);
    return { ok: true, tool: azione.tool, id: r.valutazione_id };
  }
  throw new Error(`Tool non ammesso nei piani: ${azione.tool}`);
}

/** Valida ogni azione contro lo schema del suo tool (rifiuto immediato se non ammesso/non valido). */
function validaAzioni(azioni: AzionePiano[]): AzionePiano[] {
  if (!Array.isArray(azioni) || azioni.length === 0) {
    throw new Error('Il piano deve contenere almeno un\'azione.');
  }
  return azioni.map((a, i) => {
    const schema = AZIONI_PIANO_SCHEMAS[a?.tool];
    if (!schema) {
      throw new Error(`Azione #${i + 1}: tool non ammesso nei piani ("${a?.tool}").`);
    }
    return { tool: a.tool, args: schema.parse(a.args ?? {}) as Record<string, any> };
  });
}

/** Riepilogo leggibile delle azioni (una riga per azione) per il messaggio di ritorno. */
function buildRiepilogo(azioni: AzionePiano[]): string[] {
  return azioni.map((a, i) => {
    let n = '';
    if (a.tool === 'crea_incarico') {
      n = a.args.codice_incarico || a.args.tipologia_prestazione_id || '';
    } else if (a.tool === 'crea_valutazione') {
      n = a.args.incarico_id ? `incarico ${a.args.incarico_id}` : '';
    } else {
      n = a.args.nome_cognome || a.args.nome_cognome_pf || a.args.ragione_sociale || a.args.nome_cognome_prof || a.args.codice_cliente || '';
    }
    return `${i + 1}. ${a.tool}${n ? `: ${n}` : ''}`;
  });
}

/**
 * Valida le azioni e salva un piano in stato `pending`. Ritorna id, riepilogo leggibile e link
 * breve a scadenza alla pagina di approvazione (§7.3). Nessuna scrittura sui dati business qui.
 */
export async function proponiPiano(
  client: SupabaseClient,
  studioId: string | null,
  input: { titolo?: string; azioni: AzionePiano[] },
): Promise<{ plan_id: string; n_azioni: number; scadenza: string; link: string; riepilogo: string[] }> {
  const azioniValidate = validaAzioni(input.azioni);

  const { data, error } = await client
    .from('mcp_pending_plans')
    .insert({
      studio_id: studioId,
      titolo: input.titolo ?? null,
      azioni: azioniValidate,
      status: 'pending',
    })
    .select('id, expires_at')
    .single();
  if (error) throw new Error(error.message);

  const riepilogo = buildRiepilogo(azioniValidate);

  return {
    plan_id: data.id,
    n_azioni: azioniValidate.length,
    scadenza: data.expires_at,
    link: buildApprovalLink(data.id),
    riepilogo,
  };
}

/**
 * Aggiorna un piano già proposto e ANCORA `pending`, sostituendo le sue azioni (e opzionalmente il
 * titolo) — invece di crearne uno nuovo. Consentito solo finché il piano è in attesa e non scaduto:
 * dopo l'approvazione/esecuzione/rifiuto non è più modificabile. RLS: l'utente aggiorna solo i propri
 * piani. Il guard `.eq('status','pending')` evita la corsa con un'approvazione concorrente.
 */
export async function aggiornaPiano(
  client: SupabaseClient,
  planId: string,
  input: { titolo?: string; azioni: AzionePiano[] },
): Promise<{ plan_id: string; n_azioni: number; scadenza: string; link: string; riepilogo: string[] }> {
  const azioniValidate = validaAzioni(input.azioni);

  const { data: plan, error: selErr } = await client
    .from('mcp_pending_plans')
    .select('id, status, expires_at')
    .eq('id', planId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!plan) throw new Error('Piano non trovato (o non appartiene al tuo studio).');
  if (plan.status !== 'pending') {
    throw new Error(`Il piano non è più modificabile (stato: ${plan.status}). Si aggiornano solo i piani ancora in attesa di approvazione; per cambiare qualcosa proponi un nuovo piano.`);
  }
  if (new Date(plan.expires_at) < new Date()) {
    throw new Error('Piano scaduto: non più modificabile. Proponi un nuovo piano.');
  }

  const patch: Record<string, any> = { azioni: azioniValidate };
  if (input.titolo !== undefined) patch.titolo = input.titolo;

  const { data: updated, error: upErr } = await client
    .from('mcp_pending_plans')
    .update(patch)
    .eq('id', planId)
    .eq('status', 'pending')
    .select('id, expires_at')
    .maybeSingle();
  if (upErr) throw new Error(upErr.message);
  if (!updated) throw new Error('Piano non aggiornato: potrebbe essere stato approvato o rifiutato nel frattempo.');

  return {
    plan_id: updated.id,
    n_azioni: azioniValidate.length,
    scadenza: updated.expires_at,
    link: buildApprovalLink(updated.id),
    riepilogo: buildRiepilogo(azioniValidate),
  };
}

/**
 * Esegue un piano SOLO se `approved` e non scaduto. Claim atomico (approved → executing) per
 * evitare doppia esecuzione, poi esegue le azioni e salva l'esito per-azione (status=executed).
 */
export async function eseguiPiano(
  client: SupabaseClient,
  studioId: string | null,
  planId: string,
): Promise<{ plan_id: string; eseguite: number; totali: number; esito: any[] }> {
  const { data: plan, error } = await client
    .from('mcp_pending_plans')
    .select('id, status, azioni, expires_at')
    .eq('id', planId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!plan) throw new Error('Piano non trovato (o non appartiene al tuo studio).');

  if (plan.status === 'executed') throw new Error('Piano già eseguito.');

  if (new Date(plan.expires_at) < new Date()) {
    if (plan.status === 'pending' || plan.status === 'approved') {
      await client.from('mcp_pending_plans').update({ status: 'expired' }).eq('id', planId).eq('status', plan.status);
    }
    throw new Error('Piano scaduto: non più eseguibile.');
  }

  if (plan.status !== 'approved') {
    throw new Error(`Piano non approvato (stato: ${plan.status}). Va approvato da un umano alla pagina di approvazione prima di poter essere eseguito.`);
  }

  // Claim atomico: solo chi porta approved → executing prosegue (evita doppia esecuzione).
  const { data: claimed } = await client
    .from('mcp_pending_plans')
    .update({ status: 'executing' })
    .eq('id', planId)
    .eq('status', 'approved')
    .select('id')
    .maybeSingle();
  if (!claimed) {
    throw new Error('Piano non più in stato approvato (forse già in esecuzione o revocato).');
  }

  const azioni = (plan.azioni as AzionePiano[]) ?? [];
  const esito: any[] = [];
  for (let i = 0; i < azioni.length; i++) {
    try {
      const r = await executeAzione(client, studioId, azioni[i]);
      esito.push({ index: i, ...r });
    } catch (e: any) {
      esito.push({ index: i, tool: azioni[i]?.tool, ok: false, error: e?.message || String(e) });
    }
  }

  await client
    .from('mcp_pending_plans')
    .update({ status: 'executed', esito, executed_at: new Date().toISOString() })
    .eq('id', planId);

  return {
    plan_id: planId,
    eseguite: esito.filter((e) => e.ok).length,
    totali: azioni.length,
    esito,
  };
}

/** Stato corrente di un piano (per l'AI che attende l'approvazione umana o vuole rileggere/ritoccare
 *  le azioni con aggiorna_piano). Include le `azioni` correnti così l'AI può patcharle. */
export async function statoPiano(
  client: SupabaseClient,
  planId: string,
): Promise<{ plan_id: string; status: string; n_azioni: number; azioni: AzionePiano[]; esito: any[] | null }> {
  const { data, error } = await client
    .from('mcp_pending_plans')
    .select('id, status, azioni, esito')
    .eq('id', planId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Piano non trovato (o non appartiene al tuo studio).');
  const azioni = (Array.isArray(data.azioni) ? data.azioni : []) as AzionePiano[];
  return {
    plan_id: data.id,
    status: data.status,
    n_azioni: azioni.length,
    azioni,
    esito: data.esito ?? null,
  };
}
