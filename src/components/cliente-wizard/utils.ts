// ==================== UTILITY FUNCTIONS ====================

// ========== VALIDAZIONE ==========
export const normalizeVatOrCF = (raw: string): string => {
  if (!raw) return '';
  const trimmed = raw.trim();
  const onlyDigits = trimmed.replace(/\D+/g, '');
  if (onlyDigits.length === 11) return onlyDigits;
  const maybeCF = trimmed.toUpperCase().replace(/\s+/g, '');
  return maybeCF;
};

export const isValidPIva = (v: string): boolean => /^\d{11}$/.test(v);
export const isValidCF = (v: string): boolean => /^[A-Z0-9]{11,16}$/.test(v);

export const isValidDate = (dateStr: string): boolean => {
  if (!dateStr) return true; // Empty is valid (optional fields)

  let day: number, month: number, year: number;

  // Formato DD/MM/YYYY
  const ddmmyyyy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    day = parseInt(ddmmyyyy[1], 10);
    month = parseInt(ddmmyyyy[2], 10);
    year = parseInt(ddmmyyyy[3], 10);
  } else {
    // Formato ISO YYYY-MM-DD
    const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!iso) return false;
    year = parseInt(iso[1], 10);
    month = parseInt(iso[2], 10);
    day = parseInt(iso[3], 10);
  }

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;

  // Check valid day for month
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
};

// ========== GESTIONE DATE dd/mm/yyyy ==========
export const formatDateToISO = (displayDate: string): string => {
  if (!displayDate) return '';
  try {
    // Rimuove spazi extra e normalizza
    const cleaned = displayDate.trim().replace(/\s+/g, '');
    const parts = cleaned.split('/');
    if (parts.length !== 3) return '';
    const [day, month, year] = parts;
    // Valida che siano numeri
    if (isNaN(parseInt(day)) || isNaN(parseInt(month)) || isNaN(parseInt(year))) return '';
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  } catch {
    return '';
  }
};

export const formatDateForDB = (displayDate: string): string | null => {
  if (!displayDate || displayDate.trim() === '') return null;
  const isoDate = formatDateToISO(displayDate);
  return isoDate === '' ? null : isoDate;
};

/** Normalizza una data in formato dd/mm/yyyy, accettando sia ISO (yyyy-mm-dd[Thh:mm…])
 *  che dd/mm/yyyy (anche senza zero-padding o con separatori `-`/`.`).
 *  Ritorna '' se l'input è vuoto / non riconoscibile come data, così il dato
 *  in `anagrafica_soggetti` resta sempre coerente.
 *  NB: vive qui (modulo neutro, no React/DOM) per essere importabile anche dal servizio
 *  condiviso `clienteService` e dal server MCP. Ri-esportato da PersonaFisicaForm per i
 *  consumatori storici. */
export const normalizeDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const trimmed = String(dateStr).trim();
  if (!trimmed) return '';

  // Formato ISO yyyy-mm-dd (eventuale "T..." per timestamp)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  // Formato dd/mm/yyyy (anche senza padding o con separatori `-` / `.`)
  const itMatch = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (itMatch) {
    const [, d, m, y] = itMatch;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  return '';
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const trimmed = dateStr.trim();
    // Già in formato dd/mm/yyyy - restituisci così com'è
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;
    // Formato ISO yyyy-mm-dd (con eventuale parte T...)
    const datePart = trimmed.split('T')[0];
    const parts = datePart.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    return trimmed;
  } catch {
    return '';
  }
};

// ========== UTILITY ==========
export const extractLocationParts = (locationStr: string): { city: string; province: string } => {
  if (!locationStr) return { city: '', province: '' };
  if (locationStr.includes('(')) {
    const parts = locationStr.split('(');
    const city = parts[0].trim();
    const province = parts[1]?.replace(')', '').trim() || '';
    return { city, province };
  }
  return { city: locationStr, province: '' };
};

// ========== ESPORTAZIONE JSON API ==========
export const exportAPIDataToJSON = (data: any, companyName: string): string | null => {
  try {
    // Formatta la data corrente come gg-mm-aaaa
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}-${month}-${year}`;

    // Pulisce il nome dell'impresa per il nome del file
    const cleanCompanyName = companyName
      .replace(/[^a-zA-Z0-9\s]/g, '-')  // Sostituisce caratteri speciali con -
      .replace(/\s+/g, '-')              // Sostituisce spazi con -
      .replace(/-+/g, '-')               // Rimuove trattini multipli
      .replace(/^-|-$/g, '');            // Rimuove trattini all'inizio/fine

    const fileName = `${cleanCompanyName}-${dateStr}.json`;

    // Crea il blob JSON
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Crea link di download e simula il click
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    
    // Pulizia
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return fileName;
  } catch (error) {
    console.error('Errore durante l\'esportazione JSON:', error);
    return null;
  }
};

// ========== API HELPERS ==========
export const getLegalRepresentative = (managers: any[]): any => {
  if (!managers || managers.length === 0) return null;

  for (const manager of managers) {
    if (manager.isLegalRepresentative && manager.name) {
      return manager;
    }
  }

  for (const manager of managers) {
    if (manager.name) {
      return manager;
    }
  }

  return null;
};
