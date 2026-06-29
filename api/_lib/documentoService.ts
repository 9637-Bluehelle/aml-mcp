// Servizio documenti condiviso UI ↔ MCP (§5.1, §9). Fonte di verità per: enum tipologie, regola
// level→id obbligatorio, obbligatorietà data_scadenza, calcolo path storage. Niente React/singleton:
// la UI (DocumentiAllegati) importa l'enum da qui; l'MCP usa anche la logica di prepare/confirm.
//
// Flusso (Opzione 1 estesa, §5.1.2): descrivi_tipologie → prepara_upload_documento (riga `pending`
// + signed upload URL) → upload_file (bytes fuori dal contesto AI) → approvazione umana in inbox →
// conferma_upload_documento (finalize). Il byte del file NON transita mai nel contesto dell'AI.

import type { SupabaseClient } from '@supabase/supabase-js';

export type DocumentoLevel = 'persona' | 'cliente' | 'incarico';

export interface TipologiaDocumento {
  value: string;
  label: string;
  level: DocumentoLevel;
}

// Allineato a TIPOLOGIE_DOCUMENTO in DocumentiAllegati.tsx: questa è la copia canonica/neutra
// importata anche dalla UI. Modificare qui, non duplicare.
export const TIPOLOGIE_DOCUMENTO: TipologiaDocumento[] = [
  { value: 'documento_identita', label: 'Documento di identità', level: 'persona' },
  { value: 'codice_fiscale', label: 'Attestazione codice fiscale / Partita IVA', level: 'cliente' },
  { value: 'visura', label: 'Visura camerale', level: 'cliente' },
  { value: 'atti_costitutivi', label: 'Atti costitutivi / Delibere', level: 'cliente' },
  { value: 'dichiarazione_av4', label: 'Dichiarazione cliente (AV.4) — modulo firmato', level: 'incarico' },
  { value: 'attestazione_av5', label: 'Attestazione verifica terzi (AV.5)', level: 'incarico' },
  { value: 'mandato', label: 'Mandato (lettera di incarico)', level: 'incarico' },
  { value: 'mezzi_pagamento', label: 'Mezzi di pagamento', level: 'incarico' },
  { value: 'provenienza_fondi', label: 'Provenienza fondi', level: 'incarico' },
  { value: 'doc_semplificati_rafforzati', label: 'Documentazione obblighi semplificati/rafforzati', level: 'incarico' },
  { value: 'dichiarazione_penale', label: 'Dichiarazione sostitutiva / Certificato Tribunale', level: 'cliente' },
  { value: 'esiti_ricerche', label: 'Esiti ricerche internet / banche dati', level: 'cliente' },
  { value: 'consistenza_patrimoniale', label: 'Documentazione consistenza patrimoniale', level: 'cliente' },
  { value: 'visura_nominativa', label: 'Visura camerale nominativa (cariche/protesti)', level: 'cliente' },
  { value: 'posizione_giuridica', label: 'Documentazione posizione giuridica', level: 'cliente' },
  { value: 'bilancio', label: 'Bilancio', level: 'incarico' },
  { value: 'procura', label: 'Procura', level: 'incarico' },
  { value: 'contratto', label: 'Contratto', level: 'incarico' },
  { value: 'altro', label: 'Altro', level: 'incarico' },
];

