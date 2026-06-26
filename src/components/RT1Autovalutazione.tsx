import { useState, useEffect, useCallback } from 'react';
import { Card } from './Card';
import { useToast, useConfirm } from './Toast';
import { spostaNelCestino, clausolaRecuperoCestino } from '../lib/cestinoHelper';
import { useCestinaPermesso } from '../hooks/useCestinaPermesso';
import { supabase } from '../lib/supabase';
import { Plus, Eye, Edit, Copy, Trash2, FileText, AlertCircle, Download, Clock } from 'lucide-react';
import { RT1Wizard } from './rt1-wizard';
import { generateAndDownloadDOCX_RT1 } from '../lib/docx-converter';
import { Spinner } from './cliente-wizard/modals/Spinner';
import { getDaysUntilExpiry } from './rt1-wizard/utils';
import { addUserLog } from './LogUtente';
// import { useSystemAlerts } from './AlertPanel.tsx'; // [DEPRECATED 2026-04-22] Gestito dai trigger DB
import { useStudio } from '../lib/StudioContext';

interface Autovalutazione {
  id: string;
  version: string;
  created_by: string;
  created_at: string;
  valid_until: string | null;
  status: 'draft' | 'current' | 'archived' | 'expired';
  inerente_score: number | null;
  vulnerabilita_score: number | null;
  residuo_score: number | null;
}

type WizardMode = 'new' | 'view' | 'draft' | null;

