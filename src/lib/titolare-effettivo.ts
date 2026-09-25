/**
 * Titolare Effettivo - Catene di Controllo
 *
 * Implementa la logica di individuazione del titolare effettivo secondo:
 * - Art. 20 D.Lgs. 231/2007
 * - Documento CNDCEC Ottobre 2024 "L'individuazione del TE nelle società e negli enti"
 * - FAQ MEF/BdI/UIF 20 novembre 2023
 * - Art. 2359 c.c. (società controllate e collegate)
 *
 * Applicazione SCALARE dei criteri (art. 20):
 * 1° livello - Proprietà diretta/indiretta >25% del capitale (co. 1-2)
 * 2° livello - Controllo: maggioranza voti in assemblea ordinaria (co. 3)
 * 3° livello - Residuale: poteri di amministrazione/direzione (co. 5)
 */

// ==================== TYPES ====================

/** Tipo di entità nella catena partecipativa */
export type TipoEntita = 'persona_fisica' | 'societa_capitali' | 'societa_persone' | 'fiduciaria' | 'trust' | 'altro_ente';

/** Tipo di controllo rilevante per art. 2359 c.c. */
export type TipoControllo =
  | 'proprieta_diretta'          // Art. 20 co. 1: >25% proprietà diretta
  | 'proprieta_indiretta'        // Art. 20 co. 2: tramite società controllate/fiduciarie
  | 'maggioranza_voti'           // Art. 20 co. 3 lett. a): maggioranza voti assemblea ordinaria
  | 'influenza_dominante_voti'   // Art. 20 co. 3 lett. b): voti sufficienti per influenza
  | 'influenza_dominante_contratto' // Art. 20 co. 3 lett. c): vincoli contrattuali
  | 'patto_parasociale'          // Sindacato di voto / joint venture
  | 'controllo_congiunto'        // Controllo esercitato congiuntamente
  | 'residuale_amministrazione'  // Art. 20 co. 5: poteri di amministrazione/direzione
  | 'usufrutto_pegno';           // Art. 2352 c.c.: usufruttuario/creditore pignoratizio

/** Nodo nella catena partecipativa */
export interface NodoPartecipativo {
  id: string;
  tipo: TipoEntita;
  denominazione: string;
  codice_fiscale?: string;
  persona_id?: string;

  // Dati persona fisica (se tipo = persona_fisica)
  nome_cognome?: string;
  data_nascita?: string;
  residenza?: string;
  is_pep?: boolean;
  pep_carica?: string;

  // Dati società (se tipo != persona_fisica)
  natura_giuridica?: string;
  capitale_sociale?: number;
  sede_legale?: string;
}

/** Arco (partecipazione) tra due nodi */
export interface ArcoPartecipativo {
  id: string;
  /** ID del nodo che possiede la partecipazione */
  da_nodo_id: string;
  /** ID del nodo posseduto */
  a_nodo_id: string;

  /** Percentuale di capitale posseduto (0-100) */
  percentuale_capitale: number;
  /** Percentuale di diritti di voto in assemblea ordinaria (0-100), se diversa dal capitale */
  percentuale_voti?: number;
  /** Tipo di controllo esercitato */
  tipo_controllo: TipoControllo;
  /** Note aggiuntive (es. descrizione patto parasociale) */
  note?: string;
  /** Se la partecipazione è tramite fiduciaria */
  tramite_fiduciaria?: boolean;
  /** Se è un diritto di usufrutto o pegno */
  diritto_reale?: 'usufrutto' | 'pegno' | 'nuda_proprieta';
}

/** Risultato dell'analisi titolare effettivo */
export interface RisultatoTitolareEffettivo {
  /** Persona fisica identificata come TE */
  nodo: NodoPartecipativo;
  /** Criterio utilizzato per l'identificazione (art. 20 co. 1/2/3/5) */
  criterio: 'proprieta' | 'controllo' | 'residuale';
  /** Dettaglio del tipo di controllo */
  tipo_controllo: TipoControllo;
  /** Percentuale di partecipazione diretta nella società cliente */
  percentuale_diretta: number;
  /** Percentuale di partecipazione indiretta calcolata */
  percentuale_indiretta: number;
  /** Percentuale totale (diretta + indiretta) */
  percentuale_totale: number;
  /** Percorso della catena partecipativa */
  catena: string[];
  /** Note sull'individuazione */
  note: string;
}

