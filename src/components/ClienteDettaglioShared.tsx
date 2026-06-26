/**
 * ClienteDettaglioShared - Componente condiviso per il dettaglio cliente
 *
 * Utilizzato sia nella tab "Anagrafica" del Fascicolo Cliente
 * che nella vista "Dettaglio Cliente" di RT2 Adeguata Verifica.
 * Segue lo stesso pattern di DettaglioIncaricoPage per gli incarichi.
 */
import { useState, useEffect } from 'react';
import { Card } from './Card';
import { useScrollLock } from '../hooks/useScrollLock';
import { FileClock, Edit3, ArrowLeft, FileText, PlusCircleIcon, Trash2 } from 'lucide-react';
import { buildValueLabelMap } from '../lib/storicoFormat';
import { StoricoModificheDrawer } from './StoricoModificheDrawer';
import { useCestinaPermesso } from '../hooks/useCestinaPermesso';
import { ActionsMenu, type ActionItem } from './ActionsMenu';
import { supabase } from '../lib/supabase';
import { getPrestazione } from '../lib/aml-data';
import { detectTipoSoggetto } from '../lib/personeHelper';

// --- Interfaces ---

export interface ClienteShared {
  id: string;
  codice_cliente: string;
  ragione_sociale: string;
  tipo_cliente?: 'persona_fisica' | 'societa' | 'professionista' | 'impresa';
  status?: string;
  codice_fiscale?: string;
  partita_iva?: string;
  natura_giuridica?: string;
  indirizzo?: string;
  paese?: string;
  data_nascita?: string;
  luogo_nascita?: string;
  nazionalita?: string;
  professione?: string;
  residenza?: string;
  comune_nascita?: string;
  provincia_nascita?: string;
  via?: string;
  numero_civico?: string;
  comune_residenza?: string;
  provincia_residenza?: string;
  domicilio?: string;
  rappresentante_legale?: string;
  pep?: boolean;
  pep_carica?: string;
  pep_dettagli?: string;
  sanzioni?: boolean;
  registro_imprese?: string;
  numero_iscrizione?: string;
  documento_identita?: {
    tipo: string;
    numero: string;
    data_rilascio: string;
    data_scadenza: string;
    ente_rilascio: string;
  };
  rappresentante_legale_documento?: {
    tipo: string;
    numero: string;
    data_rilascio: string;
    data_scadenza: string;
    ente_rilascio: string;
  };
  ownerEmail?: string;
  created_at?: string;
  [key: string]: any;
}

export interface TitolareEffettivoShared {
  id: string;
  cliente_id: string;
  tipo_soggetto?: 'persona_fisica' | 'azienda';
  tipo_rapporto: string;
  nome_cognome: string;
  codice_fiscale: string;
  professione: string;
  comune_nascita: string;
  provincia_nascita: string;
  data_nascita: string;
  comune_residenza: string;
  via_residenza: string;
  numero_civico: string;
  // Campi azienda
  partita_iva?: string;
  natura_giuridica?: string;
  codice_ateco?: string;
  documento_tipo: string;
  documento_numero: string;
  documento_rilascio_ente: string;
  documento_rilascio_data: string;
  documento_scadenza: string;
  is_pep: boolean;
  pep_carica?: string;
  note_quota?: string;
  [key: string]: any;
}

export interface IncaricoShared {
  id: string;
  codice_incarico: string;
  tipologia_prestazione_id: string;
  descrizione: string;
  data_inizio?: string;
  [key: string]: any;
}

interface StoricoModifica {
  id: string;
  created_at: string;
  entity_type: 'cliente' | 'incarico' | 'titolare_effettivo' | 'soggetto';
  entity_id: string;
  parent_entity_id?: string | null;
  campo: string;
  valore_precedente: string | null;
  valore_nuovo: string | null;
  user_id: string;
}

