// Query per recuperare dati dal database Supabase con pulizia encoding

import { SupabaseClient } from '@supabase/supabase-js';
import { AMLDataComplete, ClienteData, TitolareEffettivo, IncaricoData, ValutazioneData } from './types.ts';

/**
 * Pulisce un singolo campo stringa da encoding corrotto
 */
function cleanTextField(value: any): string | undefined {
  if (!value || typeof value !== 'string') return value;
  
  return value
    // Caratteri accentati italiani - conversione esplicita da encoding corrotto
    .replace(/Ã /g, 'à')
    .replace(/Ã¨/g, 'è')
    .replace(/Ã©/g, 'é')
    .replace(/Ã¬/g, 'ì')
    .replace(/Ã²/g, 'ò')
    .replace(/Ã¹/g, 'ù')
    .replace(/Ã€/g, 'À')
    .replace(/Ã/g, 'È')
    .replace(/Ã‰/g, 'É')
    .replace(/ÃŒ/g, 'Ì')
    .replace(/Ã'/g, 'Ò')
    .replace(/Ã™/g, 'Ù')
    
    // Altri caratteri speciali comuni
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€¦/g, '...')
    .replace(/â€"/g, '-')
    .replace(/â€"/g, '--')
    
    // Caratteri Unicode malformati
    .replace(/ï¿½/g, '')
    .replace(/Â½/g, '½')
    .replace(/Â¼/g, '¼')
    
    // Apostrofi e virgolette
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    
    // Normalizza spazi multipli
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pulisce ricorsivamente tutti i campi stringa di un oggetto
 */
function cleanObject<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  
  const cleaned = { ...obj };
  
  for (const key in cleaned) {
    const value = cleaned[key];
    
    if (typeof value === 'string') {
      cleaned[key] = cleanTextField(value) as any;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      cleaned[key] = cleanObject(value);
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map((item: any) =>
        typeof item === 'string' ? cleanTextField(item) :
        typeof item === 'object' ? cleanObject(item) :
        item
      ) as any;
    }
  }
  
  return cleaned;
}

export async function getAMLData(
  supabase: SupabaseClient,
  clienteId: string,
  incaricoId: string
): Promise<AMLDataComplete> {
  // Query 1: Dati cliente completi + rappresentante legale (via FK rappresentante_persona_id).
  // I dati del rappresentante vivono in anagrafica_soggetti e vengono fatti flatten in cliente.*
  // per compatibilità col rendering PDF/DOCX. Include il tipo_soggetto per distinguere PF/azienda.
  const { data: cliente, error: clienteError } = await supabase
    .from('clienti')
    .select(`
      *,
      rappresentante:anagrafica_soggetti!rappresentante_persona_id(
        tipo_soggetto, nome_cognome, codice_fiscale,
        data_nascita, luogo_nascita, provincia_nascita, nazionalita,
        residenza, professione,
        documento_tipo, documento_numero, documento_ente_rilascio,
        documento_data_rilascio, documento_data_scadenza,
        partita_iva, natura_giuridica, codice_ateco
      )
    `)
    .eq('id', clienteId)
    .single();

  if (clienteError || !cliente) {
    throw new Error(`Errore recupero cliente: ${clienteError?.message || 'Cliente non trovato'}`);
  }

  // Flatten campi rappresentante nel record cliente (override delle colonne denormalizzate
  // legacy su clienti, che potrebbero essere stale per i record salvati con il flusso nuovo).
  const rl = (cliente as any).rappresentante;
  if (rl) {
    (cliente as any).rappresentante_legale = rl.nome_cognome || (cliente as any).rappresentante_legale || '';
    (cliente as any).codice_fiscale_rappresentante = rl.codice_fiscale || (cliente as any).codice_fiscale_rappresentante || '';
    (cliente as any).data_nascita_rappresentante = rl.data_nascita || (cliente as any).data_nascita_rappresentante || '';
    (cliente as any).luogo_nascita_rappresentante = rl.luogo_nascita || (cliente as any).luogo_nascita_rappresentante || '';
    (cliente as any).provincia_nascita_rappresentante = rl.provincia_nascita || (cliente as any).provincia_nascita_rappresentante || '';
    (cliente as any).nazionalita_rappresentante = rl.nazionalita || (cliente as any).nazionalita_rappresentante || '';
    (cliente as any).residenza_rappresentante = rl.residenza || (cliente as any).residenza_rappresentante || '';
    (cliente as any).rappresentante_legale_documento = {
      tipo: rl.documento_tipo || '',
      numero: rl.documento_numero || '',
      data_rilascio: rl.documento_data_rilascio || '',
      data_scadenza: rl.documento_data_scadenza || '',
      ente_rilascio: rl.documento_ente_rilascio || '',
    };
    // Campi azienda del rappresentante
    (cliente as any).tipo_soggetto_rappresentante = rl.tipo_soggetto || 'persona_fisica';
    (cliente as any).partita_iva_rappresentante = rl.partita_iva || '';
    (cliente as any).natura_giuridica_rappresentante = rl.natura_giuridica || '';
    (cliente as any).codice_ateco_rappresentante = rl.codice_ateco || '';
  }
  delete (cliente as any).rappresentante;

  // Query 2: Titolari effettivi — i dati anagrafici (nome, CF, nascita, documento,
  // campi azienda) vivono in anagrafica_soggetti via persona_id e vanno fatti flatten
  // sul record titolare per compatibilità con il rendering PDF/DOCX.
  const { data: titolari, error: titolariError } = await supabase
    .from('titolari_effettivi')
    .select(`
      id, cliente_id, tipo_rapporto, is_pep, pep_carica, note_quota, persona_id,
      anagrafica_soggetti(
        tipo_soggetto, nome_cognome, codice_fiscale, professione,
        luogo_nascita, provincia_nascita, data_nascita,
        nazionalita, residenza,
        documento_tipo, documento_numero, documento_ente_rilascio,
        documento_data_rilascio, documento_data_scadenza,
        partita_iva, natura_giuridica, codice_ateco
      )
    `)
    .eq('cliente_id', clienteId);

  if (titolariError) {
    throw new Error(`Errore recupero titolari effettivi: ${titolariError.message}`);
  }

  // Flatten dei campi anagrafica nel record titolare (formato atteso dai generatori PDF/DOCX)
  const titolariFlat = (titolari || []).map((t: any) => {
    const a = t.anagrafica_soggetti || {};
    return {
      id: t.id,
      cliente_id: t.cliente_id,
      tipo_soggetto: a.tipo_soggetto || 'persona_fisica',
      tipo_rapporto: t.tipo_rapporto,
      nome_cognome: a.nome_cognome || '',
      codice_fiscale: a.codice_fiscale || '',
      professione: a.professione || '',
      comune_nascita: a.luogo_nascita || '',
      provincia_nascita: a.provincia_nascita || '',
      data_nascita: a.data_nascita || '',
      nazionalita: a.nazionalita || '',
      residenza: a.residenza || '',
      documento_tipo: a.documento_tipo || '',
      documento_numero: a.documento_numero || '',
      documento_rilascio_ente: a.documento_ente_rilascio || '',
      documento_rilascio_data: a.documento_data_rilascio || '',
      documento_scadenza: a.documento_data_scadenza || '',
      partita_iva: a.partita_iva || '',
      natura_giuridica: a.natura_giuridica || '',
      codice_ateco: a.codice_ateco || '',
      is_pep: t.is_pep ?? false,
      pep_carica: t.pep_carica || '',
      note_quota: t.note_quota || '',
    };
  });

  // Query 3: Dati incarico (vincolato al cliente per evitare IDOR cross-studio)
  const { data: incarico, error: incaricoError } = await supabase
    .from('incarichi')
    .select('*')
    .eq('id', incaricoId)
    .eq('cliente_id', clienteId)
    .single();

  if (incaricoError || !incarico) {
    throw new Error(`Errore recupero incarico: ${incaricoError?.message || 'Incarico non trovato'}`);
  }

  // Query 4: Nome studio (direttamente da clienti.studio_id -> studi)
  let nomeStudio: string | undefined;
  if (cliente.studio_id) {
    const { data: studioData } = await supabase
      .from('studi')
      .select('nome')
      .eq('id', cliente.studio_id)
      .single();
    nomeStudio = studioData?.nome || undefined;
  }

  // Query 5: Valutazione rischio (la più recente per questo incarico)
  const { data: valutazione } = await supabase
    .from('valutazioni_rischio')
    .select('*')
    .eq('incarico_id', incaricoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Query 6: Numero totale incarichi del cliente (per checkbox "Nuovo Cliente" vs "già identificato")
  const { count: numeroIncarichiCliente } = await supabase
    .from('incarichi')
    .select('*', { count: 'exact', head: true })
    .eq('cliente_id', clienteId);

  // ✅ PULIZIA DATI prima di restituirli
  const cleanedCliente = cleanObject(cliente) as ClienteData;
  const cleanedTitolari = titolariFlat.map(t => cleanObject(t)) as TitolareEffettivo[];
  const cleanedIncarico = cleanObject(incarico) as IncaricoData;
  const cleanedValutazione = valutazione ? cleanObject(valutazione) as ValutazioneData : undefined;

  console.log('✅ Dati puliti da encoding corrotto');

  return {
    cliente: cleanedCliente,
    titolari_effettivi: cleanedTitolari,
    incarico: cleanedIncarico,
    valutazione: cleanedValutazione,
    nome_studio: nomeStudio,
    numero_incarichi_cliente: numeroIncarichiCliente ?? 0,
  };
}