// Risolve i nomi citati dalle azioni di un piano (cliente per crea_incarico; incarico + cliente +
// PEP per crea_valutazione, serve all'anteprima RT2). Tutto sotto la RLS dell'utente. Condiviso tra
// PianoApprovazione (modale/pagina) e AzioniAiInAttesa (inbox), così il dettaglio mostra i nomi.

import { supabase } from './supabase';
import type { ContestoNomi } from './dettaglioAzioni';

interface Azione { tool: string; args?: Record<string, any> }

// Solo gli UUID veri vanno interrogati: un id può essere un riferimento intra-piano "@passo:N"
// (entità non ancora creata) — passarlo a .in('id', …) su una colonna uuid farebbe fallire l'intera
// query. Tali riferimenti semplicemente non si risolvono in un nome (corretto: l'entità non esiste).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const soloUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export async function risolviNomiAzioni(azioni: Azione[]): Promise<ContestoNomi> {
  const cliIds = azioni.filter((a) => a.tool === 'crea_incarico').map((a) => a.args?.cliente_id).filter(soloUuid);
  const incIds = azioni.filter((a) => a.tool === 'crea_valutazione').map((a) => a.args?.incarico_id).filter(soloUuid);

  const incarichiInfo: ContestoNomi['incarichiInfo'] = {};
  const incClienteId: Record<string, string | null> = {};
  const extraCliIds: string[] = [];
  if (incIds.length) {
    const { data: incs } = await supabase
      .from('incarichi')
      .select('id, codice_incarico, tipologia_prestazione_id, cliente_id')
      .in('id', [...new Set(incIds)]);
    (incs ?? []).forEach((i: any) => {
      incarichiInfo[i.id] = { codice: i.codice_incarico, tipologiaId: i.tipologia_prestazione_id, isPep: false };
      incClienteId[i.id] = i.cliente_id;
      if (i.cliente_id) extraCliIds.push(i.cliente_id);
    });
  }

  const allCli = [...new Set([...cliIds, ...extraCliIds])];
  const clienteNomi: Record<string, string> = {};
  const pepById: Record<string, boolean> = {};
  if (allCli.length) {
    const { data: clis } = await supabase.from('clienti').select('id, ragione_sociale, pep').in('id', allCli);
    (clis ?? []).forEach((c: any) => { clienteNomi[c.id] = c.ragione_sociale; pepById[c.id] = c.pep === true; });
  }

  Object.keys(incarichiInfo).forEach((id) => {
    const cid = incClienteId[id];
    incarichiInfo[id].clienteNome = cid ? clienteNomi[cid] : undefined;
    incarichiInfo[id].isPep = cid ? !!pepById[cid] : false;
  });

  return { clienteNomi, incarichiInfo };
}
