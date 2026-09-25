import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Building2, MapPin, Save, Pencil, Check, X, UserCheck } from 'lucide-react';
import { Spinner } from '../cliente-wizard/modals/Spinner';
import { useToast } from '../Toast';
import { getMyStudio, getStudioProprietarioProfile } from '../../lib/studioHelper';

interface StudioData {
  id: string;
  nome: string;
  created_by: string | null;
  comune_sede: string | null;
  provincia_sede: string | null;
  via_piazza_sede: string | null;
  numero_civico_sede: string | null;
  nome_proprietario: string | null;
  cognome_proprietario: string | null;
  albo_sede: string | null;
  albo_numero: string | null;
  albo_sezione: string | null;
  delega_admin_av5: boolean | null;
}

export function MyStudioInfo() {
  const toast = useToast();
  const [studio, setStudio] = useState<StudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProf, setSavingProf] = useState(false);
  const [editingNome, setEditingNome] = useState(false);
  const [nomeBuffer, setNomeBuffer] = useState('');
  const [savingNome, setSavingNome] = useState(false);
  const [comuneSede, setComuneSede] = useState('');
  const [provinciaSede, setProvinciaSede] = useState('');
  const [viaPiazzaSede, setViaPiazzaSede] = useState('');
  const [numeroCivicoSede, setNumeroCivicoSede] = useState('');
  const [nomeProprietario, setNomeProprietario] = useState('');
  const [cognomeProprietario, setCognomeProprietario] = useState('');
  const [alboSede, setAlboSede] = useState('');
  const [alboNumero, setAlboNumero] = useState('');
  const [alboSezione, setAlboSezione] = useState('');
  const [delegaAdminAv5, setDelegaAdminAv5] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userIsProprietario, setUserIsProprietario] = useState(false);

  useEffect(() => {
    loadStudio();
  }, []);

  async function loadStudio() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role, proprietario')
          .eq('user_id', user.id)
          .single();
        setUserRole(profile?.role ?? null);
        setUserIsProprietario(profile?.proprietario === true);
      }
      const data = await getMyStudio();
      if (!data) {
        setStudio(null);
        return;
      }
      setStudio(data);
      setComuneSede(data.comune_sede || '');
      setProvinciaSede(data.provincia_sede || '');
      setViaPiazzaSede(data.via_piazza_sede || '');
      setNumeroCivicoSede(data.numero_civico_sede || '');
      setAlboSede(data.albo_sede || '');
      setAlboNumero(data.albo_numero || '');
      setAlboSezione(data.albo_sezione || '');
      setDelegaAdminAv5(!!data.delega_admin_av5);

      // Pre-compila nome/cognome dal user_profiles del proprietario quando i
      // dedicati su `studi` non sono ancora valorizzati: chi modifica la scheda
      // (proprietario o admin delegato) trova sempre i dati anagrafici già pronti.
      let nomeFallback = '';
      let cognomeFallback = '';
      if (!data.nome_proprietario || !data.cognome_proprietario) {
        const propProfile = await getStudioProprietarioProfile(data.id);
        nomeFallback = propProfile?.nome ?? '';
        cognomeFallback = propProfile?.cognome ?? '';
      }
      setNomeProprietario(data.nome_proprietario || nomeFallback);
      setCognomeProprietario(data.cognome_proprietario || cognomeFallback);
    } catch (err: any) {
      console.error('Errore caricamento studio:', err);
      toast.error('Errore nel caricamento dei dati dello studio');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveNome() {
    if (!studio) return;
    const nome = nomeBuffer.trim();
    if (!nome) {
      toast.error('Il nome dello studio non può essere vuoto');
      return;
    }
    if (nome === studio.nome) {
      setEditingNome(false);
      return;
    }
    setSavingNome(true);
    try {
      const { error } = await supabase.from('studi').update({ nome }).eq('id', studio.id);
      if (error) throw error;
      toast.success('Nome dello studio aggiornato');
      setEditingNome(false);
      await loadStudio();
    } catch (err: any) {
      toast.error(err.message || 'Errore durante il salvataggio del nome');
    } finally {
      setSavingNome(false);
    }
  }

  async function handleSave() {
    if (!studio) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('studi').update({
        comune_sede: comuneSede.trim() || null,
        provincia_sede: provinciaSede.trim().toUpperCase() || null,
        via_piazza_sede: viaPiazzaSede.trim() || null,
        numero_civico_sede: numeroCivicoSede.trim() || null,
      }).eq('id', studio.id);
      if (error) throw error;
      toast.success('Dati dello studio aggiornati');
      await loadStudio();
    } catch (err: any) {
      toast.error(err.message || 'Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProprietario() {
    if (!studio) return;
    setSavingProf(true);
    try {
      const payload: Record<string, unknown> = {
        nome_proprietario: nomeProprietario.trim() || null,
        cognome_proprietario: cognomeProprietario.trim() || null,
        albo_sede: alboSede.trim() || null,
        albo_numero: alboNumero.trim() || null,
        albo_sezione: alboSezione.trim() || null,
      };
      // Solo il proprietario può modificare il flag di delega.
      if (isProprietario) {
        payload.delega_admin_av5 = delegaAdminAv5;
      }
      const { error } = await supabase.from('studi').update(payload).eq('id', studio.id);
      if (error) throw error;
      toast.success('Dati del professionista aggiornati');
      await loadStudio();
    } catch (err: any) {
      toast.error(err.message || 'Errore durante il salvataggio');
    } finally {
      setSavingProf(false);
    }
  }

  const isAdminRole = userRole === 'admin' || userRole === 'superadmin';
  // Il flag autoritativo è `user_profiles.proprietario` (gestito dal superadmin).
  const isProprietario = userIsProprietario;
  // Permesso di modifica unificato: vale sia per i dati di studio (nome, sede)
  // sia per i dati del professionista. Gli admin senza delega vedono comunque
  // entrambe le card ma in sola lettura.
  const canEdit = isProprietario || (isAdminRole && !!studio?.delega_admin_av5);
  const readOnlyInputClass = 'opacity-60 cursor-not-allowed';

  if (loading) return <Spinner />;

  if (!studio) {
    return (
      <div className="text-center py-12 text-slate-400">
        Nessuno studio associato al tuo account.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold text-white">Il mio Studio</h1>
      </div>

      <div className="grid gap-6 items-start lg:grid-cols-2">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5 shadow-lg hover:border-slate-600 transition-colors">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-700">
          <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg shrink-0">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Nome studio</p>
            {editingNome ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nomeBuffer}
                  onChange={(e) => setNomeBuffer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveNome();
                    if (e.key === 'Escape') setEditingNome(false);
                  }}
                  className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                  autoFocus
                />
                <button
                  onClick={handleSaveNome}
                  disabled={savingNome || !nomeBuffer.trim()}
                  className="p-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                  title="Salva"
                >
                  {savingNome ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => setEditingNome(false)}
                  disabled={savingNome}
                  className="p-1.5 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors"
                  title="Annulla"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white truncate">{studio.nome}</h2>
                {canEdit && (
                  <button
                    onClick={() => { setNomeBuffer(studio.nome); setEditingNome(true); }}
                    className="p-1 hover:bg-slate-700 text-slate-500 hover:text-amber-400 rounded transition-colors shrink-0"
                    title="Modifica nome"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-semibold text-white">Sede studio</p>
            <span className="text-xs text-slate-500">(opzionale, usata nell'AV.5)</span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Comune</label>
                <input
                  type="text"
                  value={comuneSede}
                  onChange={(e) => setComuneSede(e.target.value)}
                  placeholder="Es. Milano"
                  disabled={!canEdit}
                  className={`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent ${!canEdit ? readOnlyInputClass : ''}`}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Prov.</label>
                <input
                  type="text"
                  value={provinciaSede}
                  onChange={(e) => setProvinciaSede(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="MI"
                  maxLength={2}
                  disabled={!canEdit}
                  className={`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent uppercase ${!canEdit ? readOnlyInputClass : ''}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Via / Piazza</label>
                <input
                  type="text"
                  value={viaPiazzaSede}
                  onChange={(e) => setViaPiazzaSede(e.target.value)}
                  placeholder="Es. Via Roma"
                  disabled={!canEdit}
                  className={`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent ${!canEdit ? readOnlyInputClass : ''}`}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">N. civico</label>
                <input
                  type="text"
                  value={numeroCivicoSede}
                  onChange={(e) => setNumeroCivicoSede(e.target.value)}
                  placeholder="10/A"
                  disabled={!canEdit}
                  className={`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent ${!canEdit ? readOnlyInputClass : ''}`}
                />
              </div>
            </div>
          </div>
        </div>

        {canEdit ? (
          <div className="flex justify-end pt-2 border-t border-slate-700">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium text-sm"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salva modifiche
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic pt-2 border-t border-slate-700">
            Sola lettura: il proprietario non ha delegato la modifica di questi dati.
          </p>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5 shadow-lg hover:border-slate-600 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-semibold text-white">Dati del Professionista (proprietario dello studio)</p>
          </div>
          <p className="text-xs text-slate-400 -mt-3">
            Usati per precompilare l'AV.5 - Attestazione del Professionista. Tutti i membri dello studio troveranno questi dati già compilati nel modulo generato.
            {!isProprietario && canEdit && ' Il proprietario ti ha delegato la gestione di questi dati.'}
            {!isProprietario && !canEdit && ' Il proprietario non ti ha delegato la modifica: visualizzazione in sola lettura.'}
          </p>

          {isProprietario && (
            <label className="flex items-start gap-3 p-3 bg-slate-900/60 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-900 transition-colors">
              <input
                type="checkbox"
                checked={delegaAdminAv5}
                onChange={(e) => setDelegaAdminAv5(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Delega ad altri admin la modifica di questi dati</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Se attivo, gli admin del tuo studio (esclusi i collaboratori) potranno vedere e modificare i dati del professionista. Il flag va salvato con il pulsante in basso.
                </p>
              </div>
            </label>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nome</label>
                <input
                  type="text"
                  value={nomeProprietario}
                  onChange={(e) => setNomeProprietario(e.target.value)}
                  placeholder="Es. Mario"
                  disabled={!canEdit}
                  className={`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent ${!canEdit ? readOnlyInputClass : ''}`}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cognome</label>
                <input
                  type="text"
                  value={cognomeProprietario}
                  onChange={(e) => setCognomeProprietario(e.target.value)}
                  placeholder="Es. Rossi"
                  disabled={!canEdit}
                  className={`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent ${!canEdit ? readOnlyInputClass : ''}`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Sede Albo Dottori Commercialisti ed Esperti Contabili</label>
              <input
                type="text"
                value={alboSede}
                onChange={(e) => setAlboSede(e.target.value)}
                placeholder="Es. Milano"
                disabled={!canEdit}
                className={`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent ${!canEdit ? readOnlyInputClass : ''}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">N. iscrizione</label>
                <input
                  type="text"
                  value={alboNumero}
                  onChange={(e) => setAlboNumero(e.target.value)}
                  placeholder="Es. 12345"
                  disabled={!canEdit}
                  className={`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent ${!canEdit ? readOnlyInputClass : ''}`}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Sezione</label>
                <input
                  type="text"
                  value={alboSezione}
                  onChange={(e) => setAlboSezione(e.target.value)}
                  placeholder="Es. A"
                  disabled={!canEdit}
                  className={`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent ${!canEdit ? readOnlyInputClass : ''}`}
                />
              </div>
            </div>
          </div>

          {canEdit ? (
            <div className="flex justify-end pt-2 border-t border-slate-700">
              <button
                onClick={handleSaveProprietario}
                disabled={savingProf}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium text-sm"
              >
                {savingProf ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salva dati professionista
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic pt-2 border-t border-slate-700">
              Sola lettura: il proprietario non ha delegato la modifica di questi dati.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
