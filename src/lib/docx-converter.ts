import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  Packer,
  LevelFormat,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  VerticalAlign,
  ShadingType,
  HeightRule
} from 'docx';
import { saveAs } from 'file-saver';
import { getPrestazione } from './aml-data';

// Interfacce tipizzate
interface Cliente {
  ragione_sociale: string | null;
  codice_fiscale: string | null;
  codice_fiscale_rappresentante?: string | null;
  partita_iva: string | null;
  indirizzo: string | null;
  nazionalita: string | null;
  rappresentante_legale: string | null;
  data_nascita_rappresentante?: string | null;
  luogo_nascita_rappresentante?: string | null;
  provincia_nascita_rappresentante?: string | null;
  nazionalita_rappresentante?: string | null;
  residenza_rappresentante?: string | null;
  // Campi rappresentante azienda (popolati quando tipo_soggetto_rappresentante='azienda')
  tipo_soggetto_rappresentante?: 'persona_fisica' | 'azienda' | null;
  partita_iva_rappresentante?: string | null;
  natura_giuridica_rappresentante?: string | null;
  codice_ateco_rappresentante?: string | null;
  rappresentante_legale_documento?: {
    tipo: string;
    numero: string;
    data_rilascio: string;
    data_scadenza: string;
    ente_rilascio: string;
  } | null;
  pep: boolean | null;
  pep_carica?: string | null;
  tipo_cliente?: string | null;
  attivita_svolta?: string | null;
  codice_ateco?: string | null;
  ruolo_dichiarante?: string | null;
}

interface TitolareEffettivo {
  nome_cognome: string;
  codice_fiscale: string | null;
  professione: string | null;
  tipo_rapporto: string;
  // 'persona_fisica' (default) o 'azienda'. Per azienda: nome_cognome=ragione sociale,
  // codice_fiscale=CF azienda, residenza=sede legale, professione=attività svolta.
  tipo_soggetto?: 'persona_fisica' | 'azienda' | null;
  partita_iva?: string | null;
  natura_giuridica?: string | null;
  codice_ateco?: string | null;
  data_nascita?: string | null;
  comune_nascita?: string | null;
  provincia_nascita?: string | null;
  nazionalita?: string | null;
  residenza?: string | null;
  documento_tipo?: string | null;
  documento_numero?: string | null;
  documento_rilascio_data?: string | null;
  documento_scadenza?: string | null;
  documento_rilascio_ente?: string | null;
  is_pep: boolean | null;
  pep_carica?: string | null;
  note_quota?: string | null;
}

interface Incarico {
  descrizione: string | null;
  scopo_natura: string | null;
  codice_incarico: string | null;
  tipologia_prestazione_id?: string | null;
  relazioni_cliente_te: string | null;
  provenienza_fondi: string | null;
  mezzi_pagamento: string | null;
  importo_stimato: number | null;
  data_inizio?: string | null;
}

/** Singolo fattore di rischio come salvato in valutazioni_rischio */
interface FattoreRischio {
  score: number;
  fattoriSelezionati: string[];
  altro: string;
}

/** Supporto retrocompatibile: il campo può essere un oggetto FattoreRischio o un numero semplice */
type FattoreRischioCompat = FattoreRischio | number;

function getFattoreScore(f: FattoreRischioCompat): number {
  if (typeof f === 'number') return f;
  return Number(f?.score ?? 0);
}

function getFattoreSelezionati(f: FattoreRischioCompat): string[] {
  if (typeof f === 'number') return [];
  return f?.fattoriSelezionati ?? [];
}

interface Valutazione {
  rischio_inerente_prestazione: number;
  rischio_specifico: number;
  rischio_effettivo: number;
  classe_rischio: number;
  misure_applicate: string;
  tabella_a_scores: {
    naturaGiuridica: FattoreRischioCompat;
    attivitaPrevalente: FattoreRischioCompat;
    comportamentoConferimento: FattoreRischioCompat;
    areaClienteControparte: FattoreRischioCompat;
  };
  tabella_b_scores?: {
    tipologia: FattoreRischioCompat;
    modalita: FattoreRischioCompat;
    ammontare: FattoreRischioCompat;
    frequenzaVolumeDurata: FattoreRischioCompat;
    ragionevolezza: FattoreRischioCompat;
    areaDestinazione: FattoreRischioCompat;
  } | null;
  created_at: string;
  prossimo_controllo?: string | null;
  note?: string | null;
}

export interface DocumentoAllegato {
  tipologia: string;
  nome_file?: string;
  label?: string;
}

interface AMLData {
  cliente: Cliente;
  titolari_effettivi: TitolareEffettivo[];
  incarico: Incarico;
  valutazione?: Valutazione;
  documenti?: DocumentoAllegato[];
  nome_studio?: string;
  studio_comune_sede?: string | null;
  studio_provincia_sede?: string | null;
  studio_via_piazza_sede?: string | null;
  studio_numero_civico_sede?: string | null;
  studio_nome_proprietario?: string | null;
  studio_cognome_proprietario?: string | null;
  studio_albo_sede?: string | null;
  studio_albo_numero?: string | null;
  studio_albo_sezione?: string | null;
  responsabile_nome?: string | null;
  responsabile_cognome?: string | null;
  /** Numero totale di incarichi del cliente: 1 → spunta "Nuovo Cliente", >1 → "già identificato". */
  numero_incarichi_cliente?: number;
}

