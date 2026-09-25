// ==================== RT1 WIZARD CONSTANTS ====================

import { SezioneWizard, RisposteDettagliate, DescrizioneStudio } from './types';

// Dati vuoti iniziali
export const emptyDescrizioneStudio: DescrizioneStudio = {
  tipologia_giuridica: '',
  anno_inizio_attivita: '',
  sedi: '',
  organizzazione_interna: '',
  peculiarita_e_specializzazioni: '',
  tipologia_prevalente_clientela: '',
  principali_prestazioni_professionali: ''
};

export const emptyRisposteDettagliate: RisposteDettagliate = {
  tipologia_clientela: { scelta_valore: 2.0, note: '' },
  area_geografica_operativita: { scelta_valore: 2.0, note: '' },
  canali_distributivi: { scelta_valore: 2.0, note: '' },
  servizi_professionali_offerti: { scelta_valore: 2.0, note: '' },
  formazione: { scelta_valore: 2.0, note: '' },
  organizzazione_adeguata_verifica: { scelta_valore: 2.0, note: '' },
  organizzazione_conservazione: { scelta_valore: 2.0, note: '' },
  organizzazione_segnalazione_sos: { scelta_valore: 2.0, note: '' }
};

// Sezioni del wizard con istruzioni e criteri
export const SEZIONI_WIZARD: SezioneWizard[] = [
  {
    key: 'tipologia_clientela',
    titolo: 'Tipologia Clientela',
    istruzioni: `La valutazione va effettuata tenendo conto delle caratteristiche oggettive e soggettive della clientela; a titolo esemplificativo, incidono elementi quali il tipo di attività dei clienti (esposta o meno ad infiltrazioni criminali o legata a particolari settori più a rischio), l'inquadramento giuridico, la presenza o meno di organismi o Autorità di controllo (collegio sindacale, revisore, Organismo di Vigilanza ex D.Lgs. 231/2001), la complessità e la dimensione aziendale, il volume e l'ammontare delle transazioni del cliente, la presenza di persone politicamente esposte ovvero di soggetti sottoposti a indagini o procedimenti penali, ovvero aventi legami con soggetti a rischio o censiti in liste c.d. antiterrorismo, la presenza di enti no profit con elementi di potenziale rischio di finanziamento del terrorismo e/o della proliferazione delle armi di distruzione di massa, la qualifica di soggetto destinatario degli obblighi antiriciclaggio in capo allo stesso cliente del professionista.`,
    criteri_rischio: [
      {
        descrizione: 'Un numero molto esiguo di clienti (10%) individuati in sede di adeguata verifica come ad alto rischio',
        indice_rischiosita: 1
      },
      {
        descrizione: 'Un numero molto limitato di clienti (tra il 10 e il 25%) individuati in sede di adeguata verifica come ad alto rischio',
        indice_rischiosita: 2
      },
      {
        descrizione: 'Un numero significativo di clienti (tra il 25% e il 40%) individuati in sede di adeguata verifica come ad alto rischio',
        indice_rischiosita: 3
      },
      {
        descrizione: 'Percentuale molto significativa (superiore al 40%) di clienti ritenuti ad alto rischio',
        indice_rischiosita: 4
      }
    ]
  },
  {
    key: 'area_geografica_operativita',
    titolo: 'Area Geografica di Operatività',
    istruzioni: `L'area geografica di operatività è da riferirsi tanto alla sede (o sedi diverse) dello studio professionale, quanto al territorio in cui si esplica la prestazione professionale a favore del cliente (che può coincidere o meno con la sede di quest'ultimo). Occorre tenere conto delle relazioni con cui le Autorità aggiornano periodicamente la mappa delle zone maggiormente a rischio sia a livello nazionale, sia a livello internazionale (Stati non dotati di adeguati presidi antiriciclaggio o di una normativa antiriciclaggio equivalente a quella italiana).`,
    criteri_rischio: [
      {
        descrizione: 'Un numero molto esiguo di clienti operanti in aree geografiche ritenute ad alto rischio (10%)',
        indice_rischiosita: 1
      },
      {
        descrizione: 'Un numero molto limitato di clienti operanti in aree geografiche ritenute ad alto rischio (tra il 10 e il 25%)',
        indice_rischiosita: 2
      },
      {
        descrizione: 'Un numero significativo di clienti operanti in aree geografiche ritenute ad alto rischio (tra il 25% e il 40%)',
        indice_rischiosita: 3
      },
      {
        descrizione: 'Una percentuale molto significativa (superiore al 40%) di clienti operanti in aree geografiche ritenute ad alto rischio',
        indice_rischiosita: 4
      }
    ]
  },
  {
    key: 'canali_distributivi',
    titolo: 'Canali Distributivi',
    istruzioni: `Qualora i servizi professionali avvengano tramite collaborazioni esterne, corrispondenze, canali di pagamento, occorre tener conto dei relativi rischi, specie se le prestazioni si sviluppano in aree potenzialmente pericolose o distanti rispetto alla sede del professionista. La valutazione deve quindi riguardare il grado di controllo, tracciabilità e protezione di tali relazioni e canali.`,
    note_campo: 'Valutare il livello di rischio da 1.0 (basso - canali diretti e controllati) a 4.0 (alto - canali complessi e/o remoti)'
  },
  {
    key: 'servizi_professionali_offerti',
    titolo: 'Servizi Professionali Offerti',
    istruzioni: `La valutazione deve tener conto dei diversi ambiti di attività professionale, con particolare riguardo a quelle prestazioni maggiormente esposte a tentativi di riciclaggio, finanziamento del terrorismo e/o della proliferazione delle armi di distruzione di massa. A tal proposito sono individuati i diversi livelli di rischio nella Regola Tecnica n. 2, rispettivamente nella Tabella 1 (prestazioni a rischio inerente non significativo) e nella Tabella 2 (prestazioni a rischio inerente poco significativo, abbastanza significativo o molto significativo).`,
    criteri_rischio: [
      {
        descrizione: 'Una percentuale delle prestazioni a rischio inerente non significativo o poco significativo superiore all\'80%',
        indice_rischiosita: 1
      },
      {
        descrizione: 'Una percentuale delle prestazioni a rischio inerente non significativo o poco significativo superiore al 60%',
        indice_rischiosita: 2
      },
      {
        descrizione: 'Una percentuale delle prestazioni a rischio inerente non significativo o poco significativo compresa tra il 45% e il 60%',
        indice_rischiosita: 3
      },
      {
        descrizione: 'Percentuale delle prestazioni a rischio inerente non significativo o poco significativo inferiore al 45%',
        indice_rischiosita: 4
      }
    ]
  },
  {
    key: 'formazione',
    titolo: 'Formazione',
    istruzioni: `Oggetto di valutazione è il livello di aggiornamento della conoscenza della normativa antiriciclaggio in capo a tutti i componenti dello studio (titolare/i, dipendenti, collaboratori, tirocinanti). La formazione va valutata altresì per quanto concerne il grado di conoscenza della norma e degli strumenti a supporto dell'intercettazione/prevenzione dei fenomeni di riciclaggio di denaro e/o finanziamento del terrorismo e della proliferazione delle armi di distruzione di massa, facendo riferimento anche agli indicatori di anomalia, schemi di comportamento anomalo e altri indicatori messi a disposizione delle Autorità attraverso relazioni ufficiali. Altro elemento da tenere in considerazione è la frequenza della attività di formazione e il suo effettivo svolgimento.`,
    note_campo: 'Valutare da 1.0 (formazione strutturata e frequente) a 4.0 (formazione carente o assente)'
  },
  {
    key: 'organizzazione_adeguata_verifica',
    titolo: 'Organizzazione Adeguata Verifica della Clientela',
    istruzioni: `Idoneità delle misure adottate per adempiere agli obblighi previsti dalla legislazione vigente in materia di adeguata verifica e dalle regole tecniche (ad es. esistenza e documentazione, attraverso l'utilizzo di apposita modulistica, di procedure per l'identificazione del cliente, dell'esecutore e del TE).`,
    note_campo: 'Valutare da 1.0 (organizzazione solida e documentata) a 4.0 (organizzazione carente)'
  },
  {
    key: 'organizzazione_conservazione',
    titolo: 'Organizzazione Conservazione Documenti, Dati e Informazioni',
    istruzioni: `Idoneità delle misure adottate per adempiere agli obblighi previsti dalla legislazione vigente in materia di conservazione (cartacea o informatica) e dalle regole tecniche (ad es. istituzione e aggiornamento di un sistema organico di conservazione dei fascicoli della clientela; individuazione dei soggetti legittimati ad alimentare e ad accedere al sistema).`,
    note_campo: 'Valutare da 1.0 (sistema organizzato e conforme) a 4.0 (sistema inadeguato)'
  },
  {
    key: 'organizzazione_segnalazione_sos',
    titolo: 'Organizzazione Segnalazione Operazioni Sospette e Violazioni Uso Contante',
    istruzioni: `Idoneità delle misure adottate per adempiere agli obblighi previsti dalla legislazione vigente in materia di SOS e di comunicazione dell'uso illegittimo del contante (ad es. esistenza di una procedura interna per la rilevazione di anomalie riconducibili ad eventuali operazioni sospette di riciclaggio/FDT/proliferazione; diffusione interna di indici di anomalia nonché delle casistiche di riciclaggio/FDT/proliferazione elaborate dall'UIF).`,
    note_campo: 'Valutare da 1.0 (procedure chiare e applicate) a 4.0 (assenza di procedure)'
  }
];

