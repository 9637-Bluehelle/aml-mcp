import { supabase } from './supabase';
import { validatePdfFile } from './fileValidation';
import { getActiveStudioIdHolder } from './studioHelper';

export interface DocumentoIdentitaEsistente {
  id: string;
  file_path: string;
  nome_file: string;
  data_scadenza: string | null;
  descrizione: string | null;
  data_acquisizione: string | null;
  cartaceo: boolean;
}

/** Recupera, se esiste, l'ultimo documento di identità registrato per una persona fisica
 *  (ordinato per data_acquisizione desc). Utile quando importiamo una persona
 *  nel wizard per mostrare il doc già a sistema invece di proporre un nuovo upload. */
export async function fetchDocumentoIdentitaEsistente(personaId: string): Promise<DocumentoIdentitaEsistente | null> {
  if (!personaId) return null;
  const { data, error } = await supabase
    .from('documenti')
    .select('id, file_path, nome_file, data_scadenza, descrizione, data_acquisizione')
    .eq('persona_id', personaId)
    .eq('tipologia', 'documento_identita')
    .order('data_acquisizione', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    file_path: data.file_path || '',
    nome_file: data.nome_file || '',
    data_scadenza: data.data_scadenza,
    descrizione: data.descrizione,
    data_acquisizione: data.data_acquisizione,
    cartaceo: !!data.file_path && data.file_path.startsWith('*'),
  };
}

export interface UploadDocumentoIdentitaArgs {
  personaId: string;
  clienteId?: string | null;
  file?: File | null;
  cartaceo?: boolean;
  dataScadenza?: string | null;
  descrizione?: string;
}

export interface UploadResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/** Carica (o marca come cartaceo) un documento di identità per una persona fisica.
 *  Usa il primo segmento del path storage = clienteId se presente, altrimenti personaId,
 *  così da rispettare le policy RLS su file_allegati (vedi migration storage_allow_persona_folder). */
export async function uploadDocumentoIdentita({
  personaId,
  clienteId,
  file,
  cartaceo = false,
  dataScadenza,
  descrizione,
}: UploadDocumentoIdentitaArgs): Promise<UploadResult> {
  if (!cartaceo && !file) return { ok: true, skipped: true };
  if (!personaId) return { ok: false, error: 'persona_id mancante' };

  let filePath = '*Non disponibile perchè acquisito in formato cartaceo*';
  let nomeFile = "Documento di identità (cartaceo)";

  if (!cartaceo && file) {
    const validation = await validatePdfFile(file);
    if (!validation.ok) {
      return { ok: false, error: validation.error ?? 'File non valido' };
    }
    const folder = clienteId || personaId;
    // Difesa in profondita' contro path traversal sullo Storage: il folder
    // deve essere un UUID. Se per errore arriva qualcosa di diverso, rifiuta.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folder)) {
      return { ok: false, error: 'Identificativo destinazione non valido' };
    }
    const timestamp = Date.now();
    // Lowercase dell'estensione finale: la policy RESTRICTIVE "Solo PDF ammessi"
    // su storage.objects confronta storage.extension(name) = 'pdf' (case-sensitive).
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, m => m.toLowerCase());
    filePath = `${folder}/${timestamp}_${safeName}`;

    const { error: storageError } = await supabase.storage
      .from('file_allegati')
      .upload(filePath, file);
    if (storageError) return { ok: false, error: storageError.message };
    nomeFile = file.name;
  }

  // studio_id esplicito: non dipendere dal default DB. Se il context non è
  // ancora popolato, lasciamo a NULL e ci affidiamo alla policy/default DB
  // (la RLS rifiuterà comunque INSERT con studio_id incongruente).
  const studioId = getActiveStudioIdHolder();

  const insertPayload: Record<string, unknown> = {
    cliente_id: clienteId || null,
    persona_id: personaId,
    incarico_id: null,
    tipologia: 'documento_identita',
    nome_file: nomeFile,
    descrizione: descrizione || '',
    file_path: filePath,
    data_scadenza: dataScadenza || null,
  };
  if (studioId) insertPayload.studio_id = studioId;

  const { error: dbError } = await supabase.from('documenti').insert(insertPayload);

  if (dbError) {
    // Se l'INSERT su DB fallisce dopo un upload riuscito, rimuoviamo il file
    // appena caricato per evitare orfani su Storage (file presenti ma senza
    // riga di metadata in `documenti`, quindi invisibili da UI). Best-effort:
    // non blocchiamo il flusso di errore se anche la cleanup fallisce.
    if (!cartaceo && file) {
      await supabase.storage.from('file_allegati').remove([filePath]).catch(() => {});
    }
    return { ok: false, error: dbError.message };
  }
  return { ok: true };
}
