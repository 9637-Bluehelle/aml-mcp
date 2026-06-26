// Generazione PDF AV.3 e AV.4 con jsPDF e supporto Unicode

// @ts-ignore - jsPDF types from ESM
import jsPDF from 'https://esm.sh/jspdf@2.5.1';
import { AMLDataComplete } from './types.ts';
import { createPDFWithUnicode, setFont, normalizeText, cleanBase64, getCheckboxSymbol } from './pdf-unicode.ts';

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

// Utility: Estrae città e provincia da "ROMA (RM)"
function extractLocationParts(location: string): { city: string; province: string } {
  if (!location) return { city: '', province: '' };
  if (location.includes('(')) {
    const parts = location.split('(');
    return {
      city: parts[0].trim(),
      province: parts[1]?.replace(')', '').trim() || '',
    };
  }
  return { city: location, province: '' };
}

// ========== GENERAZIONE PDF AV.3 - ISTRUTTORIA CLIENTE ==========
export async function generatePDF_AV3(data: AMLDataComplete): Promise<Uint8Array> {
  const doc = await createPDFWithUnicode({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const { cliente, titolari_effettivi, incarico, numero_incarichi_cliente } = data;
  const today = formatDate(new Date().toISOString());
  const numIncarichi = numero_incarichi_cliente ?? 0;
  // Auto-checkbox AV.3: 1 incarico → "Nuovo Cliente"; >1 → "già identificato"
  const isNuovoCliente = numIncarichi === 1;
  const isGiaIdentificato = numIncarichi > 1;

  let yPos = 20;
  const pageWidth = 210;
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;

  // TITOLO
  doc.setFontSize(16);
  setFont(doc, 'bold');
  doc.text('AV.3 - ISTRUTTORIA CLIENTE', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // SEZIONE 1 - CLIENTE E PROFESSIONISTA
  doc.setFontSize(12);
  setFont(doc, 'bold');
  doc.text('CLIENTE E PROFESSIONISTA INCARICATO', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  setFont(doc, 'normal');
  doc.text(`Denominazione Cliente: ${normalizeText(cliente.ragione_sociale)}`, margin, yPos);
  yPos += 6;
  doc.text('Gruppo di riferimento del Cliente: _____________________________', margin, yPos);
  yPos += 8;

  doc.text('Studio/Professionista di riferimento: _____________________________', margin, yPos);
  yPos += 6;
  doc.text('Altri Associati/Soci/Professionisti: _____________________________', margin, yPos);
  yPos += 8;

  // Checkbox (simulati con caratteri Unicode) — auto-spuntati in base al numero di incarichi
  doc.text(`${getCheckboxSymbol(isNuovoCliente)} Nuovo Cliente.`, margin, yPos);
  yPos += 6;
  doc.text(`${getCheckboxSymbol(isGiaIdentificato)} Cliente già identificato in relazione ad un precedente incarico.`, margin, yPos);
  yPos += 6;
  doc.text(`${getCheckboxSymbol(false)} Necessaria/opportuna una nuova identificazione.`, margin, yPos);
  yPos += 8;

  doc.text('Soggetto responsabile identificazione: _____________________________', margin, yPos);
  yPos += 8;

  setFont(doc, 'bold');
  doc.text('Valore della prestazione professionale:', margin, yPos);
  yPos += 6;
  setFont(doc, 'normal');
  doc.text(`${getCheckboxSymbol(false)} Euro _____________________`, margin, yPos);
  yPos += 6;
  doc.text(`${getCheckboxSymbol(true)} indeterminato/non determinabile`, margin, yPos);
  yPos += 10;

  // OPERAZIONE
  setFont(doc, 'bold');
  doc.text('OPERAZIONE (eseguita dal Professionista per conto del Cliente):', margin, yPos);
  yPos += 6;
  setFont(doc, 'normal');
  doc.text(`Data: ${today}`, margin, yPos);
  yPos += 6;
  doc.text('Importo: _____________________________', margin, yPos);
  yPos += 6;
  doc.text('Causale: Servizi professionali di consulenza', margin, yPos);
  yPos += 6;
  doc.text('Mezzi di pagamento utilizzati: Bonifico bancario', margin, yPos);
  yPos += 6;
  doc.text('Documentazione allegata: Visura camerale, Statuto, Dichiarazione AML', margin, yPos);
  yPos += 10;

  // ADEGUATA VERIFICA
  setFont(doc, 'bold');
  doc.text('ADEGUATA VERIFICA:', margin, yPos);
  yPos += 6;
  setFont(doc, 'normal');
  doc.text(`${getCheckboxSymbol(true)} Ordinaria`, margin, yPos);
  yPos += 6;
  doc.text(`${getCheckboxSymbol(false)} Semplificata`, margin, yPos);
  yPos += 6;
  doc.text(`${getCheckboxSymbol(false)} Rafforzata`, margin, yPos);
  yPos += 10;

  // DATA DI RIFERIMENTO
  setFont(doc, 'bold');
  doc.text('DATA DI RIFERIMENTO:', margin, yPos);
  yPos += 6;
  setFont(doc, 'normal');
  doc.text(`${getCheckboxSymbol(true)} Data di riferimento del fascicolo: ${today}`, margin, yPos);
  yPos += 6;
  doc.text(`${getCheckboxSymbol(false)} Data di aggiornamento: ____________________`, margin, yPos);
  yPos += 6;
  doc.setFontSize(9);
  doc.text('Prossimo aggiornamento previsto per: _______________________________', margin, yPos);
  yPos += 12;

  // Nuova pagina se necessario
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // SEZIONE 1 - DATI CLIENTE
  doc.setFontSize(12);
  setFont(doc, 'bold');
  doc.text('1) Dati relativi al Cliente', margin, yPos);
  yPos += 8;

  doc.setFontSize(9);
  setFont(doc, 'italic');
  doc.text('Con riferimento al legale rappresentante/delegato:', margin, yPos);
  yPos += 6;

  doc.setFontSize(10);
  setFont(doc, 'normal');

  const rlIsAzienda = cliente.tipo_soggetto_rappresentante === 'azienda';

  if (cliente.rappresentante_legale) {
    doc.text(`${rlIsAzienda ? 'Ragione sociale' : 'Cognome e nome'}: ${normalizeText(cliente.rappresentante_legale)}`, margin, yPos);
    yPos += 6;
  }

  if (rlIsAzienda) {
    if (cliente.codice_fiscale_rappresentante) {
      doc.text(`Codice fiscale azienda: ${normalizeText(cliente.codice_fiscale_rappresentante)}`, margin, yPos);
      yPos += 6;
    }
    if (cliente.partita_iva_rappresentante) {
      doc.text(`Partita IVA: ${normalizeText(cliente.partita_iva_rappresentante)}`, margin, yPos);
      yPos += 6;
    }
    if (cliente.natura_giuridica_rappresentante) {
      doc.text(`Natura giuridica: ${normalizeText(cliente.natura_giuridica_rappresentante)}`, margin, yPos);
      yPos += 6;
    }
  } else {
    doc.text(`Codice fiscale: ${normalizeText(cliente.codice_fiscale_rappresentante || cliente.codice_fiscale) || 'N/D'}`, margin, yPos);
    yPos += 6;
  }

  doc.text('Carica/poteri rappresentanza: Amministratore/Legale rappresentante', margin, yPos);
  yPos += 6;
  doc.text('Poteri rappresentanza verificati tramite: Visura camerale', margin, yPos);
  yPos += 8;

  doc.setFontSize(9);
  setFont(doc, 'italic');
  doc.text('Con riferimento alla società/ente:', margin, yPos);
  yPos += 6;

  doc.setFontSize(10);
  setFont(doc, 'normal');
  doc.text(`Denominazione/ragione sociale: ${normalizeText(cliente.ragione_sociale)}`, margin, yPos);
  yPos += 6;
  doc.text(`Codice fiscale: ${normalizeText(cliente.codice_fiscale) || 'N/D'}`, margin, yPos);
  yPos += 6;
  doc.text(`Partita IVA: ${normalizeText(cliente.partita_iva) || 'N/D'}`, margin, yPos);
  yPos += 6;
  doc.text(`Sede legale: ${normalizeText(cliente.indirizzo) || 'N/D'}`, margin, yPos);
  yPos += 6;
  doc.text(`Attività: ${normalizeText(incarico.descrizione) || 'Attività d\'impresa'}`, margin, yPos);
  yPos += 12;

  // Nuova pagina per titolari effettivi
  if (yPos > 220) {
    doc.addPage();
    yPos = 20;
  }

  // SEZIONE 2 - TITOLARI EFFETTIVI
  doc.setFontSize(12);
  setFont(doc, 'bold');
  doc.text('2) Dati relativi ai titolari effettivi', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  setFont(doc, 'normal');

  if (titolari_effettivi.length > 0) {
    titolari_effettivi.slice(0, 5).forEach((titolare, _index) => {
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }

      const isAzienda = titolare.tipo_soggetto === 'azienda';

      if (isAzienda) {
        doc.text(`Ragione sociale: ${normalizeText(titolare.nome_cognome)}`, margin, yPos);
        yPos += 6;
        doc.text(`Codice fiscale azienda: ${normalizeText(titolare.codice_fiscale)}`, margin, yPos);
        yPos += 6;
        if (titolare.partita_iva) {
          doc.text(`Partita IVA: ${normalizeText(titolare.partita_iva)}`, margin, yPos);
          yPos += 6;
        }
        if (titolare.natura_giuridica) {
          doc.text(`Natura giuridica: ${normalizeText(titolare.natura_giuridica)}`, margin, yPos);
          yPos += 6;
        }
        if (titolare.codice_ateco) {
          doc.text(`Codice ATECO: ${normalizeText(titolare.codice_ateco)}`, margin, yPos);
          yPos += 6;
        }
      } else {
        doc.text(`Cognome e nome: ${normalizeText(titolare.nome_cognome)}`, margin, yPos);
        yPos += 6;
        doc.text(`Codice fiscale: ${normalizeText(titolare.codice_fiscale)}`, margin, yPos);
        yPos += 6;
      }

      if (titolare.tipo_rapporto === 'societa_ente' || titolare.tipo_rapporto === 'caso_residuale') {
        doc.setFontSize(9);
        setFont(doc, 'italic');
        const ruoloLabel = isAzienda ? 'Attività svolta' : 'Ruolo';
        doc.text(`${ruoloLabel}: ${normalizeText(titolare.professione)}`, margin, yPos);
        yPos += 6;
        doc.setFontSize(10);
        setFont(doc, 'normal');
      }

      yPos += 4;
    });
  } else {
    doc.text('Nessun titolare effettivo registrato', margin, yPos);
    yPos += 8;
  }

  yPos += 6;
  doc.setFontSize(9);
  setFont(doc, 'italic');
  doc.text('Altri dati identificativi come da documentazione allegata.', margin, yPos);
  yPos += 10;

  doc.setFontSize(10);
  setFont(doc, 'bold');
  doc.text('Dati acquisiti e verificati tramite:', margin, yPos);
  yPos += 6;
  setFont(doc, 'normal');
  doc.text(`${getCheckboxSymbol(true)} dichiarazione antiriciclaggio resa dal Cliente ex art. 22 D.Lgs. 231/2007;`, margin, yPos);
  yPos += 6;
  doc.text(`${getCheckboxSymbol(true)} estratti da pubblici registri;`, margin, yPos);
  yPos += 6;
  doc.text(`${getCheckboxSymbol(false)} estratti da elenchi, atti, documenti conoscibili da chiunque;`, margin, yPos);
  yPos += 6;
  doc.text(`${getCheckboxSymbol(false)} attestazione di altro professionista, art. 26 D.Lgs.231/2007;`, margin, yPos);
  yPos += 12;

  // Nuova pagina per sezione 3
  if (yPos > 220) {
    doc.addPage();
    yPos = 20;
  }

  // SEZIONE 3 - SCOPO E NATURA
  doc.setFontSize(12);
  setFont(doc, 'bold');
  doc.text('3) Scopo e natura dell\'incarico professionale', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  setFont(doc, 'normal');
  const scopoText = normalizeText(incarico.scopo_natura) || normalizeText(incarico.descrizione) || 'Servizi professionali nell\'ambito dell\'attività d\'impresa';
  const scopoLines = doc.splitTextToSize(scopoText, contentWidth);
  doc.text(scopoLines, margin, yPos);
  yPos += scopoLines.length * 6 + 12;

  // SEZIONE 4 - PROFILO DI RISCHIO
  setFont(doc, 'bold');
  doc.text('4) Profilo di rischio attribuito', margin, yPos);
  yPos += 8;

  setFont(doc, 'normal');
  doc.text(`${getCheckboxSymbol(true)} Basso`, margin, yPos);
  yPos += 6;
  doc.text(`${getCheckboxSymbol(false)} Medio`, margin, yPos);
  yPos += 6;
  doc.text(`${getCheckboxSymbol(false)} Alto`, margin, yPos);
  yPos += 12;

  // SEZIONE 5 - SEGNALAZIONI
  setFont(doc, 'bold');
  doc.text('5) Segnalazioni e comunicazioni', margin, yPos);
  yPos += 8;

  setFont(doc, 'normal');
  doc.text(`${getCheckboxSymbol(false)} Effettuata segnalazione di operazione sospetta`, margin, yPos);
  yPos += 6;
  doc.text(`${getCheckboxSymbol(false)} Effettuata comunicazione violazioni`, margin, yPos);
  yPos += 10;

  // FIRMA E DATA
  doc.setFontSize(10);
  setFont(doc, 'normal');
  const locationCity = normalizeText(cliente.indirizzo?.split(',')[1]?.trim()) || 'Italia';
  doc.text(`Luogo e data: ${locationCity}, ${today}`, margin, yPos);
  yPos += 15;

  doc.text('Firma del Professionista', margin, yPos);
  yPos += 3;
  doc.text('_'.repeat(50), margin, yPos);

  return doc.output('arraybuffer');
}

// ========== GENERAZIONE PDF AV.4 - DICHIARAZIONE CLIENTE ==========
export async function generatePDF_AV4(data: AMLDataComplete): Promise<Uint8Array> {
  const doc = await createPDFWithUnicode({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const { cliente, titolari_effettivi, incarico } = data;
  const today = formatDate(new Date().toISOString());

  let yPos = 20;
  const pageWidth = 210;
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;

  // TITOLO
  doc.setFontSize(16);
  setFont(doc, 'bold');
  doc.text('AV.4 - DICHIARAZIONE DEL CLIENTE', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // PREAMBOLO
  doc.setFontSize(9);
  setFont(doc, 'normal');
  const preambuloText = 'In ottemperanza alle disposizioni dell\'art. 22 del D.Lgs. 231/2007 (obblighi del cliente in materia di prevenzione e contrasto al riciclaggio/FDT) e successive modifiche e integrazioni, fornisco le sottostanti informazioni, assumendomi tutte le responsabilità di natura civile, amministrativa e penale per dichiarazioni non veritiere.';
  const preambuloLines = doc.splitTextToSize(preambuloText, contentWidth);
  doc.text(preambuloLines, margin, yPos);
  yPos += preambuloLines.length * 5 + 12;

  // IL SOTTOSCRITTO
  doc.setFontSize(11);
  setFont(doc, 'bold');
  doc.text('Il sottoscritto,', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  setFont(doc, 'normal');
  doc.text(`Nome e Cognome: ${normalizeText(cliente.ragione_sociale)}`, margin, yPos);
  yPos += 6;
  doc.text(`Codice fiscale: ${normalizeText(cliente.codice_fiscale) || 'N/D'}`, margin, yPos);
  yPos += 6;
  doc.text(`Nazionalità: ${normalizeText(cliente.nazionalita) || 'Italiana'}`, margin, yPos);
  yPos += 12;

  // DICHIARA
  doc.setFontSize(11);
  setFont(doc, 'bold');
  doc.text('DICHIARA', margin, yPos);
  yPos += 8;

  doc.setFontSize(9);
  setFont(doc, 'normal');
  const scopoText = `- che, ai sensi dell'art.18, comma 1, lettera c), D.Lgs. 231/2007, lo scopo e la natura della prestazione professionale richiesta sono: ${normalizeText(incarico.scopo_natura) || normalizeText(incarico.descrizione) || 'Servizi professionali nell\'ambito dell\'attività d\'impresa'}`;
  const scopoLines = doc.splitTextToSize(scopoText, contentWidth);
  doc.text(scopoLines, margin, yPos);
  yPos += scopoLines.length * 5 + 10;

  // PEP Status
  const isPep = cliente.pep === true;
  doc.text(`${getCheckboxSymbol(!isPep)} di non costituire persona politicamente esposta (PEP)`, margin, yPos);
  yPos += 5;
  doc.text(`${getCheckboxSymbol(false)} di non rivestire lo status di PPE da più di un anno`, margin, yPos);
  yPos += 5;
  doc.text(`${getCheckboxSymbol(isPep)} di costituire persona politicamente esposta`, margin, yPos);
  yPos += 10;

  // TITOLARI EFFETTIVI
  doc.text('- ai fini dell\'identificazione del Titolare Effettivo:', margin, yPos);
  yPos += 6;

  const tipoRapporto = titolari_effettivi[0]?.tipo_rapporto || 'in_proprio';
  doc.text(`${getCheckboxSymbol(tipoRapporto === 'in_proprio')} di agire in proprio`, margin, yPos);
  yPos += 5;
  doc.text(`${getCheckboxSymbol(tipoRapporto === 'per_conto_persone')} di agire per conto dei seguenti titolari effettivi (persone fisiche)`, margin, yPos);
  yPos += 5;
  doc.text(`${getCheckboxSymbol(tipoRapporto === 'societa_ente' || tipoRapporto === 'caso_residuale')} (caso residuale) di agire per conto della società/ente ${normalizeText(cliente.ragione_sociale)}`, margin, yPos);
  yPos += 6;
  doc.text(`con sede legale in ${normalizeText(cliente.indirizzo) || 'N/D'},`, margin, yPos);
  yPos += 5;
  doc.text('in qualità di legale rappresentante, e attesta che i titolari effettivi sono:', margin, yPos);
  yPos += 10;

  // PEP per titolari effettivi
  const hasPepTitolari = titolari_effettivi.some(t => t.is_pep === true);
  doc.text(`${getCheckboxSymbol(!hasPepTitolari)} che il/i titolare/i effettivo/i non costituisce/costituiscono PEP`, margin, yPos);
  yPos += 5;
  doc.text(`${getCheckboxSymbol(hasPepTitolari)} che il/i titolari effettivi costituisce/costituiscono PEP`, margin, yPos);
  yPos += 10;

  // RELAZIONI, FONDI, PAGAMENTI
  doc.text('- che le relazioni intercorrenti tra Cliente e titolare effettivo sono:', margin, yPos);
  yPos += 6;
  doc.text(normalizeText(incarico.relazioni_cliente_te) || 'descrizione', margin + 5, yPos);
  yPos += 8;

  doc.text('- che la provenienza dei fondi utilizzati è:', margin, yPos);
  yPos += 6;
  doc.text(normalizeText(incarico.provenienza_fondi) || 'descrizione', margin + 5, yPos);
  yPos += 8;

  doc.text('- che i mezzi di pagamento forniti al professionista sono:', margin, yPos);
  yPos += 6;
  doc.text(normalizeText(incarico.mezzi_pagamento) || 'descrizione', margin + 5, yPos);
  yPos += 8;

  const fondiText = '- che i medesimi fondi non provengono né sono destinati a un\'attività criminosa o al finanziamento del terrorismo di cui all\'art. 2, co. 6, del D.Lgs. 231/2007.';
  const fondiLines = doc.splitTextToSize(fondiText, contentWidth);
  doc.text(fondiLines, margin, yPos);
  yPos += fondiLines.length * 5 + 8;

  doc.text(`- che la professione/attività del cliente è: ${normalizeText(incarico.descrizione) || 'descrizione'}`, margin, yPos);
  yPos += 12;

  // Nuova pagina se necessario
  if (yPos > 220) {
    doc.addPage();
    yPos = 20;
  }

  // DICHIARA ESPRESSAMENTE
  setFont(doc, 'bold');
  doc.text('Dichiara espressamente', margin, yPos);
  yPos += 6;
  setFont(doc, 'normal');
  
  const dichText = 'i) di aver esaminato e compreso le definizioni in materia di "persone politicamente esposte", di "titolare effettivo" e di "finanziamento al terrorismo" contenute in calce all\'Allegato alla presente dichiarazione, ii) di essere consapevole delle sanzioni penali previste dall\'art. 55, co. 3, D.Lgs. 231/2007, per chi fornisce dati falsi o informazioni non veritiere, iii) di essere stato informato della circostanza che il mancato rilascio in tutto o in parte delle informazioni di cui sopra pregiudica la possibilità dello Studio professionale di dare esecuzione alla prestazione professionale richiesta.';
  const dichLines = doc.splitTextToSize(dichText, contentWidth);
  doc.text(dichLines, margin, yPos);
  yPos += dichLines.length * 5 + 10;

  // SI IMPEGNA
  doc.setFontSize(10);
  setFont(doc, 'bold');
  doc.text('Si impegna', margin, yPos);
  yPos += 6;
  setFont(doc, 'normal');
  doc.setFontSize(9);
  doc.text('a comunicare senza ritardo ogni eventuale integrazione o variazione dei dati sopra indicati.', margin, yPos);
  yPos += 10;

  const gdprText = 'Il sottoscritto prende altresì atto che i propri dati personali saranno trattati dallo Studio professionale esclusivamente per le finalità previste dal D.Lgs. 231/2007 in adempimento degli obblighi previsti dal Regolamento UE 2016/679 per la protezione dei dati.';
  const gdprLines = doc.splitTextToSize(gdprText, contentWidth);
  doc.text(gdprLines, margin, yPos);
  yPos += gdprLines.length * 5 + 15;

  // FIRMA E DATA
  doc.setFontSize(10);
  setFont(doc, 'normal');
  const locationCity = normalizeText(cliente.indirizzo?.split(',')[1]?.trim()) || 'Italia';
  doc.text(`Luogo e data: ${locationCity}, ${today}`, margin, yPos);
  yPos += 15;

  doc.text('Firma del Cliente', margin, yPos);
  yPos += 3;
  doc.text('_'.repeat(50), margin, yPos);
  yPos += 15;

  doc.text('Firma del soggetto che esegue l\'identificazione', margin, yPos);
  yPos += 3;
  doc.text('_'.repeat(50), margin, yPos);

  // NUOVA PAGINA - ALLEGATO RIEPILOGO
  doc.addPage();
  yPos = 20;

  doc.setFontSize(14);
  setFont(doc, 'bold');
  doc.text('ALLEGATO - RIEPILOGO DATI ESTRATTI', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  doc.setFontSize(12);
  doc.text('DATI AZIENDALI', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  setFont(doc, 'normal');
  doc.text(`Ragione Sociale: ${normalizeText(cliente.ragione_sociale)}`, margin, yPos);
  yPos += 6;
  doc.text(`Partita IVA: ${normalizeText(cliente.partita_iva) || 'N/D'}`, margin, yPos);
  yPos += 6;
  doc.text(`Codice Fiscale: ${normalizeText(cliente.codice_fiscale) || 'N/D'}`, margin, yPos);
  yPos += 6;
  doc.text(`Sede Legale: ${normalizeText(cliente.indirizzo) || 'N/D'}`, margin, yPos);
  yPos += 6;
  doc.text(`Settore Attività: ${normalizeText(incarico.descrizione) || 'N/D'}`, margin, yPos);
  yPos += 12;

  doc.setFontSize(12);
  setFont(doc, 'bold');
  doc.text('TITOLARI EFFETTIVI IDENTIFICATI', margin, yPos);
  yPos += 6;
  doc.setFontSize(9);
  setFont(doc, 'italic');
  doc.text('Secondo D.Lgs. 231/2007, Art. 20', margin, yPos);
  yPos += 10;

  doc.setFontSize(10);
  setFont(doc, 'normal');
  
  if (titolari_effettivi.length > 0) {
    titolari_effettivi.forEach((titolare, index) => {
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }

      const isAzienda = titolare.tipo_soggetto === 'azienda';

      setFont(doc, 'bold');
      doc.text(`${index + 1}. ${normalizeText(titolare.nome_cognome)}`, margin, yPos);
      yPos += 6;
      setFont(doc, 'normal');
      doc.setFontSize(9);

      if (isAzienda) {
        doc.text(`   Codice Fiscale Azienda: ${normalizeText(titolare.codice_fiscale)}`, margin, yPos);
        yPos += 5;
        if (titolare.partita_iva) {
          doc.text(`   Partita IVA: ${normalizeText(titolare.partita_iva)}`, margin, yPos);
          yPos += 5;
        }
        if (titolare.natura_giuridica) {
          doc.text(`   Natura Giuridica: ${normalizeText(titolare.natura_giuridica)}`, margin, yPos);
          yPos += 5;
        }
      } else {
        doc.text(`   Codice Fiscale: ${normalizeText(titolare.codice_fiscale)}`, margin, yPos);
        yPos += 5;
      }

      if (titolare.tipo_rapporto === 'societa_ente') {
        doc.text('   Identificato come titolare effettivo ai sensi dell\'Art. 20, comma 2', margin, yPos);
      } else {
        const ruoloLabel = isAzienda ? 'Attività svolta' : 'Ruolo';
        doc.text(`   ${ruoloLabel}: ${normalizeText(titolare.professione)}`, margin, yPos);
        yPos += 5;
        doc.text('   Identificato come titolare effettivo ai sensi dell\'Art. 20, comma 4', margin, yPos);
      }
      yPos += 8;
      doc.setFontSize(10);
    });
  }

  // NUOVA PAGINA - NOTE LEGALI
  doc.addPage();
  yPos = 20;

  doc.setFontSize(14);
  setFont(doc, 'bold');
  doc.text('Allegato alla Dichiarazione del Cliente', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // NOTA 1 - Riciclaggio
  doc.setFontSize(9);
  setFont(doc, 'bold');
  doc.text('(Nota 1)', margin, yPos);
  setFont(doc, 'normal');
  yPos += 5;
  
  const nota1 = 'Ai sensi dell\'art. 2, commi 4 e 5, del D.Lgs. 231/2007, per "riciclaggio" si intende: a) la conversione o il trasferimento di beni, effettuati essendo a conoscenza che essi provengono da un\'attività criminosa; b) l\'occultamento o la dissimulazione della reale natura, provenienza, ubicazione dei beni; c) l\'acquisto, la detenzione o l\'utilizzazione di beni essendo a conoscenza che provengono da attività criminosa; d) la partecipazione ad uno degli atti sopra indicati.';
  const nota1Lines = doc.splitTextToSize(nota1, contentWidth);
  doc.text(nota1Lines, margin, yPos);
  yPos += nota1Lines.length * 4 + 8;

  // NOTA 2 - Finanziamento al terrorismo
  setFont(doc, 'bold');
  doc.text('(Nota 2)', margin, yPos);
  setFont(doc, 'normal');
  yPos += 5;
  
  const nota2 = 'Ai sensi dell\'art. 2, comma 6, del D.Lgs. 231/2007, per "finanziamento al terrorismo" si intende qualsiasi attività diretta, con ogni mezzo, alla fornitura, alla raccolta, alla provvista, all\'intermediazione, al deposito, alla custodia o all\'erogazione di fondi e risorse economiche utilizzabili per il compimento di una o più condotte con finalità di terrorismo.';
  const nota2Lines = doc.splitTextToSize(nota2, contentWidth);
  doc.text(nota2Lines, margin, yPos);
  yPos += nota2Lines.length * 4 + 8;

  // Nuova pagina se necessario
  if (yPos > 240) {
    doc.addPage();
    yPos = 20;
  }

  // NOTA 3 - PEP
  setFont(doc, 'bold');
  doc.text('(Nota 3)', margin, yPos);
  setFont(doc, 'normal');
  yPos += 5;
  
  const nota3 = 'Ai sensi dell\'art.1, comma 2, lett. dd), del D.Lgs. 231/2007, per "persone politicamente esposte" si intendono: le persone fisiche che occupano o hanno cessato di occupare da meno di un anno importanti cariche pubbliche (Presidente della Repubblica, Ministro, parlamentare, giudice, ecc.), nonché i loro familiari e coloro che con i predetti soggetti intrattengono notoriamente stretti legami.';
  const nota3Lines = doc.splitTextToSize(nota3, contentWidth);
  doc.text(nota3Lines, margin, yPos);
  yPos += nota3Lines.length * 4 + 8;

  // NOTA 4 - Titolare Effettivo
  setFont(doc, 'bold');
  doc.text('(Nota 4)', margin, yPos);
  setFont(doc, 'normal');
  yPos += 5;
  
  const nota4 = 'Ai sensi dell\'art. 1, comma 2, lett. pp), del D.Lgs. 231/2007, per "titolare effettivo" si intende la persona fisica o le persone fisiche cui, in ultima istanza, è attribuibile la proprietà diretta o indiretta dell\'ente ovvero il relativo controllo. Secondo l\'art. 20, per le società di capitali costituisce indicazione di proprietà diretta la titolarità di una partecipazione superiore al 25% del capitale. Qualora l\'applicazione di tali criteri non consenta di individuare univocamente uno o più titolari effettivi, il titolare effettivo coincide con la persona fisica o le persone fisiche titolari di poteri di amministrazione o direzione della società.';
  const nota4Lines = doc.splitTextToSize(nota4, contentWidth);
  doc.text(nota4Lines, margin, yPos);

  return doc.output('arraybuffer');
}