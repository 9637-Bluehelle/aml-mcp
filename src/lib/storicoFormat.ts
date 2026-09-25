import { supabase } from './supabase';
import { getPrestazione } from './aml-data';

// ---------------------------------------------------------------------------
// Formattazione dei valori dello Storico Modifiche per renderli leggibili a un
// utente non tecnico: UUID → nome, true/false → Sì/No, tipologia → etichetta,
// timestamp ISO → data, vuoto → trattino.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(v: string | null | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

// Etichette leggibili per i valori "codificati" salvati come stringa dai trigger.
const TIPO_CLIENTE_LABEL: Record<string, string> = {
  persona_fisica: 'Persona Fisica',
  impresa: 'Impresa',
  professionista: 'Professionista',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Attivo',
  draft: 'Bozza',
};

// Valori codificati dei titolari effettivi (colonne tipo_rapporto / tipo_soggetto).
const TIPO_RAPPORTO_LABEL: Record<string, string> = {
  in_proprio: 'In proprio',
  per_conto_persone: 'Per conto di altre persone',
  societa_ente: 'Società / ente',
  caso_residuale: 'Caso residuale',
};

const TIPO_SOGGETTO_LABEL: Record<string, string> = {
  persona_fisica: 'Persona fisica',
  azienda: 'Azienda',
};

/** Data ISO "solo giorno" (yyyy-mm-dd) → gg/mm/aaaa; lascia invariato il resto.
 *  Riordino testuale (niente `new Date`) per non introdurre shift di fuso orario. */
function formatDateMaybe(v: string | null | undefined): string {
  if (!v) return '';
  if (ISO_DATE_RE.test(v)) {
    const [y, m, d] = v.split('-');
    return `${d}/${m}/${y}`;
  }
  return v;
}

/**
 * Rende leggibile l'oggetto `documento_identita` (colonna JSONB del cliente),
 * che nello storico arriva come stringa JSON grezza. Produce una sola riga tipo
 * "Carta d'identità n. AB123 — Comune di Roma (scad. 01/01/2030)".
 *  - stringa vuota  → documento presente ma senza dati identità (trattato come vuoto)
 *  - null           → valore non parsabile (il chiamante mostra il fallback grezzo)
 */
function formatDocumentoIdentita(value: string): string | null {
  let doc: Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    doc = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const str = (k: string): string => {
    const raw = doc[k];
    return typeof raw === 'string' ? raw.trim() : '';
  };

  const tipo = str('tipo');
  const numero = str('numero');
  const ente = str('ente_rilascio');
  const scadenza = formatDateMaybe(str('data_scadenza'));

  const parti: string[] = [];
  if (tipo) parti.push(tipo);
  if (numero) parti.push(`n. ${numero}`);
  let testa = parti.join(' ');
  if (ente) testa = testa ? `${testa} — ${ente}` : ente;
  if (scadenza) testa = testa ? `${testa} (scad. ${scadenza})` : `scad. ${scadenza}`;

  // Nessun campo identità valorizzato → documento di fatto vuoto: lo trattiamo
  // come gli altri campi vuoti (il chiamante mostrerà "—").
  return testa;
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

  if (sub === 'tipo_cliente') {
    return TIPO_CLIENTE_LABEL[value] || value;
  }

  if (sub === 'status') {
    return STATUS_LABEL[value] || value;
  }

  if (sub === 'tipo_rapporto') {
    return TIPO_RAPPORTO_LABEL[value] || value;
  }

  if (sub === 'tipo_soggetto') {
    return TIPO_SOGGETTO_LABEL[value] || value;
  }

  if (sub === 'documento_identita') {
    const formatted = formatDocumentoIdentita(value);
    if (formatted === null) return value; // non parsabile → mostra il grezzo
    return formatted === '' ? '—' : formatted; // documento vuoto → trattino
  }

  if (sub === 'tipologia_prestazione_id') {
    return getPrestazione(value)?.label || value;
  }

  if (ISO_DT_RE.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }

  // Date "solo giorno" (yyyy-mm-dd): data_nascita, pep/sanzioni_data_verifica,
  // date documento, date incarico... altrimenti resterebbero grezze (es. 2026-07-20).
  if (ISO_DATE_RE.test(value)) {
    return formatDateMaybe(value);
  }

  if (isUuid(value)) {
    return valueMap[value] || getPrestazione(value)?.label || '(non disponibile)';
  }

  return value;
}
