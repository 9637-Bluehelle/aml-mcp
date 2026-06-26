import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { checkAccountLockout, recordLoginAttempt, selfUnlockAccount, sendLockoutEmail } from '../lib/loginSecurity';
import { useToast } from './Toast';
import { LogIn, Loader2, ArrowLeft, Mail, KeyRound, Eye, EyeOff, Building2, Cookie } from 'lucide-react';
import { openPrivacyBanner } from './PrivacyBanner';

// Il token OTP di recovery è monouso: dopo un updateUser fallito non è più
// riutilizzabile, quindi riportiamo l'utente a "Recupera Password" per
// richiederne uno nuovo.
const mapUpdatePasswordError = (err: any): string => {
  const msg = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  const suffix = ' Per riprovare richiedi un nuovo codice OTP inserendo di nuovo la tua email.';

  if (code === 'same_password' || msg.includes('should be different') || msg.includes('same as the old')) {
    return 'La nuova password deve essere diversa da quella attuale.' + suffix;
  }
  if (code === 'weak_password' || msg.includes('weak') || msg.includes('pwned') || msg.includes('leaked') || msg.includes('compromis')) {
    return 'Password troppo debole o compromessa. Scegli una password più robusta.' + suffix;
  }
  if (err?.status === 422) {
    return 'Password non valida.' + suffix;
  }
  return `Errore nell'aggiornamento della password: ${err?.message || err}.` + suffix;
};

type ViewMode = 'login' | 'forgot-password' | 'reset-password';

interface LoginProps {
  onLoginSuccess: () => void;
  onRequestRegistration: () => void;
}

