import { useState, useEffect, useCallback, ReactNode } from 'react';
import { Shield, X, ChevronDown, ChevronUp } from 'lucide-react';
import { createPortal } from 'react-dom';
import { STUDIO_INFO, POLICY_VERSION } from '../lib/legal/studioInfo';
import {
  writeAcknowledgment,
  needsAcknowledgment,
} from '../lib/legal/consentManager';
import { persistAcknowledgmentToDb } from '../lib/legal/consentLog';
import { LegalDoc, type LegalDocId } from './legal/LegalDocs';

/* ------------------------------------------------------------------ */
/*  Modal: documenti legali (Privacy / Cookie / T&C)                   */
/* ------------------------------------------------------------------ */
type LegalTab = LegalDocId;

function LegalModal({ initialTab = 'privacy', onClose }: { initialTab?: LegalTab; onClose: () => void }) {
  const [tab, setTab] = useState<LegalTab>(initialTab);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Documenti legali</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex border-b border-gray-200 px-6">
          <TabBtn active={tab === 'privacy'} onClick={() => setTab('privacy')}>Privacy Policy</TabBtn>
          <TabBtn active={tab === 'cookie'} onClick={() => setTab('cookie')}>Cookie Policy</TabBtn>
          <TabBtn active={tab === 'terms'} onClick={() => setTab('terms')}>Termini e Condizioni</TabBtn>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm text-gray-700 leading-relaxed">
          <LegalDoc id={tab} />
          <p className="text-xs text-gray-400 italic pt-4 border-t border-gray-100">
            Versione documenti: {POLICY_VERSION}
          </p>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Banner informativo (presa visione)                                 */
/* ------------------------------------------------------------------ */
// Riapre il banner privacy/cookie da qualunque punto dell'app.
export function openPrivacyBanner() {
  window.dispatchEvent(new Event('aml:open-privacy-banner'));
}

export function PrivacyBanner() {
  // Apri automaticamente alla prima visita o quando POLICY_VERSION cambia.
  const [visible, setVisible] = useState(() => needsAcknowledgment());
  const [showLegal, setShowLegal] = useState<LegalTab | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Ctrl+B per aprire/chiudere il banner.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        setVisible(v => !v);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Apertura programmatica via openPrivacyBanner().
  useEffect(() => {
    function handleOpen() { setVisible(true); }
    window.addEventListener('aml:open-privacy-banner', handleOpen);
    return () => window.removeEventListener('aml:open-privacy-banner', handleOpen);
  }, []);

  // Blocca lo scroll del body finché il banner è aperto.
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  const handleAcknowledge = useCallback(() => {
    const record = writeAcknowledgment();
    setVisible(false);
    void persistAcknowledgmentToDb(record);
  }, []);

  if (!visible) {
    return showLegal ? <LegalModal initialTab={showLegal} onClose={() => setShowLegal(null)} /> : null;
  }

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[150] bg-black/10 flex items-end sm:items-end justify-center p-0 sm:p-4">
          <div className="w-full max-w-4xl animate-slide-up sm:px-0 px-0">
            <div className="bg-white sm:border border-gray-200 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden mx-0 sm:mx-4">
              <div className="px-5 py-4 flex items-start gap-4">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-blue-600" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">
                    Privacy e cookie
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    La piattaforma utilizza esclusivamente <strong>cookie tecnici</strong> indispensabili
                    al suo funzionamento (autenticazione, sicurezza, memorizzazione di questa presa
                    visione). Ai sensi dell'art. 122 del Codice Privacy <strong>non è richiesto il tuo
                    consenso</strong>: questa è un'informativa di presa visione.
                    Non utilizziamo cookie di profilazione, di marketing né di analisi statistica.
                  </p>

                  {expanded && (
                    <div className="mt-3 text-sm text-gray-600 space-y-2 border-t border-gray-100 pt-3">
                      <p>
                        I dati personali sono trattati per finalità di adempimento agli obblighi
                        antiriciclaggio (D.Lgs. 231/2007) e per la gestione del rapporto professionale,
                        nel rispetto del GDPR (Reg. UE 2016/679). Conservazione: <strong>10 anni</strong>.
                      </p>
                      <p>
                        Diritti ex artt. 15-22 GDPR (accesso, rettifica, cancellazione, portabilità,
                        opposizione). Contatto Titolare: {STUDIO_INFO.email}.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <button
                      onClick={() => setExpanded(e => !e)}
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {expanded ? 'Meno dettagli' : 'Più dettagli'}
                    </button>
                    <button
                      onClick={() => setShowLegal('privacy')}
                      className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors"
                    >
                      Privacy Policy
                    </button>
                    <button
                      onClick={() => setShowLegal('cookie')}
                      className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors"
                    >
                      Cookie Policy
                    </button>
                    <button
                      onClick={() => setShowLegal('terms')}
                      className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors"
                    >
                      Termini e Condizioni
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setVisible(false)}
                  className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Chiudi (Ctrl+B)"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div className="px-5 pb-4 pt-1 flex justify-end">
                <button
                  onClick={handleAcknowledge}
                  className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Ho capito
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showLegal && <LegalModal initialTab={showLegal} onClose={() => setShowLegal(null)} />}
    </>
  );
}