/** Struttura completa della catena di controllo per un cliente */
export interface CatenaControllo {
  /** ID del nodo "società cliente" (radice) */
  clienteNodoId: string;
  /** Tutti i nodi nella catena */
  nodi: NodoPartecipativo[];
  /** Tutti gli archi (partecipazioni) */
  archi: ArcoPartecipativo[];
}

/** Risultato completo dell'analisi */
export interface AnalisiTitolareEffettivo {
  /** Titolari effettivi individuati */
  titolari: RisultatoTitolareEffettivo[];
  /** Criterio applicato (scalare: proprietà → controllo → residuale) */
  criterioApplicato: 'proprieta' | 'controllo' | 'residuale';
  /** Se è scattato l'obbligo di astensione (art. 42) */
  obbligoAstensione: boolean;
  /** Motivazione dell'eventuale obbligo di astensione */
  motivoAstensione?: string;
  /** Warning e note per il professionista */
  warnings: string[];
}

// ==================== SOGLIA ====================

/** Soglia di partecipazione rilevante (art. 20 co. 1) */
const SOGLIA_PARTECIPAZIONE = 25; // >25%

// ==================== ALGORITMO ====================

/**
 * Trova tutti i percorsi da un nodo sorgente a un nodo destinazione.
 * Usato per risalire le catene partecipative.
 */
function trovaTuttiPercorsi(
  catena: CatenaControllo,
  daId: string,
  aId: string,
  visitati: Set<string> = new Set()
): string[][] {
  if (daId === aId) return [[aId]];
  visitati.add(daId);

  const percorsi: string[][] = [];
  const archiUscenti = catena.archi.filter(a => a.da_nodo_id === daId);

  for (const arco of archiUscenti) {
    if (!visitati.has(arco.a_nodo_id)) {
      const subPercorsi = trovaTuttiPercorsi(catena, arco.a_nodo_id, aId, new Set(visitati));
      for (const sp of subPercorsi) {
        percorsi.push([daId, ...sp]);
      }
    }
  }

  return percorsi;
}

/**
 * Calcola la percentuale di partecipazione diretta di un nodo nel cliente.
 */
function calcolaPartecipazioneDiretta(
  catena: CatenaControllo,
  nodoId: string
): number {
  const arco = catena.archi.find(
    a => a.da_nodo_id === nodoId && a.a_nodo_id === catena.clienteNodoId
  );
  return arco?.percentuale_capitale ?? 0;
}

/**
 * Calcola la percentuale di partecipazione indiretta.
 *
 * Secondo FAQ MEF/BdI/UIF 20/11/2023:
 * - La soglia >25% si applica al primo livello (capitale della società cliente)
 * - Per i livelli successivi si verifica il CONTROLLO ex art. 2359 c.c.
 *
 * Esempio: A possiede 60% di X, X possiede 40% del cliente
 * → A ha partecipazione indiretta nel cliente (40% tramite X che controlla)
 * → La soglia si verifica sulla società cliente: 40% > 25% ✓
 * → Si verifica che A controlla X: 60% > 50% (maggioranza voti) ✓
 */
function calcolaPartecipazioneIndiretta(
  catena: CatenaControllo,
  personaFisicaId: string
): { percentuale: number; percorsi: string[][] } {
  const percorsi = trovaTuttiPercorsi(catena, personaFisicaId, catena.clienteNodoId);
  let totaleIndiretto = 0;
  const percorsiValidi: string[][] = [];

  for (const percorso of percorsi) {
    // Escludi partecipazione diretta (percorso di lunghezza 2)
    if (percorso.length <= 2) continue;

    // Verifica che ogni anello intermedio sia controllato ex art. 2359 c.c.
    let percorsoValido = true;
    let quotaAlCliente = 0;

    for (let i = 0; i < percorso.length - 1; i++) {
      const arco = catena.archi.find(
        a => a.da_nodo_id === percorso[i] && a.a_nodo_id === percorso[i + 1]
      );
      if (!arco) { percorsoValido = false; break; }

      if (i === percorso.length - 2) {
        // Ultimo arco: percentuale detenuta nella società cliente
        quotaAlCliente = arco.percentuale_capitale;
      } else {
        // Archi intermedi: verificare il controllo ex art. 2359
        const voti = arco.percentuale_voti ?? arco.percentuale_capitale;
        const haControllo = voti > 50 ||
          arco.tipo_controllo === 'influenza_dominante_voti' ||
          arco.tipo_controllo === 'influenza_dominante_contratto' ||
          arco.tipo_controllo === 'patto_parasociale';

        if (!haControllo) {
          percorsoValido = false;
          break;
        }
      }
    }

    if (percorsoValido && quotaAlCliente > 0) {
      totaleIndiretto += quotaAlCliente;
      percorsiValidi.push(percorso);
    }
  }

  return { percentuale: totaleIndiretto, percorsi: percorsiValidi };
}

