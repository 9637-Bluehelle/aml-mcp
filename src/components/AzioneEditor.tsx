// Editor inline dei campi "sicuri" di un'azione di piano AI (PianoApprovazione, modalità Modifica).
// L'utente può correggere i dati proposti dall'AI PRIMA di approvare, operando direttamente sugli
// `args` dell'azione. Sono editabili solo campi descrittivi/scalari (testi, date, importi, punteggi
// RT2 1-4, sì/no): le ASSOCIAZIONI (cliente_id, incarico_id, tipologia_prestazione_id — UUID) NON
// sono modificabili qui, perché cambiarle a mano romperebbe i collegamenti; per quelle si chiede
// all'AI un piano aggiornato. Si mostrano solo i campi effettivamente valorizzati dall'AI.

import { Fragment } from 'react';
import { formatDateToISO, normalizeDate } from './cliente-wizard/utils';

export type CampoTipo = 'text' | 'textarea' | 'date' | 'number' | 'bool' | 'score';
export interface CampoEditabile { key: string; label: string; tipo: CampoTipo; gruppo?: string }

const CAMPI_BOZZA_CLIENTE: CampoEditabile[] = [
    { key: 'codice_cliente', label: 'Codice cliente', tipo: 'text', gruppo: 'Anagrafica' },
    // Persona fisica
    { key: 'nome_cognome_pf', label: 'Nome e cognome', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'codice_fiscale_pf', label: 'Codice fiscale', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'data_nascita_pf', label: 'Data di nascita', tipo: 'date', gruppo: 'Anagrafica' },
    { key: 'luogo_nascita_pf', label: 'Luogo di nascita', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'provincia_nascita_pf', label: 'Provincia di nascita', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'nazionalita_pf', label: 'Nazionalità', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'professione_pf', label: 'Professione', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'residenza_pf', label: 'Residenza', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'pep_pf', label: 'PEP', tipo: 'bool', gruppo: 'Verifiche' },
    { key: 'sanzioni_pf', label: 'In liste sanzioni', tipo: 'bool', gruppo: 'Verifiche' },
    { key: 'note_verifica_pf', label: 'Note di verifica', tipo: 'textarea', gruppo: 'Verifiche' },
    // Impresa
    { key: 'ragione_sociale', label: 'Ragione sociale', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'partita_iva_impresa', label: 'Partita IVA', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'codice_fiscale_impresa', label: 'Codice fiscale impresa', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'natura_giuridica', label: 'Natura giuridica', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'paese', label: 'Paese', tipo: 'text', gruppo: 'Sede e attività' },
    { key: 'indirizzo', label: 'Indirizzo sede', tipo: 'text', gruppo: 'Sede e attività' },
    { key: 'codice_ateco_impresa', label: 'Codice ATECO', tipo: 'text', gruppo: 'Sede e attività' },
    { key: 'attivita_svolta_impresa', label: 'Attività svolta', tipo: 'textarea', gruppo: 'Sede e attività' },
    { key: 'rappresentante_legale', label: 'Rappresentante legale', tipo: 'text', gruppo: 'Rappresentante' },
    { key: 'codice_fiscale_rappresentante', label: 'CF rappresentante', tipo: 'text', gruppo: 'Rappresentante' },
    { key: 'partita_iva_rappresentante', label: 'P.IVA rappresentante', tipo: 'text', gruppo: 'Rappresentante' },
    { key: 'data_nascita_rappresentante', label: 'Data di nascita rappr.', tipo: 'date', gruppo: 'Rappresentante' },
    { key: 'luogo_nascita_rappresentante', label: 'Luogo di nascita rappr.', tipo: 'text', gruppo: 'Rappresentante' },
    { key: 'residenza_rappresentante', label: 'Residenza rappresentante', tipo: 'text', gruppo: 'Rappresentante' },
    { key: 'pep_impresa', label: 'PEP', tipo: 'bool', gruppo: 'Verifiche' },
    { key: 'sanzioni_impresa', label: 'In liste sanzioni', tipo: 'bool', gruppo: 'Verifiche' },
    { key: 'note_verifica_impresa', label: 'Note di verifica', tipo: 'textarea', gruppo: 'Verifiche' },
    // Professionista
    { key: 'nome_cognome_prof', label: 'Nome e cognome', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'codice_fiscale_prof', label: 'Codice fiscale', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'partita_iva_prof', label: 'Partita IVA', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'data_nascita_prof', label: 'Data di nascita', tipo: 'date', gruppo: 'Anagrafica' },
    { key: 'luogo_nascita_prof', label: 'Luogo di nascita', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'provincia_nascita_prof', label: 'Provincia di nascita', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'nazionalita_prof', label: 'Nazionalità', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'professione_prof', label: 'Professione', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'residenza_prof', label: 'Residenza', tipo: 'text', gruppo: 'Anagrafica' },
    { key: 'codice_ateco_prof', label: 'Codice ATECO', tipo: 'text', gruppo: 'Sede e attività' },
    { key: 'pep_prof', label: 'PEP', tipo: 'bool', gruppo: 'Verifiche' },
    { key: 'sanzioni_prof', label: 'In liste sanzioni', tipo: 'bool', gruppo: 'Verifiche' },
    { key: 'note_verifica_prof', label: 'Note di verifica', tipo: 'textarea', gruppo: 'Verifiche' },
  ];

