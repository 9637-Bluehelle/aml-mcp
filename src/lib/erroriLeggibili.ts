// Traduce i messaggi d'errore tecnici (Postgres / servizi) in testo leggibile in italiano per
// l'utente dello studio. Usato dove un errore "grezzo" finirebbe altrimenti sotto gli occhi
// dell'utente: esito per-azione dei piani MCP e toast di approvazione/esecuzione.
//
// Regola d'oro: se NESSUN pattern noto combacia, restituisce il messaggio originale invariato —
// così gli errori imprevisti non vengono mai nascosti (e restano diagnosticabili). Il dettaglio
// tecnico completo resta comunque salvato in `esito.error` sul piano e leggibile dall'AI.

// Constraint UNIQUE noti → spiegazione mirata. Sono i duplicati più frequenti nei piani MCP
// (creazione cliente / incarico). La chiave è il nome del vincolo così come lo riporta Postgres.
const VINCOLI_UNIQUE: Record<string, string> = {
  clienti_codice_cliente_studio_unique:
    'Esiste già un cliente con questo codice nello studio. Verifica prima di ricrearlo.',
  incarichi_codice_incarico_key:
    'Esiste già un incarico con questo codice. Usa un codice incarico diverso o verifica se ' +
    "l'incarico è già presente.",
};

/**
 * Restituisce un messaggio d'errore adatto all'utente. Accetta una stringa, un Error o qualsiasi
 * valore (ne estrae `.message` se presente). Su pattern non riconosciuti torna il testo originale.
 */
export function umanizzaErrore(raw: unknown): string {
  const msg =
    typeof raw === 'string' ? raw : ((raw as any)?.message ?? String(raw ?? ''));
  if (!msg) return 'Si è verificato un errore imprevisto.';

  // 1. Violazione UNIQUE: `duplicate key value violates unique constraint "<nome>"`
  const dup = msg.match(/duplicate key value violates unique constraint "([^"]+)"/i);
  if (dup) {
    return (
      VINCOLI_UNIQUE[dup[1]] ??
      'Esiste già un record con questi dati (valore duplicato): verifica se è già presente prima di ricrearlo.'
    );
  }

  // 2. Chiave esterna: un dato collegato non esiste (o è stato rimosso).
  if (/violates foreign key constraint/i.test(msg)) {
    return 'Un dato collegato (cliente, incarico o persona) non esiste o non è più disponibile. Aggiorna la pagina e riprova.';
  }

  // 3. Campo obbligatorio mancante.
  const notNull = msg.match(/null value in column "([^"]+)"[^]*violates not-null/i);
  if (notNull) {
    return `Manca un dato obbligatorio ("${notNull[1]}"). Completa il campo e riprova.`;
  }

  // 4. Valore non ammesso da un CHECK constraint.
  if (/violates check constraint/i.test(msg)) {
    return 'Uno dei valori inseriti non è ammesso. Controlla i dati e riprova.';
  }

  // 5. Permessi / RLS: l'utente non può scrivere o i dati non sono del suo studio.
  if (/row-level security|permission denied|not authorized/i.test(msg)) {
    return 'Non hai i permessi per completare questa operazione, oppure i dati non appartengono al tuo studio.';
  }

  return msg;
}
