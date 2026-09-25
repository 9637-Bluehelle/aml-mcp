// Service per chiamare l'Edge Function che genera i PDF AML

import { supabase } from './supabase';

export type DocumentType = 'av3' | 'av4' | 'both';

export interface GeneratePDFParams {
  clienteId: string;
  incaricoId: string;
  documentType: DocumentType;
}

/**
 * Genera PDF AML (AV.3 Istruttoria e/o AV.4 Dichiarazione)
 * chiamando la Supabase Edge Function
 */
export async function generateAMLPDF(params: GeneratePDFParams): Promise<Blob> {
  const { clienteId, incaricoId, documentType } = params;

  try {
    // Chiama l'Edge Function
    const { data, error } = await supabase.functions.invoke('generate-aml-pdf', {
      body: {
        clienteId,
        incaricoId,
        documentType,
      },
    });

    if (error) {
      console.error('Errore Edge Function:', error);
      throw new Error(`Errore generazione PDF: ${error.message}`);
    }

    // La risposta dovrebbe essere un ArrayBuffer
    if (!data) {
      throw new Error('Nessun dato ricevuto dalla Edge Function');
    }

    // Converti in Blob per il download
    const blob = new Blob([data], { type: 'application/pdf' });
    return blob;
  } catch (error: any) {
    console.error('Errore nella generazione PDF:', error);
    throw new Error(error.message || 'Errore sconosciuto nella generazione PDF');
  }
}

/**
 * Scarica il PDF generato
 */
export function downloadPDF(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Genera e scarica PDF AML in un'unica operazione
 */
export async function generateAndDownloadPDF(
  params: GeneratePDFParams,
  customFilename?: string
): Promise<void> {
  try {
    const blob = await generateAMLPDF(params);
    
    // Genera nome file se non fornito
    let filename = customFilename;
    if (!filename) {
      const timestamp = new Date().toISOString().split('T')[0];
      const typeLabel = params.documentType === 'av3' ? 'AV3_Istruttoria' :
                       params.documentType === 'av4' ? 'AV4_Dichiarazione' :
                       'AML_Documenti';
      filename = `${typeLabel}_${timestamp}.pdf`;
    }
    
    downloadPDF(blob, filename);
  } catch (error: any) {
    throw error;
  }
}