const CAMPI_INCARICO: CampoEditabile[] = [
    { key: 'codice_incarico', label: 'Codice incarico', tipo: 'text' },
    { key: 'descrizione', label: 'Descrizione', tipo: 'textarea' },
    { key: 'scopo_natura', label: 'Scopo e natura', tipo: 'textarea' },
    { key: 'data_inizio', label: 'Data inizio', tipo: 'date' },
    { key: 'data_fine', label: 'Data fine', tipo: 'date' },
    { key: 'importo_stimato', label: 'Importo stimato (€)', tipo: 'number' },
    { key: 'relazioni_cliente_te', label: 'Relazioni cliente / TE', tipo: 'textarea' },
    { key: 'provenienza_fondi', label: 'Provenienza fondi', tipo: 'text' },
    { key: 'mezzi_pagamento', label: 'Mezzi di pagamento', tipo: 'text' },
    { key: 'conferma_fondi_leciti', label: 'Conferma fondi leciti', tipo: 'bool' },
  ];

// Mappa per tool dei campi sicuri (ordine = ordine di visualizzazione). Allineata ai costruttori
// di righe in dettaglioAzioni.ts, ma SENZA gli UUID/associazioni. Le chiavi annidate (RT2) usano
// la notazione con punto (es. "tabella_a.naturaGiuridica").
const CAMPI: Record<string, CampoEditabile[]> = {
  crea_bozza_cliente: CAMPI_BOZZA_CLIENTE,
  modifica_cliente: CAMPI_BOZZA_CLIENTE,
  crea_soggetto: [
    { key: 'nome_cognome', label: 'Nome / ragione sociale', tipo: 'text' },
    { key: 'codice_fiscale', label: 'Codice fiscale', tipo: 'text' },
    { key: 'partita_iva', label: 'Partita IVA', tipo: 'text' },
    { key: 'data_nascita', label: 'Data di nascita', tipo: 'date' },
    { key: 'luogo_nascita', label: 'Luogo di nascita', tipo: 'text' },
    { key: 'provincia_nascita', label: 'Provincia di nascita', tipo: 'text' },
    { key: 'nazionalita', label: 'Nazionalità', tipo: 'text' },
    { key: 'professione', label: 'Professione / attività', tipo: 'text' },
    { key: 'residenza', label: 'Residenza / sede', tipo: 'text' },
    { key: 'natura_giuridica', label: 'Natura giuridica', tipo: 'text' },
    { key: 'codice_ateco', label: 'Codice ATECO', tipo: 'text' },
    { key: 'pep', label: 'PEP', tipo: 'bool' },
    { key: 'sanzioni', label: 'In liste sanzioni', tipo: 'bool' },
  ],
  crea_incarico: CAMPI_INCARICO,
  modifica_incarico: CAMPI_INCARICO, 
  crea_valutazione: [
    { key: 'tabella_a.naturaGiuridica', label: 'Tab. A · Natura giuridica', tipo: 'score' },
    { key: 'tabella_a.attivitaPrevalente', label: 'Tab. A · Attività prevalente', tipo: 'score' },
    { key: 'tabella_a.comportamentoConferimento', label: 'Tab. A · Comportamento al conferimento', tipo: 'score' },
    { key: 'tabella_a.areaClienteControparte', label: 'Tab. A · Area cliente/controparte', tipo: 'score' },
    { key: 'tabella_b.tipologia', label: 'Tab. B · Tipologia', tipo: 'score' },
    { key: 'tabella_b.modalita', label: 'Tab. B · Modalità', tipo: 'score' },
    { key: 'tabella_b.ammontare', label: 'Tab. B · Ammontare', tipo: 'score' },
    { key: 'tabella_b.frequenzaVolumeDurata', label: 'Tab. B · Frequenza/volume/durata', tipo: 'score' },
    { key: 'tabella_b.ragionevolezza', label: 'Tab. B · Ragionevolezza', tipo: 'score' },
    { key: 'tabella_b.areaDestinazione', label: 'Tab. B · Area destinazione', tipo: 'score' },
    { key: 'note', label: 'Note', tipo: 'textarea' },
  ],
};

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Set immutabile su un percorso (anche annidato, es. "tabella_a.naturaGiuridica"). */
export function setArgPath(args: Record<string, any>, path: string, value: any): Record<string, any> {
  const [head, ...rest] = path.split('.');
  if (rest.length === 0) return { ...args, [head]: value };
  return { ...args, [head]: setArgPath((args?.[head] as Record<string, any>) ?? {}, rest.join('.'), value) };
}
// Campi da mostrare sempre nell'editor anche se assenti negli args (l'utente potrebbe volerli compilare).
const CAMPI_SEMPRE_VISIBILI: Partial<Record<string, Set<string>>> = {
  modifica_cliente: new Set(['codice_cliente', 'ragione_sociale', 'nome_cognome_pf', 'nome_cognome_prof']),
};