export function Login({ onLoginSuccess, onRequestRegistration }: LoginProps) {

  const toast = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('login');
  const [otpCode, setOtpCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Banner post-errore PKCE: App.tsx setta il flag se exchangeCodeForSession
  // fallisce; lo leggiamo una volta e puliamo sessionStorage.
  useEffect(() => {
    if (sessionStorage.getItem('pkce_error')) {
      setError('Autenticazione non completata. Effettua nuovamente l\'accesso.');
      sessionStorage.removeItem('pkce_error');
    }
    const resetErr = sessionStorage.getItem('reset_password_error');
    if (resetErr) {
      sessionStorage.removeItem('reset_password_error');
      toast.error(resetErr, 20000);
      setViewMode('forgot-password');
    }
  }, [toast]);

  const lockoutMessage = "Account bloccato per troppi tentativi falliti. Per sbloccare il tuo account puoi recuperare la password oppure contattare l'assistenza.";
  const ipRateLimitMessage = "Troppi tentativi di accesso da questa rete. Attendi qualche minuto prima di riprovare.";

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const preCheck = await checkAccountLockout(email);
      if (preCheck.locked) {
        setError(preCheck.reason === 'ip_rate_limited' ? ipRateLimitMessage : lockoutMessage);
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        const msg = signInError.message ?? '';

        if (msg.includes('Email not confirmed')) {
          setError('Il tuo account è stato bloccato. Contatta il tuo amministratore per avere maggiori informazioni.');
          return;
        }

        // Solo "Invalid login credentials" conta come tentativo fallito ai fini
        // del lockout: evita falsi positivi su 5xx / rate limit / errori di rete.
        if (!msg.includes('Invalid login credentials')) {
          setError('Errore durante il login. Riprova più tardi');
          return;
        }

        const result = await recordLoginAttempt(email, false);

        if (result.just_locked) {
          await sendLockoutEmail(email);
          setError(lockoutMessage);
        } else if (result.locked) {
          setError(result.reason === 'ip_rate_limited' ? ipRateLimitMessage : lockoutMessage);
        } else if (
          typeof result.attempts_remaining === 'number' &&
          result.attempts_remaining >= 1 &&
          result.attempts_remaining <= 4
        ) {
          setError(`Password Errata. ${result.attempts_remaining} su 5 tentativi rimasti.              l'Account verrà bloccato per sicurezza e potrà essere sbloccato recuperando la password oppure contattando il supporto.`);
        } else {
          setError('Email o password non corretti');
        }
        return;
      }

      if (data.session) {
        await recordLoginAttempt(email, true);
        onLoginSuccess();
      }
    } catch (err: any) {
      console.error('Errore login:', err);
      setError('Errore durante il login. Riprova più tardi');
    } finally {
      setIsLoading(false);
    }
  };

  const sendResetOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      /*const { error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: false,
        },
      });*/
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;

      setSuccessMessage('Codice inviato! Controlla la tua email.');
      setTimeout(() => { setViewMode('reset-password'); setSuccessMessage(''); }, 1500);
    } catch (err: any) {
      if (err.message.includes('User not found')) {
        setError('Questa email non è registrata.');
      } else {
        setError("Errore durante l'invio del codice.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (newPassword !== confirmPassword) {
        setError("Le password non corrispondono");
        setIsLoading(false);
        return;
      }

      if (newPassword.length < 6) {
        setError("La password deve avere almeno 6 caratteri");
        setIsLoading(false);
        return;
      }

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: 'recovery',
      });

      if (verifyError) throw verifyError;

      if (data.user) {
        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (updateError) {
          // Login verrà smontato dal SIGNED_OUT: passiamo il messaggio
          // tramite sessionStorage così il prossimo mount mostra il toast
          // e riapre la vista "Recupera Password" per richiedere un nuovo OTP.
          sessionStorage.setItem('reset_password_error', mapUpdatePasswordError(updateError));
          await supabase.auth.signOut();
          throw updateError;
        }

        // Self-unlock: avendo dimostrato il possesso dell'email con l'OTP e
        // impostato una nuova password, sblocchiamo l'eventuale lockout.
        await selfUnlockAccount();

        setSuccessMessage('Password aggiornata!');
        onLoginSuccess();
      } else {
        throw new Error('Verifica riuscita ma nessuna sessione utente stabilita.');
      }
    } catch (err: any) {
      setError(`Errore: ${err}`);
    } finally {
      await supabase.auth.signOut();
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Titolo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">AdeguataVerifica.Pro</h1>
          <p className="text-slate-300">Sistema di Gestione Antiriciclaggio</p>
        </div>

        {/* Form Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20">

          {/* LOGIN */}
          {viewMode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-semibold text-white">Accedi</h2>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@esempio.it"
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 placeholder-slate-400"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-white mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                    className="w-full px-4 py-3 pr-12 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-slate-800"
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


              {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-white px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !email || !password}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-500 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Accesso in corso...</>
                ) : (
                  <><LogIn className="w-5 h-5" /> ACCEDI</>
                )}
              </button>

              <div className="mt-6 text-center space-y-3">
                <button
                  type="button"
                  onClick={() => { setViewMode('forgot-password'); setError(null); }}
                  className="text-sm text-slate-300 hover:text-white transition-colors"
                >
                  <div className="inline-flex items-center gap-2">
                    <KeyRound className="w-4 h-4" />
                    Password dimenticata?
                  </div>
                </button>
                <div className="border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={onRequestRegistration}
                    className="text-sm text-amber-300 hover:text-amber-200 transition-colors"
                  >
                    <div className="inline-flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Registra il tuo Studio
                    </div>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* RECUPERA PASSWORD */}
          {viewMode === 'forgot-password' && (
            <form onSubmit={sendResetOtp} className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-semibold text-white mb-2">Recupera Password</h2>
                <p className="text-sm text-slate-300">
                  Inserisci la tua email per ricevere un codice OTP<br/> per confermare il reset.
                </p>
              </div>

              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-white mb-2">
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@esempio.it"
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 placeholder-slate-400"
                />
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-white px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="bg-emerald-500/20 border border-emerald-500/50 text-white px-4 py-3 rounded-lg text-sm">
                  <div className="flex items-start gap-2">
                    <Mail className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <span>{successMessage}</span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={isLoading || !email}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Invio in corso...</>
                  ) : (
                    <><Mail className="w-5 h-5" /> Invia Email</>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setViewMode('login'); setError(null); setSuccessMessage(null); setEmail('')}}
                  disabled={isLoading}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Torna al Login
                </button>
              </div>
            </form>
          )}

          {/* RESET PASSWORD */}
          {viewMode === 'reset-password' && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-semibold text-white mb-2">Nuova Password</h2>
                <p className="text-sm text-slate-300">Inserisci la tua nuova password</p>
              </div>

              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-white mb-2">
                  Nuova Password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                    minLength={6}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore
                    data-bwignore
                    className="w-full px-4 py-3 pr-12 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-600 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label={showNewPassword ? 'Nascondi password' : 'Mostra password'}
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-300 mt-1">Minimo 6 caratteri</p>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-white mb-2">
                  Conferma Password
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                    minLength={6}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore
                    data-bwignore
                    className="w-full px-4 py-3 pr-12 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-slate-800"
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

                <div className="mt-6">
                  <label htmlFor="otp-code" className="block text-sm font-medium text-white mb-2">
                    Codice di Verifica *
                  </label>
                  <input
                    id="otp-code"
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    required
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 placeholder-slate-400 text-center text-2xl tracking-widest font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-2 text-center">Controlla anche la cartella spam</p>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-white px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="bg-emerald-500/20 border border-emerald-500/50 text-white px-4 py-3 rounded-lg text-sm">
                  {successMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !newPassword || !confirmPassword || !otpCode}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Aggiornamento...</>
                ) : (
                  <><KeyRound className="w-5 h-5" /> Aggiorna Password</>
                )}
              </button>
              <button
                  type="button"
                  onClick={() => { setViewMode('login'); setError(null); setSuccessMessage(null); setEmail(''); setNewPassword(''); setConfirmPassword(''); setOtpCode('') }}
                  disabled={isLoading}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Torna al Login
                </button>
            </form>
          )}
        </div>

        <div className="mt-8 text-center text-slate-400 text-sm space-y-2">
          <p>© 2026 AdeguataVerifica.Pro. Tutti i diritti riservati.</p>
          <button
            type="button"
            onClick={openPrivacyBanner}
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 underline underline-offset-2 transition-colors"
          >
            <Cookie className="w-3.5 h-3.5" />
            Privacy & Cookie
          </button>
        </div>
      </div>
    </div>
  );
}