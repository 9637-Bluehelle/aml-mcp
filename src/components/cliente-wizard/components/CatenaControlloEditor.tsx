import { useState } from 'react';
import { Plus, Trash2, AlertTriangle, CheckCircle, Link, User, Building2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '../../Card';
import {
  CatenaControllo,
  NodoPartecipativo,
  ArcoPartecipativo,
  TipoEntita,
  TipoControllo,
  analizzaTitolareEffettivo,
  aggiungiNodo,
  aggiungiArco,
  rimuoviNodo,
  generaId,
  AnalisiTitolareEffettivo,
} from '../../../lib/titolare-effettivo';

interface CatenaControlloEditorProps {
  catena: CatenaControllo;
  onCatenaChange: (catena: CatenaControllo) => void;
}

const TIPO_ENTITA_LABELS: Record<TipoEntita, string> = {
  persona_fisica: 'Persona Fisica',
  societa_capitali: 'Società di Capitali',
  societa_persone: 'Società di Persone',
  fiduciaria: 'Società Fiduciaria',
  trust: 'Trust',
  altro_ente: 'Altro Ente',
};

const TIPO_CONTROLLO_LABELS: Record<TipoControllo, string> = {
  proprieta_diretta: 'Proprietà diretta (>25% capitale)',
  proprieta_indiretta: 'Proprietà indiretta (tramite controllate)',
  maggioranza_voti: 'Maggioranza voti assemblea ordinaria',
  influenza_dominante_voti: 'Influenza dominante (voti)',
  influenza_dominante_contratto: 'Influenza dominante (contratto)',
  patto_parasociale: 'Patto parasociale / sindacato di voto',
  controllo_congiunto: 'Controllo congiunto',
  residuale_amministrazione: 'Poteri di amministrazione/direzione (residuale)',
  usufrutto_pegno: 'Usufrutto / pegno su quote',
};

export function CatenaControlloEditor({ catena, onCatenaChange }: CatenaControlloEditorProps) {
  const [showAddNodo, setShowAddNodo] = useState(false);
  const [showAddArco, setShowAddArco] = useState(false);
  const [analisi, setAnalisi] = useState<AnalisiTitolareEffettivo | null>(null);
  const [expanded, setExpanded] = useState(true);

  // Nuovo nodo form state
  const [nuovoNodo, setNuovoNodo] = useState<Partial<NodoPartecipativo>>({
    tipo: 'persona_fisica',
    denominazione: '',
  });

  // Nuovo arco form state
  const [nuovoArco, setNuovoArco] = useState<Partial<ArcoPartecipativo>>({
    da_nodo_id: '',
    a_nodo_id: catena.clienteNodoId,
    percentuale_capitale: 0,
    tipo_controllo: 'proprieta_diretta',
  });

  const nodoCliente = catena.nodi.find(n => n.id === catena.clienteNodoId);
  const altriNodi = catena.nodi.filter(n => n.id !== catena.clienteNodoId);

  function handleAddNodo() {
    if (!nuovoNodo.denominazione?.trim()) return;
    const nodo: NodoPartecipativo = {
      id: generaId(),
      tipo: nuovoNodo.tipo || 'persona_fisica',
      denominazione: nuovoNodo.denominazione.trim(),
      nome_cognome: nuovoNodo.tipo === 'persona_fisica' ? nuovoNodo.denominazione.trim() : undefined,
      codice_fiscale: nuovoNodo.codice_fiscale,
      is_pep: nuovoNodo.is_pep || false,
      pep_carica: nuovoNodo.pep_carica,
      natura_giuridica: nuovoNodo.natura_giuridica,
    };
    onCatenaChange(aggiungiNodo(catena, nodo));
    setNuovoNodo({ tipo: 'persona_fisica', denominazione: '' });
    setShowAddNodo(false);
  }

  function handleAddArco() {
    if (!nuovoArco.da_nodo_id || !nuovoArco.a_nodo_id || !nuovoArco.percentuale_capitale) return;
    const arco: ArcoPartecipativo = {
      id: generaId(),
      da_nodo_id: nuovoArco.da_nodo_id,
      a_nodo_id: nuovoArco.a_nodo_id,
      percentuale_capitale: nuovoArco.percentuale_capitale,
      percentuale_voti: nuovoArco.percentuale_voti,
      tipo_controllo: nuovoArco.tipo_controllo || 'proprieta_diretta',
      note: nuovoArco.note,
    };
    onCatenaChange(aggiungiArco(catena, arco));
    setNuovoArco({
      da_nodo_id: '',
      a_nodo_id: catena.clienteNodoId,
      percentuale_capitale: 0,
      tipo_controllo: 'proprieta_diretta',
    });
    setShowAddArco(false);
  }

  function handleRemoveNodo(nodoId: string) {
    onCatenaChange(rimuoviNodo(catena, nodoId));
  }

  function handleRemoveArco(arcoId: string) {
    onCatenaChange({
      ...catena,
      archi: catena.archi.filter(a => a.id !== arcoId),
    });
  }

  function handleAnalizza() {
    const result = analizzaTitolareEffettivo(catena);
    setAnalisi(result);
  }

  function getNodoDenominazione(id: string): string {
    return catena.nodi.find(n => n.id === id)?.denominazione || id;
  }

  return (
    <Card title="Catena di Controllo e Titolarità Effettiva">
      <div className="space-y-4">
        {/* Header con toggle */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Definisci la struttura proprietaria per individuare il titolare effettivo
            secondo i criteri dell'art. 20 D.Lgs. 231/2007.
          </p>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {expanded && (
          <>
            {/* Nodo Cliente (radice) */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-blue-900">
                  Impresa Cliente: {nodoCliente?.denominazione}
                </span>
                <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded">
                  {nodoCliente?.natura_giuridica || nodoCliente?.tipo}
                </span>
              </div>
            </div>

            {/* Lista nodi (soci/entità) */}
            {altriNodi.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Soci / Entità nella catena</h4>
                {altriNodi.map(nodo => (
                  <div key={nodo.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                    nodo.tipo === 'persona_fisica' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      {nodo.tipo === 'persona_fisica' ? (
                        <User className="w-4 h-4 text-green-600" />
                      ) : (
                        <Building2 className="w-4 h-4 text-gray-600" />
                      )}
                      <span className="font-medium">{nodo.denominazione}</span>
                      <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                        {TIPO_ENTITA_LABELS[nodo.tipo]}
                      </span>
                      {nodo.is_pep && (
                        <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded font-bold">
                          PPE
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveNodo(nodo.id)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Lista archi (partecipazioni) */}
            {catena.archi.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Partecipazioni / Relazioni</h4>
                {catena.archi.map(arco => (
                  <div key={arco.id} className="flex items-center justify-between p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      <Link className="w-4 h-4 text-yellow-600" />
                      <span className="font-medium">{getNodoDenominazione(arco.da_nodo_id)}</span>
                      <span className="text-gray-500">→</span>
                      <span className="font-medium">{getNodoDenominazione(arco.a_nodo_id)}</span>
                      <span className="bg-yellow-200 px-2 py-0.5 rounded text-yellow-800 font-bold">
                        {arco.percentuale_capitale}%
                      </span>
                      {arco.percentuale_voti && arco.percentuale_voti !== arco.percentuale_capitale && (
                        <span className="text-xs text-gray-500">
                          (voti: {arco.percentuale_voti}%)
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        [{TIPO_CONTROLLO_LABELS[arco.tipo_controllo]}]
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveArco(arco.id)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pulsanti azione */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setShowAddNodo(!showAddNodo)}
                className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                <Plus className="w-4 h-4" /> Aggiungi Socio/Entità
              </button>
              <button
                onClick={() => setShowAddArco(!showAddArco)}
                className="flex items-center gap-1 px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm"
                disabled={altriNodi.length === 0}
              >
                <Link className="w-4 h-4" /> Aggiungi Partecipazione
              </button>
              <button
                onClick={handleAnalizza}
                className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                disabled={altriNodi.length === 0}
              >
                <CheckCircle className="w-4 h-4" /> Analizza Titolare Effettivo
              </button>
            </div>

            {/* Form aggiungi nodo */}
            {showAddNodo && (
              <div className="bg-gray-50 border rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm">Nuovo Socio / Entità</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                    <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                    <select
                      value={nuovoNodo.tipo}
                      onChange={e => setNuovoNodo({ ...nuovoNodo, tipo: e.target.value as TipoEntita })}
                      className="w-full text-sm focus:outline-none focus:ring-0"
                    >
                      {Object.entries(TIPO_ENTITA_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {nuovoNodo.tipo === 'persona_fisica' ? 'Nome e Cognome' : 'Denominazione'}
                    </label>
                    <input
                      type="text"
                      value={nuovoNodo.denominazione || ''}
                      onChange={e => setNuovoNodo({ ...nuovoNodo, denominazione: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={nuovoNodo.tipo === 'persona_fisica' ? 'Mario Rossi' : 'Holding SRL'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Codice Fiscale</label>
                    <input
                      type="text"
                      value={nuovoNodo.codice_fiscale || ''}
                      onChange={e => setNuovoNodo({ ...nuovoNodo, codice_fiscale: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  {nuovoNodo.tipo === 'persona_fisica' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={nuovoNodo.is_pep || false}
                        onChange={e => setNuovoNodo({ ...nuovoNodo, is_pep: e.target.checked })}
                        className="rounded"
                      />
                      <label className="text-sm">Persona Politicamente Esposta (PPE)</label>
                    </div>
                  )}
                  {nuovoNodo.tipo !== 'persona_fisica' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Natura Giuridica</label>
                      <input
                        type="text"
                        value={nuovoNodo.natura_giuridica || ''}
                        onChange={e => setNuovoNodo({ ...nuovoNodo, natura_giuridica: e.target.value })}
                        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="SRL, SPA, SAS..."
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddNodo} className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                    Conferma
                  </button>
                  <button onClick={() => setShowAddNodo(false)} className="px-4 py-2 bg-gray-300 rounded text-sm hover:bg-gray-400">
                    Annulla
                  </button>
                </div>
              </div>
            )}

            {/* Form aggiungi arco */}
            {showAddArco && (
              <div className="bg-gray-50 border rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm">Nuova Partecipazione / Relazione</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Da (chi possiede)</label>
                    <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                    <select
                      value={nuovoArco.da_nodo_id}
                      onChange={e => setNuovoArco({ ...nuovoArco, da_nodo_id: e.target.value })}
                      className="w-full text-sm focus:outline-none focus:ring-0"
                    >
                      <option value="">Seleziona...</option>
                      {altriNodi.map(n => (
                        <option key={n.id} value={n.id}>{n.denominazione}</option>
                      ))}
                    </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">A (società posseduta)</label>
                    <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                    <select
                      value={nuovoArco.a_nodo_id}
                      onChange={e => setNuovoArco({ ...nuovoArco, a_nodo_id: e.target.value })}
                      className="w-full text-sm focus:outline-none focus:ring-0"
                    >
                      {catena.nodi.filter(n => n.tipo !== 'persona_fisica').map(n => (
                        <option key={n.id} value={n.id}>{n.denominazione}</option>
                      ))}
                    </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">% Capitale</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={nuovoArco.percentuale_capitale || ''}
                      onChange={e => setNuovoArco({ ...nuovoArco, percentuale_capitale: Number(e.target.value) })}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">% Voti (se diversa)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={nuovoArco.percentuale_voti || ''}
                      onChange={e => setNuovoArco({ ...nuovoArco, percentuale_voti: Number(e.target.value) || undefined })}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Lascia vuoto se uguale al capitale"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tipo di controllo</label>
                    <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                    <select
                      value={nuovoArco.tipo_controllo}
                      onChange={e => setNuovoArco({ ...nuovoArco, tipo_controllo: e.target.value as TipoControllo })}
                      className="w-full text-sm focus:outline-none focus:ring-0"
                    >
                      {Object.entries(TIPO_CONTROLLO_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                    <input
                      type="text"
                      value={nuovoArco.note || ''}
                      onChange={e => setNuovoArco({ ...nuovoArco, note: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Es: Sindacato di voto con soci B, C, D"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddArco} className="px-4 py-2 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700">
                    Conferma
                  </button>
                  <button onClick={() => setShowAddArco(false)} className="px-4 py-2 bg-gray-300 rounded text-sm hover:bg-gray-400">
                    Annulla
                  </button>
                </div>
              </div>
            )}

            {/* Risultato analisi */}
            {analisi && (
              <div className={`border-2 rounded-lg p-4 space-y-3 ${
                analisi.obbligoAstensione ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'
              }`}>
                <h4 className="font-medium flex items-center gap-2">
                  {analisi.obbligoAstensione ? (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  )}
                  Risultato Analisi Titolare Effettivo
                </h4>

                {analisi.obbligoAstensione ? (
                  <div className="text-red-800">
                    <p className="font-bold">OBBLIGO DI ASTENSIONE (art. 42 D.Lgs. 231/2007)</p>
                    <p className="text-sm mt-1">{analisi.motivoAstensione}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-700">
                      Criterio applicato: <span className="font-bold">{
                        analisi.criterioApplicato === 'proprieta' ? 'Proprietà (art. 20, co. 1-2)' :
                        analisi.criterioApplicato === 'controllo' ? 'Controllo (art. 20, co. 3)' :
                        'Residuale (art. 20, co. 5)'
                      }</span>
                    </p>
                    <div className="space-y-1">
                      {analisi.titolari.map((te, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-white rounded border">
                          <User className="w-4 h-4 text-green-600" />
                          <span className="font-medium">{te.nodo.denominazione}</span>
                          <span className="text-sm text-gray-500">
                            {te.percentuale_totale > 0 ? `${te.percentuale_totale}%` : ''}
                            {te.percentuale_diretta > 0 && te.percentuale_indiretta > 0 ? (
                              ` (${te.percentuale_diretta}% dir. + ${te.percentuale_indiretta}% ind.)`
                            ) : ''}
                          </span>
                          {te.nodo.is_pep && (
                            <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded font-bold">PPE</span>
                          )}
                          <span className="text-xs text-gray-500">{te.note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {analisi.warnings.length > 0 && (
                  <div className="space-y-1 pt-2 border-t">
                    {analisi.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-gray-600 flex items-start gap-1">
                        <AlertTriangle className="w-3 h-3 mt-0.5 text-yellow-500 flex-shrink-0" />
                        {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
