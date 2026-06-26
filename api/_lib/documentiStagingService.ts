// Staging documenti — servizio server condiviso dai tool MCP (Design §7, tappa 2).
//  - listaStaging: elenca i file caricati dall'utente in attesa di catalogazione.
//  - leggiStaging: scarica il PDF dallo staging ed estrae il testo (unpdf, ESM-native, serverless)
//    per darlo in lettura all'AI. Cache del testo in `testo_estratto`.
//  - proponiCatalogazione: registra la proposta dell'AI (tipologia + associazione + scadenza) sulla
//    riga di staging (stato 'proposto'). NIENTE viene scritto in `documenti` finché un umano non
//    approva (tappe 3/4). Riusa `risolviAssociazione` per validare tipologia/associazione/scadenza.
//
// Modulo neutro (no React): gira in Node sotto l'identità dell'utente (RLS piena).

import type { SupabaseClient } from '@supabase/supabase-js';
import { risolviAssociazione, getTipologia, TIPOLOGIE_CON_SCADENZA, type DocumentoMetadata } from './documentoService.js';

const STAGING_BUCKET = 'documenti_staging';

/** Elenco dei documenti in staging (da_catalogare + proposto) dell'utente (RLS scoped). */
export async function listaStaging(client: SupabaseClient) {
  const { data, error } = await client
    .from('documenti_staging')
    .select('id, nome_file, dimensione, stato, proposta, testo_estratto, created_at')
    .in('stato', ['da_catalogare', 'proposto'])
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return {
    count: data?.length ?? 0,
    // Il testo dei PDF si estrae SU RICHIESTA (leggi_documento_staging), non in questa lista:
    // `testo_in_cache=false` significa solo "non ancora estratto", NON "documento senza testo".
    nota:
      'Il contenuto dei PDF non è incluso qui: viene estratto on-demand con leggi_documento_staging. ' +
      '"testo_in_cache": false significa solo che il testo non è ancora stato estratto, NON che il ' +
      'documento sia privo di testo o scansionato. Per ricavare dati dal contenuto (sempre per le ' +
      'tipologie con data di scadenza, e ogni volta che il nome file non basta) LEGGI il documento.',
    documenti: (data ?? []).map((d: any) => ({
      id: d.id,
      nome_file: d.nome_file,
      dimensione: d.dimensione,
      stato: d.stato,
      testo_in_cache: !!(d.testo_estratto && String(d.testo_estratto).trim()),
      proposta: d.proposta ?? null,
      created_at: d.created_at,
    })),
  };
}

/** Scarica il PDF di staging ed estrae il testo (cache in testo_estratto). Per i PDF scansionati
 *  (immagine, senza layer testo) restituisce testo vuoto + nota: senza OCR non è leggibile. */
export async function leggiStaging(client: SupabaseClient, id: string) {
  const { data: row, error } = await client
    .from('documenti_staging')
    .select('id, nome_file, file_path, testo_estratto')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('Documento di staging non trovato (o non appartiene al tuo studio/utente).');

  if (row.testo_estratto && String(row.testo_estratto).trim()) {
    return { id: row.id, nome_file: row.nome_file, testo: row.testo_estratto, fonte: 'cache' as const };
  }

  const { data: blob, error: dlErr } = await client.storage.from(STAGING_BUCKET).download(row.file_path);
  if (dlErr || !blob) throw new Error(`Download PDF fallito: ${dlErr?.message || 'file assente'}`);

  // unpdf caricato on-demand (ESM): estrazione testo senza worker, adatta al runtime serverless.
  const { extractText, getDocumentProxy } = await import('unpdf');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let testo = '';
  try {
    const pdf = await getDocumentProxy(bytes);
    const res = await extractText(pdf, { mergePages: true });
    testo = (typeof res.text === 'string' ? res.text : (res.text as string[]).join('\n')).trim();
  } catch (e: any) {
    throw new Error(`Estrazione testo fallita: ${e?.message || String(e)}`);
  }

  if (testo) {
    await client.from('documenti_staging').update({ testo_estratto: testo }).eq('id', id);
    return { id: row.id, nome_file: row.nome_file, testo, fonte: 'estratto' as const };
  }

  return {
    id: row.id,
    nome_file: row.nome_file,
    testo: '',
    fonte: 'estratto' as const,
    nota: 'Nessun testo estraibile: probabile PDF scansionato (immagine). Senza OCR il contenuto non è ' +
      'leggibile come testo. Deduci la tipologia dal nome file se possibile, oppure chiedi i dati all\'utente.',
  };
}