// Fattori inerenti (Step 2-5)
export const FATTORI_INERENTI_KEYS: (keyof RisposteDettagliate)[] = [
  'tipologia_clientela',
  'area_geografica_operativita',
  'canali_distributivi',
  'servizi_professionali_offerti'
];

// Fattori vulnerabilità (Step 6-7)
export const FATTORI_VULNERABILITA_KEYS: (keyof RisposteDettagliate)[] = [
  'formazione',
  'organizzazione_adeguata_verifica',
  'organizzazione_conservazione',
  'organizzazione_segnalazione_sos'
];

// Configurazione slider
export const SLIDER_CONFIG = {
  min: 1.0,
  max: 4.0,
  step: 0.1,
  default: 2.0
};

// Messaggi di validazione
export const VALIDATION_MESSAGES = {
  DESCRIZIONE_STUDIO_INCOMPLETA: 'Compila tutti i campi della descrizione dello studio professionale',
  VALORE_MANCANTE: 'Seleziona un valore per questa sezione',
  PIANO_MITIGAZIONE_MANCANTE: 'Il piano di mitigazione è obbligatorio',
  VERSION_MANCANTE: 'Inserisci la versione dell\'autovalutazione',
  CREATED_BY_MANCANTE: 'Inserisci il nome del valutatore'
};

// Colori badge rischio
export const RISK_COLORS = {
  low: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  critical: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' }
};

// Mappa step a sezione
export const STEP_TO_SEZIONE_MAP: { [step: number]: keyof RisposteDettagliate | null } = {
  1: null, // Descrizione Studio
  2: 'tipologia_clientela',
  3: 'area_geografica_operativita',
  4: 'canali_distributivi',
  5: 'servizi_professionali_offerti',
  6: 'formazione',
  7: 'organizzazione_adeguata_verifica', // Step 7 avrà 3 sotto-sezioni
  8: null // Riepilogo
};

// Labels step
export const STEP_LABELS = [
  'Descrizione Studio',
  'Tipologia Clientela',
  'Area Geografica',
  'Canali Distributivi',
  'Servizi Professionali',
  'Formazione',
  'Organizzazione Adempimenti',
  'Riepilogo e Piano Mitigazione'
];

// Numero totale di step
export const TOTAL_STEPS = 8;
