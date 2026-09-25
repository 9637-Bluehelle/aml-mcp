import { useState } from 'react';
import { X, Send, Bug, Database, Lightbulb, AlertTriangle } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

interface SegnalazioneModalProps {
  show: boolean;
  onClose: () => void;
}

const CATEGORIE = [
  { id: 'bug', label: 'Bug / Malfunzionamento', icon: Bug, color: 'text-red-600 bg-red-50 border-red-200' },
  { id: 'dati', label: 'Dati inesatti o obsoleti', icon: Database, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { id: 'suggerimento', label: 'Suggerimento / Miglioramento', icon: Lightbulb, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'altro', label: 'Altro', icon: AlertTriangle, color: 'text-gray-600 bg-gray-50 border-gray-200' },
] as const;

type Categoria = typeof CATEGORIE[number]['id'];

export function SegnalazioneModal({ show, onClose }: SegnalazioneModalProps) {
  useScrollLock(show);
  const toast = useToast();
  const [categoria, setCategoria] = useState<Categoria | ''>('');
  const [oggetto, setOggetto] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [sezione, setSezione] = useState('');
  const [isSending, setIsSending] = useState(false);

  const SEZIONI = [
    'Dashboard',
    'Anagrafica',
    'Fascicolo Cliente',
    'RT1 - Autovalutazione',
    'RT2 - Adeguata Verifica',
    'RT3 - Monitoraggio',
    'Alert',
    'Profilo Utente',
    'Impostazioni',
    'Altro / Generale',
  ];

  const resetForm = () => {
    setCategoria('');
    setOggetto('');
    setDescrizione('');
    setSezione('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoria || !oggetto.trim() || !descrizione.trim()) return;

    setIsSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utente non autenticato');

      const { error } = await supabase.from('segnalazioni').insert({
        user_id: user.id,
        categoria,
        oggetto: oggetto.trim(),
        descrizione: descrizione.trim(),
        sezione: sezione || null,
      });

      if (error) throw error;

      toast.success('Segnalazione inviata con successo! Grazie per il tuo contributo.');
      resetForm();
      onClose();
    } catch (error) {
      console.error('Errore invio segnalazione:', error);
      toast.error('Errore durante l\'invio della segnalazione. Riprova.');
    } finally {
      setIsSending(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Invia una segnalazione</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Categoria */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo di segnalazione *</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIE.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoria(cat.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      categoria === cat.id
                        ? `${cat.color} border-current ring-1 ring-current`
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sezione */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sezione interessata</label>
            <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
            <select
              value={sezione}
              onChange={(e) => setSezione(e.target.value)}
              className="w-full rounded-lg bg-white text-sm focus:outline-none focus:ring-0"
            >
              <option value="">-- Seleziona (opzionale) --</option>
              {SEZIONI.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            </div>
          </div>

          {/* Oggetto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Oggetto *</label>
            <input
              type="text"
              value={oggetto}
              onChange={(e) => setOggetto(e.target.value)}
              placeholder="Breve descrizione del problema"
              maxLength={150}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Descrizione */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione dettagliata *</label>
            <textarea
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Descrivi il problema nel dettaglio: cosa è successo, cosa ti aspettavi, eventuali passi per riprodurlo..."
              rows={4}
              maxLength={2000}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              required
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{descrizione.length}/2000</p>
          </div>

          {/* Azioni */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { resetForm(); onClose(); }}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={!categoria || !oggetto.trim() || !descrizione.trim() || isSending}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {isSending ? 'Invio in corso...' : 'Invia segnalazione'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
