import XLSX from 'xlsx';
import { analyzeWorkbookBuffer } from './src/lib/clienteImport.ts';

function makeBufferWith(headers: unknown[], rows: unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Foglio1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as unknown as ArrayBuffer;
}

const buf = makeBufferWith(['', '', ''], [['Cognome', 'Nome', 'Codice Fiscale'], ['Rossi', 'Mario', 'RSSMRA80A01H501Z']]);
const a = analyzeWorkbookBuffer(buf);
console.log('headerRowIndex', a.headerRowIndex);
console.log('headerOptions', a.headerOptions);
