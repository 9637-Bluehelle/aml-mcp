import { ReactNode } from 'react';
import { Cookie, ExternalLink, User } from 'lucide-react';
import { STUDIO_INFO, DPO_INFO, POLICY_VERSION } from '../../lib/legal/studioInfo';
import { THIRD_PARTIES, COOKIE_REGISTRY } from '../../lib/legal/thirdParties';

export type LegalDocId = 'privacy' | 'cookie' | 'terms';

export const LEGAL_DOC_LABEL: Record<LegalDocId, string> = {
  privacy: 'Privacy Policy',
  cookie: 'Cookie Policy',
  terms: 'Termini e Condizioni',
};

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
      {children}
    </div>
  );
}

export function PrivacyContent() {
  return (
    <>
      <p className="text-xs text-gray-400 italic">
        Ai sensi degli artt. 13-14 del Regolamento (UE) 2016/679 (GDPR) e del D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018
      </p>

      <Section title="1. Titolare del trattamento">
        <p>
          Il Titolare del trattamento dei dati personali è <strong>{STUDIO_INFO.nome}</strong>,
          con sede in {STUDIO_INFO.indirizzo}, P.IVA {STUDIO_INFO.partitaIva},
          PEC: {STUDIO_INFO.pec}, e-mail: {STUDIO_INFO.email}, tel.: {STUDIO_INFO.telefono}.
        </p>
      </Section>

      <Section title="2. Responsabile della Protezione dei Dati (DPO)">
        <p>
          Il Responsabile della Protezione dei Dati (DPO) è <strong>{DPO_INFO.nome}</strong>,
          contattabile all'indirizzo: {DPO_INFO.email}.
        </p>
      </Section>

      <Section title="3. Finalità e base giuridica del trattamento">
        <p>I dati personali sono trattati per le seguenti finalità:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            <strong>Adempimenti antiriciclaggio</strong> — adeguata verifica della clientela, conservazione
            dei dati, segnalazione di operazioni sospette ai sensi del D.Lgs. 231/2007 e successive modifiche.
            Base giuridica: <em>obbligo legale</em> (art. 6.1.c GDPR).
          </li>
          <li>
            <strong>Gestione del rapporto professionale</strong> — esecuzione dell'incarico conferito dal
            cliente. Base giuridica: <em>esecuzione contrattuale</em> (art. 6.1.b GDPR).
          </li>
          <li>
            <strong>Obblighi di legge e regolamentari</strong> — adempimenti fiscali, contabili, previdenziali.
            Base giuridica: <em>obbligo legale</em> (art. 6.1.c GDPR).
          </li>
          <li>
            <strong>Funzionamento della piattaforma</strong> — autenticazione utenti, log di accesso, gestione
            ruoli e permessi. Base giuridica: <em>legittimo interesse</em> (art. 6.1.f GDPR).
          </li>
        </ul>
      </Section>

      <Section title="4. Categorie di dati trattati">
        <ul className="list-disc pl-5 space-y-1">
          <li>Dati anagrafici e di contatto (nome, cognome, codice fiscale, indirizzo, telefono, e-mail)</li>
          <li>Dati identificativi (documento d'identità, tessera sanitaria)</li>
          <li>Dati economico-patrimoniali (reddito, patrimonio, operazioni finanziarie)</li>
          <li>Dati relativi all'attività professionale e societaria</li>
          <li>Dati di accesso alla piattaforma (credenziali, log, indirizzo IP)</li>
        </ul>
      </Section>

      <Section title="5. Destinatari dei dati e responsabili esterni">
        <p>I dati possono essere comunicati a:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Unità di Informazione Finanziaria (UIF) per le segnalazioni di operazioni sospette</li>
          <li>Autorità giudiziarie e di vigilanza, ove previsto dalla legge</li>
          <li>Collaboratori e professionisti dello studio autorizzati al trattamento</li>
          <li>Fornitori di servizi tecnologici nominati responsabili del trattamento ex art. 28 GDPR (vedi elenco sotto)</li>
        </ul>
        <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Fornitore</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Finalità</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Paese</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Informativa</th>
              </tr>
            </thead>
            <tbody>
              {THIRD_PARTIES.map(tp => (
                <tr key={tp.nome} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium">{tp.nome}</td>
                  <td className="px-3 py-2">{tp.finalita}</td>
                  <td className="px-3 py-2">{tp.paese}</td>
                  <td className="px-3 py-2">
                    <a
                      href={tp.privacyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      Link <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Eventuali trasferimenti verso Paesi terzi avvengono sulla base delle Clausole Contrattuali Standard
          approvate dalla Commissione Europea (decisione 2021/914).
        </p>
      </Section>

      <Section title="6. Periodo di conservazione">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Dati antiriciclaggio:</strong> 10 anni dalla cessazione del rapporto (art. 31 D.Lgs. 231/2007)</li>
          <li><strong>Dati contrattuali e contabili:</strong> 10 anni (art. 2220 c.c.)</li>
          <li><strong>Registri dei consensi:</strong> per tutta la durata del trattamento e fino a 10 anni successivi</li>
          <li><strong>Dati di accesso alla piattaforma:</strong> durata del rapporto + tempo necessario alla tutela dei diritti</li>
        </ul>
      </Section>

      <Section title="7. Diritti dell'interessato">
        <p>In qualità di interessato, Lei ha diritto di:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Accedere ai propri dati personali (art. 15 GDPR)</li>
          <li>Ottenere la rettifica dei dati inesatti (art. 16 GDPR)</li>
          <li>Ottenere la cancellazione dei dati, ove applicabile (art. 17 GDPR)</li>
          <li>Limitare il trattamento (art. 18 GDPR)</li>
          <li>Ricevere i dati in formato strutturato — portabilità (art. 20 GDPR)</li>
          <li>Opporsi al trattamento (art. 21 GDPR)</li>
          <li>Proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it)</li>
        </ul>
        <p className="mt-2">
          Per esercitare tali diritti, scrivere a: {STUDIO_INFO.pec} o {STUDIO_INFO.email}.
        </p>
      </Section>

      <Section title="8. Natura del conferimento">
        <p>
          Il conferimento dei dati per le finalità antiriciclaggio è <strong>obbligatorio</strong> ai
          sensi di legge. Il rifiuto di fornire tali dati comporta l'impossibilità di instaurare o
          proseguire il rapporto professionale (art. 42, D.Lgs. 231/2007).
        </p>
      </Section>

      <Section title="9. Processo decisionale automatizzato">
        <p>
          La piattaforma utilizza algoritmi di scoring del rischio (autovalutazione, adeguata verifica,
          monitoraggio costante) come strumento di supporto al professionista. Le decisioni finali sono
          sempre assunte dal Titolare o dai suoi collaboratori autorizzati. Non è previsto alcun processo
          decisionale interamente automatizzato con effetti giuridici significativi sull'interessato.
        </p>
      </Section>

      <Section title="10. Sicurezza dei dati">
        <p>
          I dati sono trattati mediante misure tecniche e organizzative adeguate: cifratura TLS in transito
          e a riposo, controllo degli accessi basato su ruoli (RBAC), autenticazione sicura con account
          lockout, log di audit, backup periodici, policy di gestione degli incidenti di sicurezza.
        </p>
      </Section>
    </>
  );
}

export function CookieContent() {
  return (
    <>
      <p className="text-xs text-gray-400 italic">
        Informativa cookie ai sensi del Provvedimento del Garante Privacy del 10 giugno 2021 e dell'art. 122 del Codice Privacy
      </p>

      <Section title="Cosa sono i cookie e le tecnologie simili">
        <p>
          I cookie sono piccoli file di testo memorizzati sul dispositivo dell'utente. La piattaforma
          utilizza anche tecnologie equivalenti di archiviazione locale del browser per finalità
          tecniche.
        </p>
      </Section>

      <Section title="Categorie utilizzate">
        <p>
          La piattaforma utilizza <strong>esclusivamente cookie tecnici/necessari</strong>,
          indispensabili al funzionamento del servizio (autenticazione, sicurezza, memorizzazione
          della presa visione di questa informativa). Tali cookie <strong>non richiedono il consenso
          dell'utente</strong> ai sensi dell'art. 122 del Codice Privacy e del Provvedimento del
          Garante del 10 giugno 2021.
        </p>
        <p className="mt-2">
          <strong>Non sono installati</strong> cookie di profilazione, di marketing, di analisi
          statistica o di terze parti per finalità diverse da quelle tecniche.
        </p>
      </Section>

      <Section title="Elenco cookie e archiviazione locale">
        <div className="border border-gray-200 rounded-lg overflow-auto max-h-[60vh]">
          <table className="text-xs min-w-[720px] w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap">Identificativo</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Finalità</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Perché è obbligatorio</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap">Durata</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap">Fornitore</th>
              </tr>
            </thead>
            <tbody>
              {COOKIE_REGISTRY.map(c => (
                <tr key={c.nomeTecnico} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{c.etichetta}</div>
                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">rif. tecnico: {c.nomeTecnico}</div>
                  </td>
                  <td className="px-3 py-2">{c.finalita}</td>
                  <td className="px-3 py-2">{c.obbligatorio}</td>
                  <td className="px-3 py-2">{c.durata}</td>
                  <td className="px-3 py-2">{c.fornitore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Presa visione dell'informativa">
        <p>
          Trattandosi esclusivamente di cookie tecnici, non viene richiesto un consenso ma una
          semplice <strong>presa visione</strong> dell'informativa, registrata cliccando "Ho capito"
          nel banner. La presa visione viene ripresentata ad ogni aggiornamento sostanziale dei
          documenti legali (versione corrente: {POLICY_VERSION}).
        </p>
        <p className="mt-2">
          L'informativa può essere riaperta in qualsiasi momento dal menu
          {' '}<User className="w-3.5 h-3.5 inline-block align-text-bottom mx-0.5" />
          {' '} selezionando <Cookie className="w-3.5 h-3.5 inline-block align-text-bottom mx-0.5"/> Privacy & Cookie.
        </p>
      </Section>

      <Section title="Cookie di terze parti">
        <p>
          La piattaforma non installa cookie di profilazione di terze parti. I servizi di hosting
          (vedi sezione "Destinatari" della Privacy Policy) possono utilizzare cookie tecnici
          strettamente necessari al funzionamento del servizio.
        </p>
      </Section>
    </>
  );
}

export function TermsContent() {
  return (
    <>
      <Section title="1. Oggetto">
        <p>
          I presenti Termini disciplinano l'utilizzo della piattaforma AdeguataVerifica.Pro messa a disposizione da
          {' '}{STUDIO_INFO.nome} per la gestione degli adempimenti antiriciclaggio previsti dal
          D.Lgs. 231/2007.
        </p>
      </Section>

      <Section title="2. Account utente">
        <p>
          L'accesso alla piattaforma è soggetto ad approvazione e segue due percorsi distinti:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            <strong>Registrazione di un nuovo studio</strong> — il referente compila un'apposita
            richiesta dalla pagina di accesso; la richiesta è valutata e approvata dal gestore
            della piattaforma, che alla conferma abilita l'account amministratore dello studio.
          </li>
          <li>
            <strong>Collaboratori di uno studio esistente</strong> — l'amministratore dello
            studio invita i propri collaboratori e ne abilita l'account; può inoltre sospendere
            o riattivare l'accesso degli utenti del proprio studio.
          </li>
        </ul>
        <p className="mt-2">
          L'utente è responsabile della custodia delle credenziali e di ogni attività svolta
          tramite il proprio account.
        </p>
      </Section>

      <Section title="3. Uso consentito">
        <p>
          La piattaforma è destinata esclusivamente ad uso professionale e svolge funzione di
          <strong> registro operativo e archivio documentale</strong> degli adempimenti
          antiriciclaggio: raccoglie, organizza e conserva i dati e i documenti relativi
          all'attività svolta dal professionista, mette a disposizione strumenti di supporto
          (scoring del rischio, alert su scadenze, monitoraggio) e ne consente la consultazione
          nei tempi previsti dalla legge. Le valutazioni e le decisioni operative restano in capo
          al professionista (vedi sezione 4).
        </p>
        <p className="mt-2">È vietato:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>caricare dati di soggetti per i quali non si ha titolo al trattamento;</li>
          <li>tentare di aggirare i controlli di sicurezza o di accedere a dati di altri studi;</li>
          <li>utilizzare la piattaforma per finalità illecite o contrarie all'ordine pubblico.</li>
        </ul>
      </Section>

      <Section title="4. Limitazione di responsabilità">
        <p>
          La piattaforma costituisce uno strumento di supporto al professionista. Le valutazioni di
          rischio e le decisioni finali in materia di adeguata verifica e segnalazione di operazioni
          sospette restano di esclusiva competenza e responsabilità del professionista incaricato.
        </p>
      </Section>

      <Section title="5. Disponibilità del servizio">
        <p>
          Il Titolare si impegna a garantire la massima disponibilità del servizio ma non assicura
          un'operatività ininterrotta. Sono possibili interruzioni per manutenzione, aggiornamenti o
          cause di forza maggiore.
        </p>
      </Section>

      <Section title="6. Modifiche ai Termini">
        <p>
          Il Titolare si riserva il diritto di modificare i presenti Termini. Le modifiche sostanziali
          saranno comunicate tramite il banner all'accesso e richiederanno una nuova approvazione.
        </p>
      </Section>

      <Section title="7. Legge applicabile e foro competente">
        <p>
          I presenti Termini sono disciplinati dalla legge italiana. Per ogni controversia è competente
          in via esclusiva il Foro del luogo in cui ha sede il Titolare.
        </p>
      </Section>
    </>
  );
}

export function LegalDoc({ id }: { id: LegalDocId }) {
  if (id === 'privacy') return <PrivacyContent />;
  if (id === 'cookie') return <CookieContent />;
  return <TermsContent />;
}
