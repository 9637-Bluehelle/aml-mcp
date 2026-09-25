/**
 * ValutazioneRischioForm - Componente riutilizzabile per la valutazione del rischio.
 * Usato sia in FascicoloCliente (inline) che in RT2AdeguataVerifica.
 */
import { useState, useEffect } from 'react';
import { Save, Search, X, AlertTriangle, Shield } from 'lucide-react';
import { Card } from './Card';
import { RiskBadge } from './RiskBadge';
import { supabase } from '../lib/supabase';
import { amlData, getPrestazione } from '../lib/aml-data';
import { calculateRT2Scores, RT2TabellaA, RT2TabellaB, RT2FattoreRischio, createDefaultTabellaA, createDefaultTabellaB, addMonths, toLocalIsoDate } from '../lib/calculations';
import { getNomeBySigla, getSiglaByCity } from '../lib/provinceHelper';
import { addUserLog } from './LogUtente';
import { useToast } from './Toast';
// import { useSystemAlerts } from './AlertPanel.tsx'; // [DEPRECATED 2026-04-22] Gestito dai trigger DB
import codiciAtecoRischio from '../data/codici_ateco_2025_rischio.json';
import rischioPaesiData from '../data/rischio_paesi.json';

interface ValutazioneRischioFormProps {
  /** Se fornito, l'incarico è pre-selezionato (no ricerca) */
  incaricoId?: string;
  /** Lista clienti per lookup */
  clienti: any[];
  /** Lista incarichi per ricerca e lookup */
  incarichi: any[];
  /** Callback dopo salvataggio */
  onSave: () => void;
  /** Callback annulla */
  onCancel: () => void;
  /** Label del bottone annulla */
  cancelLabel?: string;
}