export function RT1Autovalutazione() {
  const toast = useToast();
  const confirm = useConfirm();
  // const { checkSystemAlerts } = useSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
  const { activeStudioId } = useStudio();
  const puoCestina = useCestinaPermesso();
  const [autovalutazioni, setAutovalutazioni] = useState<Autovalutazione[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardMode, setWizardMode] = useState<WizardMode>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const loadAutovalutazioni = useCallback(async () => {
    setLoading(true);
    try {
      // console.log('🔍 [RT1] Inizio caricamento autovalutazioni...');
      
      // Verifica utente corrente
      //const { data: { user } } = await supabase.auth.getUser();
      // console.log('👤 [RT1] User ID corrente:', user?.id);
      // console.log('👤 [RT1] User email:', user?.email);
      
      let q = supabase
        .from('autovalutazioni')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (activeStudioId) q = q.eq('studio_id', activeStudioId);
      const { data, error } = await q;

      // console.log('📊 [RT1] Query completata');
      // console.log('📈 [RT1] Data ricevuta:', data);
      // console.log('📈 [RT1] Numero record:', data?.length);
      // console.log('❌ [RT1] Errore:', error);

      if (error) {
        console.error('❌ [RT1] ERRORE durante caricamento:', error);
        throw error;
      }
      
      // console.log('✅ [RT1] Autovalutazioni caricate con successo:', data?.length || 0);

      // Auto-expire: marca come 'expired' le autovalutazioni 'current' con valid_until passata
      if (data) {
        const today = new Date();
        for (const auto of data) {
          if (auto.status === 'current' && auto.valid_until && new Date(auto.valid_until) < today) {
            await supabase
              .from('autovalutazioni')
              .update({ status: 'expired' })
              .eq('id', auto.id);
            auto.status = 'expired';
          }
        }
      }

      setAutovalutazioni(data || []);
    } catch (error) {
      console.error('💥 [RT1] ERRORE CATCH:', error);
    } finally {
      setLoading(false);
    }
  }, [activeStudioId]);

  useEffect(() => {
    loadAutovalutazioni();
  }, [loadAutovalutazioni]);

  async function handleDelete(id: string) {
    const clausola = await clausolaRecuperoCestino();
    if (!(await confirm({
      message: `Spostare questa bozza nel cestino? ${clausola}`,
      variant: 'danger',
      confirmText: 'Sposta nel cestino',
    }))) return;

    try {
      await spostaNelCestino('autovalutazione', id);
      toast.success('Bozza spostata nel cestino');
      addUserLog('Spostata nel cestino bozza autovalutazione RT1');
      loadAutovalutazioni();
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error('Errore durante lo spostamento nel cestino: ' + error.message);
    }
  }

  async function handleDuplicate(sourceId: string, currentVersion: string) {
    //const newVersion = prompt('Inserisci il numero della nuova versione:', currentVersion);
    //if (!newVersion || newVersion.trim() === '') return;

    const annoCorrente = new Date().getFullYear();
    const generaNuovoLabel = (input:any, anno:number) => {
      //trasformiamo l'input in stringa e dividiamolo al punto
      const parti = String(input).split('.');
    
      //estraiamo l'anno e la sequenza dal vecchio label
      const annoPrecedente = parseInt(parti[0]);
      const sequenzaPrecedente = parseInt(parti[1]);

      // Se l'anno nel label è uguale all'anno corrente e la sequenza è un numero...
      if (annoPrecedente === anno && !isNaN(sequenzaPrecedente)) {
        // ...incrementiamo la sequenza
        return `${anno}.${sequenzaPrecedente + 1}`;
      } 
    
      // In tutti gli altri casi ricominciamo da .1 con l'anno corrente
      return `${anno}.1`;
    };

    const newVersion = generaNuovoLabel(currentVersion, annoCorrente);

    try {
      // Carica l'autovalutazione sorgente
      const { data: source, error: loadError } = await supabase
        .from('autovalutazioni')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (loadError) throw loadError;
      if (!source) throw new Error('Autovalutazione sorgente non trovata');

      // Ottieni user_id corrente
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utente non autenticato');

      // Crea nuova bozza con i dati della sorgente
      const newDraft = {
        user_id: user.id,
        version: newVersion.trim(),
        created_by: source.created_by,
        status: 'draft',
        descrizione_studio: source.descrizione_studio,
        risposte_dettagliate: source.risposte_dettagliate,
        piano_mitigazione: source.piano_mitigazione,
        inerente_score: source.inerente_score,
        vulnerabilita_score: source.vulnerabilita_score,
        residuo_score: source.residuo_score,
        fattori_inerenti: source.fattori_inerenti,
        fattori_vulnerabilita: source.fattori_vulnerabilita,
        valid_until: null // Le bozze non hanno scadenza
      };

      const { data: newData, error: insertError } = await supabase
        .from('autovalutazioni')
        .insert(newDraft)
        .select('id')
        .single();

      if (insertError) throw insertError;

      toast.success('Autovalutazione duplicata con successo come bozza');
      addUserLog(`Autovalutazione RT1 v ${currentVersion} duplicata come bozza v ${newVersion}.`);

      // Apri la nuova bozza nel wizard
      openWizard('draft', newData.id);
      
    } catch (error: any) {
      console.error('Error duplicating:', error);
      toast.error('Errore durante la duplicazione: ' + error.message);
    }
  }

  async function handleDownloadDOCX(autovalutazioneId: string) {
    try {
      // Carica l'autovalutazione completa
      const { data, error } = await supabase
        .from('autovalutazioni')
        .select('*')
        .eq('id', autovalutazioneId)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Autovalutazione non trovata');

      // Genera e scarica il documento DOCX
      await generateAndDownloadDOCX_RT1(data);
      addUserLog(`Esportazione DOCX autovalutazione RT1 v${data.version}`);
    } catch (error: any) {
      console.error('Error downloading DOCX:', error);
      toast.error('Errore durante l\'esportazione: ' + error.message);
    }
  }

  function openWizard(mode: 'new' | 'view' | 'draft', id?: string) {
    setWizardMode(mode);
    setSelectedId(id);
  }

  const closeWizard = useCallback(() => {
    setWizardMode(null);
    setSelectedId(undefined);
    loadAutovalutazioni();
    // checkSystemAlerts(); // [DEPRECATED 2026-04-22] Gestito dai trigger DB
  }, [loadAutovalutazioni]);

  function getStatusBadge(status: string) {
    const badges = {
      draft: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'BOZZA' },
      current: { bg: 'bg-green-100', text: 'text-green-800', label: 'CORRENTE' },
      archived: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'ARCHIVIATA' },
      expired: { bg: 'bg-red-100', text: 'text-red-800', label: 'SCADUTA' }
    };
    const badge = badges[status as keyof typeof badges] || badges.draft;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  }

  function formatScore(score: number | null) {
    return score !== null ? score.toFixed(2) : '—';
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('it-IT');
  }

  // Se il wizard è aperto, mostra solo quello
  if (wizardMode) {
    return (
      <RT1Wizard
        mode={wizardMode}
        autovalutazioneId={selectedId}
        onComplete={closeWizard}
        onCancel={closeWizard}
      />
    );
  }

  // Altrimenti mostra la lista
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">RT1 - Autovalutazione del Rischio</h1>
          <p className="text-gray-600 mt-1">
            Valutazione del rischio di riciclaggio e finanziamento del terrorismo
          </p>
        </div>
        <button
          onClick={() => openWizard('new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuova Autovalutazione
        </button>
      </div>

      {/* Info Box */}
      <Card>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">Frequenza Minima: Triennale</p>
              <p>
                Aggiornare anche in caso di: variazioni rilevanti clientela/servizi/canali/aree, 
                modifiche normative, cambi organizzativi.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Lista Autovalutazioni */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Le tue Autovalutazioni</h2>
          <span className="text-sm text-gray-600">
            {autovalutazioni.length} totali
          </span>
        </div>

        {loading ? (
          <>
          {/*<div className="text-center py-8 text-gray-600">Caricamento...</div>*/}
          <Spinner/></>
        ) : autovalutazioni.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 mb-4">Nessuna autovalutazione presente</p>
            <button
              onClick={() => openWizard('new')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Crea la prima autovalutazione
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {autovalutazioni.map((auto) => (
              <div
                key={auto.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Info Principale */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-semibold text-gray-900">
                        Versione {auto.version}
                      </h3>
                      {getStatusBadge(auto.status)}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">Valutatore:</span>
                        <span className="ml-2 font-medium text-gray-900">{auto.created_by}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Data:</span>
                        <span className="ml-2 font-medium text-gray-900">{formatDate(auto.created_at)}</span>
                      </div>
                      {auto.valid_until && (() => {
                        const daysLeft = getDaysUntilExpiry(auto.valid_until);
                        const isExpiringSoon = auto.status === 'current' && daysLeft !== null && daysLeft <= 90 && daysLeft > 0;
                        return (
                          <div>
                            <span className="text-gray-600">Valida fino:</span>
                            <span className={`ml-2 font-medium ${isExpiringSoon ? 'text-orange-600' : auto.status === 'expired' ? 'text-red-600' : 'text-gray-900'}`}>
                              {formatDate(auto.valid_until)}
                            </span>
                            {isExpiringSoon && (
                              <span className="ml-2 inline-flex items-center gap-1 text-xs text-orange-600 font-medium">
                                <Clock className="w-3 h-3" />
                                {daysLeft} giorni rimasti
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Score */}
                    {auto.status !== 'draft' && (
                      <div className="flex gap-4 mt-3 text-sm">
                        <div>
                          <span className="text-gray-600">Inerente:</span>
                          <span className="ml-2 font-bold text-blue-600">{formatScore(auto.inerente_score)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Vulnerabilità:</span>
                          <span className="ml-2 font-bold text-orange-600">{formatScore(auto.vulnerabilita_score)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Residuo:</span>
                          <span className="ml-2 font-bold text-red-600">{formatScore(auto.residuo_score)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Azioni */}
                  <div className="flex gap-2 flex-shrink-0">
                    {/* Download DOCX - Solo per autovalutazioni completate */}
                    {(auto.status === 'current' || auto.status === 'archived' || auto.status === 'expired') && (
                      <button
                        onClick={() => handleDownloadDOCX(auto.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 border border-emerald-300 text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors text-xs font-medium"
                        title="Scarica DOCX AV.0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        AV.0
                      </button>
                    )}

                    <button
                      onClick={() => openWizard('view', auto.id)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Visualizza"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {auto.status === 'draft' && (
                      <>
                        <button
                          onClick={() => openWizard('draft', auto.id)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Continua Bozza"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {puoCestina && (
                          <button
                            onClick={() => handleDelete(auto.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Sposta nel cestino"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}

                    {(auto.status === 'current' || auto.status === 'expired') && (
                      <button
                        onClick={() => handleDuplicate(auto.id, auto.version)}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Duplica come nuova versione"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
