// Generazione DOCX AV.3 e AV.4 con libreria docx

import { 
  Document, 
  Paragraph, 
  TextRun, 
  AlignmentType, 
  UnderlineType,
  HeadingLevel,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
  Packer
} from 'docx';
import { AMLDataComplete } from './types.ts';

// Utility: Formatta data ISO in gg/mm/aaaa
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/D';
  try {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return 'N/D';
  }
}

// Utility: Checkbox simboli
function getCheckbox(checked: boolean): string {
  return checked ? '☑' : '☐';
}

// ========== GENERAZIONE DOCX AV.3 - ISTRUTTORIA CLIENTE ==========
export async function generateDOCX_AV3(data: AMLDataComplete): Promise<Uint8Array> {
  const { cliente, titolari_effettivi, incarico, valutazione, numero_incarichi_cliente } = data;
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
  const profiloRischio = valutazione ? classeToProfile(valutazione.classe_rischio) : '';

  // Mappa classe_rischio -> tipologia adeguata verifica
  const classeToVerifica = (classe?: number): string => {
    if (!classe) return '';
    if (classe <= 1) return 'Semplificata';
    if (classe <= 2) return 'Ordinaria';
    return 'Rafforzata';
  };
  const tipologiaVerifica = valutazione ? classeToVerifica(valutazione.classe_rischio) : '';

  // Frequenza controllo costante basata sulla classe di rischio
  const classeToFrequenza = (classe?: number): string => {
    if (!classe) return '36 mesi';
    if (classe === 1) return '36 mesi';
    if (classe === 2) return '24 mesi';
    if (classe === 3) return '12 mesi';
    return '6 mesi';
  };
  const frequenzaControllo = valutazione ? classeToFrequenza(valutazione.classe_rischio) : '';

  const doc = new Document({
    sections: [{
      properties: {},
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
          spacing: { before: 200, after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Denominazione Cliente: ', bold: true }),
            new TextRun({ text: cliente.ragione_sociale || 'N/D' })
          ],
          spacing: { after: 100 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Gruppo di riferimento del Cliente: ', bold: true }),
            new TextRun({ text: '_____________________________' })
          ],
          spacing: { after: 150 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Studio/Professionista di riferimento: ', bold: true }),
            new TextRun({ text: data.nome_studio || '_____________________________' })
          ],
          spacing: { after: 100 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Altri Associati/Soci/Professionisti: ', bold: true }),
            new TextRun({ text: '_____________________________' })
          ],
          spacing: { after: 150 }
        }),

        // Checkbox — auto-spuntati in base al numero di incarichi del cliente
        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(isNuovoCliente)} ` }),
            new TextRun({ text: 'Nuovo Cliente.' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(isGiaIdentificato)} ` }),
            new TextRun({ text: 'Cliente già identificato in relazione ad un precedente incarico.' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} ` }),
            new TextRun({ text: 'Necessaria/opportuna una nuova identificazione.' })
          ],
          spacing: { after: 150 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Soggetto responsabile identificazione: ', bold: true }),
            new TextRun({ text: '_____________________________' })
          ],
          spacing: { after: 200 }
        }),

        // VALORE PRESTAZIONE
        new Paragraph({
          children: [
            new TextRun({ text: 'Valore della prestazione professionale:', bold: true })
          ],
          spacing: { after: 100 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} Euro _____________________` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(true)} indeterminato/non determinabile` })
          ],
          spacing: { after: 200 }
        }),

        // OPERAZIONE
        new Paragraph({
          children: [
            new TextRun({ text: 'OPERAZIONE (eseguita dal Professionista per conto del Cliente):', bold: true })
          ],
          spacing: { after: 100 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Data: ', bold: true }),
            new TextRun({ text: today })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          text: 'Importo: _____________________________',
          spacing: { after: 80 }
        }),

        new Paragraph({
          text: 'Causale: Servizi professionali di consulenza',
          spacing: { after: 80 }
        }),

        new Paragraph({
          text: 'Mezzi di pagamento utilizzati: Bonifico bancario',
          spacing: { after: 80 }
        }),

        new Paragraph({
          text: 'Documentazione allegata: Visura camerale, Statuto, Dichiarazione AML',
          spacing: { after: 200 }
        }),

        // ADEGUATA VERIFICA
        new Paragraph({
          children: [
            new TextRun({ text: 'ADEGUATA VERIFICA:', bold: true })
          ],
          spacing: { after: 100 }
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
          spacing: { after: 200 }
        }),

        // DATA DI RIFERIMENTO
        new Paragraph({
          children: [
            new TextRun({ text: 'DATA DI RIFERIMENTO:', bold: true })
          ],
          spacing: { after: 100 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(true)} Data di riferimento del fascicolo: ` }),
            new TextRun({ text: incarico.data_inizio ? formatDate(incarico.data_inizio) : today })
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
              text: valutazione?.prossimo_controllo
                ? formatDate(valutazione.prossimo_controllo)
                : '_______________________________'
            })
          ],
          spacing: { after: 300 }
        }),

        // SEZIONE 1 - DATI CLIENTE
        new Paragraph({
          text: '1) Dati relativi al Cliente',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 150 }
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
            new TextRun({ text: cliente.codice_fiscale_rappresentante || cliente.codice_fiscale || 'N/D' })
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
            new TextRun({ text: 'Carica/poteri rappresentanza: ', bold: true }),
            new TextRun({ text: 'Amministratore/Legale rappresentante' })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Poteri rappresentanza verificati tramite: ', bold: true }),
            new TextRun({ text: 'Visura camerale' })
          ],
          spacing: { after: 80 }
        }),

        // Documento — solo per persona fisica
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
            new TextRun({ text: incarico.descrizione || 'Attività d\'impresa' })
          ],
          spacing: { after: 300 }
        }),

        // SEZIONE 2 - TITOLARI EFFETTIVI
        new Paragraph({
          text: '2) Dati relativi ai titolari effettivi',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 150 }
        }),

        ...(titolari_effettivi.length > 0
          ? titolari_effettivi.slice(0, 5).flatMap((titolare, index) => {
              const isAzienda = titolare.tipo_soggetto === 'azienda';
              return [
              new Paragraph({
                children: [
                  new TextRun({ text: `TITOLARE EFFETTIVO N.${index + 1}${isAzienda ? ' (Azienda)' : ''}`, bold: true })
                ],
                spacing: { before: 150, after: 100 }
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: isAzienda ? 'Ragione sociale: ' : 'Cognome e nome: ', bold: true }),
                  new TextRun({ text: titolare.nome_cognome })
                ],
                spacing: { after: 80 }
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: isAzienda ? 'Codice fiscale azienda: ' : 'Codice fiscale: ', bold: true }),
                  new TextRun({ text: titolare.codice_fiscale || 'N/D' })
                ],
                spacing: { after: 80 }
              }),
              ...(isAzienda && titolare.partita_iva ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Partita IVA: ', bold: true }),
                    new TextRun({ text: titolare.partita_iva })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              ...(isAzienda && titolare.natura_giuridica ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Natura giuridica: ', bold: true }),
                    new TextRun({ text: titolare.natura_giuridica })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              ...(isAzienda && titolare.codice_ateco ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Codice ATECO: ', bold: true }),
                    new TextRun({ text: titolare.codice_ateco })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              ...(!isAzienda && titolare.data_nascita ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Data di nascita: ', bold: true }),
                    new TextRun({ text: formatDate(titolare.data_nascita) })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              ...(!isAzienda && titolare.comune_nascita ? [
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
                  new TextRun({ text: isAzienda ? 'Attività svolta: ' : 'Ruolo: ', bold: true }),
                  new TextRun({ text: titolare.professione || 'N/D' })
                ],
                spacing: { after: 80 }
              }),
              ...(titolare.residenza ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: isAzienda ? 'Sede legale: ' : 'Residenza: ', bold: true }),
                    new TextRun({ text: titolare.residenza })
                  ],
                  spacing: { after: 80 }
                })
              ] : []),
              ...(!isAzienda && titolare.documento_tipo ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Documento: ', bold: true }),
                    new TextRun({
                      text: `${titolare.documento_tipo == 'carta-identita' ? 'Carta d\'Identità' : titolare.documento_tipo} n. ${titolare.documento_numero || 'N/D'}`
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
              ...(titolare.is_pep ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: '⚠️ PEP (Persona Politicamente Esposta)', bold: true })
                  ],
                  spacing: { after: 80 }
                }),
                ...(titolare.pep_carica ? [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Carica: ', italics: true }),
                      new TextRun({ text: titolare.pep_carica, italics: true })
                    ],
                    spacing: { after: 80 }
                  })
                ] : [])
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
            new TextRun({ text: `${getCheckbox(true)} dichiarazione antiriciclaggio resa dal Cliente ex art. 22 D.Lgs. 231/2007;` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(true)} estratti da pubblici registri;` })
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
          spacing: { after: 300 }
        }),

        // SEZIONE 3 - SCOPO E NATURA
        new Paragraph({
          text: '3) Scopo e natura dell\'incarico professionale',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 150 }
        }),

        new Paragraph({
          text: incarico.scopo_natura || incarico.descrizione || 'Servizi professionali nell\'ambito dell\'attività d\'impresa',
          spacing: { after: 300 }
        }),

        // SEZIONE 4 - PROFILO DI RISCHIO
        new Paragraph({
          text: '4) Profilo di rischio attribuito',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 150 }
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
          spacing: { before: 200, after: 150 }
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
          text: valutazione?.note || '________________________________________________________________________________',
          spacing: { after: 80 }
        }),

        ...(valutazione?.note ? [] : [
          new Paragraph({
            text: '________________________________________________________________________________',
            spacing: { after: 300 }
          })
        ]),

        ...(valutazione?.note ? [
          new Paragraph({ text: '', spacing: { after: 300 } })
        ] : []),

        // FIRMA E DATA
        new Paragraph({
          children: [
            new TextRun({ text: 'Luogo e data: ', bold: true }),
            new TextRun({ text: `${cliente.indirizzo?.split(',')[1]?.trim() || 'Italia'}, ${today}` })
          ],
          spacing: { before: 400, after: 200 }
        }),

        new Paragraph({
          text: 'Firma del Professionista',
          spacing: { after: 50 }
        }),

        new Paragraph({
          text: '__________________________________________________',
          spacing: { after: 200 }
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

// ========== GENERAZIONE DOCX AV.4 - DICHIARAZIONE CLIENTE ==========
export async function generateDOCX_AV4(data: AMLDataComplete): Promise<Uint8Array> {
  const { cliente, titolari_effettivi, incarico } = data;
  const isPep = cliente.pep === true;
  const tipoRapporto = titolari_effettivi[0]?.tipo_rapporto || 'in_proprio';
  const hasPepTitolari = titolari_effettivi.some(t => t.is_pep === true);

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
          text: 'AV.4 - DICHIARAZIONE DEL CLIENTE',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        }),

        // PREAMBOLO
        new Paragraph({
          text: 'In ottemperanza alle disposizioni dell\'art. 22 del D.Lgs. 231/2007 (obblighi del cliente in materia di prevenzione e contrasto al riciclaggio/FDT) e successive modifiche e integrazioni, fornisco le sottostanti informazioni, assumendomi tutte le responsabilità di natura civile, amministrativa e penale per dichiarazioni non veritiere.',
          spacing: { after: 300 },
          alignment: AlignmentType.JUSTIFIED
        }),

        // IL SOTTOSCRITTO
        new Paragraph({
          children: [
            new TextRun({ text: 'Il sottoscritto, ' }),
            new TextRun(cliente.rappresentante_legale
              ? { text: ` ${cliente.rappresentante_legale} `, bold: true }
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
            new TextRun((cliente.codice_fiscale_rappresentante || cliente.codice_fiscale)
              ? { text: ` ${cliente.codice_fiscale_rappresentante || cliente.codice_fiscale} `, bold: true }
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
                new TextRun({ text: ` ${cliente.partita_iva_rappresentante} `, bold: true }),
              ],
              spacing: { after: 80 }
            })
          ] : []),
          ...(cliente.natura_giuridica_rappresentante ? [
            new Paragraph({
              children: [
                new TextRun({ text: 'Natura giuridica ' }),
                new TextRun({ text: ` ${cliente.natura_giuridica_rappresentante} `, bold: true }),
              ],
              spacing: { after: 80 }
            })
          ] : []),
        ] : [
          new Paragraph({
            children: [
              new TextRun({ text: 'nato a ' }),
              new TextRun(cliente.luogo_nascita_rappresentante
                ? { text: ` ${cliente.luogo_nascita_rappresentante} `, bold: true }
                : { text: '____________ ' }),
              new TextRun({ text: '(' }),
              new TextRun(cliente.provincia_nascita_rappresentante
                ? { text: ` ${cliente.provincia_nascita_rappresentante} `, bold: true }
                : { text: '_____' }),
              new TextRun({ text: ') il ' }),
              new TextRun(cliente.data_nascita_rappresentante
                ? { text: ` ${formatDate(cliente.data_nascita_rappresentante)} `, bold: true }
                : { text: '___________ ' }),
            ],
            spacing: { after: 80 }
          })
        ]),

        new Paragraph({
          children: [
            new TextRun({ text: cliente.tipo_soggetto_rappresentante === 'azienda' ? 'con sede legale in ' : 'residente in ' }),
            new TextRun(cliente.residenza_rappresentante
              ? { text: ` ${cliente.residenza_rappresentante} `, bold: true }
              : { text: '_______________(_____), Località/Via/Piazza  ______________________n. ______' }),
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Nazionalità ' }),
            new TextRun(cliente.nazionalita
              ? { text: ` ${cliente.nazionalita} `, bold: true }
              : { text: '________________________________________________________' })
          ],
          spacing: { after: 120 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} Dati di nascita e residenza come da documento di identificazione allegato` })
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
          text: `- che, ai sensi dell'art.18, comma 1, lettera c), D.Lgs. 231/2007, lo scopo e la natura della prestazione professionale richiesta sono: ${incarico.scopo_natura || incarico.descrizione || 'Servizi professionali nell\'ambito dell\'attività d\'impresa'}`,
          spacing: { after: 200 }
        }),

        // PEP Status
        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(!isPep)} di non costituire persona politicamente esposta (PEP)` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(false)} di non rivestire lo status di PPE da più di un anno` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(isPep)} di costituire persona politicamente esposta` })
          ],
          spacing: { after: 200 }
        }),

        // TITOLARI EFFETTIVI
        new Paragraph({
          text: '- ai fini dell\'identificazione del Titolare Effettivo:',
          spacing: { after: 100 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(tipoRapporto === 'in_proprio')} di agire in proprio` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(tipoRapporto === 'per_conto_persone')} di agire per conto dei seguenti titolari effettivi (persone fisiche)` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(tipoRapporto === 'societa_ente' || tipoRapporto === 'caso_residuale')} (caso residuale) di agire per conto della società/ente ${cliente.ragione_sociale || 'N/D'}` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          text: `con sede legale in ${cliente.indirizzo || 'N/D'},`,
          spacing: { after: 80 }
        }),

        new Paragraph({
          text: 'in qualità di legale rappresentante, e attesta che i titolari effettivi sono:',
          spacing: { after: 200 }
        }),

        // PEP per titolari effettivi
        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(!hasPepTitolari)} che il/i titolare/i effettivo/i non costituisce/costituiscono PEP` })
          ],
          spacing: { after: 80 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${getCheckbox(hasPepTitolari)} che il/i titolari effettivi costituisce/costituiscono PEP` })
          ],
          spacing: { after: 200 }
        }),

        // RELAZIONI, FONDI, PAGAMENTI
        new Paragraph({
          text: '- che le relazioni intercorrenti tra Cliente e titolare effettivo sono:',
          spacing: { after: 100 }
        }),

        new Paragraph({
          text: incarico.relazioni_cliente_te || '_____________________________',
          spacing: { after: 200 }
        }),

        new Paragraph({
          text: '- che la provenienza dei fondi utilizzati è:',
          spacing: { after: 100 }
        }),

        new Paragraph({
          text: incarico.provenienza_fondi || '_____________________________',
          spacing: { after: 200 }
        }),

        new Paragraph({
          text: '- che i mezzi di pagamento forniti al professionista sono:',
          spacing: { after: 100 }
        }),

        new Paragraph({
          text: incarico.mezzi_pagamento || '_____________________________',
          spacing: { after: 200 }
        }),

        new Paragraph({
          text: '- che i medesimi fondi non provengono né sono destinati a un\'attività criminosa o al finanziamento del terrorismo di cui all\'art. 2, co. 6, del D.Lgs. 231/2007.',
          spacing: { after: 200 }
        }),

        new Paragraph({
          text: `- che la professione/attività del cliente è: ${cliente.professione || '_____________________________'}`,
          spacing: { after: 300 }
        }),

        // DICHIARA ESPRESSAMENTE
        new Paragraph({
          text: 'DICHIARA ESPRESSAMENTE',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 }
        }),

        new Paragraph({
          text: 'i) di aver esaminato e compreso le definizioni in materia di "persone politicamente esposte", di "titolare effettivo" e di "finanziamento al terrorismo" contenute in calce all\'Allegato alla presente dichiarazione, ii) di essere consapevole delle sanzioni penali previste dall\'art. 55, co. 3, D.Lgs. 231/2007, per chi fornisce dati falsi o informazioni non veritiere, iii) di essere stato informato della circostanza che il mancato rilascio in tutto o in parte delle informazioni di cui sopra pregiudica la possibilità dello Studio professionale di dare esecuzione alla prestazione professionale richiesta.',
          spacing: { after: 300 },
          alignment: AlignmentType.JUSTIFIED
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
            new TextRun({ text: 'Firma del soggetto identificatore' })
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

        // NUOVA PAGINA - ALLEGATO (gestito tramite page break)
        new Paragraph({
          text: '',
          pageBreakBefore: true
        }),

        new Paragraph({
          text: 'ALLEGATO - RIEPILOGO DATI ESTRATTI',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        }),

        new Paragraph({
          text: 'DATI AZIENDALI',
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 150 }
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
            new TextRun({ text: cliente.professione || incarico.descrizione || 'N/D' })
          ],
          spacing: { after: 300 }
        }),

        new Paragraph({
          text: 'TITOLARI EFFETTIVI IDENTIFICATI',
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 100 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Secondo D.Lgs. 231/2007, Art. 20', italics: true })
          ],
          spacing: { after: 200 }
        }),

        ...(titolari_effettivi.length > 0
          ? titolari_effettivi.flatMap((titolare, index) => {
              const isAzienda = titolare.tipo_soggetto === 'azienda';
              return [
              new Paragraph({
                children: [
                  new TextRun({ text: `${index + 1}. `, bold: true }),
                  new TextRun({ text: titolare.nome_cognome, bold: true }),
                  ...(isAzienda ? [new TextRun({ text: ' (Azienda)', italics: true })] : [])
                ],
                spacing: { after: 80 }
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: isAzienda ? 'Codice Fiscale Azienda: ' : 'Codice Fiscale: ', bold: true }),
                  new TextRun({ text: titolare.codice_fiscale || 'N/D' })
                ],
                spacing: { after: 80 },
                indent: { left: 250 }
              }),
              ...(isAzienda && titolare.partita_iva ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Partita IVA: ', bold: true }),
                    new TextRun({ text: titolare.partita_iva })
                  ],
                  spacing: { after: 80 },
                  indent: { left: 250 }
                })
              ] : []),
              ...(isAzienda && titolare.natura_giuridica ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Natura Giuridica: ', bold: true }),
                    new TextRun({ text: titolare.natura_giuridica })
                  ],
                  spacing: { after: 80 },
                  indent: { left: 250 }
                })
              ] : []),
              new Paragraph({
                children: [
                  new TextRun({ text: titolare.tipo_rapporto === 'societa_ente' ? 'Identificato come titolare effettivo ai sensi dell\'Art. 20, comma 2' : '', bold: true }),
                  ...(titolare.tipo_rapporto !== 'societa_ente' ? [
                    new TextRun({ text: isAzienda ? 'Attività svolta: ' : 'Ruolo: ', bold: true }),
                    new TextRun({ text: titolare.professione || 'N/D' })
                  ] : [])
                ],
                spacing: { after: 80 },
                indent: { left: 250 }
              }),
              ...(titolare.tipo_rapporto !== 'societa_ente' ? [
                new Paragraph({
                  text: '   Identificato come titolare effettivo ai sensi dell\'Art. 20, comma 4',
                  spacing: { after: 150 }
                })
              ] : [
                new Paragraph({ text: '', spacing: { after: 150 } })
              ])
            ];
            })
          : []
        ),

        // NOTE LEGALI - NUOVA PAGINA
        new Paragraph({
          text: '',
          pageBreakBefore: true
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
            new TextRun({ text: 'Ai sensi dell\'art. 2, commi 4 e 5, del D.Lgs. 231/2007, per "riciclaggio" si intende: a) la conversione o il trasferimento di beni, effettuati essendo a conoscenza che essi provengono da un\'attività criminosa; b) l\'occultamento o la dissimulazione della reale natura, provenienza, ubicazione dei beni; c) l\'acquisto, la detenzione o l\'utilizzazione di beni essendo a conoscenza che provengono da attività criminosa; d) la partecipazione ad uno degli atti sopra indicati.' })
          ],
          spacing: { after: 200 }
        }),

        // NOTA 2 - Finanziamento al terrorismo
        new Paragraph({
          children: [
            new TextRun({ text: '(Nota 2) ', bold: true }),
            new TextRun({ text: 'Ai sensi dell\'art. 2, comma 6, del D.Lgs. 231/2007, per "finanziamento al terrorismo" si intende qualsiasi attività diretta, con ogni mezzo, alla fornitura, alla raccolta, alla provvista, all\'intermediazione, al deposito, alla custodia o all\'erogazione di fondi e risorse economiche utilizzabili per il compimento di una o più condotte con finalità di terrorismo.' })
          ],
          spacing: { after: 200 }
        }),

        // NOTA 3 - PEP
        new Paragraph({
          children: [
            new TextRun({ text: '(Nota 3) ', bold: true }),
            new TextRun({ text: 'Ai sensi dell\'art.1, comma 2, lett. dd), del D.Lgs. 231/2007, per "persone politicamente esposte" si intendono: le persone fisiche che occupano o hanno cessato di occupare da meno di un anno importanti cariche pubbliche (Presidente della Repubblica, Ministro, parlamentare, giudice, ecc.), nonché i loro familiari e coloro che con i predetti soggetti intrattengono notoriamente stretti legami.' })
          ],
          spacing: { after: 200 }
        }),

        // NOTA 4 - Titolare Effettivo
        new Paragraph({
          children: [
            new TextRun({ text: '(Nota 4) ', bold: true }),
            new TextRun({ text: 'Ai sensi dell\'art. 1, comma 2, lett. pp), del D.Lgs. 231/2007, per "titolare effettivo" si intende la persona fisica o le persone fisiche cui, in ultima istanza, è attribuibile la proprietà diretta o indiretta dell\'ente ovvero il relativo controllo. Secondo l\'art. 20, per le società di capitali costituisce indicazione di proprietà diretta la titolarità di una partecipazione superiore al 25% del capitale. Qualora l\'applicazione di tali criteri non consenta di individuare univocamente uno o più titolari effettivi, il titolare effettivo coincide con la persona fisica o le persone fisiche titolari di poteri di amministrazione o direzione della società.' })
          ],
          spacing: { after: 200 }
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}
