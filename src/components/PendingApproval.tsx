import { ShieldOff, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useState } from 'react';

export function PendingApproval() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
      // Il componente App.tsx rileverà automaticamente il logout
    } catch (error) {
      console.error('Errore durante il logout:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">AdeguataVerifica.Pro</h1>
          <p className="text-slate-300">Sistema di Gestione Antiriciclaggio</p>
        </div>

        {/* Card Principale */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20">
          {/* Icona */}
          <div className="mx-auto w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
            <ShieldOff className="w-12 h-12 text-red-400" />
          </div>

          {/* Titolo */}
          <h2 className="text-2xl font-semibold text-white text-center mb-4">
            Account bloccato
          </h2>

          {/* Messaggio */}
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <ShieldOff className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-200">
                <p className="mb-2">
                  Il tuo account è stato sospeso da un amministratore.
                </p>
                <p>
                  Per maggiori informazioni contatta l'amministratore del tuo studio.
                </p>
              </div>
            </div>
          </div>

          {/* Nota */}
          <p className="text-center text-xs text-slate-400 mb-6">
            Se l'accesso verrà ripristinato, sarai reindirizzato automaticamente.
          </p>

          {/* Pulsante Logout */}
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoggingOut ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Disconnessione...
              </>
            ) : (
              <>
                <LogOut className="w-5 h-5" />
                Esci
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-slate-400 text-sm">
          <p>© 2026 AdeguataVerifica.Pro. Tutti i diritti riservati.</p>
        </div>
      </div>
    </div>
  );
}
