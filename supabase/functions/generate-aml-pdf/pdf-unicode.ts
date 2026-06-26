// pdf-unicode.ts - VERSIONE CON AUTO-NORMALIZATION

// @ts-ignore
import jsPDF from 'https://esm.sh/jspdf@2.5.1';

declare const Deno: any;
type JsPDFDocument = InstanceType<typeof jsPDF>;

export function cleanBase64(base64String: string | null | undefined): string {
  if (!base64String) return '';
  return base64String
    .replace(/-----BEGIN [A-Z\s]+-----/g, '')
    .replace(/-----END [A-Z\s]+-----/g, '')
    .replace(/data:image\/[^;]+;base64,/g, '')
    .replace(/\s/g, '')
    .trim();
}

export async function registerUnicodeFonts(doc: JsPDFDocument) {
  console.log('✅ Font configurati con auto-normalization');
  
  // Sovrascrivi il metodo text() per normalizzare automaticamente
  const originalText = doc.text.bind(doc);
  
  doc.text = function(text: any, x: number, y: number, options?: any) {
    // Se text è una stringa, normalizzala
    if (typeof text === 'string') {
      return originalText(safeText(text), x, y, options);
    }
    // Se text è un array di stringhe, normalizza ognuna
    else if (Array.isArray(text)) {
      return originalText(text.map(t => typeof t === 'string' ? safeText(t) : t), x, y, options);
    }
    // Altrimenti passa come sta
    return originalText(text, x, y, options);
  };
  
  return;
}

export function setFont(
  doc: JsPDFDocument, 
  style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal'
) {
  const fontStyle = style === 'bolditalic' ? 'bold' : style;
  doc.setFont('helvetica', fontStyle);
}

export function setText(
  doc: JsPDFDocument, 
  text: string, 
  x: number, 
  y: number, 
  style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal',
  options?: any
) {
  setFont(doc, style);
  doc.text(safeText(text), x, y, options);
}

export function setTextLines(
  doc: JsPDFDocument,
  lines: string[],
  x: number,
  y: number,
  style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal',
  options?: any
) {
  setFont(doc, style);
  const safeLines = lines.map(line => safeText(line));
  doc.text(safeLines, x, y, options);
}

// Converte testo in versione sicura per PDF
function safeText(text: string): string {
  if (!text) return '';
  
  // Normalizza encoding corrotto
  let result = normalizeText(text);
  
  // Converte caratteri accentati in versione ASCII safe
  // Questo è l'unico modo garantito di funzionare con jsPDF in Supabase
  const replacements: { [key: string]: string } = {
    'à': 'a\'',
    'è': 'e\'',
    'é': 'e\'',
    'ì': 'i\'',
    'ò': 'o\'',
    'ù': 'u\'',
    'À': 'A\'',
    'È': 'E\'',
    'É': 'E\'',
    'Ì': 'I\'',
    'Ò': 'O\'',
    'Ù': 'U\'',
  };
  
  for (const [accented, safe] of Object.entries(replacements)) {
    result = result.split(accented).join(safe);
  }
  
  return result;
}

export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  
  let result = text;
  
  // Rimuovi caratteri Unicode corrotti
  result = result
    .replace(/ï¿½/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/�/g, '');
  
  // Converti encoding corrotto UTF-8 doppio
  result = result
    .replace(/Ã\s/g, 'à')
    .replace(/Ã /g, 'à')
    .replace(/Ã¨/g, 'è')
    .replace(/Ã©/g, 'é')
    .replace(/Ã¬/g, 'ì')
    .replace(/Ã²/g, 'ò')
    .replace(/Ã¹/g, 'ù')
    .replace(/Ã€/g, 'À')
    .replace(/Ã\b/g, 'È')
    .replace(/Ã(?=[^a-z])/g, 'È')
    .replace(/Ã‰/g, 'É')
    .replace(/ÃŒ/g, 'Ì')
    .replace(/Ã'/g, 'Ò')
    .replace(/Ã™/g, 'Ù');
  
  // Caratteri speciali
  result = result
    .replace(/â€™/g, "'")
    .replace(/['']/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/[""]/g, '"')
    .replace(/â€¦/g, '...')
    .replace(/â€"/g, '-')
    .replace(/[—–]/g, '-')
    .replace(/Â/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return result;
}

export function getCheckboxSymbol(checked: boolean): string {
  return checked ? '[X]' : '[ ]';
}

export async function createPDFWithUnicode(options?: any): Promise<JsPDFDocument> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    ...options
  });
  
  // Sovrascrivi doc.text() per auto-normalizzazione
  await registerUnicodeFonts(doc);
  setFont(doc, 'normal');
  
  return doc;
}