/**
 * STEP 1: Individua TE per criterio della proprietà (art. 20, co. 1-2)
 * Tutte le persone fisiche con partecipazione (diretta + indiretta) >25% del capitale del cliente
 */
function individuaTEPerProprieta(catena: CatenaControllo): RisultatoTitolareEffettivo[] {
  const risultati: RisultatoTitolareEffettivo[] = [];
  const personeFisiche = catena.nodi.filter(n => n.tipo === 'persona_fisica');

  for (const pf of personeFisiche) {
    const diretta = calcolaPartecipazioneDiretta(catena, pf.id);
    const { percentuale: indiretta, percorsi } = calcolaPartecipazioneIndiretta(catena, pf.id);
    const totale = diretta + indiretta;

    if (totale > SOGLIA_PARTECIPAZIONE) {
      const tipo: TipoControllo = diretta > SOGLIA_PARTECIPAZIONE
        ? 'proprieta_diretta'
        : 'proprieta_indiretta';

      risultati.push({
        nodo: pf,
        criterio: 'proprieta',
        tipo_controllo: tipo,
        percentuale_diretta: diretta,
        percentuale_indiretta: indiretta,
        percentuale_totale: totale,
        catena: percorsi.length > 0 ? percorsi[0] : [pf.id, catena.clienteNodoId],
        note: diretta > SOGLIA_PARTECIPAZIONE
          ? `Proprietà diretta: ${diretta}% del capitale`
          : `Proprietà indiretta: ${indiretta}% tramite catena partecipativa`
      });
    }
  }

  return risultati;
}

/**
 * STEP 2: Individua TE per criterio del controllo (art. 20, co. 3)
 * Chi controlla la maggioranza dei voti in assemblea ordinaria o esercita influenza dominante
 */
