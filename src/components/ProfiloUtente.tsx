import { useState, useEffect } from 'react';
import { Card } from './Card';
import { User, CreditCard, Save, Lock, Loader2, Shield, EyeOff, Eye, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useIsAdmin } from '../lib/hooks/useIsAdmin';
import { generateSecurePassword }from '../components/admin/UsersManagement';
import { useToast } from './Toast';

interface UserProfile {
  id?: string;
  user_id: string;
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  partita_iva: string;
  codice_fiscale: string;
  pec: string;
  codice_sdi: string;
  intestazione_fattura: string;
  indirizzo_fatturazione: string;
  cap_fatturazione: string;
  citta_fatturazione: string;
  provincia_fatturazione: string;
}

interface ProfiloUtenteProps {
  onOpenAdmin: () => void;
}

export function ProfiloUtente({ onOpenAdmin }: ProfiloUtenteProps) {
  const toast = useToast();
  const { isAdmin } = useIsAdmin();
  const [activeTab, setActiveTab] = useState<'anagrafica' | 'fatturazione'>('anagrafica');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [profile, setProfile] = useState<UserProfile>({
    user_id: '',
    nome: '',
    cognome: '',
    telefono: '',
    email: '',
    partita_iva: '',
    codice_fiscale: '',
    pec: '',
    codice_sdi: '',
    intestazione_fattura: '',
    indirizzo_fatturazione: '',
    cap_fatturazione: '',
    citta_fatturazione: '',
    provincia_fatturazione: ''
  });

  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isProprietario, setIsProprietario] = useState(false);
  const [isDelegato, setIsDelegato] = useState(false);

  function generatePass() {
    const pwd = generateSecurePassword();
    setNewPassword(pwd);
    setConfirmPassword(pwd);
    setShowNewPassword(true);
    setShowConfirmPassword(true);
  }

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utente non autenticato');

      const { data: profileData, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (profileData) {
        setProfile({
          ...profile,
          ...Object.fromEntries(
            Object.entries(profileData).map(([k, v]) => [k, v ?? ''])
          )
        });
      } else {
        setProfile({
          ...profile,
          user_id: user.id,
          email: user.email || ''
        });
      }

      const isAdminRole = profileData?.role === 'admin' || profileData?.role === 'superadmin';
      const proprietarioFlag = profileData?.proprietario === true;
      if (proprietarioFlag) {
        setIsProprietario(true);
        setIsDelegato(false);
      } else if (isAdminRole && profileData?.studio_id) {
        const { data: studioData } = await supabase
          .from('studi')
          .select('delega_admin_av5')
          .eq('id', profileData.studio_id)
          .single();
        setIsProprietario(false);
        setIsDelegato(!!studioData?.delega_admin_av5);
      } else {
        setIsProprietario(false);
        setIsDelegato(false);
      }
    } catch (error) {
      console.error('Errore caricamento profilo:', error);
      toast.error('Errore nel caricamento del profilo');
    } finally {
      setLoading(false);
    }
  };

  const validatePIva = (piva: string): boolean => {
    return /^\d{11}$/.test(piva);
  };

  const validateCF = (cf: string): boolean => {
    return /^[A-Z0-9]{16}$/i.test(cf);
  };

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validateProfile = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (profile.partita_iva && !validatePIva(profile.partita_iva)) {
      newErrors.partita_iva = 'Partita IVA deve essere di 11 cifre';
    }

    if (profile.codice_fiscale && !validateCF(profile.codice_fiscale)) {
      newErrors.codice_fiscale = 'Codice Fiscale deve essere di 16 caratteri alfanumerici';
    }

    if (profile.pec && !validateEmail(profile.pec)) {
      newErrors.pec = 'Formato email PEC non valido';
    }

    if (profile.cap_fatturazione && !/^\d{5}$/.test(profile.cap_fatturazione)) {
      newErrors.cap_fatturazione = 'CAP deve essere di 5 cifre';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveProfile = async () => {
    if (!validateProfile()) {
      toast.warning('Correggi gli errori nel form prima di salvare');
      return;
    }

    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utente non autenticato');

      const { data: existing } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('user_profiles')
          .update(profile)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_profiles')
          .insert({ ...profile, user_id: user.id });

        if (error) throw error;
      }

      toast.success('Profilo salvato con successo!');
    } catch (error) {
      console.error('Errore salvataggio profilo:', error);
      toast.error('Errore nel salvataggio del profilo');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!password || !newPassword || !confirmPassword) {
      toast.warning('Compila tutti i campi della password');
      return;
    }

    if (newPassword.length < 6) {
      toast.warning('La nuova password deve essere di almeno 6 caratteri');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.warning('Le password non coincidono');
      return;
    }

    try {
      setIsLoading(true);
      setChangingPassword(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) { toast.error('Errore nel recupero utente');  return }

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: password,
      });

      if (loginError) {
        toast.warning('La password corrente non è corretta');
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast.success('Password cambiata con successo!');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Errore cambio password:', error);
      toast.error('Errore nel cambio password: ' + error.message);
    } finally {
      setShowPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setChangingPassword(false);
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profilo Personale</h1>
          <p className="text-gray-600 mt-1">Gestisci i tuoi dati personali{/*e di fatturazione*/}</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              onOpenAdmin();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all shadow-lg"
          >
            <Shield className="w-4 h-4" />
            Admin Panel
          </button>
        )}
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('anagrafica')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors ${
              activeTab === 'anagrafica'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <User className="w-4 h-4" />
            Dati Anagrafici
          </button>
          {/*<button
            onClick={() => setActiveTab('fatturazione')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors ${
              activeTab === 'fatturazione'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Dati Fatturazione
          </button>*/}
        </nav>
      </div>

      {activeTab === 'anagrafica' && (
        <div className="space-y-6">
          <Card title="Dati di Contatto">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
                  <input
                    type="text"
                    value={profile.nome}
                    onChange={(e) => setProfile({ ...profile, nome: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Mario"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cognome</label>
                  <input
                    type="text"
                    value={profile.cognome}
                    onChange={(e) => setProfile({ ...profile, cognome: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Rossi"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-xs text-gray-500">(non modificabile)</span>
                </label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Telefono</label>
                <input
                  type="tel"
                  value={profile.telefono}
                  onChange={(e) => setProfile({ ...profile, telefono: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="+39 xxx xxxxxxx"
                />
              </div>

              {isProprietario && (
                <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 min-w-5 text-amber-600 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-semibold mb-1">Sei il proprietario dello studio</p>
                      <p>
                        Per precompilare l'<span className="font-semibold">AV.5 - Attestazione del Professionista</span> con i tuoi dati di iscrizione all'Albo (sede, n. iscrizione, sezione), inserisci queste informazioni in <span className="font-semibold">Admin Panel → Il mio Studio</span>, sezione "Dati del Professionista". Da lì puoi anche delegare la gestione di questi dati agli altri admin del tuo studio.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isDelegato && (
                <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 min-w-5 text-amber-600 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-semibold mb-1">Delega del proprietario dello studio</p>
                      <p>
                        Il proprietario dello studio ti ha delegato la gestione dei dati di iscrizione all'Albo del professionista, utilizzati per precompilare l'<span className="font-semibold">AV.5 - Attestazione del Professionista</span>. Puoi visualizzarli e modificarli in <span className="font-semibold">Admin Panel → Il mio Studio</span>, sezione "Dati del Professionista". Verifica con attenzione i dati salvati: saranno utilizzati nei moduli generati da tutti i membri dello studio.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvataggio...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salva Dati
                  </>
                )}
              </button>
            </div>
          </Card>

          <Card title="Cambio Password">
            <div className="space-y-4">
              <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6">
                <div className="flex items-center">
                  <Shield className="w-5 h-5 min-w-5 text-amber-600 mr-3" />
                  <p className="text-sm text-amber-700 font-sm">
                    <span className='font-semibold'>Importante</span>: Se generi una nuova password, assicurati di copiarla e conservarla in un luogo sicuro prima di procedere con il salvataggio.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password Attuale</label>
                <div className="relative">{/*max-w-xl*/}
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={showPassword ? 'Password' :"••••••••"}
                    required
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-600 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

             <div className='pt-5'>
               <div className="flex items-center justify-between mb-2 mr-4">{/*max-w-xl*/}
                 <label className="block text-sm font-medium text-gray-700">Nuova Password</label>
                 <button
                   type="button"
                   onClick={generatePass}
                   disabled={isLoading}
                   className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                 >
                   <Lock className="w-3 h-3" />
                   Genera Password
                 </button>
               </div>
               <div className="relative">
                 <input
                   id="new-password"
                   type={showNewPassword ? 'text' : 'password'}
                   value={newPassword}
                   onChange={(e) => setNewPassword(e.target.value)}
                   placeholder={showNewPassword ? 'Password' :"••••••••"}
                   required
                   disabled={isLoading}
                   minLength={6}
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                 />
                 <button
                   type="button"
                   onClick={() => setShowNewPassword(!showNewPassword)}
                   disabled={isLoading}
                   className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-600 hover:text-slate-800 disabled:opacity-50 transition-colors"
                 >
                   {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                 </button>
               </div>
               <p className="text-xs text-gray-500 mt-1">Minimo 6 caratteri</p>
             </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Conferma Nuova Password</label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={showConfirmPassword ? 'Password' :"••••••••"}
                    required
                    disabled={isLoading}
                    minLength={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-600 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label={showConfirmPassword ? 'Nascondi password' : 'Mostra password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cambio in corso...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      Cambia Password
                    </>
                  )}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'fatturazione' && (
        <Card title="Dati di Fatturazione">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Partita IVA</label>
                <input
                  type="text"
                  value={profile.partita_iva}
                  onChange={(e) => setProfile({ ...profile, partita_iva: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.partita_iva ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="12345678901"
                  maxLength={11}
                />
                {errors.partita_iva && (
                  <p className="text-xs text-red-600 mt-1">{errors.partita_iva}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Codice Fiscale</label>
                <input
                  type="text"
                  value={profile.codice_fiscale}
                  onChange={(e) => setProfile({ ...profile, codice_fiscale: e.target.value.toUpperCase() })}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.codice_fiscale ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="RSSMRA80A01H501X"
                  maxLength={16}
                />
                {errors.codice_fiscale && (
                  <p className="text-xs text-red-600 mt-1">{errors.codice_fiscale}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email PEC</label>
                <input
                  type="email"
                  value={profile.pec}
                  onChange={(e) => setProfile({ ...profile, pec: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.pec ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="esempio@pec.it"
                />
                {errors.pec && (
                  <p className="text-xs text-red-600 mt-1">{errors.pec}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Codice SDI</label>
                <input
                  type="text"
                  value={profile.codice_sdi}
                  onChange={(e) => setProfile({ ...profile, codice_sdi: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="XXXXXXX"
                  maxLength={7}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Intestazione Fattura</label>
              <input
                type="text"
                value={profile.intestazione_fattura}
                onChange={(e) => setProfile({ ...profile, intestazione_fattura: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Studio Professionale Mario Rossi"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Indirizzo Fatturazione</label>
              <input
                type="text"
                value={profile.indirizzo_fatturazione}
                onChange={(e) => setProfile({ ...profile, indirizzo_fatturazione: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Via Roma, 1"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">CAP</label>
                <input
                  type="text"
                  value={profile.cap_fatturazione}
                  onChange={(e) => setProfile({ ...profile, cap_fatturazione: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.cap_fatturazione ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="00100"
                  maxLength={5}
                />
                {errors.cap_fatturazione && (
                  <p className="text-xs text-red-600 mt-1">{errors.cap_fatturazione}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Città</label>
                <input
                  type="text"
                  value={profile.citta_fatturazione}
                  onChange={(e) => setProfile({ ...profile, citta_fatturazione: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Roma"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Provincia</label>
                <input
                  type="text"
                  value={profile.provincia_fatturazione}
                  onChange={(e) => setProfile({ ...profile, provincia_fatturazione: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="RM"
                  maxLength={2}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvataggio...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salva Dati
                  </>
                )}
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
