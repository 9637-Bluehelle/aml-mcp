import { supabase } from './supabase';
import { getPrestazione } from './aml-data';

// ---------------------------------------------------------------------------
// Formattazione dei valori dello Storico Modifiche per renderli leggibili a un
// utente non tecnico: UUID → nome, true/false → Sì/No, tipologia → etichetta,
// timestamp ISO → data, vuoto → trattino.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function isUuid(v: string | null | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

interface StoricoRowValues {
  valore_precedente: string | null;
  valore_nuovo: string | null;
}

/**
 * Costruisce una mappa UUID → etichetta leggibile per i valori dello storico
 * che sono riferimenti a persone/aziende (persona_id, rappresentante_persona_id,
 * …). Gli UUID vengono risolti via anagrafica_soggetti (nome_cognome).
 * Best-effort: un id non risolto resta semplicemente fuori dalla mappa.
 */
export async function buildValueLabelMap(
  rows: StoricoRowValues[],
): Promise<Record<string, string>> {
  const uuids = new Set<string>();
  for (const r of rows) {
    if (isUuid(r.valore_precedente)) uuids.add(r.valore_precedente);
    if (isUuid(r.valore_nuovo)) uuids.add(r.valore_nuovo);
  }
  if (uuids.size === 0) return {};

  const map: Record<string, string> = {};
  try {
    // Senza filtro deleted_at: una persona cestinata va comunque mostrata col nome.
    const { data } = await supabase
      .from('anagrafica_soggetti')
      .select('id, nome_cognome')
      .in('id', [...uuids]);
    for (const a of (data ?? []) as Array<{ id: string; nome_cognome: string | null }>) {
      if (a.nome_cognome) map[a.id] = a.nome_cognome;
    }
  } catch {
    /* best effort */
  }
  return map;
}

/**
 * Valore da mostrare nello storico:
 *  - vuoto/null            → '—'
 *  - 'true' / 'false'      → 'Sì' / 'No'
 *  - tipologia prestazione → etichetta leggibile
 *  - timestamp ISO         → data gg/mm/aaaa
 *  - UUID                  → nome risolto (o '(non disponibile)' se sconosciuto)
 *  - altrimenti            → valore così com'è
 */
export function formatStoricoValue(
  value: string | null | undefined,
  campo: string,
  valueMap: Record<string, string>,
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (value === 'true') return 'Sì';
  if (value === 'false') return 'No';

  // Campo con prefisso scritto dai trigger (es. 'titolare.persona_id').
  const sub = campo.includes('.') ? campo.slice(campo.lastIndexOf('.') + 1) : campo;

  if (sub === 'tipologia_prestazione_id') {
    return getPrestazione(value)?.label || value;
  }

  if (ISO_DT_RE.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }

  if (isUuid(value)) {
    return valueMap[value] || getPrestazione(value)?.label || '(non disponibile)';
  }

  return value;
}