// Utility: Formatta data ISO in gg/mm/aaaa
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr || typeof dateStr !== 'string') return 'N/D';
  const trimmed = dateStr.trim();
  if (!trimmed) return 'N/D';

  // Formato italiano già corretto: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const itMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (itMatch) {
    const [, d, m, y] = itMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${year}`;
  }

  // Formato ISO (YYYY-MM-DD) o parsabile da Date
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) return 'N/D';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Utility: Checkbox simboli
function getCheckbox(checked: boolean): string {
  return checked ? '☑' : '☐';
}

// Utility: Colore per score rischio
function getColorForScore(score: number): string {
  if (score >= 3.6) return 'CC0000';      // Rosso scuro - Molto significativo
  if (score >= 2.6) return 'FF6600';      // Arancione - Abbastanza significativo 
  if (score >= 1.6) return 'FFB300';      // Giallo/Oro - Poco significativo
  return '00AA00';                        // Verde - Non significativo
}

// Utility: Colore per classe rischio
function getColorForClasse(classe: number): string {
  if (classe === 4) return 'CC0000';      // Rosso - Classe 4
  if (classe === 3) return 'FF6600';      // Arancione - Classe 3
  if (classe === 2) return 'FFB300';      // Giallo - Classe 2
  return '00AA00';                        // Verde - Classe 1
}

// Utility: Testo classificazione per score
function getClassificationText(score: number): string {
  if (score >= 3.6) return 'Molto significativo';
  if (score >= 2.6) return 'Abbastanza significativo';
  if (score >= 1.6) return 'Poco significativo';
  return 'Non significativo';
}

// Formatta numero in formato italiano (es: 10000 -> "10.000,00")
const formatCurrency = (value: number | string): string => {
  if (!value && value !== 0) return '';
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '';
  return numValue.toLocaleString('it-IT', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

/**
 * Genera e scarica documento DOCX AV.3 - Istruttoria Cliente
 */
// Mappa tipologia documento -> etichetta leggibile
// Importa i label dalla fonte unica in DocumentiAllegati
import { TIPOLOGIE_DOCUMENTO } from '../components/DocumentiAllegati';
const TIPOLOGIA_LABELS: Record<string, string> = Object.fromEntries(
  TIPOLOGIE_DOCUMENTO.map(t => [t.value, t.label])
);

export async function generateBlobDOCX_AV3(data: AMLData): Promise<{ blob: Blob; filename: string }> {
  const { cliente, titolari_effettivi, incarico, numero_incarichi_cliente } = data;
  const today = formatDate(new Date().toISOString());
  const numIncarichi = numero_incarichi_cliente ?? 0;
  // Auto-checkbox AV.3: 1 incarico → "Nuovo Cliente"; >1 → "già identificato"
  const isNuovoCliente = numIncarichi === 1;
  const isGiaIdentificato = numIncarichi > 1;

  // Mappa classe_rischio -> profilo di rischio testuale
  const classeToProfile = (classe?: number): string => {
    if (!classe) return '';
    if (classe === 1) return 'Non significativo';
    if (classe === 2) return 'Poco significativo';
    if (classe === 3) return 'Abbastanza significativo';
    return 'Molto significativo';
  };
  const profiloRischio = data.valutazione ? classeToProfile(data.valutazione.classe_rischio) : '';

  // Mappa classe_rischio -> tipologia adeguata verifica
  const classeToVerifica = (classe?: number): string => {
    if (!classe) return '';
    if (classe <= 1) return 'Semplificata';
    if (classe <= 2) return 'Ordinaria';
    return 'Rafforzata';
  };
  const tipologiaVerifica = data.valutazione ? classeToVerifica(data.valutazione.classe_rischio) : '';

  // Frequenza controllo costante basata sulla classe di rischio
  const classeToFrequenza = (classe?: number): string => {
    if (!classe) return '36 mesi';
    if (classe === 1) return '36 mesi';
    if (classe === 2) return '24 mesi';
    if (classe === 3) return '12 mesi';
    return '6 mesi';
  };
  const frequenzaControllo = data.valutazione ? classeToFrequenza(data.valutazione.classe_rischio) : '';

  // Documenti allegati: tipologia (nome_file), uno per riga
  const tipiDocumentiList = (data.documenti || []).map(d => {
    const tipo = d.label || TIPOLOGIA_LABELS[d.tipologia] || d.tipologia;
    return d.nome_file ? `${tipo} (${d.nome_file})` : tipo;
  });

  const FNT = 'Arial Narrow';

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: { name: FNT },
            size: 20 // 10pt
          }
        },
        heading1: {
          run: {
            font: { name: FNT },
            size: 28, // 14pt
            bold: true
          }
        },
        heading2: {
          run: {
            font: { name: FNT },
            size: 22, // 11pt
            bold: true
          }
        },
        heading3: {
          run: {
            font: { name: FNT },
            size: 20,
            bold: true
          }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1440
          }
        }
      },
      children: [
        // TITOLO
        new Paragraph({
          text: 'AV.3 - ISTRUTTORIA CLIENTE',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        }),

        // SEZIONE 1 - CLIENTE E PROFESSIONISTA
        new Paragraph({
          text: 'CLIENTE E PROFESSIONISTA INCARICATO',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Denominazione Cliente: ', bold: true }),
            new TextRun({ text: cliente.ragione_sociale || 'N/D' })
          ],
          spacing: { after: 120 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Gruppo di riferimento del Cliente: ', bold: true }),
            new TextRun({ text: '_____________________________' })
          ],
          spacing: { after: 120 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Studio/Professionista di riferimento: ', bold: true }),
            new TextRun({ text: data.nome_studio || '_____________________________' })
          ],
          spacing: { after: 120 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Altri Associati/Soci/Professionisti: ', bold: true }),
            new TextRun({ text: '_____________________________' })
          ],
          spacing: { after: 250 }
        }),

        // Checkbox — auto-spuntati in base al numero di incarichi del cliente
        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(isNuovoCliente)} Nuovo Cliente.` })
          ],
          spacing: { after: 100 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(isGiaIdentificato)} Cliente già identificato in relazione ad un precedente incarico.` })
          ],
          spacing: { after: 100 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} Necessaria/opportuna una nuova identificazione.` })
          ],
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Soggetto responsabile identificazione: ', bold: true }),
            new TextRun({
              text: [data.responsabile_nome, data.responsabile_cognome].filter(Boolean).join(' ') || '_____________________________'
            })
          ],
          spacing: { after: 40 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: '(professionista o altro soggetto appositamente delegato)', italics: true, size: 16 })
          ],
          spacing: { after: 300 }
        }),

        // Valore prestazione professionale
        new Paragraph({
          children: [
            new TextRun({ text: 'Valore della prestazione professionale:', bold: true })
          ],
          spacing: { after: 100 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Euro: ', bold: true }),
            new TextRun({ text: incarico.importo_stimato ? formatCurrency(incarico.importo_stimato) : '_____________________________' }),
            new TextRun({ text: '          ' }),
            new TextRun({ text: `${getCheckbox(!incarico.importo_stimato)} indeterminato/non determinabile` })
          ],
          spacing: { after: 300 }
        }),

        // OPERAZIONE
        new Paragraph({
          children: [
            new TextRun({ text: 'OPERAZIONE (eseguita dal Professionista per conto del Cliente):', bold: true })
          ],
          spacing: { before: 300, after: 120 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Data: ', bold: true }),
            new TextRun({ text: today })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Importo: ', bold: true }),
            new TextRun({ text: incarico.importo_stimato? `€ ${formatCurrency(incarico.importo_stimato)}` : ' _____________________________' })
          ],
          spacing: { after: 80 } //text: 'Importo: _____________________________',
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Causale: ', bold: true }),
            new TextRun({ text: incarico.scopo_natura || incarico.descrizione || '_____________________________' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Mezzi di pagamento utilizzati: ', bold: true }),
            new TextRun({ text: incarico.mezzi_pagamento || '_____________________________' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [new TextRun({ text: 'Documentazione allegata:', bold: true })],
          spacing: { after: 80 }
        }),
        ...(tipiDocumentiList.length > 0
          ? tipiDocumentiList.map((item, i) => new Paragraph({
              children: [new TextRun({ text: `- ${item}` })],
              spacing: { after: i === tipiDocumentiList.length - 1 ? 300 : 40 }
            }))
          : [new Paragraph({
              children: [new TextRun({ text: '_____________________________' })],
              spacing: { after: 300 }
            })]
        ),

        // ADEGUATA VERIFICA
        new Paragraph({
          children: [
            new TextRun({ text: 'ADEGUATA VERIFICA:', bold: true })
          ],
          spacing: { before: 300, after: 120 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(tipologiaVerifica === 'Ordinaria')} Ordinaria` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(tipologiaVerifica === 'Semplificata')} Semplificata` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(tipologiaVerifica === 'Rafforzata')} Rafforzata` })
          ],
          spacing: { after: 300 }
        }),

        // DATA DI RIFERIMENTO
        new Paragraph({
          children: [
            new TextRun({ text: 'DATA DI RIFERIMENTO:', bold: true })
          ],
          spacing: { before: 300, after: 120 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(true)} Data di riferimento del fascicolo: ` }),
            new TextRun({ text: incarico.data_inizio ? formatDate(incarico.data_inizio) : today, bold: true })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} Data di aggiornamento: ____________________` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Prossimo aggiornamento previsto per: ', bold: true }),
            new TextRun({
              text: data.valutazione?.prossimo_controllo
                ? formatDate(data.valutazione.prossimo_controllo)
                : '_______________________________'
            })
          ],
          spacing: { after: 400 }
        }),

        // SEZIONE 1 - DATI CLIENTE
        new Paragraph({
          text: '1) Dati relativi al Cliente',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Con riferimento al legale rappresentante/delegato:', italics: true })
          ],
          spacing: { after: 100 }
        }),

        ...(cliente.rappresentante_legale ? [
          new Paragraph({
            children: [
              new TextRun({ text: cliente.tipo_soggetto_rappresentante === 'azienda' ? 'Ragione sociale: ' : 'Cognome e nome: ', bold: true }),
              new TextRun({ text: cliente.rappresentante_legale }),
              ...(cliente.tipo_soggetto_rappresentante === 'azienda' ? [new TextRun({ text: ' (Azienda)', italics: true })] : [])
            ],
            spacing: { after: 80 }
          })
        ] : []),

        new Paragraph({
          children: [
            new TextRun({ text: cliente.tipo_soggetto_rappresentante === 'azienda' ? 'Codice fiscale azienda: ' : 'Codice fiscale: ', bold: true }),
            new TextRun({ text: cliente.codice_fiscale_rappresentante || 'N/D' })
          ],
          spacing: { after: 80 }
        }),

        // Campi specifici azienda
        ...(cliente.tipo_soggetto_rappresentante === 'azienda' && cliente.partita_iva_rappresentante ? [
          new Paragraph({
            children: [
              new TextRun({ text: 'Partita IVA: ', bold: true }),
              new TextRun({ text: cliente.partita_iva_rappresentante })
            ],
            spacing: { after: 80 }
          })
        ] : []),

        ...(cliente.tipo_soggetto_rappresentante === 'azienda' && cliente.natura_giuridica_rappresentante ? [
          new Paragraph({
            children: [
              new TextRun({ text: 'Natura giuridica: ', bold: true }),
              new TextRun({ text: cliente.natura_giuridica_rappresentante })
            ],
            spacing: { after: 80 }
          })
        ] : []),

        // Campi nascita — solo per persona fisica
        ...(cliente.tipo_soggetto_rappresentante !== 'azienda' && cliente.data_nascita_rappresentante ? [
          new Paragraph({
            children: [
              new TextRun({ text: 'Data di nascita: ', bold: true }),
              new TextRun({ text: formatDate(cliente.data_nascita_rappresentante) })
            ],
            spacing: { after: 80 }
          })
        ] : []),

        ...(cliente.tipo_soggetto_rappresentante !== 'azienda' && cliente.luogo_nascita_rappresentante ? [
          new Paragraph({
            children: [
              new TextRun({ text: 'Luogo di nascita: ', bold: true }),
              new TextRun({
                text: `${cliente.luogo_nascita_rappresentante}${cliente.provincia_nascita_rappresentante ? ' (' + cliente.provincia_nascita_rappresentante + ')' : ''}`
              })
            ],
            spacing: { after: 80 }
          })
        ] : []),

        ...(cliente.nazionalita_rappresentante ? [
          new Paragraph({
            children: [
              new TextRun({ text: 'Nazionalità: ', bold: true }),
              new TextRun({ text: cliente.nazionalita_rappresentante })
            ],
            spacing: { after: 80 }
          })
        ] : []),

        ...(cliente.residenza_rappresentante ? [
          new Paragraph({
            children: [
              new TextRun({ text: cliente.tipo_soggetto_rappresentante === 'azienda' ? 'Sede legale: ' : 'Residenza: ', bold: true }),
              new TextRun({ text: cliente.residenza_rappresentante })
            ],
            spacing: { after: 80 }
          })
        ] : []),

        new Paragraph({
          children: [
            new TextRun({ text: 'PEP (Persona Politicamente Esposta): ', bold: true }),
            new TextRun({ text: cliente.pep ? 'Sì' : 'No' }),
            ...(cliente.pep && cliente.pep_carica ? [
              new TextRun({ text: ' — Carica: ', italics: true }),
              new TextRun({ text: cliente.pep_carica, italics: true })
            ] : [])
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Carica/poteri rappresentanza: ', bold: true }),
            new TextRun({ text: cliente.ruolo_dichiarante || '_____________________________' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Poteri rappresentanza verificati tramite: ', bold: true }),
            new TextRun({ text: '_____________________________' })
          ],
          spacing: { after: 80 }
        }),

        // Documento identità — solo per persona fisica
        ...(cliente.tipo_soggetto_rappresentante !== 'azienda' && cliente.rappresentante_legale_documento?.tipo ? [
          new Paragraph({
            children: [
              new TextRun({ text: 'Documento: ', bold: true }),
              new TextRun({
                text: `${cliente.rappresentante_legale_documento.tipo == 'carta-identita' ? 'Carta d\'Identità' : cliente.rappresentante_legale_documento.tipo } n. ${cliente.rappresentante_legale_documento.numero || 'N/D'}`
              })
            ],
            spacing: { after: 80 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Rilasciato da: ', bold: true }),
              new TextRun({ text: cliente.rappresentante_legale_documento.ente_rilascio || 'N/D' }),
              new TextRun({ text: ' il ' }),
              new TextRun({ text: formatDate(cliente.rappresentante_legale_documento.data_rilascio) }),
              new TextRun({ text: ', valido fino al ' }),
              new TextRun({ text: formatDate(cliente.rappresentante_legale_documento.data_scadenza) })
            ],
            spacing: { after: 150 }
          })
        ] : [
          new Paragraph({ text: '', spacing: { after: 150 } })
        ]),

        new Paragraph({
          children: [
            new TextRun({ text: 'Con riferimento alla società/ente:', italics: true })
          ],
          spacing: { after: 100 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Denominazione/ragione sociale: ', bold: true }),
            new TextRun({ text: cliente.ragione_sociale || 'N/D' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Codice fiscale: ', bold: true }),
            new TextRun({ text: cliente.codice_fiscale || 'N/D' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Partita IVA: ', bold: true }),
            new TextRun({ text: cliente.partita_iva || 'N/D' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Sede legale: ', bold: true }),
            new TextRun({ text: cliente.indirizzo || 'N/D' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Attività: ', bold: true }),
            new TextRun({ text: cliente.attivita_svolta || incarico.descrizione || '_____________________________' })
          ],
          spacing: { after: 400 }
        }),

        // SEZIONE 2 - TITOLARI EFFETTIVI
        new Paragraph({
          text: '2) Dati relativi ai titolari effettivi',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),

        ...(titolari_effettivi.length > 0
          ? titolari_effettivi.slice(0, 9).flatMap((titolare, index) => {
              const tIsAzienda = titolare.tipo_soggetto === 'azienda';
              return [
              new Paragraph({
                children: [
                  new TextRun({ text: `TITOLARE EFFETTIVO N.${index + 1}${tIsAzienda ? ' (Azienda)' : ''}`, bold: true, underline: {} })
                ],
                spacing: { before: 150, after: 100 }
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: tIsAzienda ? 'Ragione sociale: ' : 'Cognome e nome: ', bold: true }),
                  new TextRun({ text: titolare.nome_cognome })
                ],
                spacing: { after: 80 }
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: tIsAzienda ? 'Codice fiscale azienda: ' : 'Codice fiscale: ', bold: true }),
                  new TextRun({ text: titolare.codice_fiscale || 'N/D' })
                ],
                spacing: { after: 80 }
              }),
              // Campi specifici azienda
              ...(tIsAzienda && titolare.partita_iva ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Partita IVA: ', bold: true }),
                    new TextRun({ text: titolare.partita_iva })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              ...(tIsAzienda && titolare.natura_giuridica ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Natura giuridica: ', bold: true }),
                    new TextRun({ text: titolare.natura_giuridica })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              ...(tIsAzienda && titolare.codice_ateco ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Codice ATECO: ', bold: true }),
                    new TextRun({ text: titolare.codice_ateco })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              // Campi nascita — solo PF
              ...(!tIsAzienda && titolare.data_nascita ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Data di nascita: ', bold: true }),
                    new TextRun({ text: formatDate(titolare.data_nascita) })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              ...(!tIsAzienda && titolare.comune_nascita ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Luogo di nascita: ', bold: true }),
                    new TextRun({
                      text: `${titolare.comune_nascita}${titolare.provincia_nascita ? ' (' + titolare.provincia_nascita + ')' : ''}`
                    })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              ...(titolare.nazionalita ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Nazionalità: ', bold: true }),
                    new TextRun({ text: titolare.nazionalita })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              new Paragraph({
                children: [
                  new TextRun({ text: tIsAzienda ? 'Attività svolta: ' : 'Ruolo: ', bold: true }),
                  new TextRun({ text: titolare.professione || 'N/D' })
                ],
                spacing: { after: 80 }
              }),
              ...(titolare.residenza ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: tIsAzienda ? 'Sede legale: ' : 'Residenza: ', bold: true }),
                    new TextRun({ text: titolare.residenza })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              // Documento — solo PF
              ...(!tIsAzienda && titolare.documento_tipo ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Documento: ', bold: true }),
                    new TextRun({
                      text: `${titolare.documento_tipo == 'carta-identita' ? 'Carta d\'Identità' : titolare.documento_tipo } n. ${titolare.documento_numero || 'N/D'}`
                    })
                  ],
                  spacing: { after: 80 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Rilasciato da: ', bold: true }),
                    new TextRun({ text: titolare.documento_rilascio_ente || 'N/D' }),
                    new TextRun({ text: ' il ' }),
                    new TextRun({ text: formatDate(titolare.documento_rilascio_data) }),
                    new TextRun({ text: ', valido fino al ' }),
                    new TextRun({ text: formatDate(titolare.documento_scadenza) })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              new Paragraph({
                children: [
                  new TextRun({ text: 'PEP (Persona Politicamente Esposta): ', bold: true }),
                  new TextRun({ text: titolare.is_pep ? 'Sì' : 'No' }),
                  ...(titolare.is_pep && titolare.pep_carica ? [
                    new TextRun({ text: ' — Carica: ', italics: true }),
                    new TextRun({ text: titolare.pep_carica, italics: true })
                  ] : [])
                ],
                spacing: { after: 80 }
              }),
              ...(titolare.note_quota ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Note: ', bold: true }),
                    new TextRun({ text: titolare.note_quota })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              new Paragraph({ text: '', spacing: { after: 200 } })
            ];
            })
          : [
              new Paragraph({
                text: 'Nessun titolare effettivo registrato',
                spacing: { after: 150 }
              })
            ]
        ),

        new Paragraph({
          children: [
            new TextRun({ text: 'Altri dati identificativi come da documentazione allegata.', italics: true })
          ],
          spacing: { after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Dati acquisiti e verificati tramite:', bold: true })
          ],
          spacing: { after: 100 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} dichiarazione antiriciclaggio resa dal Cliente ex art. 22 D.Lgs. 231/2007;` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} estratti da pubblici registri;` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} estratti da elenchi, atti, documenti conoscibili da chiunque;` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} attestazione di altro professionista, art. 26 D.Lgs.231/2007;` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} altro modo: _____________________________` })
          ],
          spacing: { after: 300 }
        }),

        // SEZIONE 3 - SCOPO E NATURA
        new Paragraph({
          text: "3) Scopo e natura dell'incarico professionale",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),

        new Paragraph({
          text: incarico.scopo_natura || incarico.descrizione || "Servizi professionali nell'ambito dell'attività d'impresa",
          spacing: { after: 150 },
          alignment: AlignmentType.JUSTIFIED,
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Vedi anche:', italics: true })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} dichiarazione antiriciclaggio resa dal Cliente ex art. 22 D.Lgs. 231/2007` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} mandato professionale` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} altro: _____________________________` })
          ],
          spacing: { after: 300 }
        }),

        // SEZIONE 4 - PROFILO DI RISCHIO
        new Paragraph({
          text: '4) Profilo di rischio attribuito',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(profiloRischio === 'Non significativo')} Non significativo` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(profiloRischio === 'Poco significativo')} Poco significativo` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(profiloRischio === 'Abbastanza significativo')} Abbastanza significativo` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(profiloRischio === 'Molto significativo')} Molto significativo` })
          ],
          spacing: { after: 300 }
        }),

        // SEZIONE 5 - SEGNALAZIONI
        new Paragraph({
          text: '5) Segnalazioni e comunicazioni',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} Effettuata segnalazione di operazione sospetta` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} Effettuata comunicazione violazioni` })
          ],
          spacing: { after: 300 }
        }),

        // CONTROLLO COSTANTE
        new Paragraph({
          children: [
            new TextRun({ text: 'CONTROLLO COSTANTE:', bold: true })
          ],
          spacing: { before: 400, after: 120 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Risultato sintetico della valutazione del rischio effettivo: ', bold: true }),
            new TextRun({ text: profiloRischio || '_____________________________' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Tipologia di adeguata verifica: ', bold: true }),
            new TextRun({ text: tipologiaVerifica || '_____________________________' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Frequenza del controllo costante: ', bold: true }),
            new TextRun({ text: frequenzaControllo || '_____________________________' })
          ],
          spacing: { after: 300 }
        }),

        // EVENTUALI NOTE
        new Paragraph({
          children: [
            new TextRun({ text: 'Eventuali Note:', bold: true })
          ],
          spacing: { before: 200, after: 80 }
        }),

        new Paragraph({
          text: data.valutazione?.note || '________________________________________________________________________________',
          spacing: { after: 80 }
        }),

        ...(data.valutazione?.note ? [] : [
          new Paragraph({
            text: '________________________________________________________________________________',
            spacing: { after: 300 }
          })
        ]),

        ...(!data.valutazione?.note ? [] : [
          new Paragraph({ text: '', spacing: { after: 300 } })
        ]),

        // FIRMA E DATA
        new Paragraph({
          children: [
            new TextRun({ text: 'Data: ', bold: true }),
            new TextRun({ text: today })
          ],
          spacing: { before: 400, after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: "L'addetto delegato (ove presente)" }),
            new TextRun({ text: '                                        ' }),
            new TextRun({ text: 'Il Professionista' })
          ],
          spacing: { after: 50 }
        }),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({ text: '______________________________' }),
            new TextRun({ text: '                    ' }),
            new TextRun({ text: '______________________________' })
          ],
          spacing: { after: 200 }
        }),

        // ========================================
        // NUOVA PAGINA - VALUTAZIONE DEL RISCHIO
        // ========================================
        ...(data.valutazione ? [
          // PageBreak per nuova pagina
          new Paragraph({
            children: [new PageBreak()],
            spacing: { after: 0 }
          }),

          // TITOLO PAGINA
          new Paragraph({
            text: 'VALUTAZIONE DEL RISCHIO',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),

          // DATA VALUTAZIONE
          new Paragraph({
            children: [
              new TextRun({ text: 'Data Valutazione: ' }),
              new TextRun({ 
                text: formatDate(data.valutazione.created_at), 
                bold: true 
              })
            ],
            spacing: { after: 300 }
          }),

          // SINTESI VALUTAZIONE
          new Paragraph({
            text: 'SINTESI VALUTAZIONE',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 200 }
          }),

          // Rischio Inerente Prestazione
          new Paragraph({
            children: [
              new TextRun({ text: 'Rischio Inerente Prestazione', bold: true })
            ],
            spacing: { after: 80 }
          }),
          new Paragraph({
            children: [
              new TextRun({ 
                text: Number(data.valutazione.rischio_inerente_prestazione || 0).toFixed(2),
                bold: true,
                size: 32,
                color: getColorForScore(data.valutazione.rischio_inerente_prestazione)
              }),
              new TextRun({ 
                text: ` - ${getClassificationText(data.valutazione.rischio_inerente_prestazione)}`,
                italics: true
              })
            ],
            spacing: { after: 200 }
          }),

          // Rischio Specifico
          new Paragraph({
            children: [
              new TextRun({ text: 'Rischio Specifico', bold: true })
            ],
            spacing: { after: 80 }
          }),
          new Paragraph({
            children: [
              new TextRun({ 
                text: Number(data.valutazione.rischio_specifico || 0).toFixed(2),
                bold: true,
                size: 32,
                color: getColorForScore(data.valutazione.rischio_specifico)
              }),
              new TextRun({ 
                text: ` - ${getClassificationText(data.valutazione.rischio_specifico)}`,
                italics: true
              })
            ],
            spacing: { after: 200 }
          }),

          // Rischio Effettivo
          new Paragraph({
            children: [
              new TextRun({ text: 'Rischio Effettivo', bold: true })
            ],
            spacing: { after: 80 }
          }),
          new Paragraph({
            children: [
              new TextRun({ 
                text: Number(data.valutazione.rischio_effettivo || 0).toFixed(2),
                bold: true,
                size: 32,
                color: getColorForScore(data.valutazione.rischio_effettivo)
              }),
              new TextRun({ 
                text: ` - ${getClassificationText(data.valutazione.rischio_effettivo)}`,
                italics: true
              })
            ],
            spacing: { after: 300 }
          }),

          // CLASSE RISCHIO
          new Paragraph({
            children: [
              new TextRun({ text: 'Classe Rischio: ', bold: true }),
              new TextRun({ 
                text: `Classe ${data.valutazione.classe_rischio}`,
                bold: true,
                size: 28,
                color: getColorForClasse(data.valutazione.classe_rischio)
              })
            ],
            spacing: { after: 150 }
          }),

          // MISURE APPLICATE
          new Paragraph({
            children: [
              new TextRun({ text: 'Misure Applicate: ', bold: true }),
              new TextRun({ text: data.valutazione.misure_applicate })
            ],
            spacing: { after: 400 }
          }),

          // DETTAGLI VALUTAZIONE - TABELLA A
          new Paragraph({
            text: '▼ Dettagli Valutazione',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 }
          }),

          new Paragraph({
            text: 'Tabella A - Fattori Cliente',
            heading: HeadingLevel.HEADING_3,
            spacing: { after: 150 }
          }),

          // Fattori Tabella A
          new Paragraph({
            children: [
              new TextRun({ text: 'Natura Giuridica: ' }),
              new TextRun({
                text: getFattoreScore(data.valutazione.tabella_a_scores.naturaGiuridica).toFixed(1),
                bold: true
              })
            ],
            spacing: { after: 80 }
          }),

          new Paragraph({
            children: [
              new TextRun({ text: 'Attività Prevalente: ' }),
              new TextRun({
                text: getFattoreScore(data.valutazione.tabella_a_scores.attivitaPrevalente).toFixed(1),
                bold: true
              })
            ],
            spacing: { after: 80 }
          }),

          new Paragraph({
            children: [
              new TextRun({ text: 'Comportamento Conferimento: ' }),
              new TextRun({
                text: getFattoreScore(data.valutazione.tabella_a_scores.comportamentoConferimento).toFixed(1),
                bold: true
              })
            ],
            spacing: { after: 80 }
          }),

          new Paragraph({
            children: [
              new TextRun({ text: 'Area Cliente/Controparte: ' }),
              new TextRun({
                text: getFattoreScore(data.valutazione.tabella_a_scores.areaClienteControparte).toFixed(1),
                bold: true
              })
            ],
            spacing: { after: 200 }
          })
        ] : [])
        // Fine nuova pagina valutazione
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  const filename = `AV3_Istruttoria_${incarico.codice_incarico || today.replace(/\//g, '-')}.docx`;
  return { blob, filename };
}

export async function generateAndDownloadDOCX_AV3(data: AMLData): Promise<void> {
  const { blob, filename } = await generateBlobDOCX_AV3(data);
  saveAs(blob, filename);
}

// ============================================================
// Shared table/cell helpers (used by RT1 and AV.1)
// ============================================================
const FONT = 'Arial Narrow';
const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
};

// Colori originali del documento ALLEGATI_Linee_Guida.docx
const C_GREEN = '92D050';
const C_YELLOW = 'FFFF00';
const C_ORANGE = 'FFC000';
const C_RED = 'FF0000';
const C_GRAY = 'D9D9D9';

/** Colore sfondo per la matrice di raccordo, fedele all'originale */
function matrixColor(val: number): string {
  if (val >= 3.6) return C_RED;
  if (val >= 2.6) return C_ORANGE;
  if (val >= 1.6) return C_YELLOW;
  return C_GREEN;
}

// Bordo bianco esplicito per sovrascrivere il bordo interno della tabella (simula cella unita)
const BORDER_NONE = { style: BorderStyle.SINGLE, size: 1, color: 'FFFFFF' };
const BORDER_BLACK = { style: BorderStyle.SINGLE, size: 1, color: '000000' };

interface CellOpts {
  bold?: boolean;
  italic?: boolean;
  width?: number;
  shading?: string;
  /** Padding verticale interno (spacing before/after nel paragrafo, default 20) */
  paddingV?: number;
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  size?: number;       // half-points (docx default)
  font?: string;
  colSpan?: number;
  /** Nasconde bordi top/bottom per effetto "cella unita" */
  mergeVisual?: 'first' | 'mid' | 'last';
  /** Allineamento verticale cella (default CENTER) */
  vAlign?: 'top' | 'center' | 'bottom';
}

function tblCell(text: string, opts?: CellOpts): TableCell {
  const sz = opts?.size ?? 16;   // 8pt default (come tabelle originali)

  // Bordi per effetto visivo di merge verticale
  let borders: Record<string, { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size: number; color: string }> | undefined;
  if (opts?.mergeVisual === 'first') {
    borders = { top: BORDER_BLACK, bottom: BORDER_NONE, left: BORDER_BLACK, right: BORDER_BLACK };
  } else if (opts?.mergeVisual === 'mid') {
    borders = { top: BORDER_NONE, bottom: BORDER_NONE, left: BORDER_BLACK, right: BORDER_BLACK };
  } else if (opts?.mergeVisual === 'last') {
    borders = { top: BORDER_NONE, bottom: BORDER_BLACK, left: BORDER_BLACK, right: BORDER_BLACK };
  }

  return new TableCell({
    width: opts?.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: (opts?.vAlign ?? VerticalAlign.CENTER) as typeof VerticalAlign.CENTER,
    columnSpan: opts?.colSpan,
    shading: opts?.shading ? { type: ShadingType.SOLID, color: opts.shading, fill: opts.shading } : undefined,
    borders,
    margins: { left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: opts?.align ?? AlignmentType.LEFT,
        spacing: { before: opts?.paddingV ?? 20, after: opts?.paddingV ?? 20 },
        children: [
          new TextRun({ text, bold: opts?.bold ?? false, italics: opts?.italic ?? false, size: sz, font: { name: opts?.font ?? FONT } })
        ]
      })
    ]
  });
}

/** Paragrafo con font Arial Narrow */
function tblPara(runs: TextRun[], opts?: { after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] }): Paragraph {
  return new Paragraph({
    children: runs,
    alignment: opts?.align ?? AlignmentType.LEFT,
    spacing: { before: opts?.before ?? 0, after: opts?.after ?? 80 }
  });
}

function tblText(text: string, opts?: { bold?: boolean; italic?: boolean; size?: number; color?: string }): TextRun {
  return new TextRun({ text, bold: opts?.bold, italics: opts?.italic, size: opts?.size ?? 20, font: { name: FONT }, color: opts?.color });
}

/**
 * Genera e scarica documento DOCX RT1 - Autovalutazione del Rischio
 * Struttura fedele al modello in documentazione/ALLEGATI_Linee_Guida.docx pag.1-6
 */