export interface CatalogazioneItem {
  staging_id: string;
  tipologia: string;
  descrizione?: string;
  data_scadenza?: string;
  persona_id?: string;
  cliente_id?: string;
  incarico_id?: string;
}

/** Registra le proposte di catalogazione sulle righe di staging (stato 'proposto'). Valida ogni
 *  item con risolviAssociazione; non scrive nulla in `documenti` (checkpoint umano alle tappe 3/4). */
export async function proponiCatalogazione(
  client: SupabaseClient,
  studioId: string | null,
  items: CatalogazioneItem[],
) {
  const esiti: Array<{
    staging_id: string;
    ok: boolean;
    error?: string;
    azione?: string;
    testo_documento?: string;
  }> = [];
  for (const it of items) {
    try {
      const { data: row } = await client
        .from('documenti_staging')
        .select('id, nome_file')
        .eq('id', it.staging_id)
        .maybeSingle();
      if (!row) { esiti.push({ staging_id: it.staging_id, ok: false, error: 'staging_id non trovato' }); continue; }

      // GATE LETTURA: se la tipologia esige una data di scadenza e l'AI non l'ha fornita, NON
      // scartiamo il file: leggiamo il PDF al posto suo e restituiamo il testo, così può ricavare
      // la data e richiamare. Deterministico — non dipende dal fatto che l'AI abbia letto prima.
      const tip = getTipologia(it.tipologia);
      const dataAssente = !it.data_scadenza || !String(it.data_scadenza).trim();
      if (tip && TIPOLOGIE_CON_SCADENZA.has(tip.value) && dataAssente) {
        let testo = '';
        let nota = '';
        try {
          const lettura = await leggiStaging(client, it.staging_id);
          testo = lettura.testo || '';
          nota = (lettura as any).nota || '';
        } catch (e: any) {
          nota = `Lettura del documento non riuscita: ${e?.message || String(e)}`;
        }
        esiti.push({
          staging_id: it.staging_id,
          ok: false,
          azione: 'ricava_data_scadenza_dal_testo',
          error:
            `La tipologia "${it.tipologia}" richiede una data di scadenza. NON scartare il file: ` +
            `ricava la data dal CONTENUTO del documento qui sotto e richiama proponi_catalogazione con ` +
            `data_scadenza valorizzata. Se la data non è davvero presente nel testo, chiedila all'utente.` +
            (nota ? ` (${nota})` : ''),
          testo_documento: testo ? testo.slice(0, 6000) : '',
        });
        continue;
      }

      const meta: DocumentoMetadata = {
        tipologia: it.tipologia,
        nome_file: row.nome_file,
        descrizione: it.descrizione,
        data_scadenza: it.data_scadenza,
        persona_id: it.persona_id,
        cliente_id: it.cliente_id,
        incarico_id: it.incarico_id,
      };
      // Valida tipologia/associazione/scadenza e verifica appartenenza allo studio (lancia se KO).
      const assoc = await risolviAssociazione(client, studioId, meta);

      const proposta = {
        tipologia: it.tipologia,
        descrizione: it.descrizione ?? '',
        data_scadenza: assoc.data_scadenza,
        persona_id: assoc.row.persona_id,
        cliente_id: assoc.row.cliente_id,
        incarico_id: assoc.row.incarico_id,
      };
      const { error: upErr } = await client
        .from('documenti_staging')
        .update({ proposta, stato: 'proposto' })
        .eq('id', it.staging_id);
      if (upErr) { esiti.push({ staging_id: it.staging_id, ok: false, error: upErr.message }); continue; }
      esiti.push({ staging_id: it.staging_id, ok: true });
    } catch (e: any) {
      esiti.push({ staging_id: it.staging_id, ok: false, error: e?.message || String(e) });
    }
  }
  const proposti = esiti.filter((e) => e.ok).length;
  return {
    proposti,
    totali: items.length,
    esiti,
    nota: proposti > 0
      ? 'Proposte registrate. Ora l\'utente le rivede e approva nell\'app (tab "Documenti da catalogare"); ' +
        'solo dopo l\'approvazione i file verranno collegati ai clienti.'
      : undefined,
  };
}
