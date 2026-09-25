// Finalizzazione catalogazione (Design §7, tappa 4). Dato un record di staging con la `proposta`
// approvata dall'utente: sposta il PDF dal bucket di staging alla posizione definitiva in
// `file_allegati`, crea la riga `documenti` collegata (cliente/persona/incarico) e ripulisce lo
// staging (file + riga) → resta UNA sola copia, al posto giusto. Se qualcosa fallisce, lascia i
// file in staging per il ritentativo (nessuna pulizia parziale che perda dati).

import { supabase } from './supabase';
import { computeFilePath } from '../../api/_lib/documentoService';

const STAGING_BUCKET = 'documenti_staging';
const FINAL_BUCKET = 'file_allegati';

export interface PropostaCatalogazione {
  tipologia: string;
  descrizione?: string;
  data_scadenza: string | null;
  persona_id: string | null;
  cliente_id: string | null;
  incarico_id: string | null;
}

export interface StagingRecord {
  id: string;
  studio_id: string;
  file_path: string;
  nome_file: string;
  proposta: PropostaCatalogazione | null;
}

export interface FinalizzaResult { ok: boolean; error?: string }

export async function finalizzaStaging(row: StagingRecord): Promise<FinalizzaResult> {
  const p = row.proposta;
  if (!p) return { ok: false, error: 'Nessuna proposta da approvare.' };
  // folder = persona (level persona) oppure cliente (level cliente/incarico). risolviAssociazione
  // aveva già impostato cliente_id = cliente dell'incarico per il level incarico.
  const folder = p.persona_id || p.cliente_id;
  if (!folder) return { ok: false, error: 'Associazione mancante nella proposta.' };

  // CLAIM ATOMICO: porta la riga da `proposto` → `catalogato` solo se è ancora `proposto`. Un solo
  // chiamante vince (compare-and-swap su Postgres); così doppio click, tab + modale globale aperte
  // insieme, o un evento realtime ritardato non finalizzano due volte la stessa riga (niente
  // documenti duplicati / file doppi). Se 0 righe aggiornate: qualcun altro l'ha già presa.
  const { data: claimed, error: claimErr } = await supabase
    .from('documenti_staging')
    .update({ stato: 'catalogato' })
    .eq('id', row.id)
    .eq('stato', 'proposto')
    .select('id')
    .maybeSingle();
  if (claimErr) return { ok: false, error: `Claim staging fallito: ${claimErr.message}` };
  if (!claimed) return { ok: false, error: 'Documento già in catalogazione o già catalogato.' };

  // Da qui in poi qualsiasi fallimento ripristina `proposto`, così il file resta in staging per il
  // ritentativo (niente pulizia parziale che perda dati — coerente con §7.7.6).
  const revert = async () => {
    await supabase.from('documenti_staging').update({ stato: 'proposto' }).eq('id', row.id);
  };

  let finalPath: string;
  try {
    finalPath = computeFilePath(folder, row.nome_file, Date.now());
  } catch (e: any) {
    await revert();
    return { ok: false, error: e?.message || 'Path non valido.' };
  }

  // 1) Scarica dallo staging e ricarica nella posizione definitiva.
  const { data: blob, error: dlErr } = await supabase.storage.from(STAGING_BUCKET).download(row.file_path);
  if (dlErr || !blob) {
    await revert();
    return { ok: false, error: `Download dallo staging fallito: ${dlErr?.message || 'file assente'}` };
  }

  const { error: upErr } = await supabase.storage.from(FINAL_BUCKET).upload(finalPath, blob, { contentType: 'application/pdf' });
  if (upErr) {
    await revert();
    return { ok: false, error: `Upload definitivo fallito: ${upErr.message}` };
  }

  // Se tra la proposta e l'approvazione il genitore (incarico / cliente / persona) è finito nel
  // CESTINO, il documento lo "segue": nasce soft-deleted, coerente col genitore, invece di restare
  // un documento VIVO agganciato a un genitore cestinato. Caso molto raro ma evita l'incoerenza.
  let parentDeletedAt: string | null = null;
  const checkDeleted = async (table: string, id: string | null) => {
    if (parentDeletedAt || !id) return;
    const { data } = await supabase.from(table).select('deleted_at').eq('id', id).maybeSingle();
    if (data?.deleted_at) parentDeletedAt = data.deleted_at as string;
  };
  await checkDeleted('incarichi', p.incarico_id);
  await checkDeleted('clienti', p.cliente_id);
  await checkDeleted('anagrafica_soggetti', p.persona_id);

  // 2) Crea la riga documenti collegata (mcp_stato resta NULL: documento approvato, a tutti gli
  //    effetti normale). Se fallisce, rimuovi il file appena caricato per non lasciare orfani.
  const { error: insErr } = await supabase.from('documenti').insert({
    cliente_id: p.cliente_id || null,
    persona_id: p.persona_id || null,
    incarico_id: p.incarico_id || null,
    tipologia: p.tipologia,
    nome_file: row.nome_file,
    descrizione: p.descrizione || '',
    file_path: finalPath,
    data_scadenza: p.data_scadenza || null,
    studio_id: row.studio_id,
    deleted_at: parentDeletedAt,
  });
  if (insErr) {
    await supabase.storage.from(FINAL_BUCKET).remove([finalPath]);
    await revert();
    return { ok: false, error: `Creazione documento fallita: ${insErr.message}` };
  }

  // 3) Pulizia staging (file + riga). Best-effort: se la rimozione fallisce, il documento è comunque
  //    salvato; resterà solo una copia in staging che l'utente può rimuovere a mano.
  await supabase.storage.from(STAGING_BUCKET).remove([row.file_path]);
  await supabase.from('documenti_staging').delete().eq('id', row.id);

  return { ok: true };
}