// Etichette leggibili per i campi dello storico
const LABEL_CAMPI: Record<string, string> = {
  ragione_sociale: 'Ragione Sociale',
  codice_cliente: 'Codice Cliente',
  codice_fiscale: 'Codice Fiscale',
  partita_iva: 'Partita IVA',
  tipo_cliente: 'Tipo Cliente',
  natura_giuridica: 'Natura Giuridica',
  codice_ateco: 'Codice ATECO',
  attivita_svolta: 'Principale Attività Svolta',
  indirizzo: 'Indirizzo',
  paese: 'Paese',
  data_nascita: 'Data di Nascita',
  luogo_nascita: 'Luogo di Nascita',
  nazionalita: 'Nazionalità',
  professione: 'Professione',
  residenza: 'Residenza',
  domicilio: 'Domicilio',
  rappresentante_persona_id: 'Rappresentante Legale',
  pep: 'PEP',
  sanzioni: 'Sanzioni',
  archiviato: 'Stato Archiviazione',
  decisione_sos: 'Decisione SOS',
  tipo_rapporto: 'Tipo rapporto titolare',
  ruolo: 'Ruolo titolare',
  is_pep: 'PEP titolare',
  pep_carica: 'Carica PEP titolare',
  note_quota: 'Quota / Note titolare',
  persona_id: 'Persona titolare',
};

// Risolve l'etichetta gestendo prefissi composti scritti dai trigger DB
// (es. "titolare.nome_cognome", "rappresentante.codice_fiscale", "anagrafica.residenza").
function labelForCampo(campo: string): string {
  if (campo === '__aggiunto') return 'Titolare effettivo aggiunto';
  if (campo === '__rimosso') return 'Titolare effettivo rimosso';
  if (campo.startsWith('titolare.')) {
    const sub = campo.slice('titolare.'.length);
    return `Titolare · ${LABEL_CAMPI[sub] || sub}`;
  }
  if (campo.startsWith('rappresentante.')) {
    const sub = campo.slice('rappresentante.'.length);
    return `Rappresentante legale · ${LABEL_CAMPI[sub] || sub}`;
  }
  if (campo.startsWith('anagrafica.')) {
    const sub = campo.slice('anagrafica.'.length);
    return `Anagrafica · ${LABEL_CAMPI[sub] || sub}`;
  }
  return LABEL_CAMPI[campo] || campo;
}

// --- Helpers ---

const formatISODateToItalian = (isoDate: string | null | undefined): string => {
  if (!isoDate) return 'N/D';
  try {
    const trimmed = String(isoDate).trim();
    if (!trimmed) return 'N/D';

    // Formato ISO yyyy-mm-dd (con eventuale "T..." o spazio + orario)
    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }

    // Formato dd/mm/yyyy (anche senza zero-padding o con separatori `-`/`.`)
    const itMatch = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (itMatch) {
      const [, d, m, y] = itMatch;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }

    return 'N/D';
  } catch {
    return 'N/D';
  }
};

async function buildUserNameMap(userIds: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (userIds.length === 0) return map;
  const unique = [...new Set(userIds)];
  const { data } = await supabase
    .from('user_profiles')
    .select('user_id, email, nome, cognome')
    .in('user_id', unique);
  data?.forEach(m => {
    const fullName = [m.nome, m.cognome].filter(Boolean).join(' ');
    map[m.user_id] = fullName || m.email || 'Utente';
  });
  return map;
}

async function loadStoricoModifiche(
  entityType: 'cliente' | 'incarico',
  entityId: string
): Promise<StoricoModifica[]> {
  // Per il cliente includiamo anche gli eventi delle entità collegate
  // (titolari effettivi, dati anagrafici del rappresentante legale)
  // scritte dai trigger DB con parent_entity_id = entityId.
  const filter = entityType === 'cliente'
    ? `and(entity_type.eq.cliente,entity_id.eq.${entityId}),parent_entity_id.eq.${entityId}`
    : `and(entity_type.eq.${entityType},entity_id.eq.${entityId})`;

  const { data, error } = await supabase
    .from('storico_modifiche')
    .select('*')
    .or(filter)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Errore caricamento storico modifiche:', error);
    return [];
  }
  return data || [];
}

// --- Props ---

export interface ClienteDettaglioProps {
  cliente: ClienteShared;
  titolariEffettivi: TitolareEffettivoShared[];
  incarichiCliente: IncaricoShared[];
  /** Mostra freccia indietro e header con titolo */
  showHeader?: boolean;
  onBack?: () => void;
  onModifica?: () => void;
  onCestina?: () => void;
  onViewIncarico?: (incaricoId: string) => void;
  onNuovoIncarico?: () => void;
  /** Nasconde la sezione Incarichi Associati */
  hideIncarichi?: boolean;
  /** Info creazione per il pannello storico (opzionale) */
  creationInfo?: { created_at: string; ownerEmail: string } | null;
}