export async function generateAndDownloadDOCX_RT1(data: any): Promise<void> {
  const today = formatDate(new Date().toISOString());
  const validUntil = data.valid_until ? formatDate(data.valid_until) : 'N/D';

  const inerente = Number(data.inerente_score || 0);
  const vulnerabilita = Number(data.vulnerabilita_score || 0);
  const residuo = Number(data.residuo_score || 0);
  const rd = data.risposte_dettagliate || {};
  const ds = data.descrizione_studio || {};

  // Utility: valore arrotondato a 2 decimali; intero più vicino per checkbox matching
  const roundVal = (v: number | null | undefined): number => Math.round((Number(v || 2)) * 100) / 100;
  const closestInt = (v: number | null | undefined): number => Math.round(Number(v || 2));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elems: any[] = [];

  // =================== TITOLO ===================
  elems.push(
    tblPara([tblText('AV.0 – AUTOVALUTAZIONE DEL RISCHIO', { bold: true, size: 26 })], { align: AlignmentType.JUSTIFIED, after: 60 }),
    tblPara([tblText('Valutazione del Rischio di Riciclaggio e Finanziamento del Terrorismo (ARTT. 15 e 16 D.LGS. 231/2007)', { size: 18 })], { align: AlignmentType.JUSTIFIED, after: 300 }),
  );

  // =================== METADATI ===================
  elems.push(
    tblPara([tblText('Valutatore: ', { bold: true }), tblText(data.created_by || 'N/D')], { after: 60 }),
    tblPara([tblText('Data: ', { bold: true }), tblText(formatDate(data.created_at))], { after: 60 }),
    tblPara([tblText('Valida fino: ', { bold: true }), tblText(validUntil)], { after: 300 }),
  );

  // =================== DESCRIZIONE STUDIO PROFESSIONALE ===================
  elems.push(
    tblPara([tblText('DESCRIZIONE DELLO STUDIO PROFESSIONALE', { bold: true, size: 22 })], { after: 120 }),
    tblPara([tblText('Tipologia giuridica: ', { bold: true, size: 19}), tblText(ds.tipologia_giuridica || 'N/D')], { after: 60 }),
    tblPara([tblText('Anno inizio attività: ', { bold: true, size: 19 }), tblText(ds.anno_inizio_attivita || 'N/D')], { after: 60 }),
    tblPara([tblText('Sedi: ', { bold: true, size: 19 }), tblText(ds.sedi || 'N/D')], { after: 60 }),
    tblPara([tblText('Organizzazione interna: ', { bold: true, size: 19 }), tblText(ds.organizzazione_interna || 'N/D')], { after: 60 }),
    tblPara([tblText('Peculiarità e specializzazioni: ', { bold: true, size: 19 }), tblText(ds.peculiarita_e_specializzazioni || 'N/D')], { after: 60 }),
    tblPara([tblText('Tipologia prevalente clientela: ', { bold: true, size: 19 }), tblText(ds.tipologia_prevalente_clientela || 'N/D')], { after: 60 }),
    tblPara([tblText('Principali prestazioni professionali: ', { bold: true, size: 19 }), tblText(ds.principali_prestazioni_professionali || 'N/D')], { after: 300 }),
  );

  // =================== FATTORI DI RISCHIO INERENTE ===================
  elems.push(
    tblPara([tblText('Punteggio / scala di intensità da adottare per le misurazioni del rischio inerente e della vulnerabilità:', { size: 18 })], { after: 120 }),
    tblPara([tblText('1 = non significativo', { size: 18 })], { after: 20 }),
    tblPara([tblText('2 = poco significativo', { size: 18 })], { after: 20 }),
    tblPara([tblText('3 = abbastanza significativo', { size: 18 })], { after: 20 }),
    tblPara([tblText('4 = molto significativo', { size: 18 })], { after: 300 }),
    tblPara([tblText('FATTORI DI RISCHIO INERENTE', { bold: true, size: 22 })], { after: 120 }),
  );

  // --- Definizione fattori inerenti con criteri (fedele all'originale) ---
  const fattoriInerenti: { key: string; titolo: string; criteri: { desc: string; valore: number }[] }[] = [
    {
      key: 'tipologia_clientela',
      titolo: 'A) Tipologia Clientela',
      criteri: [
        { desc: 'Un numero molto esiguo di clienti (10%) individuati in sede di adeguata verifica come ad alto rischio', valore: 1 },
        { desc: 'Un numero molto limitato di clienti (tra il 10 e il 25%) individuati in sede di adeguata verifica come ad alto rischio', valore: 2 },
        { desc: 'Un numero significativo di clienti (tra il 25% e il 40%) individuati in sede di adeguata verifica come ad alto rischio', valore: 3 },
        { desc: 'Percentuale molto significativa (superiore al 40%) di clienti ritenuti ad alto rischio', valore: 4 },
      ]
    },
    {
      key: 'area_geografica_operativita',
      titolo: 'B) Area Geografica di Operatività',
      criteri: [
        { desc: 'Un numero molto esiguo di clienti operanti in aree geografiche ritenute ad alto rischio (10%)', valore: 1 },
        { desc: 'Un numero molto limitato di clienti operanti in aree geografiche ritenute ad alto rischio (tra il 10 e il 25%)', valore: 2 },
        { desc: 'Un numero significativo di clienti operanti in aree geografiche ritenute ad alto rischio (tra il 25% e il 40%)', valore: 3 },
        { desc: 'Una percentuale molto significativa (superiore al 40%) di clienti operanti in aree geografiche ritenute ad alto rischio', valore: 4 },
      ]
    },
    {
      key: 'canali_distributivi',
      titolo: 'C) Canali Distributivi',
      criteri: [
        { desc: 'Canali diretti e controllati, nessun ricorso a collaborazioni esterne o corrispondenze', valore: 1 },
        { desc: 'Limitato ricorso a collaborazioni esterne con adeguata tracciabilità', valore: 2 },
        { desc: 'Utilizzo di canali indiretti con tracciabilità parziale', valore: 3 },
        { desc: 'Canali complessi e/o remoti con difficoltà di controllo e tracciabilità', valore: 4 },
      ]
    },
    {
      key: 'servizi_professionali_offerti',
      titolo: 'D) Servizi Professionali Offerti',
      criteri: [
        { desc: 'Una percentuale delle prestazioni a rischio inerente non significativo o poco significativo superiore all\'80%', valore: 1 },
        { desc: 'Una percentuale delle prestazioni a rischio inerente non significativo o poco significativo superiore al 60%', valore: 2 },
        { desc: 'Una percentuale delle prestazioni a rischio inerente non significativo o poco significativo compresa tra il 45% e il 60%', valore: 3 },
        { desc: 'Percentuale delle prestazioni a rischio inerente non significativo o poco significativo inferiore al 45%', valore: 4 },
      ]
    },
  ];

  // Build table for fattori inerenti
  const inerenteRows: TableRow[] = [];
  inerenteRows.push(new TableRow({
    children: [
      tblCell('Fattore di rischio', { bold: true, width: 50, size: 18 }),
      tblCell('Criterio', { bold: true, width: 30, size: 18 }),
      tblCell('☑', { bold: true, width: 8, align: AlignmentType.CENTER, size: 18 }),
      tblCell('Valore', { bold: true, width: 12, align: AlignmentType.CENTER, size: 18 }),
    ]
  }));

  for (const fattore of fattoriInerenti) {
    const displayValue = roundVal(rd[fattore.key]?.scelta_valore);
    const checkValue = closestInt(rd[fattore.key]?.scelta_valore);
    const note = rd[fattore.key]?.note || '';

    for (let ci = 0; ci < fattore.criteri.length; ci++) {
      const c = fattore.criteri[ci];
      const checked = checkValue === c.valore;

      inerenteRows.push(new TableRow({
        children: [
          ci === 0
            ? tblCell(fattore.titolo, { bold: true, size: 16, mergeVisual: 'first', vAlign: 'center' })
            : ci === fattore.criteri.length - 1
              ? tblCell('', { size: 14, mergeVisual: 'last' })
              : tblCell('', { size: 14, mergeVisual: 'mid' }),
          tblCell(c.desc, { size: 14 }),
          tblCell(getCheckbox(checked), { align: AlignmentType.CENTER, size: 16 }),
          ci === 0
            ? tblCell(displayValue.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 18, mergeVisual: 'first' })
            : ci === fattore.criteri.length - 1
              ? tblCell('', { mergeVisual: 'last' })
              : tblCell('', { mergeVisual: 'mid' }),
        ]
      }));
    }

    // Note row if present
    if (note) {
      inerenteRows.push(new TableRow({
        children: [
          tblCell('Note:', { italic: true, size: 14 }),
          tblCell(note, { size: 14, colSpan: 3 }),
        ]
      }));
    }
  }

  // Totale inerente
  const totInerente = Number(rd.tipologia_clientela?.scelta_valore || 0)
    + Number(rd.area_geografica_operativita?.scelta_valore || 0)
    + Number(rd.canali_distributivi?.scelta_valore || 0)
    + Number(rd.servizi_professionali_offerti?.scelta_valore || 0);

  inerenteRows.push(new TableRow({
    children: [
      tblCell('', {}),
      tblCell('TOTALE INERENTE', { bold: true, align: AlignmentType.CENTER, size: 16 }),
      tblCell('', {}),
      tblCell(totInerente.toFixed(1), { bold: true, align: AlignmentType.CENTER, size: 18 }),
    ]
  }));
  inerenteRows.push(new TableRow({
    children: [
      tblCell('', {}),
      tblCell('MEDIA INERENTE (Totale / 4)', { bold: true, align: AlignmentType.CENTER, size: 16 }),
      tblCell('', {}),
      tblCell(inerente.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 20 }),
    ]
  }));

  elems.push(new Table({ rows: inerenteRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([], { after: 300 }));

  // =================== FATTORI DI VULNERABILITÀ ===================
  elems.push(
    tblPara([tblText('FATTORI DI VULNERABILITÀ', { bold: true, size: 22 })], { after: 120 }),
  );

  const fattoriVulnerabilita: { key: string; titolo: string; criteri: { desc: string; valore: number }[] }[] = [
    {
      key: 'formazione',
      titolo: 'E) Formazione',
      criteri: [
        { desc: 'Formazione strutturata, frequente e documentata per tutti i componenti dello studio', valore: 1 },
        { desc: 'Formazione periodica svolta con regolarità ma non sempre documentata', valore: 2 },
        { desc: 'Formazione sporadica e non strutturata', valore: 3 },
        { desc: 'Formazione carente o assente', valore: 4 },
      ]
    },
    {
      key: 'organizzazione_adeguata_verifica',
      titolo: 'F) Organizzazione Adeguata Verifica della Clientela',
      criteri: [
        { desc: 'Organizzazione solida e documentata con procedure strutturate e modulistica adeguata', valore: 1 },
        { desc: 'Organizzazione adeguata con procedure presenti ma migliorabili', valore: 2 },
        { desc: 'Organizzazione parziale con procedure informali e documentazione incompleta', valore: 3 },
        { desc: 'Organizzazione carente con assenza di procedure formalizzate', valore: 4 },
      ]
    },
    {
      key: 'organizzazione_conservazione',
      titolo: 'G) Organizzazione Conservazione Documenti, Dati e Informazioni',
      criteri: [
        { desc: 'Sistema organizzato e conforme con fascicoli completi e accesso controllato', valore: 1 },
        { desc: 'Sistema adeguato con fascicoli presenti ma organizzazione migliorabile', valore: 2 },
        { desc: 'Sistema parziale con documentazione frammentaria e controlli insufficienti', valore: 3 },
        { desc: 'Sistema inadeguato o assente', valore: 4 },
      ]
    },
    {
      key: 'organizzazione_segnalazione_sos',
      titolo: 'H) Organizzazione Segnalazione Operazioni Sospette',
      criteri: [
        { desc: 'Procedure chiare e applicate con diffusione interna degli indicatori di anomalia', valore: 1 },
        { desc: 'Procedure presenti ma applicate in modo non sistematico', valore: 2 },
        { desc: 'Procedure informali con conoscenza limitata degli indicatori di anomalia', valore: 3 },
        { desc: 'Assenza di procedure per la rilevazione di operazioni sospette', valore: 4 },
      ]
    },
  ];

  const vulnRows: TableRow[] = [];
  vulnRows.push(new TableRow({
    children: [
      tblCell('Fattore di vulnerabilità', { bold: true, width: 50, size: 18 }),
      tblCell('Criterio', { bold: true, width: 30, size: 18 }),
      tblCell('☑', { bold: true, width: 8, align: AlignmentType.CENTER, size: 18 }),
      tblCell('Valore', { bold: true, width: 12, align: AlignmentType.CENTER, size: 18 }),
    ]
  }));

  for (const fattore of fattoriVulnerabilita) {
    const displayValue = roundVal(rd[fattore.key]?.scelta_valore);
    const checkValue = closestInt(rd[fattore.key]?.scelta_valore);
    const note = rd[fattore.key]?.note || '';

    for (let ci = 0; ci < fattore.criteri.length; ci++) {
      const c = fattore.criteri[ci];
      const checked = checkValue === c.valore;
      vulnRows.push(new TableRow({
        children: [
          ci === 0
            ? tblCell(fattore.titolo, { bold: true, size: 16, mergeVisual: 'first', vAlign: 'center' })
            : ci === fattore.criteri.length - 1
              ? tblCell('', { size: 14, mergeVisual: 'last' })
              : tblCell('', { size: 14, mergeVisual: 'mid' }),
          tblCell(c.desc, { size: 14 }),
          tblCell(getCheckbox(checked), { align: AlignmentType.CENTER, size: 16 }),
          ci === 0
            ? tblCell(displayValue.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 18, mergeVisual: 'first' })
            : ci === fattore.criteri.length - 1
              ? tblCell('', { mergeVisual: 'last' })
              : tblCell('', { mergeVisual: 'mid' }),
        ]
      }));
    }

    if (note) {
      vulnRows.push(new TableRow({
        children: [
          tblCell('Note:', { italic: true, size: 14 }),
          tblCell(note, { size: 14, colSpan: 3 }),
        ]
      }));
    }
  }

  const totVuln = Number(rd.formazione?.scelta_valore || 0)
    + Number(rd.organizzazione_adeguata_verifica?.scelta_valore || 0)
    + Number(rd.organizzazione_conservazione?.scelta_valore || 0)
    + Number(rd.organizzazione_segnalazione_sos?.scelta_valore || 0);

  vulnRows.push(new TableRow({
    children: [
      tblCell('', {}),
      tblCell('TOTALE VULNERABILITÀ', { bold: true, align: AlignmentType.CENTER, size: 16 }),
      tblCell('', {}),
      tblCell(totVuln.toFixed(1), { bold: true, align: AlignmentType.CENTER, size: 18 }),
    ]
  }));
  vulnRows.push(new TableRow({
    children: [
      tblCell('', {}),
      tblCell('MEDIA VULNERABILITÀ (Totale / 4)', { bold: true, align: AlignmentType.CENTER, size: 16 }),
      tblCell('', {}),
      tblCell(vulnerabilita.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 20 }),
    ]
  }));

  elems.push(new Table({ rows: vulnRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([], { after: 300 }));

  // =================== VALUTAZIONE DEL RISCHIO RESIDUO ===================
  //elems.push(new Paragraph({ children: [new PageBreak()] }));
  elems.push(tblPara([tblText('VALUTAZIONE DEL RISCHIO RESIDUO', { bold: true, size: 22 })], { after: 120 }));

  // =================== MATRICE DEL RISCHIO RESIDUO (6 colonne, colori originali) ===================
  // Valori dalla matrice: Rischio Residuo = Inerente * 0,40 + Vulnerabilità * 0,60
  const mVals: { label: string; vals: { text: string; num: number }[] }[] = [
    { label: 'Molto significativo 4', vals: [{ text: '2,2', num: 2.2 }, { text: '2,8', num: 2.8 }, { text: '3,4', num: 3.4 }, { text: '4', num: 4.0 }] },
    { label: 'Abbastanza significativo 3', vals: [{ text: '1,8', num: 1.8 }, { text: '2,4', num: 2.4 }, { text: '3', num: 3.0 }, { text: '3,6', num: 3.6 }] },
    { label: 'Poco significativo 2', vals: [{ text: '1,4', num: 1.4 }, { text: '2', num: 2.0 }, { text: '2,6', num: 2.6 }, { text: '3,2', num: 3.2 }] },
    { label: 'Non significativo 1', vals: [{ text: '1', num: 1.0 }, { text: '1,6', num: 1.6 }, { text: '2,2', num: 2.2 }, { text: '2,8', num: 2.8 }] },
  ];

  const MATRIX_ROW_H = 400;
  const mRows: TableRow[] = [];

  // Header matrice
  mRows.push(new TableRow({
    height: { value: MATRIX_ROW_H, rule: HeightRule.ATLEAST },
    children: [
      tblCell('', { size: 14, width: 18 }),
      tblCell('', { size: 14, width: 17 }),
      tblCell('RISCHIO RESIDUO', { bold: true, size: 14, align: AlignmentType.CENTER, colSpan: 4 }),
    ]
  }));

  // Data rows
  for (let ri = 0; ri < mVals.length; ri++) {
    const r = mVals[ri];
    const merge: 'first' | 'mid' | 'last' = ri === 0 ? 'first' : ri === mVals.length - 1 ? 'last' : 'mid';
    let col1Text = '';
    let col1VAlign: 'top' | 'center' | 'bottom' | undefined;
    if (ri === 1) { col1Text = 'RISCHIO INERENTE'; col1VAlign = 'bottom'; }
    if (ri === 2) { col1Text = '(coefficiente di ponderazione = 40%)'; col1VAlign = 'top'; }
    mRows.push(new TableRow({
      height: { value: MATRIX_ROW_H, rule: HeightRule.ATLEAST },
      children: [
        tblCell(col1Text, { size: 14, width: 18, mergeVisual: merge, vAlign: col1VAlign, align: AlignmentType.CENTER }),
        tblCell(r.label, { size: 14, width: 17, align: AlignmentType.CENTER }),
        ...r.vals.map(c => tblCell(c.text, { bold: true, shading: matrixColor(c.num), align: AlignmentType.CENTER, size: 16, width: 16 })),
      ]
    }));
  }

  // Footer row labels
  mRows.push(new TableRow({
    height: { value: MATRIX_ROW_H, rule: HeightRule.ATLEAST },
    children: [
      tblCell('', { size: 14 }),
      tblCell('', { size: 14 }),
      tblCell('Non significativa 1', { size: 14, align: AlignmentType.CENTER }),
      tblCell('Poco significativa 2', { size: 14, align: AlignmentType.CENTER }),
      tblCell('Abbastanza significativa 3', { size: 14, align: AlignmentType.CENTER }),
      tblCell('Molto\nsignificativa 4', { size: 14, align: AlignmentType.CENTER }),
    ]
  }));
  // Footer label VULNERABILITA'
  mRows.push(new TableRow({
    height: { value: MATRIX_ROW_H, rule: HeightRule.ATLEAST },
    children: [
      tblCell('', { size: 14 }),
      tblCell('', { size: 14 }),
      tblCell('VULNERABILITA\'\n(coefficiente di ponderazione = 60%)', { size: 14, align: AlignmentType.CENTER, colSpan: 4 }),
    ]
  }));

  elems.push(new Table({ rows: mRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([], { after: 200 }));

  // =================== LIVELLO DI RISCHIO RESIDUO (scala riferimento, colorata) ===================
  elems.push(new Paragraph({ children: [new PageBreak()] }));
  elems.push(tblPara([tblText('Livello di rischio residuo', { bold: true, size: 22 })], { after: 80 }));

  const scalaResiduo = [
    new TableRow({ children: [tblCell('Valori ponderati', { bold: true, width: 50, size: 18 }), tblCell('Rischio residuo', { bold: true, width: 50, size: 18 })] }),
    new TableRow({ children: [tblCell('Punteggio 1-1.5', { size: 18 }), tblCell('Non significativo', { shading: C_GREEN, size: 18 })] }),
    new TableRow({ children: [tblCell('Punteggio 1.6-2.5', { size: 18 }), tblCell('Poco significativo', { shading: C_YELLOW, size: 18 })] }),
    new TableRow({ children: [tblCell('Punteggio 2.6-3.5', { size: 18 }), tblCell('Abbastanza significativo', { shading: C_ORANGE, size: 18 })] }),
    new TableRow({ children: [tblCell('Punteggio 3.6-4.0', { size: 18 }), tblCell('Molto significativo', { shading: C_RED, size: 18 })] }),
  ];
  elems.push(new Table({ rows: scalaResiduo, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([], { after: 200 }));

  // =================== DETERMINAZIONE DEL RISCHIO INERENTE ===================
  const inerentePond = inerente * 0.4;

  elems.push(tblPara([tblText('Determinazione del rischio inerente:', { bold: true, size: 22 })], { after: 80 }));

  const scoreTC = Number(rd.tipologia_clientela?.scelta_valore || 0);
  const scoreAG = Number(rd.area_geografica_operativita?.scelta_valore || 0);
  const scoreCD = Number(rd.canali_distributivi?.scelta_valore || 0);
  const scoreSP = Number(rd.servizi_professionali_offerti?.scelta_valore || 0);

  const detInerenteRows = [
    new TableRow({ children: [tblCell('Fattore di rischio', { bold: true, width: 70, size: 18 }), tblCell('Indice di rischiosità', { bold: true, width: 30, align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('Tipologia di clientela', { size: 18 }), tblCell(scoreTC.toFixed(2), { align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('Area geografica di operatività', { size: 18 }), tblCell(scoreAG.toFixed(2), { align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('Canali distributivi', { size: 18 }), tblCell(scoreCD.toFixed(2), { align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('Servizi professionali offerti', { size: 18 }), tblCell(scoreSP.toFixed(2), { align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('Livello rischio inerente', { bold: true, size: 18 }), tblCell(inerente.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('Coefficiente di ponderazione', { size: 18 }), tblCell('40%', { align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('A - Rischio inerente', { bold: true, size: 18 }), tblCell(inerentePond.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 18 })] }),
  ];
  elems.push(new Table({ rows: detInerenteRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([], { after: 200 }));

  // =================== DETERMINAZIONE DEL LIVELLO DI VULNERABILITÀ ===================
  const vulnPond = vulnerabilita * 0.6;

  elems.push(tblPara([tblText('Determinazione del livello di vulnerabilità:', { bold: true, size: 22 })], { after: 80 }));

  const scoreFO = Number(rd.formazione?.scelta_valore || 0);
  const scoreAV = Number(rd.organizzazione_adeguata_verifica?.scelta_valore || 0);
  const scoreCO = Number(rd.organizzazione_conservazione?.scelta_valore || 0);
  const scoreSOS = Number(rd.organizzazione_segnalazione_sos?.scelta_valore || 0);

  const detVulnRows = [
    new TableRow({ children: [tblCell('Fattore di vulnerabilità', { bold: true, width: 70, size: 18 }), tblCell('Indice di rischiosità', { bold: true, width: 30, align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('Formazione', { size: 18 }), tblCell(scoreFO.toFixed(2), { align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('Adeguata verifica', { size: 18 }), tblCell(scoreAV.toFixed(2), { align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('Conservazione', { size: 18 }), tblCell(scoreCO.toFixed(2), { align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('SOS e contante', { size: 18 }), tblCell(scoreSOS.toFixed(2), { align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('Livello vulnerabilità', { bold: true, size: 18 }), tblCell(vulnerabilita.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('Coefficiente di ponderazione', { size: 18 }), tblCell('60%', { align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('B – Livello vulnerabilità', { bold: true, size: 18 }), tblCell(vulnPond.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 18 })] }),
  ];
  elems.push(new Table({ rows: detVulnRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([], { after: 200 }));

  // =================== DETERMINAZIONE DEL RISCHIO RESIDUO (SOMMA A + B) ===================
  elems.push(tblPara([tblText('Determinazione del rischio residuo:', { bold: true, size: 22 })], { after: 40 }));
  elems.push(tblPara([tblText('SOMMA A + B', { bold: true, size: 20 })], { after: 80 }));

  const detResiduoRows = [
    new TableRow({ children: [tblCell('Rischio inerente ponderato Tabella A', { size: 18, width: 70 }), tblCell(inerentePond.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 18, width: 30 })] }),
    new TableRow({ children: [tblCell('Livello di vulnerabilità ponderato Tabella B', { size: 18 }), tblCell(vulnPond.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 18 })] }),
    new TableRow({ children: [tblCell('Rischio residuo', { bold: true, size: 18 }), tblCell(residuo.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 20 })] }),
  ];
  elems.push(new Table({ rows: detResiduoRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([], { after: 120 }));

  elems.push(tblPara([
    tblText('Il livello di rischio residuo è pari a '),
    tblText(residuo.toFixed(2), { bold: true }),
    tblText(' e risulta essere '),
    tblText(getClassificationText(residuo).toUpperCase(), { bold: true }),
  ], { after: 300 }));

  // =================== 5. PIANO DI MITIGAZIONE ===================
  //elems.push(new Paragraph({ children: [new PageBreak()] }));

  if(data.piano_mitigazione){
    elems.push(
      tblPara([tblText('PIANO DI MITIGAZIONE', { bold: true, size: 22 })], { after: 120 }),
      tblPara([tblText(data.piano_mitigazione || 'Nessun piano di mitigazione specificato')], { after: 400 }),
    );
  }

  // =================== FIRMA E DATA ===================
  elems.push(
    tblPara([tblText(`Luogo e data: Italia, ${today}`, { bold: true })], { before: 400, after: 200 }),
    tblPara([tblText('Firma del Valutatore')], { after: 60 }),
    tblPara([], { after: 200 }),
    tblPara([tblText('..................................................')], { after: 200 }),
  );

  // =================== DOCUMENTO ===================
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: elems
    }]
  });

  try {
    const blob = await Packer.toBlob(doc);
    const filename = `AV0_Autovalutazione_v${data.version || '1.0'}_${today.replace(/\//g, '-')}.docx`;
    saveAs(blob, filename);
    // console.log('✅ Documento AV0 generato con successo');
  } catch (error) {
    console.error('❌ Errore nella generazione AV0:', error);
    throw error;
  }
}

/**
 * Genera e scarica documento DOCX AV.4 - Dichiarazione Cliente
 */
export async function generateBlobDOCX_AV4(data: AMLData): Promise<{ blob: Blob; filename: string }> {
  const { cliente, titolari_effettivi, incarico } = data;
  const today = formatDate(new Date().toISOString());
  const isPep = cliente.pep === true;
  const isPersonaFisicaOrProf = cliente.tipo_cliente === 'persona_fisica' || cliente.tipo_cliente === 'professionista';
  const hasRappresentante = !!cliente.rappresentante_legale;
  const tipoRapporto = isPersonaFisicaOrProf
    ? 'in_proprio'
    : hasRappresentante
      ? 'caso_residuale'
      : titolari_effettivi[0]?.tipo_rapporto || 'in_proprio';
  const hasPepTitolari = titolari_effettivi.some(t => t.is_pep === true);

  // Verifica se il rappresentante legale è già tra i titolari effettivi (match per nome o CF)
  const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();
  const normCf = (s: string | null | undefined) => (s || '').trim().toUpperCase();
  const rlNome = norm(cliente.rappresentante_legale);
  const rlCf = normCf(cliente.codice_fiscale_rappresentante);
  const rappresentanteEInTitolari = !!cliente.rappresentante_legale && titolari_effettivi.some(t =>
    (rlNome && norm(t.nome_cognome) === rlNome) ||
    (rlCf && normCf(t.codice_fiscale) === rlCf)
  );
  const mostraRappresentanteSeparato = !!cliente.rappresentante_legale && !rappresentanteEInTitolari;

  const FNT = 'Arial Narrow';

  const doc = new Document({
    numbering: {
    config: [
      {
        reference: "trattino-list",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "–",
            style: {
              paragraph: {
                indent: { left: 200, hanging: 200 },
              },
            },
          },
          ],
        },
      {
        reference: "i-list",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "i)",
            style: {
              paragraph: {
                indent: { left: 200, hanging: 220 },
              },
            },
          },
        ],
      },
    ],
  },
    styles: {
      default: {
        document: {
          run: {
            font: { name: FNT },
            size: 20 // 10pt
          }
        },
        heading1: {
          run: {
            font: { name: FNT },
            size: 28, // 14pt
            bold: true
          }
        },
        heading2: {
          run: {
            font: { name: FNT },
            size: 22, // 11pt
            bold: true
          }
        },
        heading3: {
          run: {
            font: { name: FNT },
            size: 20,
            bold: true
          }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1440
          }
        }
      },
      children: [
        // TITOLO
        new Paragraph({
          text: 'AV.4 - DICHIARAZIONE DEL CLIENTE',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        }),

        // PREAMBOLO
        new Paragraph({
          text: "In ottemperanza alle disposizioni dell'art. 22 del D.Lgs. 231/2007 (obblighi del cliente in materia di prevenzione e contrasto al riciclaggio/FDT) e successive modifiche e integrazioni, fornisco le sottostanti informazioni, assumendomi tutte le responsabilità di natura civile, amministrativa e penale per dichiarazioni non veritiere.",
          spacing: { after: 300 },
          alignment: AlignmentType.JUSTIFIED
        }),

        // IL SOTTOSCRITTO
        new Paragraph({
          children: [
            new TextRun({ text: 'Il sottoscritto, ' }),
            new TextRun(cliente.rappresentante_legale
              ? { text: `${cliente.rappresentante_legale}`, bold: true }
              : { text: '____________________________________________________________' }),
            new TextRun({
              text: cliente.tipo_soggetto_rappresentante === 'azienda' ? ' (Ragione Sociale)' : ' (Nome e Cognome)',
              size: 16,
            })
          ],
          spacing: { before: 300, after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: cliente.tipo_soggetto_rappresentante === 'azienda' ? 'Codice fiscale azienda ' : 'Codice fiscale ' }),
            new TextRun(cliente.codice_fiscale_rappresentante
              ? { text: `${cliente.codice_fiscale_rappresentante} `, bold: true }
              : { text: '_____________________________________________________________' })
          ],
          spacing: { after: 80 }
        }),

        // Per azienda: P.IVA + Natura giuridica al posto di "nato a... il..."
        ...(cliente.tipo_soggetto_rappresentante === 'azienda' ? [
          ...(cliente.partita_iva_rappresentante ? [
            new Paragraph({
              children: [
                new TextRun({ text: 'Partita IVA ' }),
                new TextRun({ text: `${cliente.partita_iva_rappresentante} `, bold: true }),
              ],
              spacing: { after: 80 }
            })
          ] : []),
          ...(cliente.natura_giuridica_rappresentante ? [
            new Paragraph({
              children: [
                new TextRun({ text: 'Natura giuridica ' }),
                new TextRun({ text: `${cliente.natura_giuridica_rappresentante} `, bold: true }),
              ],
              spacing: { after: 80 }
            })
          ] : []),
        ] : [
          new Paragraph({
            children: [
              new TextRun({ text: 'nato a ' }),
              new TextRun(cliente.luogo_nascita_rappresentante
                ? { text: `${cliente.luogo_nascita_rappresentante}`, bold: true }
                : { text: '____________' }),
              new TextRun({ text: ' (' }),
              new TextRun(cliente.provincia_nascita_rappresentante
                ? { text: `${cliente.provincia_nascita_rappresentante}`, bold: true }
                : { text: '_____' }),
              new TextRun({ text: ') il ' }),
              new TextRun(cliente.data_nascita_rappresentante
                ? { text: `${formatDate(cliente.data_nascita_rappresentante)}`, bold: true }
                : { text: '___________' }),
            ],
            spacing: { after: 80 }
          })
        ]),

        new Paragraph({
          children: [
            new TextRun({ text: cliente.tipo_soggetto_rappresentante === 'azienda' ? 'con sede legale in ' : 'residente in ' }),
            new TextRun(cliente.residenza_rappresentante
              ? { text: `${cliente.residenza_rappresentante}`, bold: true }
              : { text: '_______________(_____), Località/Via/Piazza  ______________________n. ______' }),
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Nazionalità ' }),
            new TextRun(cliente.nazionalita
              ? { text: `${cliente.nazionalita}`, bold: true }
              : { text: '____________________________' })
          ],
          spacing: { after: 120 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(true)} Dati di nascita e residenza come da documento di identificazione allegato` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} Domicilio diverso rispetto al documento di identificazione allegato` })
          ],
          spacing: { after: 300 }
        }),

        // DICHIARA
        new Paragraph({
          text: 'DICHIARA',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 }
        }),

        new Paragraph({
          text: `che, ai sensi dell'art.18, comma 1, lettera c), D.Lgs. 231/2007, lo scopo e la natura della prestazione professionale richiesta sono: ${incarico.scopo_natura || incarico.descrizione || "Servizi professionali nell'ambito dell'attività d'impresa"}`,
          spacing: { after: 200 },
          alignment: AlignmentType.JUSTIFIED,
          numbering: {
            level: 0,
            reference: "trattino-list",
          },
        }),

        // PEP Status
        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(!isPep)} di non costituire persona politicamente esposta (PEP)` })
          ],
          spacing: { after: 80 },
          indent: {
            left: 250,      
            hanging: 0        
          }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} di non rivestire lo status di PPE da più di un anno` })
          ],
          spacing: { after: 80 },
          indent: {
            left: 250,      
            hanging: 0        
          }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(isPep)} di costituire persona politicamente esposta` })
          ],
          spacing: { after: 200 },
          indent: {
            left: 250,      
            hanging: 0        
          }
        }),

        // TITOLARI EFFETTIVI
        new Paragraph({
          text: "ai fini dell'identificazione del Titolare Effettivo:",
          spacing: { after: 100 },
          numbering: {
            level: 0,
            reference: "trattino-list",
          },
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(tipoRapporto === 'in_proprio')} di agire in proprio` })
          ],
          spacing: { after: 80 },
          indent: {
            left: 250,      
            hanging: 0        
          }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(tipoRapporto === 'per_conto_persone')} di agire per conto dei seguenti titolari effettivi (vedi ALLEGATO - RIEPILOGO DATI)` })
          ],
          spacing: { after: 80 },
          indent: {
            left: 250,      
            hanging: 0        
          }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(tipoRapporto === 'societa_ente' || tipoRapporto === 'caso_residuale')} (caso residuale) di agire per conto della società/ente ${cliente.ragione_sociale || 'N/D'}` })
          ],
          spacing: { after: 80 },
          indent: {
            left: 250,      
            hanging: 0        
          }
        }),

        new Paragraph({
          text: `con sede legale in ${cliente.indirizzo || 'N/D'},`,
          spacing: { after: 80 },
          indent: {
            left: 250,      
            hanging: 0        
          }
        }),

        new Paragraph({
          text: 'in qualità di legale rappresentante, e attesta che i titolari effettivi sono: (vedi ALLEGATO - RIEPILOGO DATI)',
          spacing: { after: 200 },
          indent: {
            left: 250,
            hanging: 0
          }
        }),

        // PEP per titolari effettivi
        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(!hasPepTitolari)} che il/i titolare/i effettivo/i non costituisce/costituiscono PEP` })
          ],
          spacing: { after: 80 },
          indent: {
            left: 250,      
            hanging: 0        
          }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(hasPepTitolari)} che il/i titolari effettivi costituisce/costituiscono PEP` })
          ],
          spacing: { after: 200 },
          indent: {
            left: 250,      
            hanging: 0        
          }
        }),

        // RELAZIONI, FONDI, PAGAMENTI
        new Paragraph({
          text: 'che le relazioni intercorrenti tra Cliente e titolare effettivo sono:',
          spacing: { after: 100 },
          numbering: {
            level: 0,
            reference: "trattino-list",
          },
        }),

        new Paragraph({
          text: `${incarico.relazioni_cliente_te || '_____________________________'}`,
          spacing: { after: 200 },
          indent: {
            left: 250,      
            hanging: 0        
          }
        }),

        new Paragraph({
          text: 'che la provenienza dei fondi utilizzati è:',
          spacing: { after: 100 },
          numbering: {
            level: 0,
            reference: "trattino-list",
          },
        }),

        new Paragraph({
          text: `${incarico.provenienza_fondi || '_____________________________'}`,
          spacing: { after: 200 },
          indent: {
            left: 250,      
            hanging: 0        
          }
        }),

        new Paragraph({
          text: 'che i mezzi di pagamento forniti al professionista sono:',
          spacing: { after: 100 },
          numbering: {
            level: 0,
            reference: "trattino-list",
          },
        }),

        new Paragraph({
          text: `${incarico.mezzi_pagamento || '_____________________________'}`,
          spacing: { after: 200 },
          indent: {
            left: 250,      
            hanging: 0        
          }
        }),

        new Paragraph({
          text: "che i medesimi fondi non provengono né sono destinati a un'attività criminosa o al finanziamento del terrorismo di cui all'art. 2, co. 6, del D.Lgs. 231/2007.",
          spacing: { after: 200 },
          numbering: {
            level: 0,
            reference: "trattino-list",
          },
        }),

        new Paragraph({
          text: `che la professione/attività del cliente è: ${cliente.attivita_svolta || '_____________________________'}`,
          spacing: { after: 300 },
          numbering: {
            level: 0,
            reference: "trattino-list",
          },
        }),

        // DICHIARA ESPRESSAMENTE
        new Paragraph({
          text: 'DICHIARA ESPRESSAMENTE',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 }
        }),

        new Paragraph({
          text: 'di aver esaminato e compreso le definizioni in materia di "persone politicamente esposte", di "titolare effettivo" e di "finanziamento al terrorismo" contenute in calce all\'Allegato alla presente dichiarazione, ii) di essere consapevole delle sanzioni penali previste dall\'art. 55, co. 3, D.Lgs. 231/2007, per chi fornisce dati falsi o informazioni non veritiere, iii) di essere stato informato della circostanza che il mancato rilascio in tutto o in parte delle informazioni di cui sopra pregiudica la possibilità dello Studio professionale di dare esecuzione alla prestazione professionale richiesta.',
          spacing: { after: 300 },
          numbering: {
            reference: "i-list",
            level: 0,
          },
        }),

        // SI IMPEGNA
        new Paragraph({
          text: 'SI IMPEGNA',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 }
        }),

        new Paragraph({
          text: 'a comunicare senza ritardo ogni eventuale integrazione o variazione dei dati sopra indicati.',
          spacing: { after: 200 },
          alignment: AlignmentType.JUSTIFIED
        }),

        new Paragraph({
          text: 'Il sottoscritto prende altresì atto che i propri dati personali saranno trattati dallo Studio professionale esclusivamente per le finalità previste dal D.Lgs. 231/2007 in adempimento degli obblighi previsti dal Regolamento UE 2016/679 per la protezione dei dati.',
          spacing: { after: 400 },
          alignment: AlignmentType.JUSTIFIED
        }),

        // FIRMA E DATA
        new Paragraph({
          text: 'FIRMA E DATA',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Luogo e data: ', bold: true }),
            new TextRun({ text: '______________________________________' })
          ],
          spacing: { after: 300 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Firma del Cliente' }),
            new TextRun({ text: '                                        ' }),
            new TextRun({ text: "Firma del soggetto identificatore" })
          ],
          spacing: { after: 50 }
        }),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({ text: '______________________________' }),
            new TextRun({ text: '                    ' }),
            new TextRun({ text: '______________________________' })
          ],
          spacing: { after: 400 }
        }),

        // PAGEBREAK - ALLEGATO
        new Paragraph({
          children: [new PageBreak()],
          spacing: { after: 0 }
        }),

        new Paragraph({
          text: 'ALLEGATO - RIEPILOGO DATI',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        }),

        new Paragraph({
          text: 'DATI AZIENDALI',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Ragione Sociale: ', bold: true }),
            new TextRun({ text: cliente.ragione_sociale || 'N/D' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Partita IVA: ', bold: true }),
            new TextRun({ text: cliente.partita_iva || 'N/D' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Codice Fiscale: ', bold: true }),
            new TextRun({ text: cliente.codice_fiscale || 'N/D' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Sede Legale: ', bold: true }),
            new TextRun({ text: cliente.indirizzo || 'N/D' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Settore Attività: ', bold: true }),
            new TextRun({ text: cliente.attivita_svolta || incarico.descrizione || 'N/D' })
          ],
          spacing: { after: 300 }
        }),

        new Paragraph({
          text: 'TITOLARI EFFETTIVI IDENTIFICATI',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Secondo D.Lgs. 231/2007, Art. 20', italics: true })
          ],
          spacing: { after: 200 }
        }),

        ...(titolari_effettivi.length > 0
          ? titolari_effettivi.flatMap((titolare, index) => {
              const tIsAzienda = titolare.tipo_soggetto === 'azienda';
              return [
              new Paragraph({
                children: [
                  new TextRun({ text: `${index + 1}. `, bold: true }),
                  new TextRun({ text: titolare.nome_cognome, bold: true }),
                  ...(tIsAzienda ? [new TextRun({ text: ' (Azienda)', italics: true })] : [])
                ],
                spacing: { after: 80 }
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: tIsAzienda ? 'Codice fiscale azienda: ' : 'Codice fiscale: ', bold: true }),
                  new TextRun({ text: titolare.codice_fiscale || 'N/D' })
                ],
                spacing: { after: 80 },
                indent: {
                  left: 250,
                  hanging: 0
                }
              }),
              // Campi azienda
              ...(tIsAzienda && titolare.partita_iva ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Partita IVA: ', bold: true }),
                    new TextRun({ text: titolare.partita_iva })
                  ],
                  spacing: { after: 80 },
                  indent: { left: 250, hanging: 0 }
                })
              ] : []),
              ...(tIsAzienda && titolare.natura_giuridica ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Natura giuridica: ', bold: true }),
                    new TextRun({ text: titolare.natura_giuridica })
                  ],
                  spacing: { after: 80 },
                  indent: { left: 250, hanging: 0 }
                })
              ] : []),
              ...(tIsAzienda && titolare.codice_ateco ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Codice ATECO: ', bold: true }),
                    new TextRun({ text: titolare.codice_ateco })
                  ],
                  spacing: { after: 80 },
                  indent: { left: 250, hanging: 0 }
                })
              ] : []),
              ...(!tIsAzienda && titolare.data_nascita ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Data di nascita: ', bold: true }),
                    new TextRun({ text: formatDate(titolare.data_nascita) })
                  ],
                  spacing: { after: 80 },
                  indent: {
                    left: 250,      
                    hanging: 0        
                  }
                })
              ] : []),
              ...(!tIsAzienda && titolare.comune_nascita ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Luogo di nascita: ', bold: true }),
                    new TextRun({
                      text: `${titolare.comune_nascita}${titolare.provincia_nascita ? ' (' + titolare.provincia_nascita + ')' : ''}`
                    })
                  ],
                  spacing: { after: 80 },
                  indent: { left: 250, hanging: 0 }
                })
              ] : []),
              ...(titolare.nazionalita ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Nazionalità: ', bold: true }),
                    new TextRun({ text: titolare.nazionalita })
                  ],
                  spacing: { after: 80 },
                  indent: { left: 250, hanging: 0 }
                })
              ] : []),
              new Paragraph({
                children: [
                  new TextRun({ text: tIsAzienda ? 'Attività svolta: ' : 'Ruolo: ', bold: true }),
                  new TextRun({ text: titolare.professione || 'N/D' })
                ],
                spacing: { after: 80 },
                indent: { left: 250, hanging: 0 }
              }),
              ...(titolare.residenza ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: tIsAzienda ? 'Sede legale: ' : 'Residenza: ', bold: true }),
                    new TextRun({ text: titolare.residenza })
                  ],
                  spacing: { after: 80 },
                  indent: { left: 250, hanging: 0 }
                })
              ] : []),
              ...(!tIsAzienda && titolare.documento_tipo ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Documento: ', bold: true }),
                    new TextRun({
                      text: `${titolare.documento_tipo == 'carta-identita' ? 'Carta d\'Identità' : titolare.documento_tipo } n. ${titolare.documento_numero || 'N/D'}`
                    })
                  ],
                  spacing: { after: 80 },
                  indent: {
                    left: 250,
                    hanging: 0
                  }
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Rilasciato da: ', bold: true }),
                    new TextRun({ text: titolare.documento_rilascio_ente || 'N/D' }),
                    new TextRun({ text: ' il ' }),
                    new TextRun({ text: formatDate(titolare.documento_rilascio_data) }),
                    new TextRun({ text: ', valido fino al ' }),
                    new TextRun({ text: formatDate(titolare.documento_scadenza) })
                  ],
                  spacing: { after: 80 },
                  indent: {
                    left: 250,
                    hanging: 0
                  }
                })
              ] : []),
              ...(titolare.is_pep ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: '⚠️ PEP (Persona Politicamente Esposta)', bold: true })
                  ],
                  spacing: { after: 80 },
                  indent: { left: 250, hanging: 0 }
                }),
                ...(titolare.pep_carica ? [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Carica: ', bold: true }),
                      new TextRun({ text: titolare.pep_carica })
                    ],
                    spacing: { after: 80 },
                    indent: { left: 250, hanging: 0 }
                  })
                ] : [])
              ] : []),
              ...(titolare.note_quota ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Note: ', bold: true }),
                    new TextRun({ text: titolare.note_quota })
                  ],
                  spacing: { after: 80 },
                  indent: { left: 250, hanging: 0 }
                })
              ] : []),
              new Paragraph({ text: '', spacing: { after: 200 } }),
              new Paragraph({
                children: titolare.tipo_rapporto === 'societa_ente'
                  ? [new TextRun({ text: "Identificato come titolare effettivo ai sensi dell'Art. 20, comma 2" })]
                  : [new TextRun({ text: tIsAzienda ? 'Attività: ' : 'Ruolo: ', bold: true }), new TextRun({ text: titolare.professione || 'N/D' })],
                spacing: { after: 80 },
                indent: { left: 250, hanging: 0 }
              }),
              ...(titolare.tipo_rapporto !== 'societa_ente' ? [
                new Paragraph({
                  text: "Identificato come titolare effettivo ai sensi dell'Art. 20, comma 4",
                  spacing: { after: 150 },
                  indent: {
                    left: 250,
                    hanging: 0
                  }
                })
              ] : [
                new Paragraph({ text: '', spacing: { after: 150 } })
              ])
            ];
            })
          : [
              new Paragraph({ text: '', spacing: { after: 150 } }),
              new Paragraph({
                text: 'Nessun titolare effettivo registrato',
                spacing: { after: 150 }
              })
            ]
        ),

        // LEGALE RAPPRESENTANTE — solo se non è già fra i titolari effettivi (match per nome o CF)
        ...(mostraRappresentanteSeparato ? [
          new Paragraph({
            text: 'LEGALE RAPPRESENTANTE',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Soggetto distinto dai titolari effettivi.', italics: true })
            ],
            spacing: { after: 200 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: cliente.tipo_soggetto_rappresentante === 'azienda' ? 'Ragione sociale: ' : 'Cognome e nome: ', bold: true }),
              new TextRun({ text: cliente.rappresentante_legale || 'N/D', bold: true }),
              ...(cliente.tipo_soggetto_rappresentante === 'azienda' ? [new TextRun({ text: ' (Azienda)', italics: true })] : [])
            ],
            spacing: { after: 80 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: cliente.tipo_soggetto_rappresentante === 'azienda' ? 'Codice fiscale azienda: ' : 'Codice fiscale: ', bold: true }),
              new TextRun({ text: cliente.codice_fiscale_rappresentante || 'N/D' })
            ],
            spacing: { after: 80 },
            indent: { left: 250, hanging: 0 }
          }),
          // Campi azienda
          ...(cliente.tipo_soggetto_rappresentante === 'azienda' && cliente.partita_iva_rappresentante ? [
            new Paragraph({
              children: [
                new TextRun({ text: 'Partita IVA: ', bold: true }),
                new TextRun({ text: cliente.partita_iva_rappresentante })
              ],
              spacing: { after: 80 },
              indent: { left: 250, hanging: 0 }
            })
          ] : []),
          ...(cliente.tipo_soggetto_rappresentante === 'azienda' && cliente.natura_giuridica_rappresentante ? [
            new Paragraph({
              children: [
                new TextRun({ text: 'Natura giuridica: ', bold: true }),
                new TextRun({ text: cliente.natura_giuridica_rappresentante })
              ],
              spacing: { after: 80 },
              indent: { left: 250, hanging: 0 }
            })
          ] : []),
          ...(cliente.tipo_soggetto_rappresentante === 'azienda' && cliente.codice_ateco_rappresentante ? [
            new Paragraph({
              children: [
                new TextRun({ text: 'Codice ATECO: ', bold: true }),
                new TextRun({ text: cliente.codice_ateco_rappresentante })
              ],
              spacing: { after: 80 },
              indent: { left: 250, hanging: 0 }
            })
          ] : []),
          // Campi nascita — solo PF
          ...(cliente.tipo_soggetto_rappresentante !== 'azienda' && cliente.data_nascita_rappresentante ? [
            new Paragraph({
              children: [
                new TextRun({ text: 'Data di nascita: ', bold: true }),
                new TextRun({ text: formatDate(cliente.data_nascita_rappresentante) })
              ],
              spacing: { after: 80 },
              indent: { left: 250, hanging: 0 }
            })
          ] : []),
          ...(cliente.tipo_soggetto_rappresentante !== 'azienda' && cliente.luogo_nascita_rappresentante ? [
            new Paragraph({
              children: [
                new TextRun({ text: 'Luogo di nascita: ', bold: true }),
                new TextRun({
                  text: `${cliente.luogo_nascita_rappresentante}${cliente.provincia_nascita_rappresentante ? ' (' + cliente.provincia_nascita_rappresentante + ')' : ''}`
                })
              ],
              spacing: { after: 80 },
              indent: { left: 250, hanging: 0 }
            })
          ] : []),
          ...(cliente.nazionalita_rappresentante ? [
            new Paragraph({
              children: [
                new TextRun({ text: 'Nazionalità: ', bold: true }),
                new TextRun({ text: cliente.nazionalita_rappresentante })
              ],
              spacing: { after: 80 },
              indent: { left: 250, hanging: 0 }
            })
          ] : []),
          ...(cliente.residenza_rappresentante ? [
            new Paragraph({
              children: [
                new TextRun({ text: cliente.tipo_soggetto_rappresentante === 'azienda' ? 'Sede legale: ' : 'Residenza: ', bold: true }),
                new TextRun({ text: cliente.residenza_rappresentante })
              ],
              spacing: { after: 80 },
              indent: { left: 250, hanging: 0 }
            })
          ] : []),
          // Documento — solo PF
          ...(cliente.tipo_soggetto_rappresentante !== 'azienda' && cliente.rappresentante_legale_documento?.tipo ? [
            new Paragraph({
              children: [
                new TextRun({ text: 'Documento: ', bold: true }),
                new TextRun({
                  text: `${cliente.rappresentante_legale_documento.tipo == 'carta-identita' ? 'Carta d\'Identità' : cliente.rappresentante_legale_documento.tipo} n. ${cliente.rappresentante_legale_documento.numero || 'N/D'}`
                })
              ],
              spacing: { after: 80 },
              indent: { left: 250, hanging: 0 }
            }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Rilasciato da: ', bold: true }),
                new TextRun({ text: cliente.rappresentante_legale_documento.ente_rilascio || 'N/D' }),
                new TextRun({ text: ' il ' }),
                new TextRun({ text: formatDate(cliente.rappresentante_legale_documento.data_rilascio) }),
                new TextRun({ text: ', valido fino al ' }),
                new TextRun({ text: formatDate(cliente.rappresentante_legale_documento.data_scadenza) })
              ],
              spacing: { after: 80 },
              indent: { left: 250, hanging: 0 }
            })
          ] : []),
          new Paragraph({ text: '', spacing: { after: 200 } }),
        ] : []),

        // PAGEBREAK - NOTE LEGALI
        new Paragraph({
          children: [new PageBreak()],
          spacing: { after: 0 }
        }),

        new Paragraph({
          text: 'ALLEGATO - NOTE LEGALI',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        }),

        // NOTA 1 - Riciclaggio
        new Paragraph({
          children: [
            new TextRun({ text: '(Nota 1) ', bold: true }),
           ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Ai sensi dell'art. 2, commi 4 e 5, del D.Lgs. 231/2007, per \"riciclaggio\" si intende: a) la conversione o il trasferimento di beni, effettuati essendo a conoscenza che essi provengono da un'attività criminosa; b) l'occultamento o la dissimulazione della reale natura, provenienza, ubicazione dei beni; c) l'acquisto, la detenzione o l'utilizzazione di beni essendo a conoscenza che provengono da attività criminosa; d) la partecipazione ad uno degli atti sopra indicati." })
          ],
          spacing: { after: 200 },
          alignment: AlignmentType.JUSTIFIED,
          indent: {
            left: 350,
            hanging: 0
          }
        }),

        // NOTA 2 - Finanziamento al terrorismo
        new Paragraph({
          children: [
            new TextRun({ text: '(Nota 2) ', bold: true }),
           ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Ai sensi dell'art. 2, comma 6, del D.Lgs. 231/2007, per \"finanziamento al terrorismo\" si intende qualsiasi attività diretta, con ogni mezzo, alla fornitura, alla raccolta, alla provvista, all'intermediazione, al deposito, alla custodia o all'erogazione di fondi e risorse economiche utilizzabili per il compimento di una o più condotte con finalità di terrorismo." })
          ],
          spacing: { after: 200 },
          alignment: AlignmentType.JUSTIFIED,
          indent: {
            left: 350,
            hanging: 0
          }
        }),

        // NOTA 3 - PEP
        new Paragraph({
          children: [
            new TextRun({ text: '(Nota 3) ', bold: true }),
           ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Ai sensi dell'art.1, comma 2, lett. dd), del D.Lgs. 231/2007, per \"persone politicamente esposte\" si intendono: le persone fisiche che occupano o hanno cessato di occupare da meno di un anno importanti cariche pubbliche (Presidente della Repubblica, Ministro, parlamentare, giudice, ecc.), nonché i loro familiari e coloro che con i predetti soggetti intrattengono notoriamente stretti legami." })
          ],
          spacing: { after: 200 },
          alignment: AlignmentType.JUSTIFIED,
          indent: {
            left: 350,
            hanging: 0
          }
        }),

        // NOTA 4 - Titolare Effettivo
        new Paragraph({
          children: [
            new TextRun({ text: '(Nota 4) ', bold: true }),
           ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Ai sensi dell'art. 1, comma 2, lett. pp), del D.Lgs. 231/2007, per \"titolare effettivo\" si intende la persona fisica o le persone fisiche cui, in ultima istanza, è attribuibile la proprietà diretta o indiretta dell'ente ovvero il relativo controllo. Secondo l'art. 20, per le società di capitali costituisce indicazione di proprietà diretta la titolarità di una partecipazione superiore al 25% del capitale. Qualora l'applicazione di tali criteri non consenta di individuare univocamente uno o più titolari effettivi, il titolare effettivo coincide con la persona fisica o le persone fisiche titolari di poteri di amministrazione o direzione della società." })
          ],
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 200 },
          indent: {
            left: 350,      
            hanging: 0        
          }
        })
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  const filename = `AV4_Dichiarazione_${incarico.codice_incarico || today.replace(/\//g, '-')}.docx`;
  return { blob, filename };
}