// Campi nome mutuamente esclusivi per modifica_cliente: ne appare solo uno.
const NOME_FIELDS_MODIFICA = ['ragione_sociale', 'nome_cognome_pf', 'nome_cognome_prof'];

export function campiEditabiliPresenti(tool: string, args: Record<string, any>): CampoEditabile[] {
  const sempreVisibili = CAMPI_SEMPRE_VISIBILI[tool] ?? new Set();

  // Per modifica_cliente: tra i tre campi nome, mostra solo quello con valore;
  // se nessuno ce l'ha (pre-popolazione non arrivata), mostra ragione_sociale come default.
  const campoNomeAttivo = tool === 'modifica_cliente'
    ? (NOME_FIELDS_MODIFICA.find((k) => args[k] && String(args[k]).trim() !== '') ?? 'ragione_sociale')
    : null;

  return (CAMPI[tool] ?? []).filter((c) => {
    // Mutua esclusione campi nome
    if (campoNomeAttivo && NOME_FIELDS_MODIFICA.includes(c.key)) {
      return c.key === campoNomeAttivo;
    }
    if (sempreVisibili.has(c.key)) return true;
    const v = getPath(args, c.key);
    if (v === undefined || v === null) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    return true;
  });
}

/** Indica se un tool ha almeno un campo editabile (per decidere se mostrare il pulsante Modifica). */
export function haCampiEditabili(tool: string, args: Record<string, any>): boolean {
  return campiEditabiliPresenti(tool, args).length > 0;
}

function CampoInput({ campo, value, onChange }: { campo: CampoEditabile; value: any; onChange: (v: any) => void }) {
  const base = 'border border-gray-300 rounded-md px-2 py-1 text-xs w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  switch (campo.tipo) {
    case 'textarea':
      return <textarea value={value ?? ''} rows={2} onChange={(e) => onChange(e.target.value)} className={base} />;
    case 'date': {
      // Formato canonico delle date in tutto il sistema: dd/mm/yyyy (vedi schemi MCP). L'<input
      // type="date"> lavora però in ISO, quindi convertiamo: dd/mm/yyyy → ISO per il `value` e
      // ISO → dd/mm/yyyy in `onChange`, così l'arg salvato resta dd/mm/yyyy (eseguibile dai
      // servizi). Accettiamo anche un valore già ISO (retrocompat) normalizzandolo per la vista.
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : formatDateToISO(String(value ?? ''));
      return (
        <input
          type="date"
          value={iso}
          onChange={(e) => onChange(e.target.value ? normalizeDate(e.target.value) : '')}
          className={base}
        />
      );
    }
    case 'number':
      return <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={base} />;
    case 'bool':
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      );
    case 'score':
      return (
        <select value={String(value ?? '')} onChange={(e) => onChange(Number(e.target.value))} className={`${base} bg-white`}>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      );
    default:
      return <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={base} />;
  }
}

