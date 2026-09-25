// Validazione file upload con difesa in profondita':
// 1. Estensione del nome file
// 2. MIME type dichiarato dal browser
// 3. Magic bytes (firma interna del file) — non bypassabile rinominando
// 4. Dimensione massima

export const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface ValidatePdfOptions {
  maxBytes?: number;
}

// Firma PDF: "%PDF-" = 0x25 0x50 0x44 0x46 0x2D
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2D];

async function readFirstBytes(file: File, n: number): Promise<Uint8Array> {
  const slice = file.slice(0, n);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

function matchesMagic(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export async function validatePdfFile(
  file: File,
  opts: ValidatePdfOptions = {}
): Promise<ValidationResult> {
  const maxBytes = opts.maxBytes ?? MAX_PDF_SIZE_BYTES;

  if (!file || file.size === 0) {
    return { ok: false, error: 'File vuoto o non valido.' };
  }

  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `File troppo grande (${formatBytes(file.size)}). Dimensione massima: ${formatBytes(maxBytes)}.`,
    };
  }

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return { ok: false, error: 'Sono ammessi solo file in formato PDF.' };
  }

  // MIME: accettiamo 'application/pdf' o stringa vuota (alcuni OS non lo settano).
  // Un MIME diverso e' un segnale forte di non-PDF: rifiutiamo subito.
  if (file.type && file.type !== 'application/pdf') {
    return { ok: false, error: 'Il file non risulta essere un PDF.' };
  }

  // Magic bytes: decisivo — non bypassabile rinominando.
  let signature: Uint8Array;
  try {
    signature = await readFirstBytes(file, PDF_MAGIC.length);
  } catch {
    return { ok: false, error: 'Impossibile leggere il file.' };
  }

  if (!matchesMagic(signature, PDF_MAGIC)) {
    return {
      ok: false,
      error: 'Il file non e\' un PDF valido (firma interna non corrispondente).',
    };
  }

  return { ok: true };
}