// Tipologie per cui data_scadenza è obbligatoria (allineato a TIPOLOGIE_CON_SCADENZA nella UI).
export const TIPOLOGIE_CON_SCADENZA = new Set<string>([
  'documento_identita',
  'documento_identita_esecutore',
  'visura',
  'procura',
  'contratto',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = 'file_allegati';

/** Enum completo "spiegato" per l'AI: per ogni tipologia value, label, level e scadenza_obbligatoria. */
export function descriviTipologie() {
  return TIPOLOGIE_DOCUMENTO.map((t) => ({
    value: t.value,
    label: t.label,
    level: t.level,
    id_obbligatorio: t.level === 'persona' ? 'persona_id' : t.level === 'cliente' ? 'cliente_id' : 'incarico_id',
    scadenza_obbligatoria: TIPOLOGIE_CON_SCADENZA.has(t.value),
  }));
}

export function getTipologia(value: string): TipologiaDocumento | undefined {
  return TIPOLOGIE_DOCUMENTO.find((t) => t.value === value);
}

/** Normalizza una data scadenza (ISO yyyy-mm-dd o dd/mm/yyyy) in ISO; null se vuota/non valida. */
function toIsoDate(s?: string | null): string | null {
  const v = (s || '').trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export interface DocumentoMetadata {
  tipologia: string;
  nome_file: string;
  descrizione?: string;
  data_scadenza?: string;
  persona_id?: string;
  cliente_id?: string;
  incarico_id?: string;
}

interface AssociazioneRisolta {
  level: DocumentoLevel;
  folder: string;               // primo segmento del path storage (UUID cliente o persona)
  row: { persona_id: string | null; cliente_id: string | null; incarico_id: string | null };
  data_scadenza: string | null;
}

/**
 * Valida la metadata e risolve l'associazione: verifica tipologia ∈ enum, presenza dell'id del
 * level corretto e appartenenza allo studio, e obbligatorietà data_scadenza. Risolve il folder
 * (per gli incarichi = cliente_id dell'incarico). Lancia con messaggio chiaro su violazione.
 */
export async function risolviAssociazione(
  client: SupabaseClient,
  studioId: string | null,
  meta: DocumentoMetadata,
): Promise<AssociazioneRisolta> {
  if (!studioId) throw new Error('Studio non determinato: impossibile validare l\'associazione.');

  const tip = getTipologia(meta.tipologia);
  if (!tip) {
    throw new Error(`Tipologia non valida: "${meta.tipologia}". Usa descrivi_tipologie_documento per l'elenco.`);
  }

  const data_scadenza = toIsoDate(meta.data_scadenza);
  if (TIPOLOGIE_CON_SCADENZA.has(tip.value) && !data_scadenza) {
    throw new Error(`La tipologia "${tip.value}" richiede una data_scadenza (formato dd/mm/yyyy, es. 31/12/2026).`);
  }

  if (tip.level === 'persona') {
    if (!meta.persona_id || !UUID_RE.test(meta.persona_id)) {
      throw new Error(`La tipologia "${tip.value}" (level persona) richiede un persona_id valido.`);
    }
    const { data } = await client.from('anagrafica_soggetti').select('id').eq('id', meta.persona_id).eq('studio_id', studioId).maybeSingle();
    if (!data) throw new Error('persona_id non trovato nello studio.');
    return { level: 'persona', folder: meta.persona_id, row: { persona_id: meta.persona_id, cliente_id: null, incarico_id: null }, data_scadenza };
  }

  if (tip.level === 'cliente') {
    if (!meta.cliente_id || !UUID_RE.test(meta.cliente_id)) {
      throw new Error(`La tipologia "${tip.value}" (level cliente) richiede un cliente_id valido.`);
    }
    const { data } = await client.from('clienti').select('id').eq('id', meta.cliente_id).eq('studio_id', studioId).maybeSingle();
    if (!data) throw new Error('cliente_id non trovato nello studio.');
    return { level: 'cliente', folder: meta.cliente_id, row: { persona_id: null, cliente_id: meta.cliente_id, incarico_id: null }, data_scadenza };
  }

  // level incarico → folder = cliente_id dell'incarico
  if (!meta.incarico_id || !UUID_RE.test(meta.incarico_id)) {
    throw new Error(`La tipologia "${tip.value}" (level incarico) richiede un incarico_id valido.`);
  }
  const { data: inc } = await client.from('incarichi').select('id, cliente_id').eq('id', meta.incarico_id).eq('studio_id', studioId).maybeSingle();
  if (!inc) throw new Error('incarico_id non trovato nello studio.');
  if (!inc.cliente_id || !UUID_RE.test(inc.cliente_id)) throw new Error('Incarico senza cliente associato: impossibile calcolare il path.');
  return { level: 'incarico', folder: inc.cliente_id, row: { persona_id: null, cliente_id: inc.cliente_id, incarico_id: meta.incarico_id }, data_scadenza };
}

/** Calcola un path storage sicuro: <folderUUID>/<timestamp>_<safe>.pdf (estensione lowercase). */
export function computeFilePath(folder: string, nomeFile: string, timestamp: number): string {
  if (!UUID_RE.test(folder)) throw new Error('Identificativo destinazione non valido (atteso UUID).');
  const base = (nomeFile || 'documento.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  // Forza estensione .pdf minuscola (policy RESTRICTIVE storage: storage.extension(name)='pdf').
  const safe = /\.pdf$/i.test(base) ? base.replace(/\.[^.]+$/, '.pdf') : `${base}.pdf`;
  return `${folder}/${timestamp}_${safe}`;
}

export interface PreparaResult {
  doc_id: string;
  file_path: string;
  upload_token: string;
  bucket: string;
}

/**
 * Crea la riga `documenti` in stato MCP `pending` e restituisce un signed upload token con cui
 * caricare il PDF direttamente sullo Storage (via uploadToSignedUrl), fuori dal contesto AI.
 * `nowMs` iniettato per testabilità.
 */
export async function preparaUploadDocumento(
  client: SupabaseClient,
  studioId: string | null,
  meta: DocumentoMetadata,
  nowMs: number,
): Promise<PreparaResult> {
  const assoc = await risolviAssociazione(client, studioId, meta);
  const filePath = computeFilePath(assoc.folder, meta.nome_file, nowMs);

  const { data: signed, error: signErr } = await client.storage.from(BUCKET).createSignedUploadUrl(filePath);
  if (signErr || !signed) throw new Error(`Creazione signed upload URL fallita: ${signErr?.message || 'sconosciuto'}`);

  const { data: row, error: insErr } = await client
    .from('documenti')
    .insert({
      ...assoc.row,
      tipologia: meta.tipologia,
      nome_file: meta.nome_file,
      descrizione: meta.descrizione || '',
      file_path: filePath,
      data_scadenza: assoc.data_scadenza,
      studio_id: studioId,
      mcp_stato: 'pending',
    })
    .select('id')
    .single();
  if (insErr || !row) {
    // cleanup best-effort del signed slot non è necessario (nessun file ancora caricato)
    throw new Error(`Creazione riga documento fallita: ${insErr?.message || 'sconosciuto'}`);
  }

  return { doc_id: row.id, file_path: filePath, upload_token: signed.token, bucket: BUCKET };
}

/**
 * Finalizza un documento: consentito SOLO se l'associazione è stata approvata da un umano
 * (mcp_stato='approved', §5.1.3) e il file è effettivamente presente sullo Storage. Porta la riga
 * a mcp_stato='confirmed'.
 */
export async function confermaUploadDocumento(
  client: SupabaseClient,
  studioId: string | null,
  docId: string,
): Promise<{ doc_id: string; stato: string }> {
  if (!studioId) throw new Error('Studio non determinato.');
  const { data: doc } = await client
    .from('documenti')
    .select('id, file_path, mcp_stato')
    .eq('id', docId)
    .eq('studio_id', studioId)
    .maybeSingle();
  if (!doc) throw new Error('Documento non trovato nello studio.');
  if (doc.mcp_stato === 'confirmed') return { doc_id: docId, stato: 'confirmed' };
  if (doc.mcp_stato !== 'approved') {
    throw new Error(`Documento non approvato (stato: ${doc.mcp_stato ?? 'n/d'}). Va approvato da un umano nell'inbox prima della conferma.`);
  }

  // Verifica che il file sia effettivamente arrivato sullo Storage.
  const slash = doc.file_path.lastIndexOf('/');
  const dir = slash >= 0 ? doc.file_path.slice(0, slash) : '';
  const fname = slash >= 0 ? doc.file_path.slice(slash + 1) : doc.file_path;
  const { data: list } = await client.storage.from(BUCKET).list(dir, { search: fname, limit: 100 });
  const presente = (list || []).some((f) => f.name === fname);
  if (!presente) throw new Error('File non ancora presente sullo Storage: esegui prima upload_file.');

  const { error } = await client.from('documenti').update({ mcp_stato: 'confirmed' }).eq('id', docId).eq('studio_id', studioId);
  if (error) throw new Error(error.message);
  return { doc_id: docId, stato: 'confirmed' };
}

/**
 * Fallback PoC (§5.1.4): carica il PDF passando i byte in base64 (cap ≤ 1 MB). NON per la
 * produzione (il file transita nel contesto). Crea la riga in `pending` come prepara.
 */
export async function caricaDocumentoBase64(
  client: SupabaseClient,
  studioId: string | null,
  meta: DocumentoMetadata,
  base64: string,
  nowMs: number,
): Promise<{ doc_id: string; file_path: string }> {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) throw new Error('Contenuto base64 vuoto o non valido.');
  if (bytes.length > 1024 * 1024) throw new Error('File troppo grande per il fallback base64 (max 1 MB). Usa prepara_upload_documento + upload_file.');
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('Il file non è un PDF valido.');

  const assoc = await risolviAssociazione(client, studioId, meta);
  const filePath = computeFilePath(assoc.folder, meta.nome_file, nowMs);

  const { error: upErr } = await client.storage.from(BUCKET).upload(filePath, bytes, { contentType: 'application/pdf' });
  if (upErr) throw new Error(`Upload storage fallito: ${upErr.message}`);

  const { data: row, error: insErr } = await client
    .from('documenti')
    .insert({
      ...assoc.row,
      tipologia: meta.tipologia,
      nome_file: meta.nome_file,
      descrizione: meta.descrizione || '',
      file_path: filePath,
      data_scadenza: assoc.data_scadenza,
      studio_id: studioId,
      mcp_stato: 'pending',
    })
    .select('id')
    .single();
  if (insErr || !row) {
    await client.storage.from(BUCKET).remove([filePath]).catch(() => {});
    throw new Error(`Creazione riga documento fallita: ${insErr?.message || 'sconosciuto'}`);
  }
  return { doc_id: row.id, file_path: filePath };
}
