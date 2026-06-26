import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Building2, Plus, Users, Calendar, X, Save, Pencil, Check, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { Spinner } from '../cliente-wizard/modals/Spinner';
import { useToast } from '../Toast';

interface Studio {
  id: string;
  nome: string;
  created_at: string;
  membri: number;
  comune_sede: string | null;
  provincia_sede: string | null;
  via_piazza_sede: string | null;
  numero_civico_sede: string | null;
}

interface SedeForm {
  comune_sede: string;
  provincia_sede: string;
  via_piazza_sede: string;
  numero_civico_sede: string;
}

export function StudiManagement() {
  const toast = useToast();
  const [studi, setStudi] = useState<Studio[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nomeStudio, setNomeStudio] = useState('');
  const [comuneSede, setComuneSede] = useState('');
  const [provinciaSede, setProvinciaSede] = useState('');
  const [viaPiazzaSede, setViaPiazzaSede] = useState('');
  const [numeroCivicoSede, setNumeroCivicoSede] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNome, setEditingNome] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [myStudioId, setMyStudioId] = useState<string | null>(null);
  const [expandedSedeId, setExpandedSedeId] = useState<string | null>(null);
  const [sedeForm, setSedeForm] = useState<SedeForm>({ comune_sede: '', provincia_sede: '', via_piazza_sede: '', numero_civico_sede: '' });
  const [savingSede, setSavingSede] = useState(false);

  useEffect(() => {
    loadStudi();
  }, []);

  async function loadStudi() {
    setLoading(true);
    try {
      const [{ data: studiData, error }, { data: profilesData }, { data: { user } }] = await Promise.all([
        supabase.from('studi').select('id, nome, created_at, comune_sede, provincia_sede, via_piazza_sede, numero_civico_sede').order('nome'),
        supabase.from('user_profiles').select('user_id, studio_id'),
        supabase.auth.getUser(),
      ]);

      if (error) throw error;

      // Recupera studio del superadmin
      if (user && !myStudioId) {
        const myProfile = (profilesData || []).find((p: any) => p.user_id === user.id);
        if (myProfile?.studio_id) setMyStudioId(myProfile.studio_id);
      }

      // Conta i membri per ogni studio
      const countByStudio: Record<string, number> = {};
      (profilesData || []).forEach((p: any) => {
        if (p.studio_id) countByStudio[p.studio_id] = (countByStudio[p.studio_id] || 0) + 1;
      });

      const mapped = (studiData || []).map((s: any) => ({
        ...s,
        membri: countByStudio[s.id] || 0,
      }));

      // Ordina: studio del superadmin primo, poi alfabetico
      mapped.sort((a: Studio, b: Studio) => {
        const myId = myStudioId || (profilesData || []).find((p: any) => p.user_id === user?.id)?.studio_id;
        if (a.id === myId) return -1;
        if (b.id === myId) return 1;
        return a.nome.localeCompare(b.nome);
      });

      setStudi(mapped);
    } catch (err: any) {
      console.error('Errore caricamento studi:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    const nome = nomeStudio.trim();
    if (!nome) {
      setErrorMessage('Il nome dello studio è obbligatorio.');
      return;
    }
    setSaving(true);
    setErrorMessage('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('studi').insert({
        nome,
        created_by: user?.id,
        comune_sede: comuneSede.trim() || null,
        provincia_sede: provinciaSede.trim().toUpperCase() || null,
        via_piazza_sede: viaPiazzaSede.trim() || null,
        numero_civico_sede: numeroCivicoSede.trim() || null,
      });
      if (error) throw error;
      setNomeStudio('');
      setComuneSede('');
      setProvinciaSede('');
      setViaPiazzaSede('');
      setNumeroCivicoSede('');
      setShowForm(false);
      await loadStudi();
    } catch (err: any) {
      setErrorMessage(err.message || 'Errore durante la creazione dello studio.');
    } finally {
      setSaving(false);
    }
  }

  function resetCreateForm() {
    setShowForm(false);
    setNomeStudio('');
    setComuneSede('');
    setProvinciaSede('');
    setViaPiazzaSede('');
    setNumeroCivicoSede('');
    setErrorMessage('');
  }

  async function handleSaveEdit(studioId: string) {
    const nome = editingNome.trim();
    if (!nome) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase.from('studi').update({ nome }).eq('id', studioId);
      if (error) throw error;
      setEditingId(null);
      await loadStudi();
    } catch (err: any) {
      toast.error(err.message || 'Errore durante il salvataggio.');
    } finally {
      setSavingEdit(false);
    }
  }

  function toggleSedeSection(studio: Studio) {
    if (expandedSedeId === studio.id) {
      setExpandedSedeId(null);
      return;
    }
    setExpandedSedeId(studio.id);
    setSedeForm({
      comune_sede: studio.comune_sede || '',
      provincia_sede: studio.provincia_sede || '',
      via_piazza_sede: studio.via_piazza_sede || '',
      numero_civico_sede: studio.numero_civico_sede || '',
    });
  }

  async function handleSaveSede(studioId: string) {
    setSavingSede(true);
    try {
      const { error } = await supabase.from('studi').update({
        comune_sede: sedeForm.comune_sede.trim() || null,
        provincia_sede: sedeForm.provincia_sede.trim().toUpperCase() || null,
        via_piazza_sede: sedeForm.via_piazza_sede.trim() || null,
        numero_civico_sede: sedeForm.numero_civico_sede.trim() || null,
      }).eq('id', studioId);
      if (error) throw error;
      toast.success('Sede studio aggiornata');
      setExpandedSedeId(null);
      await loadStudi();
    } catch (err: any) {
      toast.error(err.message || 'Errore durante il salvataggio della sede.');
    } finally {
      setSavingSede(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Gestione Studi</h1>
          <p className="text-slate-400 mt-1">Tutti gli studi registrati sulla piattaforma</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 px-4 py-2 bg-slate-800 rounded-lg border border-slate-700">
            <Building2 className="w-5 h-5 text-slate-400" />
            <span className="text-2xl font-bold text-white">{studi.length}</span>
            <span className="text-sm text-slate-400">studi</span>
          </div>
          <button
            onClick={() => { setShowForm(true); setErrorMessage(''); }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            Nuovo Studio
          </button>
        </div>
      </div>

      {/* Form nuovo studio */}
      {showForm && (
        <div className="bg-slate-800 border border-amber-500/40 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-white">Crea Nuovo Studio</h2>
            <button onClick={resetCreateForm} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Nome Studio *</label>
            <input
              type="text"
              value={nomeStudio}
              onChange={(e) => setNomeStudio(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Es. Studio Rossi & Associati"
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              autoFocus
            />
          </div>

          <div className="pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Sede studio (opzionale)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Comune</label>
                <input
                  type="text"
                  value={comuneSede}
                  onChange={(e) => setComuneSede(e.target.value)}
                  placeholder="Es. Milano"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent uppercase"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Via / Piazza</label>
                <input
                  type="text"
                  value={viaPiazzaSede}
                  onChange={(e) => setViaPiazzaSede(e.target.value)}
                  placeholder="Es. Via Roma"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">N. civico</label>
                <input
                  type="text"
                  value={numeroCivicoSede}
                  onChange={(e) => setNumeroCivicoSede(e.target.value)}
                  placeholder="10/A"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {errorMessage && (
            <p className="text-sm text-red-400">{errorMessage}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Crea Studio
            </button>
            <button
              onClick={resetCreateForm}
              className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Lista studi */}
      <div className="space-y-3">
        {studi.map((studio) => {
          const isSedeOpen = expandedSedeId === studio.id;
          const hasSede = !!(studio.comune_sede || studio.via_piazza_sede || studio.provincia_sede || studio.numero_civico_sede);
          return (
          <div
            key={studio.id}
            className="bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
          >
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  {editingId === studio.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingNome}
                        onChange={(e) => setEditingNome(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(studio.id); if (e.key === 'Escape') setEditingId(null); }}
                        className="px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveEdit(studio.id)}
                        disabled={savingEdit || !editingNome.trim()}
                        className="p-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                        title="Salva"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors"
                        title="Annulla"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-white">{studio.nome}</h3>
                        <button
                          onClick={() => { setEditingId(studio.id); setEditingNome(studio.nome); }}
                          className="p-1 hover:bg-slate-700 text-slate-500 hover:text-amber-400 rounded transition-colors"
                          title="Modifica nome"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {hasSede && (
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {[studio.via_piazza_sede, studio.numero_civico_sede].filter(Boolean).join(' ')}
                          {(studio.via_piazza_sede || studio.numero_civico_sede) && (studio.comune_sede || studio.provincia_sede) ? ', ' : ''}
                          {studio.comune_sede}
                          {studio.provincia_sede ? ` (${studio.provincia_sede})` : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-6 text-sm text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    <span>{studio.membri} {studio.membri === 1 ? 'membro' : 'membri'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(studio.created_at).toLocaleDateString('it-IT')}</span>
                  </div>
                  <button
                    onClick={() => toggleSedeSection(studio)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSedeOpen
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-transparent'
                    }`}
                    title="Modifica sede studio"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    {hasSede ? 'Modifica sede' : 'Aggiungi sede'}
                    {isSedeOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {isSedeOpen && (
              <div className="border-t border-slate-700 bg-slate-900/40 p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-amber-400" />
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Sede studio</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Comune</label>
                    <input
                      type="text"
                      value={sedeForm.comune_sede}
                      onChange={(e) => setSedeForm({ ...sedeForm, comune_sede: e.target.value })}
                      placeholder="Es. Milano"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Prov.</label>
                    <input
                      type="text"
                      value={sedeForm.provincia_sede}
                      onChange={(e) => setSedeForm({ ...sedeForm, provincia_sede: e.target.value.toUpperCase().slice(0, 2) })}
                      placeholder="MI"
                      maxLength={2}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent uppercase"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Via / Piazza</label>
                    <input
                      type="text"
                      value={sedeForm.via_piazza_sede}
                      onChange={(e) => setSedeForm({ ...sedeForm, via_piazza_sede: e.target.value })}
                      placeholder="Es. Via Roma"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">N. civico</label>
                    <input
                      type="text"
                      value={sedeForm.numero_civico_sede}
                      onChange={(e) => setSedeForm({ ...sedeForm, numero_civico_sede: e.target.value })}
                      placeholder="10/A"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleSaveSede(studio.id)}
                    disabled={savingSede}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium text-sm"
                  >
                    {savingSede ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Salva sede
                  </button>
                  <button
                    onClick={() => setExpandedSedeId(null)}
                    className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-sm"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            )}
          </div>
          );
        })}

        {studi.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            Nessuno studio trovato
          </div>
        )}
      </div>
    </div>
  );
}
