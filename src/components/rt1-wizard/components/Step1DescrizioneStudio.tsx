import { Card } from '../../Card';
import { AlertCircle } from 'lucide-react';
import { DescrizioneStudio } from '../types';

interface Step1Props {
  descrizione: DescrizioneStudio;
  updateDescrizioneStudio: (updates: Partial<DescrizioneStudio>) => void;
  isReadOnly?: boolean;
}

export function Step1DescrizioneStudio({ descrizione, updateDescrizioneStudio, isReadOnly }: Step1Props) {
  return (
    <Card>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Descrizione Studio Professionale</h2>
      
      {/* Istruzioni */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">Istruzioni</p>
            <p>
              Indicare tipologia giuridica, anno di inizio dell'attività, localizzazione della/e sede/i, 
              organizzazione interna, eventuali peculiarità e specializzazioni, tipologia prevalente di 
              clientela, principali prestazioni professionali svolte.
            </p>
          </div>
        </div>
      </div>

      {/* Form campi */}
      <div className="space-y-5">
        {/* Tipologia Giuridica */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipologia Giuridica *
          </label>
          <input
            type="text"
            value={descrizione.tipologia_giuridica}
            onChange={(e) => updateDescrizioneStudio({ tipologia_giuridica: e.target.value })}
            disabled={isReadOnly}
            placeholder="Es: Studio associato, Società tra professionisti, Professionista individuale..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
          />
        </div>

        {/* Anno Inizio Attività */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Anno Inizio Attività *
          </label>
          <input
            type="text"
            value={descrizione.anno_inizio_attivita}
            onChange={(e) => updateDescrizioneStudio({ anno_inizio_attivita: e.target.value })}
            disabled={isReadOnly}
            placeholder="Es: 2010"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
          />
        </div>

        {/* Localizzazione Sedi */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Localizzazione della/e Sede/i *
          </label>
          <textarea
            value={descrizione.sedi}
            onChange={(e) => updateDescrizioneStudio({ sedi: e.target.value })}
            disabled={isReadOnly}
            rows={2}
            placeholder="Es: Sede principale a Roma, Via XX Settembre 10; Sede secondaria a Milano, Corso Buenos Aires 50"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
          />
        </div>

        {/* Organizzazione Interna */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Organizzazione Interna *
          </label>
          <textarea
            value={descrizione.organizzazione_interna}
            onChange={(e) => updateDescrizioneStudio({ organizzazione_interna: e.target.value })}
            disabled={isReadOnly}
            rows={3}
            placeholder="Es: 3 professionisti senior, 2 junior, 1 segretaria amministrativa. Struttura gerarchica con partner responsabili di settore..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
          />
        </div>

        {/* Peculiarità e Specializzazioni */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Peculiarità e Specializzazioni
          </label>
          <textarea
            value={descrizione.peculiarita_e_specializzazioni}
            onChange={(e) => updateDescrizioneStudio({ peculiarita_e_specializzazioni: e.target.value })}
            disabled={isReadOnly}
            rows={3}
            placeholder="Es: Specializzazione in diritto societario e fiscalità internazionale. Focus su PMI del settore manifatturiero..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
          />
        </div>

        {/* Tipologia Prevalente Clientela */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipologia Prevalente Clientela *
          </label>
          <textarea
            value={descrizione.tipologia_prevalente_clientela}
            onChange={(e) => updateDescrizioneStudio({ tipologia_prevalente_clientela: e.target.value })}
            disabled={isReadOnly}
            rows={3}
            placeholder="Es: PMI, società di capitali, professionisti, enti no profit. Prevalentemente clientela locale..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
          />
        </div>

        {/* Principali Prestazioni Professionali */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Principali Prestazioni Professionali Svolte *
          </label>
          <textarea
            value={descrizione.principali_prestazioni_professionali}
            onChange={(e) => updateDescrizioneStudio({ principali_prestazioni_professionali: e.target.value })}
            disabled={isReadOnly}
            rows={3}
            placeholder="Es: Consulenza fiscale, dichiarazioni dei redditi, assistenza contabile, revisione legale, operazioni straordinarie..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
          />
        </div>
      </div>

      {/* Info campi obbligatori */}
      <div className="mt-6 text-sm text-gray-600">
        <p>* Campi obbligatori</p>
      </div>
    </Card>
  );
}
