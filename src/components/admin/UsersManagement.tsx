import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useScrollLock } from '../../hooks/useScrollLock';
import { Users, Mail, Calendar, Lock, Unlock, Check, X, Loader2, Trash2, Plus, ChevronDown, Building2, Shield } from 'lucide-react';
import { Spinner } from '../cliente-wizard/modals/Spinner';
import { useToast } from '../Toast';
import { adminUnlockAccount } from '../../lib/loginSecurity';

interface LockedAccount {
  email: string;
  locked_at: string;
  notification_sent_at: string | null;
}

interface UserStat {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  approved?: boolean;
  approval_requested_at?: string;
  studio_id?: string;
  studio_nome?: string;
  proprietario?: boolean;
}

interface Studio {
  id: string;
  nome: string;
}

interface Props {
  isSuperAdmin: boolean;
}

export function generateSecurePassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const symbols = '!@#$%^&*()_+';
  let password = '';
  for (let i = 0; i < 7; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  password += symbols.charAt(Math.floor(Math.random() * symbols.length));
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

export function UsersManagement({ isSuperAdmin }: Props) {
  const toast = useToast();
  const [users, setUsers] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [infoUtente, setinfoUtente] = useState<[string|null, string|null, string|null]>(['','','']);
  const [eliminaUtente, setEliminaUtente] = useState(false);
  useScrollLock(eliminaUtente);
  const [errorMessage, setErrorMessage] = useState('');
  const [myStudioId, setMyStudioId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingRoleUserId, setEditingRoleUserId] = useState<string | null>(null);
  const [lockedAccounts, setLockedAccounts] = useState<LockedAccount[]>([]);
  const [unlockingEmail, setUnlockingEmail] = useState<string | null>(null);

  // Stato form crea utente
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [studi, setStudi] = useState<Studio[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({
    nome: '',
    cognome: '',
    email: '',
    role: 'user' as 'user' | 'collaboratore' | 'admin',
    studio_id: '',
    proprietario: false,
  });
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [successInfo, setSuccessInfo] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    loadUsers();
    loadLockedAccounts();
  }, []);

  // Carica studi solo se superadmin (per il selettore studio nel form)
  useEffect(() => {
    if (isSuperAdmin && showCreateForm) {
      loadStudi();
    }
  }, [isSuperAdmin, showCreateForm]);

  async function loadStudi() {
    const { data } = await supabase.from('studi').select('id, nome').order('nome');
    setStudi(data || []);
  }

  async function loadLockedAccounts() {
    const { data, error } = await supabase
      .from('account_lockouts')
      .select('email, locked_at, notification_sent_at')
      .is('unlocked_at', null)
      .order('locked_at', { ascending: false });

    if (error) {
      console.error('Errore caricamento account bloccati:', error);
      return;
    }
    setLockedAccounts(data ?? []);
  }

  async function handleUnlockAccount(email: string) {
    setUnlockingEmail(email);
    try {
      const ok = await adminUnlockAccount(email);
      if (ok) {
        toast.success(`Account ${email} sbloccato`);
        setLockedAccounts(prev => prev.filter(la => la.email !== email));
      } else {
        toast.error('Errore nello sblocco. Riprova.');
      }
    } finally {
      setUnlockingEmail(null);
    }
  }

  async function loadUsers() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utente non autenticato');
      setCurrentUserId(user.id);

      // Recupera studio del superadmin per default
      const { data: myProfile } = await supabase
        .from('user_profiles')
        .select('studio_id, proprietario')
        .eq('user_id', user.id)
        .single();

      if (myProfile?.studio_id && !myStudioId) {
        setMyStudioId(myProfile.studio_id);
        setExpandedStudios(new Set([myProfile.studio_id]));
      }

      let query = supabase
        .from('user_profiles')
        .select('user_id, email, nome, cognome, role, created_at, approved, approval_requested_at, studio_id, proprietario, studi(nome)');

      if (!isSuperAdmin) {
        query = query.eq('studio_id', myProfile?.studio_id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped = (data || []).map((u: any) => ({
        user_id: u.user_id,
        email: u.email,
        full_name: [u.nome, u.cognome].filter(Boolean).join(' ') || u.email,
        role: u.role,
        created_at: u.created_at,
        approved: u.approved,
        approval_requested_at: u.approval_requested_at,
        studio_id: u.studio_id,
        studio_nome: u.studi?.nome ?? null,
        proprietario: u.proprietario ?? false,
      }));

      setUsers(mapped);
    } catch (error) {
      console.error('Errore caricamento utenti:', error);
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    const pwd = generateSecurePassword();
    setGeneratedPassword(pwd);
    setCreateForm({ nome: '', cognome: '', email: '', role: 'user', studio_id: '', proprietario: false });
    setCreateError('');
    setSuccessInfo(null);
    setShowCreateForm(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  function closeCreateForm() {
    setShowCreateForm(false);
    setSuccessInfo(null);
    setCreateError('');
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');

    if (!createForm.nome.trim() || !createForm.cognome.trim() || !createForm.email.trim()) {
      setCreateError('Compila tutti i campi obbligatori (nome, cognome, email).');
      return;
    }
    if (isSuperAdmin && !createForm.studio_id) {
      setCreateError('Seleziona uno studio per il nuovo utente.');
      return;
    }
    if (!generatedPassword || generatedPassword.length < 6) {
      setCreateError('La password deve avere almeno 6 caratteri.');
      return;
    }

    // Controlla se l'email è già registrata
    const emailNorm = createForm.email.trim().toLowerCase();
    const alreadyExists = users.some(u => u.email.toLowerCase() === emailNorm);
    if (alreadyExists) {
      setCreateError(`L'utente con email "${createForm.email}" è già registrato nel sistema.`);
      return;
    }

    setCreating(true);

    try {
      const { data: { user: adminUser } } = await supabase.auth.getUser();
      if (!adminUser) throw new Error('Sessione admin non trovata');

      // Recupera lo studio_id dell'admin se non è superadmin
      let studioId = createForm.studio_id;
      if (!isSuperAdmin) {
        const { data: adminProfile } = await supabase
          .from('user_profiles')
          .select('studio_id')
          .eq('user_id', adminUser.id)
          .single();
        studioId = adminProfile?.studio_id ?? '';
      }

      // Creazione PRIVILEGIATA via Edge Function: verifica server-side che il chiamante sia
      // admin/superadmin e normalizza ruolo/studio/proprietario secondo i suoi privilegi.
      // Sostituisce auth.signUp+metadata, che era scavalcabile dal client (escalation a superadmin).
      const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: createForm.email,
          password: generatedPassword,
          nome: createForm.nome,
          cognome: createForm.cognome,
          role: createForm.role,
          studio_id: studioId || null,
          proprietario: createForm.role === 'admin' ? createForm.proprietario : false,
          temp_password: generatedPassword,
        },
      });

      if (fnError) {
        let msg = fnError.message;
        try {
          const ctx = await (fnError as any).context?.json?.();
          if (ctx?.error_description || ctx?.error) msg = ctx.error_description || ctx.error;
        } catch { /* corpo non JSON */ }
        throw new Error(msg || 'Creazione utente fallita');
      }
      if (!fnData?.ok) throw new Error(fnData?.error_description || 'Creazione utente fallita');

      setSuccessInfo({ email: createForm.email, password: generatedPassword });
      setTimeout(() => {
        closeCreateForm()
      }, 4500);
      await loadUsers();
    } catch (err: any) {
      setCreateError(err.message || 'Errore durante la creazione dell\'utente');
    } finally {
      setCreating(false);
    }
  }

  /*function copyPassword(pwd: string) {
    navigator.clipboard.writeText(pwd);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 2000);
  }*/

  async function handleToggleApproval(userId: string, currentStatus: boolean) {
    setProcessingUserId(userId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const newStatus = !currentStatus;

      const { error } = await supabase.rpc('admin_toggle_user_approval', {
        target_user_id: userId,
        new_approved: newStatus,
        new_approved_at: newStatus ? new Date().toISOString() : null,
        new_approved_by: newStatus ? user?.id : null,
      });

      if (error) throw error;
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, approved: newStatus } : u));
    } catch (error) {
      console.error('Errore cambio stato approvazione:', error);
      toast.error('Impossibile aggiornare lo stato di approvazione. Riprovare o contattare il supporto.');
    } finally {
      setProcessingUserId(null);
    }
  }

  async function handleDeleteUser(userId: string) {
    setProcessingUserId(userId);
    try {
      const { error } = await supabase.functions.invoke('delete-user-by-admin', {
        body: { userId },
      });
      if (error) { setErrorMessage(error.message); return; }
      setUsers(prev => prev.filter(u => u.user_id !== userId));
    } catch (error) {
      console.error('Errore eliminazione utente:', error);
      toast.error('Errore durante l\'eliminazione dell\'utente');
    } finally {
      setProcessingUserId(null);
    }
  }

  async function handleChangeRole(userId: string, newRole: string) {
    setProcessingUserId(userId);
    try {
      const { error } = await supabase.rpc('admin_change_user_role', {
        target_user_id: userId,
        new_role: newRole,
      });

      if (error) throw error;
      toast.success('Ruolo aggiornato con successo');
      setUsers(prev => prev.map(u => u.user_id === userId
        ? { ...u, role: newRole, proprietario: newRole !== 'admin' ? false : u.proprietario }
        : u
      ));
    } catch (error) {
      console.error('Errore cambio ruolo:', error);
      toast.error('Impossibile aggiornare il ruolo. Riprovare o contattare il supporto.');
    } finally {
      setProcessingUserId(null);
    }
  }

  async function handleToggleProprietario(userId: string, currentValue: boolean) {
    setProcessingUserId(userId);
    try {
      const { error } = await supabase.rpc('admin_toggle_proprietario', {
        target_user_id: userId,
        new_proprietario: !currentValue,
      });
      if (error) throw error;
      toast.success(currentValue ? 'Flag proprietario rimosso' : 'Utente impostato come proprietario');
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, proprietario: !currentValue } : u));
    } catch (error) {
      console.error('Errore toggle proprietario:', error);
      toast.error('Impossibile aggiornare il flag proprietario. Riprovare o contattare il supporto.');
    } finally {
      setProcessingUserId(null);
    }
  }

  function renderUserCard(user: UserStat, showStudio = true) {
    return (
      <div key={user.user_id} className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold text-white">
                  {user.full_name || 'Nome non disponibile'}
                </h3>
                {user.role === 'superadmin' && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-purple-600 text-white rounded">SUPERADMIN</span>
                )}
                {user.role === 'admin' && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded">ADMIN</span>
                )}
                {user.proprietario && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-amber-500 text-white rounded">PROPRIETARIO</span>
                )}
                {(user.role === 'collaboratore' || user.role === 'user') && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-slate-500 text-white rounded">COLLABORATORE</span>
                )}
                {showStudio && user.studio_nome && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-slate-600 text-slate-200 rounded">{user.studio_nome}</span>
                )}
                {user.approved === false && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-red-600 text-white rounded flex items-center gap-1">
                    <Lock className="w-3 h-3" /> BLOCCATO
                  </span>
                )}
                {user.approved === true && user.role !== 'admin' && user.role !== 'superadmin' && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-600 text-white rounded flex items-center gap-1">
                    <Check className="w-3 h-3" /> APPROVATO
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Mail className="w-3 h-3 text-slate-400" />
                <p className="text-sm text-slate-400">{user.email}</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Calendar className="w-3 h-3" />
              <span>Registrato il {new Date(user.created_at).toLocaleDateString('it-IT')}</span>
            </div>
          </div>
        </div>

        {user.role !== 'superadmin' && user.user_id !== currentUserId && (!user.proprietario || isSuperAdmin) && (
          <div className="pt-4 border-t border-slate-700 mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Stato Accesso</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {user.approved
                    ? 'Utente può accedere alla piattaforma'
                    : `Utente bloccato — non può accedere né operare sulla piattaforma`}
                </p>
              </div>
              <button
                onClick={() => handleToggleApproval(user.user_id, user.approved ?? false)}
                disabled={processingUserId === user.user_id}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  user.approved ? 'bg-emerald-600' : 'bg-red-600'
                }`}
              >
                {processingUserId === user.user_id ? (
                  <Loader2 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-white" />
                ) : (
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    user.approved ? 'translate-x-7' : 'translate-x-1'
                  }`} />
                )}
              </button>
            </div>
            {/* Modifica Ruolo */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Ruolo</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {user.role === 'admin' ? 'Amministratore dello studio' : 'Collaboratore'}
                </p>
              </div>
              {editingRoleUserId === user.user_id ? (
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 bg-slate-900 rounded-lg border border-slate-600 text-sm">
                    <select
                      value={user.role}
                      onChange={(e) => { handleChangeRole(user.user_id, e.target.value); setEditingRoleUserId(null); }}
                      disabled={processingUserId === user.user_id}
                      className="bg-slate-900 text-white text-sm focus:outline-none"
                    >
                      <option value="user">Collaboratore</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <button
                    onClick={() => setEditingRoleUserId(null)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingRoleUserId(user.user_id)}
                  disabled={processingUserId === user.user_id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-xs transition-colors disabled:opacity-50"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Modifica
                </button>
              )}
            </div>

            {/* Toggle Proprietario — solo superadmin su admin */}
            {isSuperAdmin && user.role === 'admin' && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Proprietario</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {user.proprietario ? 'Questo admin è il proprietario dello studio' : 'Admin senza privilegi di proprietario'}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleProprietario(user.user_id, user.proprietario ?? false)}
                  disabled={processingUserId === user.user_id}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    user.proprietario ? 'bg-amber-500' : 'bg-slate-600'
                  }`}
                >
                  {processingUserId === user.user_id ? (
                    <Loader2 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-white" />
                  ) : (
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                      user.proprietario ? 'translate-x-7' : 'translate-x-1'
                    }`} />
                  )}
                </button>
              </div>
            )}

            {/*isSuperAdmin && (
              <button
                onClick={() => { setinfoUtente([user.full_name, user.email, user.user_id]); setEliminaUtente(true); }}
                disabled={processingUserId === user.user_id}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {processingUserId === user.user_id ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Eliminazione...</>
                ) : (
                  <><X className="w-4 h-4" /> Elimina Account</>
                )}
              </button>
            )*/}
          </div>
        )}
      </div>
    );
  }

  const [expandedStudios, setExpandedStudios] = useState<Set<string>>(new Set());

  const toggleStudio = (studioKey: string) => {
    setExpandedStudios(prev => {
      const next = new Set(prev);
      if (next.has(studioKey)) next.delete(studioKey); else next.add(studioKey);
      return next;
    });
  };

  function userSortOrder(u: UserStat): number {
    if (u.role === 'superadmin') return 0;
    if (u.role === 'admin' && u.proprietario) return 1;
    if (u.role === 'admin') return 2;
    return 3;
  }

  const filteredUsers = users
    .filter(user =>
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.full_name && user.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      const orderDiff = userSortOrder(a) - userSortOrder(b);
      if (orderDiff !== 0) return orderDiff;
      return (a.full_name || '').localeCompare(b.full_name || '', 'it');
    });

  // Per superadmin: raggruppa utenti per studio
  const groupedByStudio = isSuperAdmin
    ? filteredUsers.reduce<Record<string, { nome: string; users: UserStat[] }>>((acc, user) => {
        const key = user.studio_id || '_no_studio';
        if (!acc[key]) acc[key] = { nome: user.studio_nome || 'Senza studio', users: [] };
        acc[key].users.push(user);
        return acc;
      }, {})
    : null;

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 relative">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Gestione Utenti</h1>
          <p className="text-slate-400 mt-1">Panoramica di tutti gli utenti registrati</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 px-4 py-2 bg-slate-800 rounded-lg border border-slate-700">
            <Users className="w-5 h-5 text-slate-400" />
            <span className="text-2xl font-bold text-white">{users.length}</span>
            <span className="text-sm text-slate-400">utenti</span>
          </div>
          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            Crea Utente
          </button>
        </div>
      </div>

      {/* Account bloccati per troppi tentativi falliti */}
      {lockedAccounts.length > 0 && (
        <div className="bg-red-900/20 border border-red-600/40 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-5 h-5 text-red-400" />
            <h2 className="text-base font-semibold text-white">
              Account bloccati ({lockedAccounts.length})
            </h2>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Account bloccati automaticamente per 5 tentativi di login falliti.
            Sblocca manualmente solo dopo aver verificato l'identita' dell'utente.
          </p>
          <ul className="space-y-2">
            {lockedAccounts.map(la => (
              <li
                key={la.email}
                className="flex items-center justify-between gap-3 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{la.email}</div>
                  <div className="text-xs text-slate-400">
                    Bloccato il {new Date(la.locked_at).toLocaleString('it-IT')}
                    {' · '}
                    {la.notification_sent_at
                      ? 'email inviata'
                      : <span className="text-amber-400">email non inviata</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleUnlockAccount(la.email)}
                  disabled={unlockingEmail === la.email}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors shrink-0"
                >
                  {unlockingEmail === la.email ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5" />
                  )}
                  Sblocca
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Form Crea Utente */}
      {showCreateForm && (
        <div className="bg-slate-800 border border-blue-500/40 rounded-lg p-6 space-y-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold text-white">Crea Nuovo Utente</h2>
            <button onClick={closeCreateForm} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {successInfo ? (
            /* Schermata di successo con credenziali */
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-emerald-900/30 border border-emerald-600/40 rounded-lg">
                <Check className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-emerald-300 font-medium">Utente creato con successo!</p>
                  <p className="text-slate-400 text-sm mt-0.5">
                    Email di conferma inviata a <span className="text-white">{successInfo.email}</span>.<br />
                    L'utente deve confermare l'email prima di poter accedere.
                  </p>
                </div>
              </div>

               {/*<div className="bg-slate-900 rounded-lg p-4 space-y-2 border border-slate-700">
                <p className="text-sm font-medium text-slate-300">Credenziali da comunicare all'utente:</p>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Email</p>
                    <p className="text-white font-mono text-sm">{successInfo.email}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Password temporanea</p>
                    <p className="text-white font-mono text-sm tracking-wider">{successInfo.password}</p>
                  </div>
                 <button
                    onClick={() => copyPassword(successInfo.password)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded text-xs transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {passwordCopied ? 'Copiata!' : 'Copia'}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={openCreateForm}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Crea un altro utente
                </button>
                <button
                  onClick={closeCreateForm}
                  className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-sm"
                >
                  Chiudi
                </button>
              </div>*/}
            </div>
          ) : (
            /* Form di creazione */
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Nome *</label>
                  <input
                    type="text"
                    required
                    value={createForm.nome}
                    onChange={(e) => setCreateForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Es. Mario"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Cognome *</label>
                  <input
                    type="text"
                    required
                    value={createForm.cognome}
                    onChange={(e) => setCreateForm(f => ({ ...f, cognome: e.target.value }))}
                    placeholder="Es. Rossi"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="utente@esempio.it"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-none text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Ruolo *</label>
                  <div  className="px-3 py-2 bg-slate-900 rounded-lg border border-slate-700 text-sm focus-within:ring-blue-500 focus-within:ring-2 focus-within:border-transparent " >
                    <select
                      value={createForm.role}
                      onChange={(e) => setCreateForm(f => ({ ...f, role: e.target.value as any }))}
                      className="w-full bg-slate-900 border-none text-white focus:outline-none focus:ring-0"
                    >
                      <option value="user">Collaboratore</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>

                {isSuperAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Studio *</label>
                    <div  className="px-3 py-2 bg-slate-900 rounded-lg border border-slate-700 text-sm focus-within:ring-blue-500 focus-within:ring-2 focus-within:border-transparent " >
                      <select
                        required
                        value={createForm.studio_id}
                        onChange={(e) => setCreateForm(f => ({ ...f, studio_id: e.target.value }))}
                        className="w-full bg-slate-900 border-none text-white focus:outline-none focus:ring-0"
                      >
                        <option value="">Seleziona studio...</option>
                        {studi.map(s => (
                          <option key={s.id} value={s.id}>{s.nome}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {isSuperAdmin && createForm.role === 'admin' && (
                <label className="flex items-center gap-3 px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg cursor-pointer hover:border-slate-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={createForm.proprietario}
                    onChange={(e) => setCreateForm(f => ({ ...f, proprietario: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
                  />
                  <div>
                    <span className="text-sm font-medium text-white">Proprietario dello studio</span>
                    <p className="text-xs text-slate-400">Il proprietario non può essere modificato o rimosso dagli altri admin</p>
                  </div>
                </label>
              )}

              {/* Avviso password auto-generata */}
              <div className="relative overflow-hidden rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/40"></div>
                <div className="flex gap-3 items-start">
                  <div className="mt-0.5 text-amber-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="text-[13px] leading-relaxed text-slate-300">
                    <p className="font-medium text-amber-200/90">
                      Una password temporanea auto-generata verrà inviata al nuovo utente tramite email.
                    </p>
                    <p className="text-slate-400 mt-1">
                      Ricorda all'utente di controllare anche la cartella <span className="text-amber-400 font-bold underline decoration-amber-500/30 underline-offset-2">SPAM</span> se non riceve nulla.
                    </p>
                  </div>
                </div>
              </div>

              {createError && (
                <p className="text-sm text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                  {createError}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium text-sm"
                >
                  {creating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Creazione in corso...</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Crea Utente</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={closeCreateForm}
                  className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-sm"
                >
                  Annulla
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Ricerca */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
        <input
          type="text"
          placeholder="Cerca per email o nome..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-none"
        />
      </div>

      {/* Lista Utenti */}
      {isSuperAdmin && groupedByStudio ? (
        /* Superadmin: raggruppati per studio */
        <div className="space-y-3">
          {Object.entries(groupedByStudio)
            .sort(([keyA, a], [keyB, b]) => {
              // Studio del superadmin sempre primo
              if (keyA === myStudioId) return -1;
              if (keyB === myStudioId) return 1;
              // "Senza studio" sempre ultimo
              if (keyA === '_no_studio') return 1;
              if (keyB === '_no_studio') return -1;
              return a.nome.localeCompare(b.nome);
            })
            .map(([studioKey, group]) => {
              const isOpen = expandedStudios.has(studioKey);
              const pendingCount = group.users.filter(u => u.approved === false).length;
              return (
                <div key={studioKey} className="border border-slate-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleStudio(studioKey)}
                    className="w-full flex items-center justify-between px-5 py-4 bg-slate-800 hover:bg-slate-750 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-9 h-9 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg">
                        <Building2 className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-base font-semibold text-white">{group.nome}</h3>
                        <p className="text-xs text-slate-400">
                          {group.users.length} {group.users.length === 1 ? 'utente' : 'utenti'}
                          {pendingCount > 0 && (
                            <span className="ml-2 text-amber-400">{pendingCount} bloccati</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="space-y-3 p-4 bg-slate-900/50">
                      {group.users.map((user) => renderUserCard(user, false))}
                    </div>
                  )}
                </div>
              );
            })}
          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-slate-400">Nessun utente trovato</div>
          )}
        </div>
      ) : (
        /* Admin singolo studio: lista piatta */
        <div className="space-y-3">
          {filteredUsers.map((user) => renderUserCard(user, false))}
          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-slate-400">Nessun utente trovato</div>
          )}
        </div>
      )}

      {/* Modale conferma eliminazione */}
      {eliminaUtente && (
        <div className="fixed inset-0 z-50 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 transition-opacity duration-300">
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full transform transition-all duration-300 scale-100 opacity-100"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="p-6 sm:p-8">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-red-100 p-3 rounded-full">
                  <Trash2 className="h-6 w-6 text-red-600" aria-hidden="true" />
                </div>
                <div className="ml-4 text-left">
                  <h3 className="text-lg leading-6 font-bold text-gray-900" id="modal-title">
                    Conferma Eliminazione Utente
                  </h3>
                </div>
              </div>
              <div className="mt-4">
                <h2 className="text-sm text-gray-500">
                  Sei sicuro di voler eliminare l'utente: <br />
                  <span className="font-semibold text-gray-900 ml-1">
                    {infoUtente[0]} ({infoUtente[1]})
                  </span> ?
                </h2>
                <p className="mt-2 text-sm font-medium text-red-600">
                  <strong>Attenzione</strong>: Questa operazione è <strong>irreversibile</strong>.<br />
                  Tutti i dati dell'utente verranno eliminati e non saranno in alcun modo recuperabili!
                </p>
              </div>
            </div>
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                <p className="text-sm text-red-800">{errorMessage}</p>
              </div>
            )}
            <div className="px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse sm:gap-3 rounded-b-xl">
              <button
                type="button"
                onClick={() => { handleDeleteUser(String(infoUtente[2])); setErrorMessage(''); setEliminaUtente(false); }}
                className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm transition-colors"
              >
                Sì, Elimina Definitivamente
              </button>
              <button
                type="button"
                onClick={() => { setErrorMessage(''); setEliminaUtente(false); }}
                className="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm transition-colors"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