export async function generateAndDownloadDOCX_AV4(data: AMLData): Promise<void> {
  const { blob, filename } = await generateBlobDOCX_AV4(data);
  saveAs(blob, filename);
}

/**
 * Genera e scarica documento DOCX AV.1 - Determinazione del Rischio Effettivo
 * e della Tipologia di Adeguata Verifica (Art. 17, CO. 3, D.Lgs. 231/2007)
 *
 * Struttura fedele al modello in documentazione/ALLEGATI_Linee_Guida.docx pag.7
 */
export async function generateBlobDOCX_AV1(data: AMLData, options?: { blank?: boolean }): Promise<{ blob: Blob; filename: string }> {
  const { cliente, incarico, valutazione } = data;
  const today = formatDate(new Date().toISOString());
  const isBlank = options?.blank === true;

  if (!valutazione && !isBlank) {
    throw new Error('Nessuna valutazione del rischio disponibile per generare il modello AV.1');
  }

  // Per il modulo vuoto, crea una valutazione fittizia con tutti i punteggi vuoti
  const emptyFattore: FattoreRischio = { score: 0, fattoriSelezionati: [], altro: '' };
  const prestazioneInfo = incarico.tipologia_prestazione_id ? getPrestazione(incarico.tipologia_prestazione_id) : null;
  const prestazioneOnlyTabA = prestazioneInfo?.onlyTabA === true;

  const blankTabB = !prestazioneOnlyTabA ? {
    tipologia: emptyFattore,
    modalita: emptyFattore,
    ammontare: emptyFattore,
    frequenzaVolumeDurata: emptyFattore,
    ragionevolezza: emptyFattore,
    areaDestinazione: emptyFattore,
  } : null;

  const blankValutazione = {
    tabella_a_scores: {
      naturaGiuridica: emptyFattore,
      attivitaPrevalente: emptyFattore,
      comportamentoConferimento: emptyFattore,
      areaClienteControparte: emptyFattore,
    },
    tabella_b_scores: blankTabB,
    rischio_specifico: 0,
    rischio_inerente_prestazione: prestazioneInfo?.inherentRisk || 0,
    rischio_effettivo: 0,
    classe_rischio: 0,
    created_at: new Date().toISOString(),
  };

  const v = isBlank ? blankValutazione : valutazione!;
  const tabA = v.tabella_a_scores;
  const tabB = v.tabella_b_scores;
  const hasTabB = tabB != null;

  // Calcolo medie (usando getFattoreScore per compatibilità con dati oggetto/numero)
  const scoreA1 = getFattoreScore(tabA.naturaGiuridica);
  const scoreA2 = getFattoreScore(tabA.attivitaPrevalente);
  const scoreA3 = getFattoreScore(tabA.comportamentoConferimento);
  const scoreA4 = getFattoreScore(tabA.areaClienteControparte);
  const totA = scoreA1 + scoreA2 + scoreA3 + scoreA4;
  const mediaA = totA / 4;

  let totB = 0;
  if (hasTabB) {
    totB = getFattoreScore(tabB.tipologia) + getFattoreScore(tabB.modalita) + getFattoreScore(tabB.ammontare)
      + getFattoreScore(tabB.frequenzaVolumeDurata) + getFattoreScore(tabB.ragionevolezza) + getFattoreScore(tabB.areaDestinazione);
  }

  const rischioSpecifico = Number(v.rischio_specifico || 0);
  const rischioInerentePond = Number(v.rischio_inerente_prestazione || 0) * 0.3;
  const rischioSpecificoPond = rischioSpecifico * 0.7;
  const rischioEffettivo = Number(v.rischio_effettivo || 0);
  const classificazioneSpecifico = getClassificationText(rischioSpecifico);
  const classeRischio = v.classe_rischio;
  const tipoVerifica = classeRischio >= 4 ? 'RAFFORZATA' : classeRischio >= 3 ? 'ORDINARIA' : 'SEMPLIFICATA';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elems: any[] = [];

  // =================== TITOLO ===================
  elems.push(
    tblPara([tblText('AV.1 – DETERMINAZIONE DEL RISCHIO EFFETTIVO E DELLA TIPOLOGIA DI ADEGUATA VERIFICA', { bold: true, size: 26 })], { align: AlignmentType.JUSTIFIED, after: 60 }),
    tblPara([tblText('Riferimenti: Art. 17, CO. 3, D.Lgs. 231/2007', { size: 18 })], { align: AlignmentType.JUSTIFIED, after: 300 }),
  );

  // =================== CLIENTE / PRESTAZIONE ===================
  elems.push(
    tblPara([tblText('CLIENTE: ', { bold: true }), tblText(cliente.ragione_sociale || '.......................................................................................................')], { after: 80 }),
    tblPara([tblText('PRESTAZIONE/I PROFESSIONALE/I: ', { bold: true }), tblText(
      (incarico.tipologia_prestazione_id ? getPrestazione(incarico.tipologia_prestazione_id)?.label : null)
        || incarico.descrizione || '.......................................................................................................'
    )], { after: 300 }),
  );

  // =================== SCALA PUNTEGGIO ===================
  elems.push(
    tblPara([tblText('Punteggio / scala di intensità da adottare per le misurazioni del rischio inerente e del rischio specifico:', { size: 20 })], { after: 40 }),
    tblPara([tblText('1 = non significativo', { size: 20 })], { after: 20 }),
    tblPara([tblText('2 = poco significativo', { size: 20 })], { after: 20 }),
    tblPara([tblText('3 = abbastanza significativo', { size: 20 })], { after: 20 }),
    tblPara([tblText('4 = molto significativo', { size: 20 })], { after: 300 }),
  );

  // =================== I. RISCHIO INERENTE ===================
  const prestazioneLabel = prestazioneInfo?.label || incarico.descrizione || '';
  elems.push(
    tblPara([tblText('I.  Misurazione del rischio inerente', { bold: true })], { after: 80 }),
    tblPara([
      tblText('Valore assegnato al rischio inerente: ', { size: 20 }),
      tblText(Number(v.rischio_inerente_prestazione || 0).toFixed(2), { bold: true, size: 20 }),
    ], { after: 80 }),
  );
  // Spiega perché manca la Tabella B (quando manca) in base alla tipologia prestazione
  if (!hasTabB && prestazioneLabel) {
    elems.push(
      tblPara([
        tblText(`Nota: la Tabella B (aspetti connessi all'operazione) non è prevista per la tipologia di prestazione `, { size: 18, italic: true }),
        tblText(`"${prestazioneLabel}"`, { size: 18, italic: true, bold: true }),
        tblText(`. Il rischio specifico viene calcolato esclusivamente sulla base della Tabella A (Totale A / 4).`, { size: 18, italic: true }),
      ], { after: 240, align: AlignmentType.JUSTIFIED }),
    );
  } else {
    elems.push(tblPara([], { after: 160 }));
  }

  // =================== II. RISCHIO SPECIFICO ===================
  elems.push(
    tblPara([tblText('II.  Misurazione del rischio specifico', { bold: true })], { after: 120 }),
  );

  // ---------- TABELLA A (3 colonne come originale) ----------
  // Fattori di rischio A con sotto-voci descrittive, ID e checkbox selezionati
  const selA1 = getFattoreSelezionati(tabA.naturaGiuridica);
  const selA2 = getFattoreSelezionati(tabA.attivitaPrevalente);
  const selA3 = getFattoreSelezionati(tabA.comportamentoConferimento);
  const selA4 = getFattoreSelezionati(tabA.areaClienteControparte);

  const factorsA: { header: string; rows: { id: string; label: string }[]; score: number; sel: string[] }[] = [
    {
      header: 'A.1 - Natura giuridica',
      rows: [
        { id: 'a1_non_congruita', label: 'Non congruità della natura giuridica prescelta in relazione all\'attività svolta e alle sue dimensioni' },
        { id: 'a1_articolazione_opaca', label: 'Articolazione giuridica, complessità e opacità della struttura volte ad ostacolare l\'identificazione del titolare effettivo o l\'attività concretamente svolta' },
        { id: 'a1_ppe', label: 'Partecipazione di persone politicamente esposte (cliente, esecutore, titolare effettivo)' },
        { id: 'a1_ong_paesi_rischio', label: 'Incarichi in società, associazioni, fondazioni, organizzazioni non lucrative, organizzazioni non governative soprattutto se aventi sede in paesi ad alto rischio o non collaborativi' },
        { id: 'a1_processi_penali', label: 'Processi penali o indagini in corso per circostanze attinenti al terrorismo, al riciclaggio o all\'autoriciclaggio – Misure di prevenzione o provvedimenti di sequestro - Familiarità/stretti legami con soggetti sottoposti a indagini o a procedimenti penali' },
      ],
      score: scoreA1, sel: selA1,
    },
    {
      header: 'A.2 - Prevalente attività svolta',
      rows: [
        { id: 'a2_infiltrazioni', label: 'Attività esposte al rischio di infiltrazioni criminali e terroristiche secondo le periodiche pubblicazioni delle Autorità in materia' },
        { id: 'a2_struttura_non_coerente', label: 'Struttura organizzativa e dimensionale non coerente con l\'attività svolta' },
        { id: 'a2_non_conformita', label: 'Non conformità dell\'attività svolta rispetto a quella indicata nell\'atto costitutivo' },
      ],
      score: scoreA2, sel: selA2,
    },
    {
      header: 'A.3 - Comportamento tenuto al momento del conferimento dell\'incarico',
      rows: [
        { id: 'a3_non_presente', label: 'Cliente non presente fisicamente' },
        { id: 'a3_terzi_non_definiti', label: 'Presenza di soggetti terzi con ruolo non definito' },
        { id: 'a3_non_trasparente', label: 'Comportamento non trasparente e collaborativo' },
        { id: 'a3_difficolta_te', label: 'Difficoltà nell\'individuazione del titolare effettivo' },
      ],
      score: scoreA3, sel: selA3,
    },
    {
      header: 'A.4 - Area geografica di residenza del cliente',
      rows: [
        { id: 'a4_comune_rischio_contante', label: 'Residenza/localizzazione in: comune italiano a rischio a causa dell\'utilizzo eccessivo di contante' },
        { id: 'a4_paesi_alto_rischio', label: 'Paesi terzi ad alto rischio individuati dalle Autorità o non collaborativi con il GAFI' },
        { id: 'a4_corruzione', label: 'Paesi con elevata corruzione o permeabilità ad altre attività criminose' },
        { id: 'a4_conflitto_sanzioni', label: 'Aree di conflitto/terrorismo o soggette a sanzioni/embargo ONU' },
        { id: 'a4_lontananza', label: 'Lontananza della residenza del cliente rispetto alla sede del professionista' },
      ],
      score: scoreA4, sel: selA4,
    },
  ];

  const tabARows: TableRow[] = [];
  // Header
  tabARows.push(new TableRow({
    children: [
      tblCell('Aspetti connessi al cliente', { bold: true, width: 55, size: 18 }),
      tblCell('Fattore di rischio riscontrato\n(barrare i fattori riscontrati)', { bold: true, width: 25, align: AlignmentType.CENTER, size: 16 }),
      tblCell('Livello di rischio specifico\n(da 1 a 4)', { bold: true, width: 20, align: AlignmentType.CENTER, size: 16 }),
    ]
  }));
  for (const factor of factorsA) {
    // Sub-header (es. "A.1 - Natura giuridica") — punteggio visibile, bordi normali
    tabARows.push(new TableRow({
      children: [
        tblCell(factor.header, { bold: true, size: 16 }),
        tblCell('', { align: AlignmentType.CENTER }),
        tblCell(factor.score.toFixed(0), { bold: true, align: AlignmentType.CENTER, size: 18 }),
      ]
    }));
    // Fattori di rischio — checkbox ☑/☐ in base ai fattoriSelezionati
    const rows = factor.rows;
    for (let di = 0; di < rows.length; di++) {
      const checked = factor.sel.includes(rows[di].id);
      const pos: 'first' | 'mid' | 'last' = di === 0 ? 'first' : 'mid';
      tabARows.push(new TableRow({
        children: [
          tblCell(rows[di].label, { size: 14 }),
          tblCell(getCheckbox(checked), { align: AlignmentType.CENTER, size: 16 }),
          tblCell('', { mergeVisual: pos }),
        ]
      }));
    }
    // Riga "Altro" — chiude il blocco vuoto col 3
    tabARows.push(new TableRow({
      children: [
        tblCell('Altro', { size: 14 }),
        tblCell('☐', { align: AlignmentType.CENTER, size: 16 }),
        tblCell('', { mergeVisual: 'last' }),
      ]
    }));
  }
  // TOTALE A
  tabARows.push(new TableRow({
    children: [
      tblCell('', {}),
      tblCell('TOTALE A', { bold: true, shading: C_GRAY, align: AlignmentType.CENTER, size: 16 }),
      tblCell(totA.toFixed(0), { bold: true, shading: C_GRAY, align: AlignmentType.CENTER, size: 18 }),
    ]
  }));

  elems.push(new Table({ rows: tabARows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));

  // ---------- TABELLA B (se presente, su nuova pagina) ----------
  if (hasTabB) {
    elems.push(new Paragraph({ children: [new PageBreak()] }));
    const selB1 = getFattoreSelezionati(tabB.tipologia);
    const selB2 = getFattoreSelezionati(tabB.modalita);
    const selB3 = getFattoreSelezionati(tabB.ammontare);
    const selB4 = getFattoreSelezionati(tabB.frequenzaVolumeDurata);
    const selB5 = getFattoreSelezionati(tabB.ragionevolezza);
    const selB6 = getFattoreSelezionati(tabB.areaDestinazione);

    const factorsB: { header: string; rows: { id: string; label: string }[]; score: number; sel: string[] }[] = [
      {
        header: 'B.1 - Tipologia',
        rows: [
          { id: 'b1_ordinaria_straordinaria', label: 'Operazione ordinaria/straordinaria rispetto al profilo soggettivo del cliente' },
          { id: 'b1_schemi_opacita', label: 'Operazione che prevede schemi negoziali che possono agevolare l\'opacità delle relazioni economiche e finanziarie' },
          { id: 'b1_articolazione_ingiustificata', label: 'Articolazione contrattuale ingiustificata' },
        ],
        score: getFattoreScore(tabB.tipologia), sel: selB1,
      },
      {
        header: 'B.2 - Modalità di svolgimento',
        rows: [
          { id: 'b2_pagamenti_non_tracciati', label: 'Utilizzo di mezzi di pagamento non tracciati - Utilizzo di valute virtuali' },
          { id: 'b2_conti_non_propri', label: 'Utilizzo di conti non propri per trasferire/ricevere fondi' },
          { id: 'b2_procure_reiterate', label: 'Ricorso reiterato a procure' },
          { id: 'b2_domiciliazioni_comodo', label: 'Ricorso a domiciliazioni di comodo' },
        ],
        score: getFattoreScore(tabB.modalita), sel: selB2,
      },
      {
        header: 'B.3 - Ammontare dell\'operazione',
        rows: [
          { id: 'b3_incoerenza_ammontare', label: 'Incoerenza dell\'ammontare rispetto al profilo economico e finanziario del cliente' },
          { id: 'b3_frazionamenti', label: 'Presenza di frazionamenti artificiosi' },
        ],
        score: getFattoreScore(tabB.ammontare), sel: selB3,
      },
      {
        header: 'B.4 - Frequenza e volume delle operazioni/durata della prestazione professionale',
        rows: [
          { id: 'b4_non_congruita_frequenza', label: 'Non congruità della frequenza dell\'operazione rispetto all\'attività esercitata – Operatività improvvisa e poco giustificata' },
          { id: 'b4_continuativo_occasionale', label: 'Rapporto professionale continuativo o occasionale' },
        ],
        score: getFattoreScore(tabB.frequenzaVolumeDurata), sel: selB4,
      },
      {
        header: 'B.5 - Ragionevolezza',
        rows: [
          { id: 'b5_irragionevolezza_attivita', label: 'Irragionevolezza dell\'operazione rispetto all\'attività svolta dal cliente' },
          { id: 'b5_irragionevolezza_risorse', label: 'Irragionevolezza dell\'operazione rispetto all\'entità delle risorse economiche nella disponibilità del cliente' },
          { id: 'b5_non_congruita_finalita', label: 'Non congruità dell\'operazione rispetto alle finalità dichiarate' },
        ],
        score: getFattoreScore(tabB.ragionevolezza), sel: selB5,
      },
      {
        header: 'B.6 - Area geografica di destinazione',
        rows: [
          { id: 'b6_comune_rischio', label: 'Destinazione in: comune italiano a rischio – Paesi terzi ad alto rischio – Paesi soggetti a sanzioni o embarghi – Aree di conflitto' },
          { id: 'b6_no_riferimenti', label: 'Inesistenza di riferimenti tradizionali nell\'area geografica di destinazione' },
          { id: 'b6_irragionevolezza_aree', label: 'Irragionevolezza e non congruità della ricerca di interazione con altre aree geografiche' },
        ],
        score: getFattoreScore(tabB.areaDestinazione), sel: selB6,
      },
    ];

    const tabBRows: TableRow[] = [];
    tabBRows.push(new TableRow({
      children: [
        tblCell('B. Aspetti connessi all\'operazione e/o prestazione professionale', { bold: true, width: 55, size: 18 }),
        tblCell('Fattore di rischio riscontrato\n(barrare i fattori riscontrati)', { bold: true, width: 25, align: AlignmentType.CENTER, size: 16 }),
        tblCell('Livello di rischio specifico\n(da 1 a 4)', { bold: true, width: 20, align: AlignmentType.CENTER, size: 16 }),
      ]
    }));
    for (const factor of factorsB) {
      tabBRows.push(new TableRow({
        children: [
          tblCell(factor.header, { bold: true, size: 16 }),
          tblCell('', { align: AlignmentType.CENTER }),
          tblCell(factor.score.toFixed(0), { bold: true, align: AlignmentType.CENTER, size: 18 }),
        ]
      }));
      const rowsB = factor.rows;
      for (let di = 0; di < rowsB.length; di++) {
        const checked = factor.sel.includes(rowsB[di].id);
        const pos: 'first' | 'mid' | 'last' = di === 0 ? 'first' : 'mid';
        tabBRows.push(new TableRow({
          children: [
            tblCell(rowsB[di].label, { size: 14 }),
            tblCell(getCheckbox(checked), { align: AlignmentType.CENTER, size: 16 }),
            tblCell('', { mergeVisual: pos }),
          ]
        }));
      }
      tabBRows.push(new TableRow({
        children: [
          tblCell('Altro', { size: 14 }),
          tblCell('☐', { align: AlignmentType.CENTER, size: 16 }),
          tblCell('', { mergeVisual: 'last' }),
        ]
      }));
    }
    tabBRows.push(new TableRow({
      children: [
        tblCell('', {}),
        tblCell('TOTALE B', { bold: true, shading: C_GRAY, align: AlignmentType.CENTER, size: 16 }),
        tblCell(totB.toFixed(0), { bold: true, shading: C_GRAY, align: AlignmentType.CENTER, size: 18 }),
      ]
    }));

    elems.push(new Table({ rows: tabBRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
    elems.push(tblPara([], { after: 200 }));
  }

  // =================== FORMULA RISCHIO SPECIFICO ===================
  if (hasTabB) {
    elems.push(tblPara([
      tblText(`Totale A (${totA.toFixed(0)}) + Totale B (${totB.toFixed(0)})  =  ${(totA + totB).toFixed(0)}  :  10  =  `),
      tblText(rischioSpecifico.toFixed(2), { bold: true }),
    ], { after: 60 }));
  }
  if (!hasTabB) {
    elems.push(tblPara([
      tblText(`Totale A (${totA.toFixed(0)})  :  4  =  `),
      tblText(mediaA.toFixed(2), { bold: true }),
    ], { after: 200 }));
  }

  // =================== TABELLA SCALA RISCHIO SPECIFICO ===================
  if (!hasTabB) {elems.push(new Paragraph({ children: [new PageBreak()] }));};
  elems.push(tblPara([tblText('Considerato il punteggio calcolato e tenendo conto della scala graduata che segue,')], { after: 80 }));

  const scalaRows = [
    new TableRow({ children: [tblCell('Valori medi', { bold: true, width: 50, size: 18 }), tblCell('Rischio specifico', { bold: true, width: 50, size: 18 })] }),
    new TableRow({ children: [tblCell('Punteggio 1-1.5', { size: 18 }), tblCell('Non significativo', { shading: C_GREEN, size: 18 })] }),
    new TableRow({ children: [tblCell('Punteggio 1.6-2.5', { size: 18 }), tblCell('Poco significativo', { shading: C_YELLOW, size: 18 })] }),
    new TableRow({ children: [tblCell('Punteggio 2.6-3.5', { size: 18 }), tblCell('Abbastanza significativo', { shading: C_ORANGE, size: 18 })] }),
    new TableRow({ children: [tblCell('Punteggio 3.6-4.0', { size: 18 }), tblCell('Molto significativo', { shading: C_RED, size: 18 })] }),
  ];
  elems.push(new Table({ rows: scalaRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([], { after: 120 }));

  elems.push(tblPara([
    tblText('il livello di rischio specifico è classificabile come '),
    tblText(`${classificazioneSpecifico.toUpperCase()}`, { bold: true }),
  ], { after: 300 }));

  // =================== III. RISCHIO EFFETTIVO ===================
  if (hasTabB) {elems.push(new Paragraph({ children: [new PageBreak()] }));};
  elems.push(tblPara([tblText('III. Determinazione del rischio effettivo', { bold: true })], { after: 120 }));

  // Tabella ponderazione (3 colonne come originale)
  const pondRows = [
    new TableRow({ children: [
      tblCell('RISCHIO INERENTE PONDERATO', { bold: true, width: 40, size: 16 }),
      tblCell(`${Number(v.rischio_inerente_prestazione || 0).toFixed(2)} X 0,30 =`, { width: 35, size: 16 }),
      tblCell(rischioInerentePond.toFixed(2), { bold: true, width: 25, align: AlignmentType.CENTER, size: 18 }),
    ] }),
    new TableRow({ children: [
      tblCell('RISCHIO SPECIFICO PONDERATO', { bold: true, size: 16 }),
      tblCell(`${rischioSpecifico.toFixed(2)} X 0,70 =`, { size: 16 }),
      tblCell(rischioSpecificoPond.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 18 }),
    ] }),
    new TableRow({ children: [
      tblCell('', {}),
      tblCell('RISCHIO EFFETTIVO', { bold: true, size: 16 }),
      tblCell(rischioEffettivo.toFixed(2), { bold: true, align: AlignmentType.CENTER, size: 20 }),
    ] }),
  ];
  elems.push(new Table({ rows: pondRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([], { after: 200 }));

  // =================== MATRICE DI RACCORDO (6 colonne, colori originali) ===================
  // Valori dalla matrice del documento originale con colori per cella
  const mVals: { label: string; inerente: number; vals: { text: string; num: number }[] }[] = [
    { label: 'Molto significativo 4', inerente: 4, vals: [{ text: '1,90', num: 1.9 }, { text: '2,60', num: 2.6 }, { text: '3,30', num: 3.3 }, { text: '4', num: 4 }] },
    { label: 'abbastanza significativo 3', inerente: 3, vals: [{ text: '1,60', num: 1.6 }, { text: '2,30', num: 2.3 }, { text: '3', num: 3 }, { text: '3,70', num: 3.7 }] },
    { label: 'poco significativo 2', inerente: 2, vals: [{ text: '1,30', num: 1.3 }, { text: '2', num: 2 }, { text: '2,70', num: 2.7 }, { text: '3,40', num: 3.4 }] },
    { label: 'non significativo 1', inerente: 1, vals: [{ text: '1', num: 1 }, { text: '1,70', num: 1.7 }, { text: '2,40', num: 2.4 }, { text: '3,10', num: 3.1 }] },
  ];

  const MATRIX_ROW_H = 400; // twips — altezza uniforme per tutte le righe
  const mRows: TableRow[] = [];
  // Data rows — col 1 unita visivamente: label diviso su riga 2 (bottom) e riga 3 (top) per centratura verticale
  for (let ri = 0; ri < mVals.length; ri++) {
    const r = mVals[ri];
    const merge: 'first' | 'mid' | 'last' = ri === 0 ? 'first' : ri === mVals.length - 1 ? 'last' : 'mid';
    let col1Text = '';
    let col1VAlign: 'top' | 'center' | 'bottom' | undefined;
    if (ri === 1) { col1Text = 'RISCHIO INERENTE'; col1VAlign = 'bottom'; }
    if (ri === 2) { col1Text = '(coefficiente di ponderazione = 30%)'; col1VAlign = 'top'; }
    mRows.push(new TableRow({
      height: { value: MATRIX_ROW_H, rule: HeightRule.ATLEAST },
      children: [
        tblCell(col1Text, { size: 14, width: 18, mergeVisual: merge, vAlign: col1VAlign, align: AlignmentType.CENTER }),
        tblCell(r.label, { size: 14, width: 17, align: AlignmentType.CENTER }),
        ...r.vals.map(c => tblCell(c.text, { bold: true, shading: matrixColor(c.num), align: AlignmentType.CENTER, size: 16, width: 16 })),
      ]
    }));
  }
  // Footer row labels
  mRows.push(new TableRow({
    height: { value: MATRIX_ROW_H, rule: HeightRule.ATLEAST },
    children: [
      tblCell('', { size: 14 }),
      tblCell('', { size: 14 }),
      tblCell('1\nnon significativo', { size: 14, align: AlignmentType.CENTER }),
      tblCell('2\npoco significativo', { size: 14, align: AlignmentType.CENTER }),
      tblCell('3\nabbastanza significativo', { size: 14, align: AlignmentType.CENTER }),
      tblCell('4\nmolto significativo', { size: 14, align: AlignmentType.CENTER }),
    ]
  }));
  // Footer label RISCHIO SPECIFICO — colSpan 4 per unire le ultime 4 colonne
  mRows.push(new TableRow({
    height: { value: MATRIX_ROW_H, rule: HeightRule.ATLEAST },
    children: [
      tblCell('', { size: 14 }),
      tblCell('', { size: 14 }),
      tblCell('RISCHIO SPECIFICO\n(coefficiente di ponderazione = 70%)', { size: 14, align: AlignmentType.CENTER, colSpan: 4 }),
    ]
  }));

  elems.push(new Table({ rows: mRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([], { after: 120 }));

  elems.push(tblPara([
    tblText('Determinazione del rischio effettivo: '),
    tblText(rischioEffettivo.toFixed(2), { bold: true }),
  ], { after: 300 }));

  // =================== IV. TIPOLOGIA ADEGUATA VERIFICA ===================
  elems.push(tblPara([tblText('IV. Determinazione della tipologia di adeguata verifica', { bold: true })], { after: 120 }));

  // Tabella raccordo rischio/misure (con colori originali)
  const raccRows = [
    new TableRow({ children: [tblCell('Grado di rischio', { bold: true, width: 50, size: 18 }), tblCell('Misure di adeguata verifica', { bold: true, width: 50, size: 18 })] }),
    new TableRow({ children: [tblCell('non significativo', { shading: C_GREEN, size: 18 }), tblCell('Semplificate', { shading: C_GREEN, size: 18 })] }),
    new TableRow({ children: [tblCell('poco significativo', { shading: C_YELLOW, size: 18 }), tblCell('Semplificate', { shading: C_YELLOW, size: 18 })] }),
    new TableRow({ children: [tblCell('abbastanza significativo', { shading: C_ORANGE, size: 18 }), tblCell('Ordinarie', { shading: C_ORANGE, size: 18 })] }),
    new TableRow({ children: [tblCell('molto significativo', { shading: C_RED, size: 18 }), tblCell('Rafforzate', { shading: C_RED, size: 18 })] }),
  ];
  elems.push(new Table({ rows: raccRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([], { after: 200 }));

  elems.push(tblPara([
    tblText('Sulla base del valore di rischio effettivo pari a '),
    tblText(rischioEffettivo.toFixed(2), { bold: true }),
    tblText(' e considerando la relativa tabella di raccordo, al cliente '),
    tblText(cliente.ragione_sociale || '.....................................................................', { bold: true }),
  ], { after: 60, align: AlignmentType.JUSTIFIED }));

  elems.push(tblPara([tblText('va associata una ADEGUATA VERIFICA di tipo:')], { after: 120, align: AlignmentType.JUSTIFIED }));

  // Checkbox tipo verifica (size 32 = 16pt come originale)
  elems.push(
    tblPara([tblText(`${getCheckbox(tipoVerifica === 'SEMPLIFICATA')} SEMPLIFICATA`, { size: 32 })], { after: 60, align: AlignmentType.JUSTIFIED }),
    tblPara([tblText(`${getCheckbox(tipoVerifica === 'ORDINARIA')} ORDINARIA`, { size: 32 })], { after: 60, align: AlignmentType.JUSTIFIED }),
    tblPara([tblText(`${getCheckbox(tipoVerifica === 'RAFFORZATA')} RAFFORZATA`, { size: 32 })], { after: 300, align: AlignmentType.JUSTIFIED }),
  );

  // =================== DATA E FIRMA ===================
  elems.push(
    tblPara([tblText(`Data ${formatDate(v.created_at)}`)], { after: 120 }),
    tblPara([tblText('Firma ..................................................')], { after: 200 }),
  );

  // =================== DOCUMENTO ===================
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: elems
    }]
  });

  const blob = await Packer.toBlob(doc);
  const suffix = isBlank ? '_VUOTO' : '';
  const filename = `AV1_RischioEffettivo_${incarico.codice_incarico || today.replace(/\//g, '-')}${suffix}.docx`;
  return { blob, filename };
}

export async function generateAndDownloadDOCX_AV1(data: AMLData, options?: { blank?: boolean }): Promise<void> {
  const { blob, filename } = await generateBlobDOCX_AV1(data, options);
  saveAs(blob, filename);
}

/**
 * Genera e scarica documento DOCX AV.7 - Controllo Costante
 * Merge delle tabelle da:
 * - documentazione/ALLEGATI_Linee_Guida.docx (pag. 24-25)
 * - documentazione/aggiornamenti-materialeExtra/CNDCEC_modulistica-AML-1 (1).docx (pag. 20-21)
 */
export interface ControlloCC {
  data_controllo?: string;
  tipologia?: string;
  esito?: string;
  azioni_intraprese?: string;
  prossima_scadenza?: string;
  checklist_cc?: Record<string, string>;  // key -> 'si' | 'no' | 'na' | ''
  esito_rischio?: string;                 // 'confermato' | 'aumentato' | 'ridotto' | ''
  annotazioni_cc?: string;
  nuovo_rischio_effettivo?: number;       // nuovo valore rischio effettivo (1-4) se aumentato/ridotto
}

export async function generateBlobDOCX_CC(data: AMLData, controlloData?: ControlloCC): Promise<{ blob: Blob; filename: string }> {
  const { cliente, incarico } = data;
  const today = formatDate(new Date().toISOString());
  const av7 = controlloData?.checklist_cc || {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elems: any[] = [];

  // =================== TITOLO ===================
  elems.push(
    tblPara([tblText('AV.7 - CONTROLLO COSTANTE', { bold: true, size: 28 })], { after: 60, align: AlignmentType.CENTER }),
    tblPara([tblText('(art. 18, co. 1, lett. d) e art. 19 D.Lgs. 231/2007)', { size: 20 })], { after: 200, align: AlignmentType.CENTER }),
  );

  // =================== CLIENTE ===================
  elems.push(
    tblPara([
      tblText('Cliente: ', { bold: true, size: 22 }),
      tblText(cliente.ragione_sociale || '________________________________________', { size: 22 }),
    ], { after: 120 }),
  );

  // =================== PREMESSA ===================
  const premessaItems = [
    'verificare la coerenza tra la complessiva operatività del cliente (operazioni e attività), la conoscenza che ha maturato del medesimo e il profilo di rischio che gli ha assegnato;',
    'verificare che lo scopo e la natura delle prestazioni professionali dichiarati dal cliente all\'atto del conferimento dell\'incarico siano coerenti con le informazioni acquisite nel corso dello svolgimento dell\'incarico stesso;',
    'in funzione del rischio, verificare la provenienza dei fondi e delle risorse nella disponibilità del cliente;',
    'verificare che non siano intervenute variazioni nei titolari effettivi e nelle persone politicamente esposte e, se del caso, acquisire una nuova dichiarazione del cliente;',
    'verificare che i dati identificativi del cliente e dell\'esecutore siano aggiornati e, se del caso, acquisire quelli modificati.',
  ];

  elems.push(
    tblPara([tblText('Il professionista deve effettuare le seguenti attività:', { italic: true, size: 22 })], { after: 120 }),
  );

  premessaItems.forEach((item, i) => {
    elems.push(new Paragraph({
      children: [new TextRun({ text: item, size: 20, font: { name: FONT } })],
      numbering: { reference: 'cc-premessa-list', level: 0 },
      spacing: { before: 40, after: i === premessaItems.length - 1 ? 160 : 40 },
      alignment: AlignmentType.JUSTIFIED,
    }));
  });

  elems.push(
    tblPara([tblText('In esito alle verifiche effettuate, il soggetto obbligato conclude in merito al livello di rischio complessivo associabile al cliente, aumentando o diminuendo quello precedentemente attribuito e, di conseguenza, determina le tempistiche per l\'effettuazione del successivo controllo.', { italic: true })], { after: 300 }),
  );

  // =================== TABELLA CONTROLLI (MERGE) ===================
  // Definizione dei controlli (merge delle due tabelle)
  const controlli = [
    { key: 'cc_1', num: '1', testo: 'La complessiva operatività del cliente (operazioni e attività) risulta coerente rispetto alla conoscenza del medesimo e al profilo di rischio assegnato?' },
    { key: 'cc_2', num: '2', testo: 'Nell\'ambito della prestazione professionale svolta sono state riscontrate infrazioni del contante/titoli o anomalie rilevanti ai fini della SOS?' },
    { key: 'cc_3', num: '3', testo: 'Permane la coerenza dello scopo e natura delle prestazioni professionali dichiarate dal cliente all\'atto del conferimento dell\'incarico con le informazioni acquisite nel corso dello svolgimento dell\'incarico?' },
    { key: 'cc_3_1', num: '3.1', testo: 'Viene confermata la funzionalità del rapporto cliente/esecutore e cliente/titolare effettivo alla gestione dell\'attività?' },
    { key: 'cc_4', num: '4', testo: 'Risulta coerente la provenienza dei fondi e risorse nella disponibilità del cliente con il suo profilo (in funzione del rischio)?' },
    { key: 'cc_5', num: '5', testo: 'Sono state rilevate incongruenze negli atti/comportamenti del cliente rispetto alla sua capacità economica/finanziaria/patrimoniale?' },
    { key: 'cc_6', num: '6', testo: 'L\'individuazione dei titolari effettivi è aggiornata?' },
    { key: 'cc_6_1', num: '6.1', testo: 'I dati identificativi dei titolari effettivi sono aggiornati?' },
    { key: 'cc_6_2', num: '6.2', testo: 'Acquisizione dati identificativi nuovi titolari effettivi' },
    { key: 'cc_7', num: '7', testo: 'I dati identificativi del cliente (ex art. 1, co. 2, lett. n) D.Lgs. 231/2007) sono aggiornati?' },
    { key: 'cc_7_1', num: '7.1', testo: 'I dati identificativi dell\'esecutore sono aggiornati?' },
    { key: 'cc_7_2', num: '7.2', testo: 'Si è reso necessario acquisire un nuovo documento di identità del cliente?' },
    { key: 'cc_7_3', num: '7.3', testo: 'Si è reso necessario acquisire un nuovo documento di identità dell\'esecutore?' },
    { key: 'cc_8', num: '8', testo: 'Si sono resi necessari approfondimenti o ulteriori verifiche sul cliente/prestazione sulla base di informazioni acquisite o possedute in ragione dell\'esercizio dell\'attività (art. 19 co. 1 lett. d) D.Lgs. 231/2007)?' },
    { key: 'cc_8_1', num: '8.1', testo: 'In caso di risposta positiva al precedente campo di controllo, sono emerse incongruenze o anomalie dalle nuove informazioni assunte?' },
  ];

  // Header tabella
  const ccRows = [
    new TableRow({
      children: [
        tblCell('Controllo', { bold: true, width: 70, size: 20, shading: C_GRAY, paddingV: 60 }),
        tblCell('Sì', { bold: true, width: 10, align: AlignmentType.CENTER, size: 20, shading: C_GRAY, paddingV: 60 }),
        tblCell('No', { bold: true, width: 10, align: AlignmentType.CENTER, size: 20, shading: C_GRAY, paddingV: 60 }),
        tblCell('N.a.', { bold: true, width: 10, align: AlignmentType.CENTER, size: 20, shading: C_GRAY, paddingV: 60 }),
      ],
    }),
  ];

  // Righe controlli — auto-compilate se il dato è presente, altrimenti vuote
  for (const ctrl of controlli) {
    const val = av7[ctrl.key] || '';
    ccRows.push(
      new TableRow({
        children: [
          tblCell(ctrl.testo, { size: 20, paddingV: 60 }),
          tblCell(val === 'si' ? '☑' : '☐', { align: AlignmentType.CENTER, size: 22, paddingV: 60 }),
          tblCell(val === 'no' ? '☑' : '☐', { align: AlignmentType.CENTER, size: 22, paddingV: 60 }),
          tblCell(val === 'na' ? '☑' : '☐', { align: AlignmentType.CENTER, size: 22, paddingV: 60 }),
        ],
      })
    );
  }

  elems.push(new Table({ rows: ccRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([tblText('* N.a. = Non applicabile', { italic: true, size: 16, color: '808080' })], { before: 40, after: 200 }));

  // =================== ANNOTAZIONI (nuova pagina) ===================
  elems.push(new Paragraph({ children: [new PageBreak()] }));
  const annotazioniTesto = controlloData?.annotazioni_cc || '';
  elems.push(
    tblPara([tblText('Annotazioni', { bold: true, size: 22 })], { after: 60 }),
    tblPara([tblText('Ove opportuno, descrivere/motivare il controllo indicato in tabella (ad es. con riferimento alla provenienza dei fondi e delle risorse nella disponibilità del cliente, incongruenze riscontrate, approfondimenti effettuati).', { italic: true, size: 18, color: '808080' })], { after: 60 }),
  );
  if (annotazioniTesto) {
    elems.push(tblPara([tblText(annotazioniTesto)], { after: 200 }));
  } else {
    elems.push(
      tblPara([tblText('________________________________________________________________________________')], { after: 40 }),
      tblPara([tblText('________________________________________________________________________________')], { after: 40 }),
      tblPara([tblText('________________________________________________________________________________')], { after: 200 }),
    );
  }

  // =================== LIVELLO DI RISCHIO ===================
  // Auto-compila dai dati della valutazione e del controllo
  const classeToProfileCC = (classe?: number): string => {
    if (!classe) return '';
    if (classe === 1) return 'Non significativo';
    if (classe === 2) return 'Poco significativo';
    if (classe === 3) return 'Abbastanza significativo';
    return 'Molto significativo';
  };
  const classeToFrequenzaCC = (classe?: number): string => {
    if (!classe) return '';
    if (classe === 1) return '36 mesi';
    if (classe === 2) return '24 mesi';
    if (classe === 3) return '12 mesi';
    return '6 mesi';
  };

  const rischioPrecedente = data.valutazione ? classeToProfileCC(data.valutazione.classe_rischio) : '';
  const tempoPrecedente = data.valutazione ? classeToFrequenzaCC(data.valutazione.classe_rischio) : '';
  const esitoRischio = controlloData?.esito_rischio || '';
  const prossimaScadenza = controlloData?.prossima_scadenza ? formatDate(controlloData.prossima_scadenza) : '';

  // Colonna "Attuale": se confermato copia precedente, se variato usa il nuovo valore
  const nuovoRischio = controlloData?.nuovo_rischio_effettivo;
  const rischioAttuale = esitoRischio === 'confermato'
    ? rischioPrecedente
    : nuovoRischio ? getClassificationText(nuovoRischio) : '';
  const tempoAttuale = esitoRischio === 'confermato'
    ? tempoPrecedente
    : nuovoRischio ? classeToFrequenzaCC(Math.ceil(nuovoRischio)) : '';

  elems.push(
    tblPara([tblText('Livello di rischio e tempi di controllo', { bold: true, size: 22 })], { after: 120 }),
  );

  // Tabella livello rischio Precedente / Attuale
  const riskRows = [
    new TableRow({
      children: [
        tblCell('', { width: 40 }),
        tblCell('Precedente', { bold: true, width: 30, align: AlignmentType.CENTER, size: 20, shading: C_GRAY, paddingV: 60 }),
        tblCell('Attuale', { bold: true, width: 30, align: AlignmentType.CENTER, size: 20, shading: C_GRAY, paddingV: 60 }),
      ],
    }),
    new TableRow({
      children: [
        tblCell('Livello di rischio', { bold: true, size: 20, paddingV: 60 }),
        tblCell(rischioPrecedente, { align: AlignmentType.CENTER, size: 20, paddingV: 60 }),
        tblCell(rischioAttuale, { align: AlignmentType.CENTER, size: 20, paddingV: 60 }),
      ],
    }),
    new TableRow({
      children: [
        tblCell('Tempistica controllo', { bold: true, size: 20, paddingV: 60 }),
        tblCell(tempoPrecedente, { align: AlignmentType.CENTER, size: 20, paddingV: 60 }),
        tblCell(tempoAttuale, { align: AlignmentType.CENTER, size: 20, paddingV: 60 }),
      ],
    }),
  ];
  elems.push(new Table({ rows: riskRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS }));
  elems.push(tblPara([], { after: 120 }));

  // Esito livello di rischio (auto-compilato se presente)
  elems.push(
    tblPara([tblText('Esito:', { bold: true, size: 22 })], { after: 60 }),
    tblPara([tblText(`${getCheckbox(esitoRischio === 'confermato')} Confermato`, { size: 22 })], { after: 40 }),
    tblPara([tblText(`${getCheckbox(esitoRischio === 'aumentato')} Aumentato`, { size: 22 })], { after: 40 }),
    tblPara([tblText(`${getCheckbox(esitoRischio === 'ridotto')} Ridotto`, { size: 22 })], { after: 120 }),
  );

  // Dettaglio rideterminazione
  elems.push(
    tblPara([tblText('In caso di variazione, le variazioni intervenute risultano significative e occorre procedere a rideterminare il rischio effettivo e, eventualmente, la tipologia di adeguata verifica da effettuare per il cliente.', { italic: true })], { after: 160 }),
    tblPara([
      tblText('A seguito di nuova valutazione del rischio effettivo, il risultato è (poco/abbastanza/molto significativo): '),
      tblText(rischioAttuale || '___________________________________', rischioAttuale ? { bold: true } : {}),
    ], { after: 200 }),
  );

  // Tempistica controllo successivo (auto-compilata se presente)
  elems.push(
    tblPara([
      tblText('Tempo di controllo in base agli esiti della valutazione del rischio confermata o rideterminata (36/24/12/6 mesi): '),
      tblText(tempoAttuale || tempoPrecedente || '___________________________', (tempoAttuale || tempoPrecedente) ? { bold: true } : {}),
    ], { after: 160 }),
    tblPara([
      tblText('Nuova scadenza controllo costante: '),
      tblText(prossimaScadenza || '________________'),
    ], { after: 300 }),
  );

  // =================== ALLEGATI ===================
  const allegatiItems = (data.documenti || []).map(d => {
    const tipo = TIPOLOGIA_LABELS[d.tipologia] || d.tipologia;
    return d.nome_file ? `${tipo} (${d.nome_file})` : tipo;
  });

  elems.push(
    tblPara([tblText('Allegati', { bold: true, size: 22 })], { after: 40 }),
    tblPara([tblText('Eventuale documentazione acquisita ai fini del presente controllo costante.', { italic: true, size: 18, color: '808080' })], { after: 80 }),
  );
  if (allegatiItems.length > 0) {
    allegatiItems.forEach((item, i) => {
      elems.push(tblPara([tblText(`- ${item}`)], { after: i === allegatiItems.length - 1 ? 300 : 20 }));
    });
  } else {
    elems.push(tblPara([tblText('________________________________________________________________________________')], { after: 300 }));
  }

  // =================== FIRMA E DATA ===================
  const dataControllo = controlloData?.data_controllo ? formatDate(controlloData.data_controllo) : '';
  elems.push(
    tblPara([tblText('Luogo e data:')], { after: 40 }),
    tblPara([tblText(dataControllo || '__________________')], { after: 200 }),
    tblPara([tblText('Il Professionista')], { after: 60, align: AlignmentType.RIGHT }),
    tblPara([], { after: 120 }),
    tblPara([tblText('____________________________')], { after: 200, align: AlignmentType.RIGHT }),
  );

  // =================== DOCUMENTO ===================
  const doc = new Document({
    numbering: {
      config: [{
        reference: 'cc-premessa-list',
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 360, hanging: 360 } } },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: elems
    }]
  });

  const blob = await Packer.toBlob(doc);
  const filename = `AV7_ControlloConstante_${incarico.codice_incarico || today.replace(/\//g, '-')}.docx`;
  return { blob, filename };
}

export async function generateAndDownloadDOCX_CC(data: AMLData, controlloData?: ControlloCC): Promise<void> {
  const { blob, filename } = await generateBlobDOCX_CC(data, controlloData);
  saveAs(blob, filename);
}

/**
 * Genera e scarica documento DOCX AV.5 - Attestazione del Professionista
 * ex art. 27 d.lgs. 231/2007
 *
 * Struttura fedele al modello in documentazione/CNDCEC_modulistica-AML-1 (1).docx
 */
export async function generateBlobDOCX_AV5(data: AMLData): Promise<{ blob: Blob; filename: string }> {
  const { cliente, incarico } = data;
  const today = formatDate(new Date().toISOString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elems: any[] = [];

  // =================== TITOLO ===================
  elems.push(
    tblPara([tblText('AV.5 - ATTESTAZIONE DEL PROFESSIONISTA', { bold: true, size: 28 })], { after: 60, align: AlignmentType.CENTER }),
    tblPara([tblText('ex art. 27 d.lgs. 231/2007', { size: 20 })], { after: 300, align: AlignmentType.CENTER }),
  );

  // =================== PREAMBOLO ===================
  const comuneSede = data.studio_comune_sede?.trim();
  const provinciaSede = data.studio_provincia_sede?.trim();
  const viaSede = data.studio_via_piazza_sede?.trim();
  const civicoSede = data.studio_numero_civico_sede?.trim();
  const nomeProf = data.studio_nome_proprietario?.trim();
  const cognomeProf = data.studio_cognome_proprietario?.trim();
  const nomeCognomeProf = [nomeProf, cognomeProf].filter(Boolean).join(' ');
  const alboSede = data.studio_albo_sede?.trim();
  const alboNumero = data.studio_albo_numero?.trim();
  const alboSezione = data.studio_albo_sezione?.trim();
  elems.push(
    tblPara([
      tblText('Il sottoscritto '),
      tblText(nomeCognomeProf || '______________________', nomeCognomeProf ? { bold: true } : undefined),
      tblText(', iscritto all\'Albo dei Dottori Commercialisti e degli Esperti Contabili di '),
      tblText(alboSede || '__________________', alboSede ? { bold: true } : undefined),
      tblText(' al n. '),
      tblText(alboNumero || '_____', alboNumero ? { bold: true } : undefined),
      tblText('/Sez. '),
      tblText(alboSezione || '____', alboSezione ? { bold: true } : undefined),
      tblText(' con studio in '),
      tblText(comuneSede || '__________________', comuneSede ? { bold: true } : undefined),
      tblText(' ('),
      tblText(provinciaSede || '____', provinciaSede ? { bold: true } : undefined),
      tblText('), alla via/piazza '),
      tblText(viaSede || '_____________________', viaSede ? { bold: true } : undefined),
      tblText(' n. '),
      tblText(civicoSede || '______', civicoSede ? { bold: true } : undefined),
      tblText(','),
    ], { after: 200 }),
  );

  elems.push(
    tblPara([
      tblText('avendo ricevuto in data _________ dal Professionista di cui all\'art. 3, co. 4, d.lgs. 231/2007 ______________________ residente in ______________ (____), alla via/piazza _________________________ n. ______, richiesta di dichiarazione di esecuzione degli obblighi di "Adeguata verifica della clientela" ex art. 18, co. 1, lettere a), b) e c), del d.lgs. 231/2007 nei confronti di:'),
    ], { after: 200 }),
  );

  // =================== PERSONA FISICA ===================
  elems.push(
    tblPara([tblText('Persona fisica Cliente o legale rappresentante/delegato/procuratore della società/ente che conferisce il mandato professionale:', { italic: true })], { after: 120 }),
  );

  elems.push(
    tblPara([
      tblText('Cognome e nome: '),
      tblText(cliente.rappresentante_legale || cliente.ragione_sociale || '______________________________________', { bold: true }),
    ], { after: 80 }),
  );

  elems.push(
    tblPara([
      tblText('Codice fiscale: '),
      tblText(cliente.codice_fiscale_rappresentante || cliente.codice_fiscale || '______________________________________', { bold: true }),
    ], { after: 80 }),
  );

  const clienteAny = cliente as any;
  const tipoCliente = clienteAny.tipo_cliente;
  const rappresentantePersonaId = clienteAny.rappresentante_persona_id;
  const isPersonaFisicaOrProfessionista = tipoCliente === 'persona_fisica' || tipoCliente === 'professionista';
  const rappresentanteIsAlsoTitolare = !!rappresentantePersonaId
    && (data.titolari_effettivi || []).some(t => (t as any).persona_id === rappresentantePersonaId);

  let ruoloAuto = '';
  if (isPersonaFisicaOrProfessionista) {
    ruoloAuto = 'Titolare effettivo';
  } else if (rappresentantePersonaId && rappresentanteIsAlsoTitolare) {
    ruoloAuto = 'Legale rappresentante e Titolare effettivo';
  } else if (rappresentantePersonaId) {
    ruoloAuto = 'Legale rappresentante';
  }

  const ruoloFinal = clienteAny.ruolo_dichiarante || ruoloAuto;

  elems.push(
    tblPara([
      tblText('Carica/poteri rappresentanza: '),
      tblText(ruoloFinal || '______________________________________', ruoloFinal ? { bold: true } : undefined),
    ], { after: 200 }),
  );

  // =================== SOCIETA/ENTE ===================
  elems.push(
    tblPara([tblText('Società/ente Cliente:', { italic: true })], { after: 120 }),
  );

  elems.push(
    tblPara([
      tblText('Denominazione/ragione sociale: '),
      tblText(cliente.ragione_sociale || '______________________________________', { bold: true }),
    ], { after: 80 }),
  );

  elems.push(
    tblPara([
      tblText('Codice fiscale: '),
      tblText(cliente.codice_fiscale || '______________________________________', { bold: true }),
    ], { after: 300 }),
  );

  // =================== ATTESTA ===================
  elems.push(
    tblPara([tblText('ATTESTA', { bold: true, size: 24 })], { after: 120, align: AlignmentType.CENTER }),
    tblPara([tblText('così come previsto dagli articoli 26 e 27 del d.lgs. 231/2007:', { italic: true })], { after: 200 }),
  );

  const clienteLabel = cliente.ragione_sociale || '________________________________________';
  elems.push(
    tblPara([
      tblText('- di aver assolto direttamente e correttamente l\'obbligo di adeguata verifica del Cliente '),
      tblText(clienteLabel, { bold: true }),
    ], { after: 120 }),
  );

  elems.push(
    tblPara([
      tblText('- la coincidenza tra il Cliente verificato dal sottoscritto Professionista e il Cliente per il quale si richiede l\'attestazione.'),
    ], { after: 200 }),
  );

  // =================== ALLEGATI ===================
  elems.push(
    tblPara([tblText('Allega, alla presente attestazione, copia della seguente documentazione, conservata agli atti presso lo studio del sottoscritto Professionista attestante:')], { after: 120 }),
  );

  const allegatiItemsAV5 = (data.documenti || []).map(d => {
    const tipo = d.label || TIPOLOGIA_LABELS[d.tipologia] || d.tipologia;
    return d.nome_file ? `${tipo} (${d.nome_file})` : tipo;
  });

  if (allegatiItemsAV5.length > 0) {
    allegatiItemsAV5.forEach((item, i) => {
      elems.push(tblPara([tblText(`- ${item}`)], { after: i === allegatiItemsAV5.length - 1 ? 300 : 60 }));
    });
  } else {
    elems.push(
      tblPara([tblText('- _______________________________________')], { after: 60 }),
      tblPara([tblText('- _______________________________________')], { after: 60 }),
      tblPara([tblText('- _______________________________________')], { after: 300 }),
    );
  }

  // =================== FIRMA E DATA ===================
  elems.push(
    tblPara([
      tblText('Data: '),
      tblText(today),
    ], { after: 200 }),
  );

  elems.push(
    tblPara([tblText('Firma del Professionista attestante')], { after: 60, align: AlignmentType.RIGHT }),
    tblPara([], { after: 120 }),
    tblPara([tblText('____________________________')], { after: 300, align: AlignmentType.RIGHT }),
  );

  // =================== NOTA PER LA COMPILAZIONE ===================
  elems.push(
    tblPara([tblText('Nota per la compilazione', { bold: true, size: 18 })], { after: 60 }),
    tblPara([tblText('Il presente modulo deve essere compilato esclusivamente dal professionista a cui sia stato richiesto, ai sensi degli artt. 26-30 del d.lgs. 231/2007, il rilascio di una attestazione relativa al corretto adempimento degli obblighi di adeguata verifica nei confronti di un determinato cliente. In tal caso il professionista attestante, dopo aver compilato il modulo, lo trasmetterà al soggetto obbligato che se ne avvale. Sarà quest\'ultimo a dover conservare il modulo, unitamente alla documentazione allegata, nel proprio fascicolo cliente.', { italic: true, size: 18, color: '808080' })], { after: 200 }),
  );

  // =================== DOCUMENTO ===================
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: elems
    }]
  });

  const blob = await Packer.toBlob(doc);
  const filename = `AV5_Attestazione_${incarico.codice_incarico || today.replace(/\//g, '-')}.docx`;
  return { blob, filename };
}

export async function generateAndDownloadDOCX_AV5(data: AMLData): Promise<void> {
  const { blob, filename } = await generateBlobDOCX_AV5(data);
  saveAs(blob, filename);
}

/**
 * Genera e scarica documento DOCX AV.6 - Dichiarazione di Astensione del Professionista
 * ex art. 42 d.lgs. 231/2007
 *
 * Struttura fedele al modello in documentazione/CNDCEC_modulistica-AML-1 (1).docx
 */
export async function generateBlobDOCX_AV6(data: AMLData): Promise<{ blob: Blob; filename: string }> {
  const { cliente, incarico } = data;
  const today = formatDate(new Date().toISOString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elems: any[] = [];

  // =================== TITOLO ===================
  elems.push(
    tblPara([tblText('AV.6 - DICHIARAZIONE DI ASTENSIONE DEL PROFESSIONISTA', { bold: true, size: 28 })], { after: 60, align: AlignmentType.CENTER }),
    tblPara([tblText('ex art. 42 d.lgs. 231/2007', { size: 20 })], { after: 300, align: AlignmentType.CENTER }),
  );

  // =================== PREAMBOLO ===================
  //const nomeStudio = data.nome_studio || '________________________________________________';
  elems.push(
    tblPara([
      tblText('Il sottoscritto _____________________'),
      //tblText(nomeStudio, { bold: true }),
      tblText(', Professionista di cui all\'articolo 3, co. 4, lett. a), d.lgs. 231/2007,'),
    ], { after: 300 }),
  );

  // =================== DICHIARA ===================
  elems.push(
    tblPara([tblText('DICHIARA', { bold: true, size: 24 })], { after: 200, align: AlignmentType.CENTER }),
  );

  // Punto 1 - chi si è rivolto e per quale incarico
  const clienteLabel = cliente.rappresentante_legale || cliente.ragione_sociale || '____________________________________________';
  const incaricoDesc = incarico.descrizione || incarico.scopo_natura || '_______________________________________________________________________________________________________________________';
  elems.push(
    tblPara([
      tblText('- che il sig. '),
      tblText(clienteLabel, { bold: true }),
      tblText(', con dati identificativi allegati alla presente (ove disponibili), si è rivolto al sottoscritto professionista per conferire il seguente incarico professionale:'),
    ], { after: 80 }),
    tblPara([
      tblText(incaricoDesc, { italic: true, bold: true }),
      tblText(' (breve descrizione della prestazione richiesta);', { size: 18, color: '808080' }),
    ], { after: 200 }),
  );

  // Punto 2 - impossibilità di completare l'adeguata verifica
  elems.push(
    tblPara([
      tblText('- di non essere stato in grado di completare la procedura di adeguata verifica della clientela (identificazione e verifica dell\'identità del cliente e del titolare effettivo nonché acquisizione e valutazione di informazioni su scopo e natura della prestazione professionale richiesta) per effetto di:'),
    ], { after: 80 }),
    tblPara([
      tblText('________________________________________________________________________________', { italic: true }),
      tblText(' (breve descrizione delle motivazioni che hanno reso oggettivamente impossibile completare l\'adeguata verifica);', { size: 18, color: '808080' }),
    ], { after: 200 }),
  );

  // Punto 3 - astensione
  elems.push(
    tblPara([
      tblText('- di essersi astenuto dallo svolgere o di aver interrotto la prestazione professionale richiesta, ai sensi dell\'art. 42, d.lgs. 231/2007;'),
    ], { after: 200 }),
  );

  // Punto 4 - valutazione SOS
  elems.push(
    tblPara([
      tblText('- di aver esaminato le cause che hanno determinato l\'impossibilità di completare l\'adeguata verifica e aver valutato, ai sensi dell\'art. 35 del d.lgs. 231/2007, che '),
      tblText('ricorre / non ricorre', { bold: true }),
      tblText(' (cancellare l\'opzione non applicabile) l\'obbligo di segnalazione di operazione sospetta (SOS) per i seguenti motivi:'),
    ], { after: 80 }),
    tblPara([
      tblText('________________________________________________________________________________'),
    ], { after: 40 }),
    tblPara([
      tblText('________________________________________________________________________________'),
    ], { after: 40 }),
    tblPara([
      tblText('________________________________________________________________________________'),
    ], { after: 80 }),
    tblPara([
      tblText('(indicare l\'iter logico seguito per determinare la necessità di effettuare o di NON effettuare una SOS).', { size: 18, color: '808080', italic: true }),
    ], { after: 300 }),
  );

  // =================== ALLEGATI ===================
  elems.push(
    tblPara([tblText('Allega alla presente dichiarazione la seguente documentazione (ove presente):')], { after: 120 }),
  );

  const allegatiItemsAV6 = (data.documenti || []).map(d => {
    const tipo = d.label || TIPOLOGIA_LABELS[d.tipologia] || d.tipologia;
    return d.nome_file ? `${tipo} (${d.nome_file})` : tipo;
  });

  if (allegatiItemsAV6.length > 0) {
    allegatiItemsAV6.forEach((item, i) => {
      elems.push(tblPara([tblText(`- ${item}`)], { after: i === allegatiItemsAV6.length - 1 ? 300 : 40 }));
    });
  } else {
    elems.push(
      tblPara([tblText('________________________________________________________________________________')], { after: 40 }),
      tblPara([tblText('________________________________________________________________________________')], { after: 40 }),
      tblPara([tblText('________________________________________________________________________________')], { after: 300 }),
    );
  }

  // =================== FIRMA E DATA ===================
  elems.push(
    tblPara([
      tblText('Data: '),
      tblText(today),
    ], { after: 200 }),
  );

  elems.push(
    tblPara([tblText('Il Professionista')], { after: 60, align: AlignmentType.RIGHT }),
    tblPara([], { after: 120 }),
    tblPara([tblText('____________________________')], { after: 200, align: AlignmentType.RIGHT }),
  );

  // =================== DOCUMENTO ===================
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: elems
    }]
  });

  const blob = await Packer.toBlob(doc);
  const filename = `AV6_Astensione_${incarico.codice_incarico || today.replace(/\//g, '-')}.docx`;
  return { blob, filename };
}

export async function generateAndDownloadDOCX_AV6(data: AMLData): Promise<void> {
  const { blob, filename } = await generateBlobDOCX_AV6(data);
  saveAs(blob, filename);
}