// --- Component ---

export function ClienteDettaglioView({
  cliente,
  titolariEffettivi,
  incarichiCliente,
  showHeader = true,
  onBack,
  onModifica,
  onCestina,
  onViewIncarico,
  onNuovoIncarico,
  hideIncarichi = false,
  creationInfo,
}: ClienteDettaglioProps) {
  // Storico panel state (self-contained)
  const [showStoricoPanel, setShowStoricoPanel] = useState(false);
  useScrollLock(showStoricoPanel);
  const [storicoModifiche, setStoricoModifiche] = useState<StoricoModifica[]>([]);
  const [loadingStorico, setLoadingStorico] = useState(false);
  const [storicoCreationInfo, setStoricoCreationInfo] = useState<{ created_at: string; ownerEmail: string } | null>(null);
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({});
  const [valueMap, setValueMap] = useState<Record<string, string>>({});


  const handleOpenStorico = async () => {
    setLoadingStorico(true);
    setShowStoricoPanel(true);
    const data = await loadStoricoModifiche('cliente', cliente.id);
    setStoricoModifiche(data);

    // Risolvi gli UUID nei valori (persone, ecc.) in etichette leggibili.
    setValueMap(await buildValueLabelMap(data));

    // Resolve user names for all user_ids (modifications + creator)
    const allUserIds = data.map(m => m.user_id).filter(Boolean);
    if ((cliente as any).user_id) allUserIds.push((cliente as any).user_id);
    const nameMap = await buildUserNameMap(allUserIds);
    setUserNameMap(nameMap);

    // Resolve creator name from user_profiles
    const creatorName = (cliente as any).user_id ? nameMap[(cliente as any).user_id] : null;
    setStoricoCreationInfo(creationInfo ?? (cliente.created_at ? {
      created_at: cliente.created_at,
      ownerEmail: creatorName || cliente.ownerEmail || 'Utente sconosciuto',
    } : null));
    setLoadingStorico(false);
  };

  const puoCestina = useCestinaPermesso();
  const azioniCliente: ActionItem[] = [
    { label: 'Storico Modifiche', icon: FileClock, onClick: handleOpenStorico },
    { label: 'Modifica Cliente', icon: Edit3, onClick: () => onModifica?.(), hidden: !onModifica },
    { label: 'Sposta nel cestino', icon: Trash2, variant: 'danger', onClick: () => onCestina?.(), hidden: !onCestina || !puoCestina },
  ];

  return (
    <div className="space-y-6">
      {/* HEADER */}
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="flex flex-row">
            {onBack && (
              <button
                onClick={onBack}
                className="px-4 py-2 my-2 mr-4 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                title="Torna alla lista"
              >
                <ArrowLeft className="w-6 h-7" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dettaglio Cliente</h1>
              <p className="text-gray-600 mt-1">
                {cliente.ragione_sociale} ({cliente.codice_cliente})
              </p>
            </div>
          </div>
          <div className="flex items-center">
            <ActionsMenu items={azioniCliente} />
          </div>
        </div>
      )}

      {/* Se non c'è header, mostra comunque i bottoni */}
      {!showHeader && (
        <div className="flex justify-between items-center">
          <div>
            {onNuovoIncarico && (
              <button
                onClick={onNuovoIncarico}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                title="Nuovo Incarico"
              >
                <PlusCircleIcon className="w-4 h-4" />
                Nuovo Incarico
              </button>
            )}
          </div>
          <div className="flex items-center">
            <ActionsMenu items={azioniCliente} />
          </div>
        </div>
      )}

      {/* ============================================================
          DATI ANAGRAFICI / IMPRESA + RAPPRESENTANTE
          - Impresa: 2 card distinte (Dati Impresa + Rappresentante Legale)
          - Persona Fisica / Professionista: 2 card (Dati Anagrafici + Documento d'Identità)
          ============================================================ */}
      {(() => {
        const isImpresa = cliente.tipo_cliente === 'societa' || cliente.tipo_cliente === 'impresa';
        const tipoLabel =
          cliente.tipo_cliente === 'persona_fisica' ? 'Persona Fisica' :
          cliente.tipo_cliente === 'professionista' ? 'Professionista' : 'Impresa';

        // Box PEP/Sanzioni (riutilizzato in entrambi i rami)
        const renderPepSanzioni = () => (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  cliente.pep ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }`}>
                  {cliente.pep ? '⚠️ PEP' : '✓ Non PEP'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  cliente.sanzioni ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }`}>
                  {cliente.sanzioni ? '⚠️ Liste Sanzioni' : '✓ No Sanzioni'}
                </span>
              </div>
            </div>
            {cliente.pep && (cliente.pep_carica || cliente.pep_dettagli) && (
              <div className="mt-3">
                {cliente.pep_carica && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Carica ricoperta</p>
                    <p className="text-sm text-gray-900">{cliente.pep_carica}</p>
                  </div>
                )}
                {cliente.pep_dettagli && (
                  <div className={cliente.pep_carica ? 'mt-2' : ''}>
                    <p className="text-xs text-gray-500 mb-1">Dettagli PEP</p>
                    <p className="text-sm text-gray-900">{cliente.pep_dettagli}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );

        // Box Note di Verifica (riutilizzato in entrambi i rami)
        const renderNoteVerifica = () => {
          const noteVerifica =
            cliente.note_verifica_pf ||
            cliente.note_verifica_prof ||
            cliente.note_verifica_impresa ||
            cliente.note_verifica;
          if (!noteVerifica) return null;
          return (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Note di Verifica</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{noteVerifica}</p>
            </div>
          );
        };

        // ---- IMPRESA: card "Dati Impresa" + card "Rappresentante Legale" ----
        if (isImpresa) {
          const docRappr = cliente.rappresentante_legale_documento;
          const tipoRapprEffettivo: 'persona_fisica' | 'azienda' =
            cliente.tipo_soggetto_rappresentante
              ?? detectTipoSoggetto(cliente.codice_fiscale_rappresentante)
              ?? 'persona_fisica';
          const rapprIsAzienda = tipoRapprEffettivo === 'azienda';
          return (
            <>
              {/* CARD 1: DATI IMPRESA */}
              <Card title="🏢 Dati Impresa">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Tipo Cliente</p>
                    <p className="text-sm font-semibold text-gray-900">{tipoLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Codice Cliente</p>
                    <p className="text-sm font-semibold text-gray-900">{cliente.codice_cliente}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">Ragione Sociale</p>
                    <p className="text-sm text-gray-900">{cliente.ragione_sociale}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Partita IVA</p>
                    <p className="text-sm text-gray-900">{cliente.partita_iva || 'N/D'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Codice Fiscale</p>
                    <p className="text-sm text-gray-900">{cliente.codice_fiscale || 'N/D'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Natura Giuridica</p>
                    <p className="text-sm text-gray-900">{cliente.natura_giuridica || 'N/D'}</p>
                  </div>
                  {cliente.codice_ateco && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Codice ATECO</p>
                      <p className="text-sm text-gray-900">{cliente.codice_ateco}</p>
                    </div>
                  )}
                  {cliente.attivita_svolta && (
                    <div className="md:col-span-2">
                      <p className="text-xs text-gray-500 mb-1">Principale Attività Svolta</p>
                      <p className="text-sm text-gray-900">{cliente.attivita_svolta}</p>
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">Sede Legale</p>
                    <p className="text-sm text-gray-900">{cliente.indirizzo || 'N/D'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Paese</p>
                    <p className="text-sm text-gray-900">{cliente.paese || 'N/D'}</p>
                  </div>
                  {cliente.registro_imprese && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Registro Imprese</p>
                      <p className="text-sm text-gray-900">{cliente.registro_imprese}</p>
                    </div>
                  )}
                  {cliente.numero_iscrizione && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Numero Iscrizione</p>
                      <p className="text-sm text-gray-900">{cliente.numero_iscrizione}</p>
                    </div>
                  )}
                </div>
                {renderPepSanzioni()}
                {renderNoteVerifica()}
              </Card>

              {/* CARD 2: RAPPRESENTANTE LEGALE (anagrafica + documento) */}
              <Card title={`${rapprIsAzienda ? '🏢' : '👤'} Rappresentante Legale`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{rapprIsAzienda ? 'Ragione Sociale' : 'Nome e Cognome'}</p>
                    <p className="text-sm font-semibold text-gray-900">{cliente.rappresentante_legale || 'N/D'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{rapprIsAzienda ? 'Codice Fiscale Azienda' : 'Codice Fiscale'}</p>
                    <p className="text-sm text-gray-900">{cliente.codice_fiscale_rappresentante || 'N/D'}</p>
                  </div>

                  {rapprIsAzienda ? (
                    <>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Partita IVA</p>
                        <p className="text-sm text-gray-900">{cliente.partita_iva_rappresentante || 'N/D'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Natura Giuridica</p>
                        <p className="text-sm text-gray-900">{cliente.natura_giuridica_rappresentante || 'N/D'}</p>
                      </div>
                      {cliente.codice_ateco_rappresentante && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Codice ATECO</p>
                          <p className="text-sm text-gray-900">{cliente.codice_ateco_rappresentante}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Data di Nascita</p>
                        <p className="text-sm text-gray-900">
                          {formatISODateToItalian(cliente.data_nascita_rappresentante)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Luogo di Nascita</p>
                        <p className="text-sm text-gray-900">
                          {cliente.luogo_nascita_rappresentante
                            ? `${cliente.luogo_nascita_rappresentante}${cliente.provincia_nascita_rappresentante ? ` (${cliente.provincia_nascita_rappresentante})` : ''}`
                            : 'N/D'}
                        </p>
                      </div>
                    </>
                  )}

                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">{rapprIsAzienda ? 'Sede Legale' : 'Residenza'}</p>
                    <p className="text-sm text-gray-900">{cliente.residenza_rappresentante || 'N/D'}</p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-1">Nazionalità</p>
                    <p className="text-sm text-gray-900">{cliente.nazionalita_rappresentante || 'N/D'}</p>
                  </div>
                </div>

                {/* DIVIDER + DOCUMENTO D'IDENTITÀ DEL RAPPRESENTANTE — solo per persona fisica */}
                {!rapprIsAzienda && docRappr && (
                  <div className="mt-6 pt-4 border-t-2 border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      🪪 Documento d'Identità
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Tipo Documento</p>
                        <p className="text-sm text-gray-900">{docRappr.tipo || 'N/D'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Numero Documento</p>
                        <p className="text-sm font-semibold text-gray-900">{docRappr.numero || 'N/D'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Ente Rilascio</p>
                        <p className="text-sm text-gray-900">{docRappr.ente_rilascio || 'N/D'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Data Rilascio</p>
                        <p className="text-sm text-gray-900">
                          {formatISODateToItalian(docRappr.data_rilascio)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Data Scadenza</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatISODateToItalian(docRappr.data_scadenza)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </>
          );
        }

        // ---- PERSONA FISICA / PROFESSIONISTA: card "Dati Anagrafici" + card "Documento d'Identità" ----
        const docCliente = cliente.documento_identita;
        return (
          <>
            <Card title="📋 Dati Anagrafici">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Tipo Cliente</p>
                  <p className="text-sm font-semibold text-gray-900">{tipoLabel}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Codice Cliente</p>
                  <p className="text-sm font-semibold text-gray-900">{cliente.codice_cliente}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs text-gray-500 mb-1">Nome e Cognome</p>
                  <p className="text-sm text-gray-900">{cliente.ragione_sociale}</p>
                </div>
                {cliente.tipo_cliente === 'professionista' && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Partita IVA</p>
                    <p className="text-sm text-gray-900">{cliente.partita_iva || 'N/D'}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Codice Fiscale</p>
                  <p className="text-sm text-gray-900">{cliente.codice_fiscale || 'N/D'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Data di Nascita</p>
                  <p className="text-sm text-gray-900">
                    {formatISODateToItalian(cliente.data_nascita)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Luogo di Nascita</p>
                  <p className="text-sm text-gray-900">
                    {cliente.luogo_nascita || (cliente.comune_nascita && cliente.provincia_nascita ?
                      `${cliente.comune_nascita} (${cliente.provincia_nascita})` : 'N/D')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Nazionalità</p>
                  <p className="text-sm text-gray-900">{cliente.nazionalita || 'N/D'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Professione</p>
                  <p className="text-sm text-gray-900">{cliente.professione || 'N/D'}</p>
                </div>
                {cliente.tipo_cliente === 'professionista' && cliente.codice_ateco && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Codice ATECO</p>
                    <p className="text-sm text-gray-900">{cliente.codice_ateco}</p>
                  </div>
                )}
                {cliente.tipo_cliente === 'professionista' && cliente.attivita_svolta && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">Principale Attività Svolta</p>
                    <p className="text-sm text-gray-900">{cliente.attivita_svolta}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Residenza</p>
                  <p className="text-sm text-gray-900">
                    {cliente.residenza || (cliente.via && cliente.numero_civico ?
                      `${cliente.via} ${cliente.numero_civico}, ${cliente.comune_residenza || ''} (${cliente.provincia_residenza || ''})` : 'N/D')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Paese</p>
                  <p className="text-sm text-gray-900">{cliente.paese || 'N/D'}</p>
                </div>
              </div>
              {renderPepSanzioni()}
              {renderNoteVerifica()}
            </Card>

            {/* DOCUMENTO D'IDENTITÀ DEL CLIENTE */}
            {docCliente && (
              <Card title="🪪 Documento d'Identità">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Tipo Documento</p>
                    <p className="text-sm text-gray-900">{docCliente.tipo || 'N/D'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Numero Documento</p>
                    <p className="text-sm font-semibold text-gray-900">{docCliente.numero || 'N/D'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Ente Rilascio</p>
                    <p className="text-sm text-gray-900">{docCliente.ente_rilascio || 'N/D'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Data Rilascio</p>
                    <p className="text-sm text-gray-900">
                      {formatISODateToItalian(docCliente.data_rilascio)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Data Scadenza</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatISODateToItalian(docCliente.data_scadenza)}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </>
        );
      })()}

      {/* TITOLARI EFFETTIVI */}
      {titolariEffettivi.length > 0 && (
        <Card title={`👥 Titolari Effettivi (${titolariEffettivi.length})`}>
          <div className="space-y-4">
            {titolariEffettivi.map((titolare, index) => {
              const isAzienda = titolare.tipo_soggetto === 'azienda';
              return (
              <div key={titolare.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900">Titolare #{index + 1}</h4>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${isAzienda ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                      {isAzienda ? 'Azienda' : 'Persona'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{isAzienda ? 'Ragione Sociale' : 'Nome e Cognome'}</p>
                    <p className="text-sm font-semibold text-gray-900">{titolare.nome_cognome}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{isAzienda ? 'Codice Fiscale Azienda' : 'Codice Fiscale'}</p>
                    <p className="text-sm text-gray-900">{titolare.codice_fiscale}</p>
                  </div>

                  {isAzienda ? (
                    <>
                      {titolare.partita_iva && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Partita IVA</p>
                          <p className="text-sm text-gray-900">{titolare.partita_iva}</p>
                        </div>
                      )}
                      {titolare.natura_giuridica && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Natura Giuridica</p>
                          <p className="text-sm text-gray-900">{titolare.natura_giuridica}</p>
                        </div>
                      )}
                      {titolare.codice_ateco && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Codice ATECO</p>
                          <p className="text-sm text-gray-900">{titolare.codice_ateco}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Data di Nascita</p>
                        <p className="text-sm text-gray-900">
                          {formatISODateToItalian(titolare.data_nascita)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Luogo di Nascita</p>
                        <p className="text-sm text-gray-900">
                          {titolare.comune_nascita || titolare.provincia_nascita
                            ? `${titolare.comune_nascita || ''}${titolare.provincia_nascita ? ` (${titolare.provincia_nascita})` : ''}`
                            : 'N/D'}
                        </p>
                      </div>
                    </>
                  )}

                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">{isAzienda ? 'Sede Legale' : 'Residenza'}</p>
                    <p className="text-sm text-gray-900">
                      {(titolare as any).residenza
                        || (titolare.via_residenza || titolare.comune_residenza
                          ? [titolare.via_residenza, titolare.numero_civico, titolare.comune_residenza].filter(Boolean).join(', ')
                          : 'N/D')}
                    </p>
                  </div>
                  {(titolare as any).ruolo && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Ruolo</p>
                      <p className="text-sm text-gray-900">{(titolare as any).ruolo}</p>
                    </div>
                  )}
                  {!isAzienda && titolare.professione && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Professione</p>
                      <p className="text-sm text-gray-900">{titolare.professione}</p>
                    </div>
                  )}

                  {/* Documento — solo per persone fisiche */}
                  {!isAzienda && (
                  <div className="md:col-span-2 mt-2 pt-2 border-t border-gray-300">
                    <p className="text-xs font-medium text-gray-700 mb-2">Documento Identità</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Tipo:</span> {titolare.documento_tipo}
                      </div>
                      <div>
                        <span className="text-gray-500">Numero:</span> {titolare.documento_numero}
                      </div>
                      <div>
                        <span className="text-gray-500">Rilasciato da:</span> {titolare.documento_rilascio_ente}
                      </div>
                      <div>
                        <span className="text-gray-500">Data Rilascio:</span> {formatISODateToItalian(titolare.documento_rilascio_data)}
                      </div>
                      <div>
                        <span className="text-gray-500">Scadenza:</span> {formatISODateToItalian(titolare.documento_scadenza)}
                      </div>
                    </div>
                  </div>
                  )}

                  {/* Note */}
                  {titolare.note_quota && (
                    <div className="md:col-span-2 mt-2 pt-2 border-t border-gray-200">
                      <div className="text-xs">
                        <span className="text-gray-500">Note:</span> {titolare.note_quota}
                      </div>
                    </div>
                  )}

                  {/* PEP */}
                  {titolare.is_pep && (
                    <div className="md:col-span-2 mt-2 pt-2 border-t border-gray-300">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded">
                          ⚠️ PEP
                        </span>
                      </div>
                      {titolare.pep_carica && (
                        <div className="text-xs">
                          <span className="text-gray-500">Carica:</span> {titolare.pep_carica}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* INCARICHI ASSOCIATI */}
      {!hideIncarichi && <Card
        title={`📄 Incarichi Associati (${incarichiCliente.length})`}
        button={
          onNuovoIncarico ? (
            <button
              onClick={onNuovoIncarico}
              className="px-3 py-1 my-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <PlusCircleIcon />
              </svg>
              Nuovo Incarico
            </button>
          ) : <></>
        }
      >
        <div className="space-y-2">
          {incarichiCliente.length > 0 &&
            incarichiCliente.map(incarico => {
              const prest = getPrestazione(incarico.tipologia_prestazione_id);
              return (
                <div
                  key={incarico.id}
                  className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-between cursor-pointer"
                  onClick={() => onViewIncarico?.(incarico.id)}
                >
                  <div>
                    <p className="font-medium text-gray-900">{incarico.codice_incarico}</p>
                    <p className="text-sm text-gray-600">{prest?.label || incarico.descrizione}</p>
                    {incarico.data_inizio && (
                      <p className="text-xs text-gray-500">
                        Dal {new Date(incarico.data_inizio).toLocaleDateString('it-IT')}
                      </p>
                    )}
                  </div>
                  <span
                    className="px-3 py-1 text-sm text-blue-600 rounded-lg"
                    title="Visualizza dettaglio incarico"
                  >
                    <FileText className="w-4 h-4" />
                  </span>
                </div>
              );
            })}
          {incarichiCliente.length === 0 && (
            <p className="flex justify-center text-sm text-gray-500 italic">Nessun incarico associato.</p>
          )}
        </div>
      </Card>}

      {/* PANNELLO STORICO MODIFICHE (drawer da destra) */}
      <StoricoModificheDrawer
        show={showStoricoPanel}
        onClose={() => setShowStoricoPanel(false)}
        loading={loadingStorico}
        modifiche={storicoModifiche}
        labelForCampo={labelForCampo}
        userNameMap={userNameMap}
        valueMap={valueMap}
        creationInfo={storicoCreationInfo}
      />
    </div>
  );
}
