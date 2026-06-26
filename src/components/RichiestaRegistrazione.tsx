import { useState, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, Loader2, ArrowLeft, Send, CheckCircle } from 'lucide-react';

interface RichiestaRegistrazioneProps {
  onBack: () => void;
}

export function RichiestaRegistrazione({ onBack }: RichiestaRegistrazioneProps) {
  const [nomeStudio, setNomeStudio] = useState('');
  const [comuneSede, setComuneSede] = useState('');
  const [provinciaSede, setProvinciaSede] = useState('');
  const [viaPiazzaSede, setViaPiazzaSede] = useState('');
  const [numeroCivicoSede, setNumeroCivicoSede] = useState('');
  const [nomeReferente, setNomeReferente] = useState('');
  const [cognomeReferente, setCognomeReferente] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [messaggio, setMessaggio] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { error: insertError } = await supabase.from('studio_requests').insert({
        nome_studio: nomeStudio.trim(),
        nome_referente: nomeReferente.trim(),
        cognome_referente: cognomeReferente.trim(),
        email: email.trim().toLowerCase(),
        telefono: telefono.trim() || null,
        messaggio: messaggio.trim() || null,
        comune_sede: comuneSede.trim() || null,
        provincia_sede: provinciaSede.trim().toUpperCase() || null,
        via_piazza_sede: viaPiazzaSede.trim() || null,
        numero_civico_sede: numeroCivicoSede.trim() || null,
      });

      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (err: any) {
      console.error('Errore invio richiesta:', err);
      setError('Errore durante l\'invio della richiesta. Riprova più tardi.');
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">AdeguataVerifica.Pro</h1>
            <p className="text-slate-300">Sistema di Gestione Antiriciclaggio</p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20">
            <div className="mx-auto w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            </div>

            <h2 className="text-2xl font-semibold text-white text-center mb-4">
              Richiesta Inviata!
            </h2>

            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-emerald-200 text-center">
                La tua richiesta di registrazione per <strong>{nomeStudio}</strong> è stata inviata con successo.
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-4 mb-6 space-y-3 text-sm text-slate-300">
              <div className="flex items-start gap-2">
                <span className="w-2 h-2 bg-emerald-400 rounded-full flex-shrink-0 mt-1.5"></span>
                <span>Quando la richiesta sarà approvata, riceverai le credenziali di accesso all'indirizzo <strong className="text-white">{email}</strong>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-2 h-2 bg-amber-400 rounded-full flex-shrink-0 mt-1.5"></span>
                <span>Sarai configurato come amministratore e proprietario dello studio.</span>
              </div>
            </div>

            <p className="text-center text-xs text-slate-400 mb-6">
              I tempi di risposta sono generalmente di 24-48 ore lavorative.
            </p>

            <button
              onClick={onBack}
              className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Torna al Login
            </button>
          </div>

          <div className="mt-8 text-center text-slate-400 text-sm">
            <p>&copy; 2026 AdeguataVerifica.Pro. Tutti i diritti riservati.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">AdeguataVerifica.Pro</h1>
          <p className="text-slate-300">Sistema di Gestione Antiriciclaggio</p>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-center mb-4">
              <div className="mx-auto w-14 h-14 bg-amber-500/20 rounded-full flex items-center justify-center mb-3">
                <Building2 className="w-7 h-7 text-amber-400" />
              </div>
              <h2 className="text-2xl font-semibold text-white">Registra il tuo Studio</h2>
              <p className="text-sm text-slate-300 mt-1">Richiedi l'attivazione del tuo studio sulla piattaforma</p>
            </div>

            {/* Info processo */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 space-y-1.5 text-xs text-blue-200">
              <p className="font-semibold text-blue-300 text-sm mb-1">Come funziona?</p>
              <p className="flex items-start gap-2">
                <span className="bg-blue-400/30 text-blue-200 rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold">1</span>
                Compila il form con i dati dello studio e i tuoi dati.
              </p>
              <p className="flex items-start gap-2">
                <span className="bg-blue-400/30 text-blue-200 rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold">2</span>
                La richiesta verrà esaminata da un amministratore della piattaforma.
              </p>
              <p className="flex items-start gap-2">
                <span className="bg-blue-400/30 text-blue-200 rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold">3</span>
                Una volta approvata, riceverai le credenziali di accesso via email come primo amministratore dello studio.
              </p>
            </div>

            {/* Sezione Studio */}
            <div className="border-b border-white/10 pb-1">
              <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Dati Studio</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-1">Nome Studio *</label>
              <input
                type="text"
                value={nomeStudio}
                onChange={(e) => setNomeStudio(e.target.value)}
                placeholder="Es. Studio Rossi & Associati"
                required
                disabled={isLoading}
                className="w-full px-4 py-2.5 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 text-slate-800 placeholder-slate-400"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-white mb-1">Comune sede</label>
                <input
                  type="text"
                  value={comuneSede}
                  onChange={(e) => setComuneSede(e.target.value)}
                  placeholder="Es. Milano"
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 text-slate-800 placeholder-slate-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">Prov.</label>
                <input
                  type="text"
                  value={provinciaSede}
                  onChange={(e) => setProvinciaSede(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="MI"
                  maxLength={2}
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 text-slate-800 placeholder-slate-400 uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-white mb-1">Via / Piazza</label>
                <input
                  type="text"
                  value={viaPiazzaSede}
                  onChange={(e) => setViaPiazzaSede(e.target.value)}
                  placeholder="Es. Via Roma"
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 text-slate-800 placeholder-slate-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">N. civico</label>
                <input
                  type="text"
                  value={numeroCivicoSede}
                  onChange={(e) => setNumeroCivicoSede(e.target.value)}
                  placeholder="10/A"
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 text-slate-800 placeholder-slate-400"
                />
              </div>
            </div>

            {/* Sezione Amministratore */}
            <div className="border-b border-white/10 pb-1 pt-1">
              <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider">I tuoi dati (Amministratore)</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-white mb-1">Nome *</label>
                <input
                  type="text"
                  value={nomeReferente}
                  onChange={(e) => setNomeReferente(e.target.value)}
                  placeholder="Mario"
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 text-slate-800 placeholder-slate-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">Cognome *</label>
                <input
                  type="text"
                  value={cognomeReferente}
                  onChange={(e) => setCognomeReferente(e.target.value)}
                  placeholder="Rossi"
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 text-slate-800 placeholder-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-1">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tuaemail@studio.it"
                required
                disabled={isLoading}
                className="w-full px-4 py-2.5 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 text-slate-800 placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-1">Telefono</label>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+39 333 1234567"
                disabled={isLoading}
                className="w-full px-4 py-2.5 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 text-slate-800 placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-1">Note aggiuntive</label>
              <textarea
                value={messaggio}
                onChange={(e) => setMessaggio(e.target.value)}
                placeholder="Informazioni aggiuntive sullo studio o sulla richiesta..."
                rows={3}
                disabled={isLoading}
                className="w-full px-4 py-2.5 bg-white/90 border-2 border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 text-slate-800 placeholder-slate-400 resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-white px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !nomeStudio || !nomeReferente || !cognomeReferente || !email}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Invio in corso...</>
              ) : (
                <><Send className="w-5 h-5" /> Invia Richiesta</>
              )}
            </button>

            <button
              type="button"
              onClick={onBack}
              disabled={isLoading}
              className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Torna al Login
            </button>
          </form>
        </div>

        <div className="mt-8 text-center text-slate-400 text-sm">
          <p>&copy; 2026 AdeguataVerifica.Pro. Tutti i diritti riservati.</p>
        </div>
      </div>
    </div>
  );
}