export function ValutazioneRischioForm({
  incaricoId,
  clienti,
  incarichi,
  onSave,
  onCancel,
  cancelLabel = 'Annulla',
}: ValutazioneRischioFormProps) {
  const toast = useToast();
  // const { checkSystemAlerts } = useSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB

  // State
  const [selectedIncarico, setSelectedIncarico] = useState(incaricoId || '');
  const [selectedIncaricoNome, setSelectedIncaricoNome] = useState('');
  const [incaricoSearchQuery, setIncaricoSearchQuery] = useState('');
  const [showIncaricoSuggestions, setShowIncaricoSuggestions] = useState(false);
  const [tabellaA, setTabellaA] = useState<RT2TabellaA>(createDefaultTabellaA());
  const [tabellaB, setTabellaB] = useState<RT2TabellaB>(createDefaultTabellaB());
  const [hasTitolariEffettiviDB, setHasTitolariEffettiviDB] = useState<boolean | null>(null);
  const [rischioContanteData, setRischioContanteData] = useState<{ provincia: string; indice_rischiosita: number } | null>(null);
  const [rischioPaeseEstero, setRischioPaeseEstero] = useState<{
    nome_it: string;
    rischio_calcolato: number;
    rischio_label: string;
    fatf_status: string | null;
    eu_alto_rischio: boolean;
    basel_aml_score: number | null;
    cpi_score: number | null;
  } | null>(null);

  // Set nome iniziale se incaricoId pre-selezionato
  useEffect(() => {
    if (incaricoId) {
      const inc = incarichi.find(i => i.id === incaricoId);
      if (inc) {
        const prest = getPrestazione(inc.tipologia_prestazione_id);
        setSelectedIncaricoNome(`${inc.codice_incarico} - ${prest?.label || inc.descrizione}`);
      }
    }
  }, [incaricoId, incarichi]);

  // Check titolari effettivi
  useEffect(() => {
    async function checkTitolariEffettivi() {
      if (!selectedIncarico) { setHasTitolariEffettiviDB(null); return; }
      const incarico = incarichi.find(i => i.id === selectedIncarico);
      if (!incarico?.cliente_id) { setHasTitolariEffettiviDB(null); return; }
      const cliente = clienti.find(c => c.id === incarico.cliente_id);
      if (cliente?.tipo_cliente === 'persona_fisica') { setHasTitolariEffettiviDB(true); return; }
      const { count, error } = await supabase
        .from('titolari_effettivi')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', incarico.cliente_id);
      if (error) { setHasTitolariEffettiviDB(null); return; }
      setHasTitolariEffettiviDB((count ?? 0) > 0);
    }
    checkTitolariEffettivi();
  }, [selectedIncarico, incarichi, clienti]);

  // Carica rischio geografico
  useEffect(() => {
    async function fetchRischioGeografico() {
      if (!selectedIncarico) { setRischioContanteData(null); setRischioPaeseEstero(null); return; }
      const incarico = incarichi.find(i => i.id === selectedIncarico);
      if (!incarico?.cliente_id) { setRischioContanteData(null); setRischioPaeseEstero(null); return; }
      const cliente = clienti.find(c => c.id === incarico.cliente_id);
      if (!cliente) { setRischioContanteData(null); setRischioPaeseEstero(null); return; }

      let paeseEsteroRilevato = '';
      const residenzaCliente = (cliente.residenza || '').trim();
      const indirizzoCliente = (cliente.indirizzo || '').trim();
      const paeseField = (cliente.paese || '').trim();

      if (residenzaCliente.includes(' | ')) {
        paeseEsteroRilevato = residenzaCliente.split(' | ')[0].trim();
      } else if (indirizzoCliente.includes(' | ')) {
        paeseEsteroRilevato = indirizzoCliente.split(' | ')[0].trim();
      } else if (paeseField) {
        const paeseUp = paeseField.toUpperCase();
        if (paeseUp !== 'ITALIA' && paeseUp !== 'IT' && paeseUp !== 'ITALIANA') {
          paeseEsteroRilevato = paeseField;
        }
      }

      if (paeseEsteroRilevato) {
        const paeseUp = paeseEsteroRilevato.toUpperCase();
        const paeseTrovato = rischioPaesiData.paesi.find((p: any) => {
          const nomeIt = p.nome_it.toUpperCase();
          const nomeEn = p.nome_en.toUpperCase();
          return nomeIt === paeseUp || nomeEn === paeseUp
            || paeseUp.includes(nomeIt) || nomeIt.includes(paeseUp)
            || paeseUp.includes(nomeEn) || nomeEn.includes(paeseUp);
        });
        if (paeseTrovato) {
          setRischioPaeseEstero({
            nome_it: paeseTrovato.nome_it,
            rischio_calcolato: paeseTrovato.rischio_calcolato,
            rischio_label: paeseTrovato.rischio_label,
            fatf_status: paeseTrovato.fatf_status,
            eu_alto_rischio: paeseTrovato.eu_alto_rischio,
            basel_aml_score: paeseTrovato.basel_aml_score,
            cpi_score: paeseTrovato.cpi_score,
          });
        } else {
          setRischioPaeseEstero(null);
        }
        setRischioContanteData(null);
        return;
      }

      setRischioPaeseEstero(null);
      let provincia = cliente.provincia_residenza;
      const indirizzoCompleto = cliente.indirizzo || cliente.residenza || '';
      if (!provincia) {
        const match = indirizzoCompleto.match(/\(([A-Z]{2})\)/);
        if (match) provincia = getNomeBySigla(match[1]);
      }
      if (!provincia) {
        const capCittaMatch = indirizzoCompleto.match(/(\d{5})\s+(.+?)$/);
        if (capCittaMatch) {
          const sigla = getSiglaByCity(capCittaMatch[2].trim());
          if (sigla) provincia = getNomeBySigla(sigla);
        }
      }
      if (!provincia) { setRischioContanteData(null); return; }
      const { data } = await supabase
        .from('rischio_contante')
        .select('provincia, indice_rischiosita')
        .ilike('provincia', provincia)
        .maybeSingle();
      setRischioContanteData(data);
    }
    fetchRischioGeografico();
  }, [selectedIncarico, incarichi, clienti]);

  // Computed
  const selectedIncaricoData = incarichi.find(i => i.id === selectedIncarico);
  const prestazione = selectedIncaricoData ? getPrestazione(selectedIncaricoData.tipologia_prestazione_id) : null;
  const onlyTabA = prestazione?.onlyTabA || false;
  const clientePerValutazione = selectedIncaricoData ? clienti.find(c => c.id === selectedIncaricoData.cliente_id) : null;
  const isPep = clientePerValutazione?.pep === true;

  const codiceAtecoCliente = (clientePerValutazione as any)?.codice_ateco as string | undefined;
  const codiceAtecoNorm = codiceAtecoCliente?.trim().split(' ')[0].split('-')[0].trim();
  const atecoRischioInfo = codiceAtecoNorm
    ? (codiciAtecoRischio as any).codici.find((c: any) => c.codice === codiceAtecoNorm)
    : null;

  const hasDatiMinimi = clientePerValutazione && (
    clientePerValutazione.documento_identita?.numero || clientePerValutazione.codice_fiscale
  );
  const hasTitolareEffettivo = hasTitolariEffettiviDB === true;
  const hasScopoPrestazione = selectedIncaricoData?.scopo_natura && selectedIncaricoData.scopo_natura.trim() !== '';
  const datiMinimiCompleti = hasDatiMinimi && hasTitolareEffettivo && hasScopoPrestazione;

  const fattoriRischioData = amlData.fattori_rischio;

  let scores = null;
  if (selectedIncaricoData && prestazione) {
    scores = calculateRT2Scores(
      selectedIncaricoData.tipologia_prestazione_id,
      tabellaA,
      onlyTabA ? undefined : tabellaB,
      isPep
    );
  }

  // Filtro incarichi per ricerca (solo se non pre-selezionato)
  const filteredIncarichiForEvaluate = incarichi.filter(incarico => {
    const query = incaricoSearchQuery.toLowerCase();
    const prest = getPrestazione(incarico.tipologia_prestazione_id);
    return (
      incarico.codice_incarico.toLowerCase().includes(query) ||
      incarico.descrizione.toLowerCase().includes(query) ||
      (prest?.label || '').toLowerCase().includes(query)
    );
  });

  // Helpers
  const updateTabellaAFattore = (key: keyof RT2TabellaA, updates: Partial<RT2FattoreRischio>) => {
    setTabellaA(prev => ({ ...prev, [key]: { ...prev[key], ...updates } }));
  };
  const updateTabellaBFattore = (key: keyof RT2TabellaB, updates: Partial<RT2FattoreRischio>) => {
    setTabellaB(prev => ({ ...prev, [key]: { ...prev[key], ...updates } }));
  };
  const toggleFattore = (tabella: 'A' | 'B', aspettoKey: string, fattoreId: string) => {
    if (tabella === 'A') {
      const key = aspettoKey as keyof RT2TabellaA;
      const current = tabellaA[key].fattoriSelezionati;
      const updated = current.includes(fattoreId) ? current.filter(f => f !== fattoreId) : [...current, fattoreId];
      updateTabellaAFattore(key, { fattoriSelezionati: updated });
    } else {
      const key = aspettoKey as keyof RT2TabellaB;
      const current = tabellaB[key].fattoriSelezionati;
      const updated = current.includes(fattoreId) ? current.filter(f => f !== fattoreId) : [...current, fattoreId];
      updateTabellaBFattore(key, { fattoriSelezionati: updated });
    }
  };

  const scoreLabels: Record<number, { label: string; color: string }> = {
    1: { label: 'Non significativo', color: 'bg-green-100 text-green-800' },
    2: { label: 'Poco significativo', color: 'bg-yellow-100 text-yellow-800' },
    3: { label: 'Abbastanza significativo', color: 'bg-orange-100 text-orange-800' },
    4: { label: 'Molto significativo', color: 'bg-red-100 text-red-800' }
  };

  async function handleSaveValutazione() {
    if (!selectedIncarico) { toast.warning('Selezionare un incarico'); return; }
    const incarico = incarichi.find(i => i.id === selectedIncarico);
    if (!incarico) return;
    const prest = getPrestazione(incarico.tipologia_prestazione_id);
    if (!prest) { toast.warning('Inserisci la tipologia di prestazione prima di continuare'); return; }

    const cliente = clienti.find(c => c.id === incarico.cliente_id);
    const isPepLocal = cliente?.pep === true;
    const scoresLocal = calculateRT2Scores(
      incarico.tipologia_prestazione_id,
      tabellaA,
      prest.onlyTabA ? undefined : tabellaB,
      isPepLocal
    );

    const classeRischio = scoresLocal.rischioEffettivo >= 3.6 ? 4 :
                          scoresLocal.rischioEffettivo >= 2.6 ? 3 :
                          scoresLocal.rischioEffettivo >= 1.6 ? 2 : 1;

    const rt2 = amlData.regole_tecniche.find(rt => rt.id === 'RT2');
    const misura = rt2?.misure_per_classe?.find(m => m.grade === classeRischio);
    const periodicitaMesi = classeRischio >= 4 ? 6 : classeRischio >= 3 ? 12 : classeRischio >= 2 ? 24 : 36;
    const prossimoControllo = addMonths(new Date(), periodicitaMesi); // clamp fine mese, no overflow

    const { error } = await supabase.from('valutazioni_rischio').insert({
      incarico_id: selectedIncarico,
      rischio_inerente_prestazione: scoresLocal.inerentePrestazione,
      tabella_a_scores: tabellaA,
      tabella_b_scores: prest.onlyTabA ? null : tabellaB,
      rischio_specifico: scoresLocal.rischioSpecifico,
      rischio_effettivo: scoresLocal.rischioEffettivo,
      classe_rischio: classeRischio,
      misure_applicate: misura?.label || '',
      prossimo_controllo: toLocalIsoDate(prossimoControllo),
    });

    if (error) { toast.error('Errore nel salvataggio della valutazione'); return; }

    addUserLog(`Aggiunta valutazione del rischio all'incarico ${incarico.codice_incarico}, cliente: ${cliente?.ragione_sociale || ''}.`);
    // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
    toast.success('Valutazione salvata con successo');
    onSave();
  }

  // Render aspetto rischio
  const renderAspettoRischio = (
    tabella: 'A' | 'B',
    aspetto: { id: string; label: string; descrizione: string; fattori: { id: string; label: string }[] },
    currentFattore: RT2FattoreRischio,
    aspettoKey: string
  ) => (
    <div key={aspetto.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{aspetto.label}</h4>
          <p className="text-xs text-gray-500">{aspetto.descrizione}</p>
        </div>
        <div className='flex flex-row gap-4'>
          {currentFattore.fattoriSelezionati.length === 0 ? (
            <div></div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-xs font-medium text-red-700 whitespace-nowrap">Grado di rischio consigliato 3 o 4</span>
            </div>
          )}
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${scoreLabels[currentFattore.score]?.color || 'bg-gray-100 text-gray-800'}`}>
            {currentFattore.score} - {scoreLabels[currentFattore.score]?.label || ''}
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 space-y-2">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Fattori di rischio rilevati:</p>
          {aspetto.fattori.map(fattore => (
            <label key={fattore.id} className="flex items-start gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={currentFattore.fattoriSelezionati.includes(fattore.id)}
                onChange={() => toggleFattore(tabella, aspettoKey, fattore.id)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{fattore.label}</span>
            </label>
          ))}
        </div>

        <div className="flex-shrink-0 flex flex-col gap-2 items-end justify-start w-1/3">
          {aspettoKey === 'areaClienteControparte' && rischioContanteData && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 max-w-[220px]">
              <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-blue-700">
                Provincia <strong>{rischioContanteData.provincia}</strong>: punteggio consigliato <strong>{rischioContanteData.indice_rischiosita}</strong>
              </span>
            </div>
          )}
          {aspettoKey === 'areaClienteControparte' && rischioPaeseEstero && (
            <div className={`flex items-start gap-2 px-3 py-2 rounded-lg max-w-[260px] border ${
              rischioPaeseEstero.rischio_calcolato >= 3 ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'
            }`}>
              <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                rischioPaeseEstero.rischio_calcolato >= 3 ? 'text-red-600' : 'text-blue-600'
              }`} />
              <div className={`text-xs ${rischioPaeseEstero.rischio_calcolato >= 3 ? 'text-red-700' : 'text-blue-700'}`}>
                <div>Paese estero : <strong>{rischioPaeseEstero.nome_it}</strong></div>
                <div>Punteggio consigliato : <strong>{rischioPaeseEstero.rischio_calcolato}</strong></div>
                {rischioPaeseEstero.fatf_status === 'black_list' && (
                  <div className="mt-1 text-red-600 font-semibold">FATF Black List — Contromisure obbligatorie</div>
                )}
                {rischioPaeseEstero.fatf_status === 'grey_list' && (
                  <div className="mt-1 text-orange-600 font-semibold">FATF Grey List — Sorveglianza rafforzata</div>
                )}
                {rischioPaeseEstero.eu_alto_rischio && (
                  <div className="mt-1 font-semibold text-red-600">Lista UE Paesi ad alto rischio</div>
                )}
                {rischioPaeseEstero.basel_aml_score !== null && (
                  <div className="mt-0.5 italic opacity-80">Basel AML: {rischioPaeseEstero.basel_aml_score}/10</div>
                )}
                {rischioPaeseEstero.cpi_score !== null && (
                  <div className="italic opacity-80">CPI: {rischioPaeseEstero.cpi_score}/100</div>
                )}
              </div>
            </div>
          )}
          {aspettoKey === 'attivitaPrevalente' && atecoRischioInfo && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 max-w-[260px]">
              <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-700">
                <div>ATECO <strong>{atecoRischioInfo.codice}</strong> : rischio <strong>{atecoRischioInfo.rischio_indicativo}</strong></div>
                {atecoRischioInfo.alto_rischio_banca_italia && (
                  <div className="mt-1 text-red-600 font-semibold">Alto rischio segnalato<br/>da Banca d'Italia</div>
                )}
                {atecoRischioInfo.fonte_rischio && (
                  <div className="mt-1 italic text-blue-600">{atecoRischioInfo.fonte_rischio}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Altro (specificare):</label>
        <input
          type="text"
          value={currentFattore.altro}
          onChange={(e) => {
            if (tabella === 'A') updateTabellaAFattore(aspettoKey as keyof RT2TabellaA, { altro: e.target.value });
            else updateTabellaBFattore(aspettoKey as keyof RT2TabellaB, { altro: e.target.value });
          }}
          placeholder="Inserisci fattori aggiuntivi non previsti..."
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Punteggio assegnato:</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(score => (
            <button
              key={score}
              onClick={() => {
                if (tabella === 'A') updateTabellaAFattore(aspettoKey as keyof RT2TabellaA, { score });
                else updateTabellaBFattore(aspettoKey as keyof RT2TabellaB, { score });
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border ${
                currentFattore.score === score
                  ? score === 1 ? 'bg-green-600 text-white border-green-600'
                  : score === 2 ? 'bg-yellow-500 text-white border-yellow-500'
                  : score === 3 ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {score}
            </button>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-gray-400">Non significativo</span>
          <span className="text-[10px] text-gray-400">Molto significativo</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Valutazione del Rischio</h1>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          {cancelLabel}
        </button>
      </div>

      {/* Warning PEP */}
      {isPep && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-red-800">Cliente PEP - Persona Politicamente Esposta</h3>
              <p className="text-sm text-red-700 mt-1">
                Il rischio effettivo viene forzato a <strong>Molto Significativo (4.0)</strong>.
                Si applica obbligatoriamente l'Adeguata Verifica <strong>Rafforzata</strong>.
              </p>
              {clientePerValutazione?.pep_dettagli && (
                <p className="text-sm text-red-600 mt-1">Dettagli: {clientePerValutazione.pep_dettagli}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Warning Dati Minimi */}
      {selectedIncaricoData && !datiMinimiCompleti && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-amber-800">Attenzione - Dati minimi incompleti</h3>
              <p className="text-sm text-amber-700 mt-1">
                Mancano uno o piu dati minimi obbligatori per l'adeguata verifica:
              </p>
              <ul className="text-sm text-amber-700 mt-1 list-disc list-inside">
                {!hasDatiMinimi && <li>Identita del cliente (documento di identita o codice fiscale)</li>}
                {!hasTitolareEffettivo && <li>Titolare effettivo</li>}
                {!hasScopoPrestazione && <li>Scopo e natura della prestazione</li>}
              </ul>
              <p className="text-sm text-amber-800 font-medium mt-2">
                In assenza dei dati minimi sussiste l'obbligo di astensione (art. 23 D.Lgs. 231/2007).
                Valutare la compilazione di una Segnalazione di Operazione Sospetta (SOS).
              </p>
            </div>
          </div>
        </div>
      )}

      <Card title="Selezione Incarico">
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Incarico da valutare *
          </label>

          {/* Incarico selezionato */}
          {selectedIncarico && selectedIncaricoNome && (
            <div className="mb-2 flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex-1">
                <p className="text-sm font-medium text-purple-900">{selectedIncaricoNome}</p>
                <p className="text-xs text-purple-600">Incarico selezionato</p>
              </div>
              {!incaricoId && (
                <button
                  onClick={() => {
                    setSelectedIncarico('');
                    setSelectedIncaricoNome('');
                    setIncaricoSearchQuery('');
                    setShowIncaricoSuggestions(false);
                  }}
                  className="text-purple-600 hover:text-purple-800 p-1"
                  title="Cambia incarico"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Campo di ricerca (solo se non pre-selezionato) */}
          {!selectedIncarico && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Cerca incarico per codice, descrizione o prestazione..."
                  value={incaricoSearchQuery}
                  onChange={(e) => {
                    setIncaricoSearchQuery(e.target.value);
                    setShowIncaricoSuggestions(true);
                  }}
                  onFocus={() => setShowIncaricoSuggestions(true)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {showIncaricoSuggestions && incaricoSearchQuery && filteredIncarichiForEvaluate.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredIncarichiForEvaluate.slice(0, 10).map(incarico => {
                    const prest = getPrestazione(incarico.tipologia_prestazione_id);
                    return (
                      <button
                        key={incarico.id}
                        onClick={() => {
                          setSelectedIncarico(incarico.id);
                          setSelectedIncaricoNome(`${incarico.codice_incarico} - ${prest?.label || incarico.descrizione}`);
                          setIncaricoSearchQuery('');
                          setShowIncaricoSuggestions(false);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                      >
                        <p className="font-medium text-gray-900">{incarico.codice_incarico}</p>
                        <p className="text-sm text-gray-600">{prest?.label || incarico.descrizione}</p>
                      </button>
                    );
                  })}
                  {filteredIncarichiForEvaluate.length > 10 && (
                    <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50">
                      Mostrando 10 di {filteredIncarichiForEvaluate.length} risultati. Continua a digitare per affinare la ricerca.
                    </div>
                  )}
                </div>
              )}

              {showIncaricoSuggestions && incaricoSearchQuery && filteredIncarichiForEvaluate.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
                  Nessun incarico trovato
                </div>
              )}
            </>
          )}
        </div>
        {prestazione && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-900">{prestazione.label}</p>
            <p className="text-xs text-gray-600 mt-1">Rischio Inerente Prestazione: {prestazione.inherentRisk}</p>
            {onlyTabA && (
              <p className="text-xs text-orange-600 mt-1">Questa prestazione richiede solo la Tabella A (la Tabella B non si compila)</p>
            )}
          </div>
        )}
      </Card>

      {selectedIncarico && (
        <>
          {/* TABELLA A */}
          <Card title="Tabella A - Aspetti connessi al cliente">
            <p className="text-xs text-gray-500 mb-4">Per ogni aspetto, selezionare i fattori di rischio rilevati e assegnare un punteggio da 1 a 4.</p>
            <div className="space-y-4">
              {fattoriRischioData.tabella_a.map(aspetto =>
                renderAspettoRischio('A', aspetto, tabellaA[aspetto.id as keyof RT2TabellaA], aspetto.id)
              )}
            </div>
          </Card>

          {/* TABELLA B */}
          {!onlyTabA && (
            <Card title="Tabella B - Aspetti connessi all'operazione/prestazione">
              <p className="text-xs text-gray-500 mb-4">Per ogni aspetto, selezionare i fattori di rischio rilevati e assegnare un punteggio da 1 a 4.</p>
              <div className="space-y-4">
                {fattoriRischioData.tabella_b.map(aspetto =>
                  renderAspettoRischio('B', aspetto, tabellaB[aspetto.id as keyof RT2TabellaB], aspetto.id)
                )}
              </div>
            </Card>
          )}

          {/* Risultato */}
          {scores && (
            <Card title="Risultato Valutazione">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Rischio Inerente Prestazione</span>
                  <RiskBadge score={scores.inerentePrestazione} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Rischio Specifico</span>
                  <RiskBadge score={scores.rischioSpecifico} />
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <span className="text-base font-semibold text-gray-900">Rischio Effettivo</span>
                  <RiskBadge score={scores.rischioEffettivo} />
                </div>
                {scores.isPepForced && (
                  <div className="flex items-center gap-2 text-red-700 bg-red-50 p-2 rounded-lg">
                    <Shield className="w-4 h-4" />
                    <span className="text-xs font-medium">Rischio forzato a 4.0 per cliente PEP</span>
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  Formula: 0.3 x Inerente Prestazione + 0.7 x Rischio Specifico
                  {onlyTabA
                    ? ' | Rischio Specifico = Totale A / 4'
                    : ' | Rischio Specifico = (Totale A + Totale B) / 10'
                  }
                </p>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSaveValutazione}
                  disabled={!datiMinimiCompleti}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-colors ${
                    datiMinimiCompleti
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                  title={!datiMinimiCompleti ? 'Completare i dati minimi obbligatori prima di salvare' : ''}
                >
                  <Save className="w-4 h-4" />
                  Salva Valutazione
                </button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