function individuaTEPerControllo(catena: CatenaControllo): RisultatoTitolareEffettivo[] {
  const risultati: RisultatoTitolareEffettivo[] = [];

  // Cerca archi che indicano controllo diretto sulla società cliente
  const archiAlCliente = catena.archi.filter(a => a.a_nodo_id === catena.clienteNodoId);

  for (const arco of archiAlCliente) {
    const nodo = catena.nodi.find(n => n.id === arco.da_nodo_id);
    if (!nodo) continue;

    const voti = arco.percentuale_voti ?? arco.percentuale_capitale;
    const haControlloVoti = voti > 50;
    const haInfluenzaDominante =
      arco.tipo_controllo === 'influenza_dominante_voti' ||
      arco.tipo_controllo === 'influenza_dominante_contratto' ||
      arco.tipo_controllo === 'patto_parasociale' ||
      arco.tipo_controllo === 'controllo_congiunto';

    if (haControlloVoti || haInfluenzaDominante) {
      if (nodo.tipo === 'persona_fisica') {
        risultati.push({
          nodo,
          criterio: 'controllo',
          tipo_controllo: arco.tipo_controllo,
          percentuale_diretta: arco.percentuale_capitale,
          percentuale_indiretta: 0,
          percentuale_totale: arco.percentuale_capitale,
          catena: [nodo.id, catena.clienteNodoId],
          note: haControlloVoti
            ? `Controlla ${voti}% dei voti in assemblea ordinaria`
            : `Influenza dominante: ${arco.tipo_controllo}`
        });
      } else {
        // Risalire la catena per trovare le persone fisiche che controllano questa entità
        const personeFisiche = catena.nodi.filter(n => n.tipo === 'persona_fisica');
        for (const pf of personeFisiche) {
          const percorsi = trovaTuttiPercorsi(catena, pf.id, nodo.id);
          for (const percorso of percorsi) {
            let controllaIntermedio = true;
            for (let i = 0; i < percorso.length - 1; i++) {
              const a = catena.archi.find(
                ar => ar.da_nodo_id === percorso[i] && ar.a_nodo_id === percorso[i + 1]
              );
              if (!a) { controllaIntermedio = false; break; }
              const v = a.percentuale_voti ?? a.percentuale_capitale;
              if (v <= 50 && a.tipo_controllo === 'proprieta_diretta') {
                controllaIntermedio = false;
                break;
              }
            }
            if (controllaIntermedio) {
              risultati.push({
                nodo: pf,
                criterio: 'controllo',
                tipo_controllo: arco.tipo_controllo,
                percentuale_diretta: 0,
                percentuale_indiretta: arco.percentuale_capitale,
                percentuale_totale: arco.percentuale_capitale,
                catena: [...percorso, catena.clienteNodoId],
                note: `Controlla la società ${nodo.denominazione} che detiene ${arco.percentuale_capitale}% del cliente`
              });
            }
          }
        }
      }
    }
  }

  // Deduplica: una persona fisica può apparire più volte
  const unici = new Map<string, RisultatoTitolareEffettivo>();
  for (const r of risultati) {
    const key = r.nodo.id;
    if (!unici.has(key) || r.percentuale_totale > unici.get(key)!.percentuale_totale) {
      unici.set(key, r);
    }
  }

  return Array.from(unici.values());
}

/**
 * STEP 3: Criterio residuale (art. 20, co. 5)
 * Chi ha poteri di amministrazione o direzione della società
 */
function individuaTEResiduale(catena: CatenaControllo): RisultatoTitolareEffettivo[] {
  const risultati: RisultatoTitolareEffettivo[] = [];

  const archiAlCliente = catena.archi.filter(
    a => a.a_nodo_id === catena.clienteNodoId &&
      a.tipo_controllo === 'residuale_amministrazione'
  );

  for (const arco of archiAlCliente) {
    const nodo = catena.nodi.find(n => n.id === arco.da_nodo_id);
    if (!nodo || nodo.tipo !== 'persona_fisica') continue;

    risultati.push({
      nodo,
      criterio: 'residuale',
      tipo_controllo: 'residuale_amministrazione',
      percentuale_diretta: arco.percentuale_capitale,
      percentuale_indiretta: 0,
      percentuale_totale: arco.percentuale_capitale,
      catena: [nodo.id, catena.clienteNodoId],
      note: 'Titolare di poteri di amministrazione o direzione della società (criterio residuale art. 20, co. 5)'
    });
  }

  return risultati;
}

/**
 * Analisi completa del titolare effettivo con applicazione scalare dei criteri.
 *
 * Ordine di applicazione (art. 20 D.Lgs. 231/2007):
 * 1. Proprietà >25% (diretta e indiretta)
 * 2. Controllo (maggioranza voti, influenza dominante, patti parasociali)
 * 3. Residuale (poteri di amministrazione/direzione)
 *
 * Se nessun criterio è soddisfatto → obbligo di astensione (art. 42)
 */