function TitolariEditor({
  titolari,
  onChange,
}: {
  titolari: Record<string, any>[];
  onChange: (nuovi: Record<string, any>[]) => void;
}) {
  const base = 'border border-gray-300 rounded-md px-2 py-1 text-xs w-full focus:outline-none focus:ring-2 focus:ring-blue-500';

  const set = (idx: number, key: string, value: any) => {
    const nuovi = titolari.map((t, i) => i === idx ? { ...t, [key]: value } : t);
    onChange(nuovi);
  };

  return (
    <div className="space-y-3">
      {titolari.map((t, idx) => (
        <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Titolare {idx + 1}
          </div>
          {[
            { key: 'nome_cognome', label: 'Nome e cognome', tipo: 'text' },
            { key: 'codice_fiscale', label: 'Codice fiscale', tipo: 'text' },
            { key: 'ruolo', label: 'Ruolo', tipo: 'text' },
            { key: 'note_quota', label: 'Quota / note', tipo: 'text' },
            { key: 'data_nascita', label: 'Data di nascita', tipo: 'date' },
            { key: 'luogo_nascita', label: 'Luogo di nascita', tipo: 'text' },
            { key: 'nazionalita', label: 'Nazionalità', tipo: 'text' },
            { key: 'residenza', label: 'Residenza', tipo: 'text' },
            { key: 'pep_carica', label: 'Carica PEP', tipo: 'text' },
          ].filter(({ key }) => t[key] !== undefined && t[key] !== null && t[key] !== '').map(({ key, label, tipo }) => (
            <div key={key} className="grid grid-cols-[9rem_1fr] gap-x-3 items-center">
              <label className="text-xs text-gray-500">{label}</label>
              {tipo === 'date' ? (
                <input type="date"
                  value={/^\d{4}-\d{2}-\d{2}$/.test(String(t[key])) ? String(t[key]) : formatDateToISO(String(t[key] ?? ''))}
                  onChange={(e) => set(idx, key, e.target.value ? normalizeDate(e.target.value) : '')}
                  className={base} />
              ) : (
                <input type="text" value={t[key] ?? ''} onChange={(e) => set(idx, key, e.target.value)} className={base} />
              )}
            </div>
          ))}
          <div className="grid grid-cols-[9rem_1fr] gap-x-3 items-center">
            <label className="text-xs text-gray-500">PEP</label>
            <input type="checkbox" checked={t.is_pep === true}
              onChange={(e) => set(idx, 'is_pep', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AzioneEditor({
  tool,
  args,
  onChange,
}: {
  tool: string;
  args: Record<string, any>;
  onChange: (path: string, value: any) => void;
}) {
  const campi = campiEditabiliPresenti(tool, args);
  const hasTitolari = (tool === 'crea_bozza_cliente' || tool === 'modifica_cliente')
    && Array.isArray(args.titolari_effettivi)
    && args.titolari_effettivi.length > 0;

  if (campi.length === 0 && !hasTitolari) {
    return <p className="text-xs text-gray-400 italic">Questa azione non ha campi modificabili a mano.</p>;
  }
  return (
    <div className="space-y-3">
      {campi.length > 0 && (
        <div className="bg-white rounded-lg p-3 border border-gray-200 space-y-2">
          {campi.map((c, i) => {
            const nuovoGruppo = c.gruppo && c.gruppo !== campi[i - 1]?.gruppo;
            return (
              <Fragment key={c.key}>
                {nuovoGruppo && (
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mt-2 first:mt-0">{c.gruppo}</div>
                )}
                <div className="grid grid-cols-[9rem_1fr] gap-x-3 items-center">
                  <label className="text-xs text-gray-500 break-words">{c.label}</label>
                  <CampoInput campo={c} value={getPath(args, c.key)} onChange={(v) => onChange(c.key, v)} />
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
      {hasTitolari && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Titolari effettivi</div>
          <TitolariEditor
            titolari={args.titolari_effettivi}
            onChange={(nuovi) => onChange('titolari_effettivi', nuovi)}
          />
        </div>
      )}
    </div>
  );
}
