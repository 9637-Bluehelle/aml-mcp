import { useEffect, useState, useCallback} from 'react';
import { Card } from './Card';
import { RiskBadge } from './RiskBadge';
import { Shield, Users, Briefcase, AlertCircle, UserRoundCog, ScrollText, ChevronRight, User2, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getUserLogs } from './LogUtente.tsx';
import { useAlertCounts } from './alertCountsContext';
import { Spinner } from '../components/cliente-wizard/modals/Spinner.tsx';
import { useStudio } from '../lib/StudioContext';
import '../index.css';

interface CollaboratoreInfo {
  id: string;
  email: string;
  nome?: string;
  cognome?: string;
  isMe?: boolean;
}

interface Stats {
  clientiTotali: number;
  incarichiAttivi: number;
  //alertAperti: number;
  autovalutazioneAttiva: {
    inerente_score: number;
    vulnerabilita_score: number;
    residuo_score: number;
    valid_until: string;
  } | null;
  collaboratoriTotali:number;                                                  
  collaboratoriLista: CollaboratoreInfo[];                                      
}

export function Dashboard() {
  const { activeStudioId } = useStudio();         
  const [datiProfilo, setDatiProfilo] = useState({id:'', email:'' , role:'', studioId: '', studioNome: '', loading: true, errorMessage:''});
  //const [emailAzienda, setEmailAzienda] = useState('');

  const { alertCounts } = useAlertCounts();
  /*
  const tableNames = ['titolari_effettivi']; 

async function fetchAndPrintAllData() {
  // console.log(" Inizio recupero dati da tutte le tabelle...");

  for (const tableName of tableNames) {
    // Recuperiamo i dati per la tabella corrente
    const { data, error } = await supabase
      .from(tableName)
      .select('*');

    if (error) {
      console.error(` Errore sulla tabella [${tableName}]:`, error.message);
      continue; // Passa alla prossima tabella anche se questa fallisce
    }

    // console.log(`\n---  TABELLA: ${tableName.toUpperCase()} ---`);

    if (data && data.length > 0) {
      // Estraiamo i nomi delle colonne dalle chiavi del primo record
      const columns = Object.keys(data[0]);
      // console.log(`Nomi Colonne: ${columns.join(' | ')}`);
      
      // Stampiamo i dati in formato tabella leggibile
      console.table(data);
    } else {
      // console.log("ℹ La tabella è vuota.");
    }
  }

  // console.log("\n Operazione completata.");
}

// Esegui la funzione
fetchAndPrintAllData();
*/

  const fetchProfilo = useCallback(async()=>{
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error(authError?.message || "Utente non autenticato");
      }

      const { data: profileCheck, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, email, studio_id')
        .eq('user_id', user.id)
        .single();

      // Recupera il nome dello studio
      let studioNome = '';
      if (profileCheck?.studio_id) {
        const { data: studioData } = await supabase
          .from('studi')
          .select('nome')
          .eq('id', profileCheck.studio_id)
          .single();
        studioNome = studioData?.nome || '';
      }

      setDatiProfilo({
        id: user.id,
        email: profileCheck?.email || '',
        role: profileCheck?.role || '',
        studioId: profileCheck?.studio_id || '',
        studioNome: studioNome,
        loading: false,
        errorMessage: profileError?.message || ''
      });

    } catch (err:any) {
      setDatiProfilo(prev => ({
        ...prev,
        loading: false,
        errorMessage: err?.message
      }));
    }
  }, []);

  useEffect(() => {
    fetchProfilo();
  }, [fetchProfilo]);

  const [stats, setStats] = useState<Stats>({
    clientiTotali: 0,
    incarichiAttivi: 0,
    //alertAperti: 0,
    autovalutazioneAttiva: null,
    collaboratoriTotali:0,
    collaboratoriLista:[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [datiProfilo, activeStudioId]);


  async function loadStats() {
    if (!datiProfilo.id) {
      return;
    }
    try {

      // Se collaboratore, recupera il nome dello studio per visualizzazione
      /*if (datiProfilo.role === 'user' && datiProfilo.studioNome) {
        setEmailAzienda(datiProfilo.studioNome);
      }*/

      // RLS ora gestisce automaticamente l'isolamento per studio,
      // quindi le query semplici restituiscono tutti i dati dello studio
      let qClienti = supabase.from('clienti').select('id', { count: 'exact', head: true }).is('deleted_at', null);
      let qIncarichi = supabase.from('incarichi').select('id', { count: 'exact', head: true }).eq('status', 'active').or('archiviato.eq.false,archiviato.is.null').is('deleted_at', null);
      let qAuto = supabase.from('autovalutazioni').select('inerente_score, vulnerabilita_score, residuo_score, valid_until').eq('status', 'current').is('deleted_at', null).order('created_at', { ascending: false }).limit(1);
      if (activeStudioId) {
        qClienti = qClienti.eq('studio_id', activeStudioId);
        qIncarichi = qIncarichi.eq('studio_id', activeStudioId);
        qAuto = qAuto.eq('studio_id', activeStudioId);
      }
      const [clienti, incarichi, autovalutazione] = await Promise.all([qClienti, qIncarichi, qAuto.maybeSingle()]);

      // Recupera collaboratori dello stesso studio con nome/cognome da user_profiles
      let listaMappata: CollaboratoreInfo[] = [];
      const studioForCollab = activeStudioId || datiProfilo.studioId;
      if (studioForCollab) {
        const { data: collaboratoriData, error: collabError } = await supabase
          .from('user_profiles')
          .select('user_id, email, nome, cognome')
          .eq('studio_id', studioForCollab);

        if (collabError) {
          console.error('Errore caricamento collaboratori:', collabError);
        }

        listaMappata = (collaboratoriData || [])
          .map(c => ({
            id: c.user_id,
            email: c.email || '',
            nome: c.nome || '',
            cognome: c.cognome || '',
            isMe: c.user_id === datiProfilo.id,
          }));

        // Utente corrente primo, poi alfabetico
        listaMappata.sort((a, b) => {
          if (a.isMe) return -1;
          if (b.isMe) return 1;
          const nameA = `${a.nome} ${a.cognome}`.trim();
          const nameB = `${b.nome} ${b.cognome}`.trim();
          return nameA.localeCompare(nameB, 'it');
        });
      }

      setStats({
        clientiTotali: clienti.count || 0,
        incarichiAttivi: incarichi.count || 0,
       //alertAperti: alertCounts.no_incarichi+alertCounts.no_valutazioni+alertCounts.draft || 0,
        autovalutazioneAttiva: autovalutazione.data,
        collaboratoriTotali: listaMappata.length || 0,
        collaboratoriLista: listaMappata,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }

  const CollaboratoreRow : React.FC<{ collab: CollaboratoreInfo }> = ({ collab }) => {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAllLogs, setShowAllLogs] = useState(false);

    useEffect(() => {
      async function fetchInitialLogs() {
        const data = await getUserLogs(collab.id);
        setLogs(data);
        setLoading(false);
      }

      setLoading(true);
      fetchInitialLogs();

      // Configurazione Realtime
      const channel = supabase
        .channel(`logs-collab-${collab.id}`) // Canale unico per collaboratore
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_logs',
            filter: `user_id=eq.${collab.id}`
          },
          (payload) => {
            // Aggiungiamo il nuovo log in cima alla lista
            setLogs((currentLogs) => [payload.new, ...currentLogs].slice(0, 15));
          }
        )
        .subscribe();

      // Cleanup
      return () => {
        supabase.removeChannel(channel);
      };
    }, [collab.id]);

    const ultimoLog = logs.length > 0 ? logs[0] : null;

    return (
      <>
        <li
          onClick={() => setShowAllLogs(!showAllLogs)}
          className={`px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer flex items-center justify-between ${collab.isMe ? 'bg-blue-50/50' : ''}`}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className={`${collab.isMe ? 'bg-blue-100' : 'bg-blue-50'} p-2 rounded-full flex-shrink-0`}>
              {collab.isMe ? <UserRoundCog className="w-4 h-4 text-blue-700" /> : <User2 className="w-4 h-4 text-blue-600" />}
            </div>

            <div className="flex flex-col min-w-0">
              <span className={`text-sm font-medium truncate ${collab.isMe ? 'text-blue-700' : 'text-gray-700'}`}>
                {collab.nome || collab.cognome ? `${collab.nome} ${collab.cognome}`.trim() : collab.email}
                {collab.isMe && <span className="ml-2 text-xs font-semibold text-blue-500">(Tu)</span>}
              </span>
              {/* Visualizzazione dell'ultimo Log */}
              <div className={`flex items-center gap-1.5 text-xs text-gray-400 transition-all duration-700 transform ${loading ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}>
                <ScrollText className="w-3 h-3" />
                <span className='truncate'>
                  {ultimoLog ? ultimoLog.action : 'Nessuna attività'}
                </span>
                {ultimoLog && (
                  <span className="text-[12px] text-gray-300 ml-5">
                    {new Date(ultimoLog.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        
          <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${showAllLogs ? 'rotate-90' : ''}`} />
        </li>

        {/* Sezione Espandibile per tutti i Log */}
        {showAllLogs && (
          <li className="bg-gray-50/50 px-12 py-3 border-t border-gray-100 list-none">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Ultime 15 attività</h4>
              <span className="text-[11px] font-medium text-blue-500">{collab.email}</span>
            </div>
            <ul className="space-y-2">
              {logs.map((log) => (
                <li key={log.id} className="text-xs text-gray-600 flex justify-between border-b border-gray-100 pb-1">
                  <span>{log.action}</span>
                  <span className="text-gray-400">{new Date(log.created_at).toLocaleString()}</span>
                </li>
              ))}
              {logs.length === 0 && <li className="text-xs text-gray-400 italic">Nessun log disponibile</li>}
            </ul>
          </li>
        )}
      </>
    );
  };

  if (loading) {
    return <Spinner/>;
  }

  return (
    <div className="space-y-6">
      <div className='flex justify-between'>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard AML</h1>
          <p className="text-gray-600 mt-1">Panoramica sistema di conformità antiriciclaggio</p>
        </div>
        {datiProfilo.studioNome && (
          <div className='flex flex-rows items-center'>
            <p className="text-gray-600 mt-1">
              {datiProfilo.role === 'user' ? 'Collaboratore presso' : 'Studio'}
            </p>
            <p className="text-blue-600 mt-1 ml-1 font-medium">{datiProfilo.studioNome}</p>
          </div>
        )}
      </div>

      <div className={datiProfilo.role !=='user'? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"}>
        {datiProfilo.role !=='user' && (
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Collaboratori</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.collaboratoriTotali}</p>
              </div>
              <UserRoundCog className="w-12 h-12 text-blue-700 opacity-35"/>
            </div>
          </Card>
        )}

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Clienti</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.clientiTotali}</p>
            </div>
            <Users className="w-12 h-12 text-blue-500 opacity-20" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Incarichi Attivi</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.incarichiAttivi}</p>
            </div>
            <Briefcase className="w-12 h-12 text-green-500 opacity-20" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Alert Aperti</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{alertCounts.no_incarichi+alertCounts.no_valutazioni+alertCounts.draft+alertCounts.scadenza+alertCounts.rt1_scadenza+alertCounts.doc_scadenza+alertCounts.controlli_scadenza}</p>
            </div>
            <AlertCircle className={`w-12 h-12 opacity-20 ${alertCounts.no_incarichi+alertCounts.no_valutazioni+alertCounts.draft+alertCounts.scadenza+alertCounts.rt1_scadenza+alertCounts.doc_scadenza+alertCounts.controlli_scadenza > 0 ? 'text-red-500' : 'text-gray-400'}`} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Rischio Residuo RT1</p>
              {stats.autovalutazioneAttiva ? (
                <div className="mt-2">
                  <RiskBadge score={stats.autovalutazioneAttiva.residuo_score} />
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-2">Nessuna valutazione</p>
              )}
            </div>
            <Shield className="w-12 h-12 text-purple-500 opacity-20" />
          </div>
        </Card>
      </div>
       
      {datiProfilo.role !=='user' && (
        <Card title="Collaboratori">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4 text-sm">
            {stats.collaboratoriLista.length > 0 ? (
              <div className="overflow-hidden border border-gray-100 rounded-lg">
                <ul className="divide-y divide-gray-100">
                  {stats.collaboratoriLista.map((collab) => (
                    <CollaboratoreRow key={collab.id} collab={collab} />
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Nessun collaboratore</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title={`RT1 - Autovalutazione del Rischio`}>
          {stats.autovalutazioneAttiva ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Rischio Inerente</span>
                <span className="text-sm font-bold text-blue-600">
                  {stats.autovalutazioneAttiva.inerente_score.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Vulnerabilità</span>
                <span className="text-sm font-bold text-orange-600">
                  {stats.autovalutazioneAttiva.vulnerabilita_score.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Rischio Residuo</span>
                <RiskBadge score={stats.autovalutazioneAttiva.residuo_score} />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm text-gray-600">Valida fino a</span>
                {(() => {
                  const validUntil = new Date(stats.autovalutazioneAttiva.valid_until);
                  const today = new Date();
                  const diffDays = Math.ceil((validUntil.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  const isExpired = diffDays <= 0;
                  const isExpiringSoon = !isExpired && diffDays <= 90;
                  return (
                    <span className={`text-sm font-medium ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-orange-600' : 'text-gray-900'}`}>
                      {validUntil.toLocaleDateString('it-IT')}
                      {isExpiringSoon && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs">
                          <Clock className="w-3 h-3" />
                          {diffDays}g rimasti
                        </span>
                      )}
                      {isExpired && (
                        <span className="ml-2 text-xs">SCADUTA</span>
                      )}
                    </span>
                  );
                })()}
              </div>
              <div className="pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Frequenza minima: Triennale. Aggiornare in caso di variazioni rilevanti.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Nessuna autovalutazione attiva</p>
              <p className="text-xs text-gray-400 mt-1">Crea una nuova autovalutazione nella sezione RT1</p>
            </div>
          )}
        </Card>

        <Card title="Regole Tecniche - Riepilogo">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                1
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Autovalutazione</p>
                <p className="text-xs text-gray-600">Valutazione rischio intrinseco e vulnerabilità</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                2
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Adeguata Verifica</p>
                <p className="text-xs text-gray-600">Identificazione cliente e titolare effettivo</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                3
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Conservazione</p>
                <p className="text-xs text-gray-600">Ricostruibilità e archiviazione documenti</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                4
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Controllo Costante</p>
                <p className="text-xs text-gray-600">Monitoraggio continuo, astensione e SOS</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Riferimenti Normativi">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">D.Lgs. 231/2007</h3>
            <ul className="space-y-1 text-gray-600">
              <li>• Art. 16 - Valutazione del rischio</li>
              <li>• Art. 17-22 - Adeguata verifica</li>
              <li>• Art. 23 - Astensione</li>
              <li>• Art. 31-36 - Conservazione</li>
              <li>• Art. 35 - Segnalazione operazioni sospette</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">CNDCEC RT 2025</h3>
            <ul className="space-y-1 text-gray-600">
              <li>• RT1 - Autovalutazione del rischio</li>
              <li>• RT2 - Adeguata verifica della clientela</li>
              <li>• RT3 - Conservazione e ricostruibilità</li>
              <li>• RT4 - Controllo costante e segnalazioni</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