export function analizzaTitolareEffettivo(catena: CatenaControllo): AnalisiTitolareEffettivo {
  const warnings: string[] = [];

  // Validazioni
  const clienteNodo = catena.nodi.find(n => n.id === catena.clienteNodoId);
  if (!clienteNodo) {
    return {
      titolari: [],
      criterioApplicato: 'proprieta',
      obbligoAstensione: true,
      motivoAstensione: 'Nodo cliente non trovato nella catena',
      warnings: ['Errore: nodo cliente non presente nella struttura']
    };
  }

  // Per persone fisiche, il TE è il cliente stesso
  if (clienteNodo.tipo === 'persona_fisica') {
    return {
      titolari: [{
        nodo: clienteNodo,
        criterio: 'proprieta',
        tipo_controllo: 'proprieta_diretta',
        percentuale_diretta: 100,
        percentuale_indiretta: 0,
        percentuale_totale: 100,
        catena: [clienteNodo.id],
        note: 'Cliente persona fisica: titolare effettivo coincide con il cliente'
      }],
      criterioApplicato: 'proprieta',
      obbligoAstensione: false,
      warnings: []
    };
  }

  // STEP 1: Criterio della proprietà (>25%)
  const tePerProprieta = individuaTEPerProprieta(catena);
  if (tePerProprieta.length > 0) {
    // Verifica se qualcuno è PPE
    for (const te of tePerProprieta) {
      if (te.nodo.is_pep) {
        warnings.push(`ATTENZIONE: Il TE ${te.nodo.denominazione} è una Persona Politicamente Esposta (PPE). Adeguata verifica rafforzata obbligatoria.`);
      }
    }
    return {
      titolari: tePerProprieta,
      criterioApplicato: 'proprieta',
      obbligoAstensione: false,
      warnings
    };
  }

  warnings.push('Nessuna persona fisica supera la soglia del 25% del capitale. Si passa al criterio del controllo (art. 20, co. 3).');

  // STEP 2: Criterio del controllo
  const tePerControllo = individuaTEPerControllo(catena);
  if (tePerControllo.length > 0) {
    for (const te of tePerControllo) {
      if (te.nodo.is_pep) {
        warnings.push(`ATTENZIONE: Il TE ${te.nodo.denominazione} è una Persona Politicamente Esposta (PPE). Adeguata verifica rafforzata obbligatoria.`);
      }
    }
    return {
      titolari: tePerControllo,
      criterioApplicato: 'controllo',
      obbligoAstensione: false,
      warnings
    };
  }

  warnings.push('Nessun soggetto identificato con il criterio del controllo. Si passa al criterio residuale (art. 20, co. 5).');

  // STEP 3: Criterio residuale
  const teResiduale = individuaTEResiduale(catena);
  if (teResiduale.length > 0) {
    return {
      titolari: teResiduale,
      criterioApplicato: 'residuale',
      obbligoAstensione: false,
      warnings
    };
  }

  // Nessun TE individuato → obbligo di astensione
  return {
    titolari: [],
    criterioApplicato: 'residuale',
    obbligoAstensione: true,
    motivoAstensione: 'Impossibile individuare il titolare effettivo con nessuno dei criteri previsti dall\'art. 20. Obbligo di astensione ex art. 42 D.Lgs. 231/2007.',
    warnings: [
      ...warnings,
      'OBBLIGO DI ASTENSIONE: Non è stato possibile individuare il titolare effettivo. Il professionista non deve instaurare o proseguire il rapporto professionale (art. 42 D.Lgs. 231/2007).'
    ]
  };
}

// ==================== UTILITY ====================

/** Crea una catena di controllo vuota per un nuovo cliente */
export function creaCatenaVuota(clienteNodo: NodoPartecipativo): CatenaControllo {
  return {
    clienteNodoId: clienteNodo.id,
    nodi: [clienteNodo],
    archi: []
  };
}

/** Aggiunge un nodo alla catena */
export function aggiungiNodo(catena: CatenaControllo, nodo: NodoPartecipativo): CatenaControllo {
  if (catena.nodi.some(n => n.id === nodo.id)) return catena;
  return { ...catena, nodi: [...catena.nodi, nodo] };
}

/** Aggiunge un arco (partecipazione) alla catena */
export function aggiungiArco(catena: CatenaControllo, arco: ArcoPartecipativo): CatenaControllo {
  return { ...catena, archi: [...catena.archi, arco] };
}

/** Rimuove un nodo e tutti i suoi archi dalla catena */
export function rimuoviNodo(catena: CatenaControllo, nodoId: string): CatenaControllo {
  if (nodoId === catena.clienteNodoId) return catena; // Non rimuovere il cliente
  return {
    ...catena,
    nodi: catena.nodi.filter(n => n.id !== nodoId),
    archi: catena.archi.filter(a => a.da_nodo_id !== nodoId && a.a_nodo_id !== nodoId)
  };
}

/** Genera un ID univoco per nodi e archi */
export function generaId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
