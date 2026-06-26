import { CheckCircle, LogIn } from 'lucide-react';
import { useState, useEffect } from 'react';

interface EmailConfirmedProps {
  onGoToLogin: () => void;
}

export function EmailConfirmed({ onGoToLogin }: EmailConfirmedProps) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onGoToLogin();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onGoToLogin]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">AdeguataVerifica.Pro</h1>
          <p className="text-slate-300">Sistema di Gestione Antiriciclaggio</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20">
          {/* Icona */}
          <div className="mx-auto w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
            <CheckCircle className="w-14 h-14 text-emerald-400" />
          </div>

          {/* Titolo */}
          <h2 className="text-2xl font-semibold text-white text-center mb-4">
            Email Confermata!
          </h2>

          {/* Messaggio */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-emerald-200 text-center">
              Il tuo indirizzo email è stato verificato con successo.<br />
              Ora puoi accedere alla piattaforma con le tue credenziali.
            </p>
          </div>

          {/* Countdown */}
          <p className="text-center text-sm text-slate-400 mb-6">
            Verrai reindirizzato al login tra <span className="text-white font-semibold">{countdown}</span> secondi...
          </p>

          {/* Pulsante */}
          <button
            onClick={onGoToLogin}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <LogIn className="w-5 h-5" />
            Vai al Login
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-slate-400 text-sm">
          <p>&copy; 2026 AdeguataVerifica.Pro. Tutti i diritti riservati.</p>
        </div>
      </div>
    </div>
  );
}
