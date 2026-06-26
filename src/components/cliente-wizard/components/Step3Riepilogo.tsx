import { Card } from '../../Card';
import { WizardData } from '../types';

interface Step3Props {
  formData: WizardData;
}

export function Step3Riepilogo({ formData }: Step3Props) {
  const getNomeCliente = () => {
    if (formData.tipo_cliente === 'persona_fisica') return formData.nome_cognome_pf || 'N/D';
    if (formData.tipo_cliente === 'impresa') return formData.ragione_sociale || 'N/D';
    return formData.nome_cognome_prof || 'N/D';
  };

  return (
    <Card title="Step 3: Riepilogo">
      <div className="space-y-4">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-bold mb-2">
            Tipo: {formData.tipo_cliente === 'persona_fisica' ? 'Persona Fisica' : 
                   formData.tipo_cliente === 'impresa' ? 'Impresa' : 'Professionista'}
          </h3>
          <p className="text-sm">Codice: {formData.codice_cliente}</p>
          <p className="text-sm">Nome: {getNomeCliente()}</p>
          
          {formData.tipo_cliente === 'impresa' && (
            <>
              <p className="text-sm">P.IVA: {formData.partita_iva_impresa || 'N/D'}</p>
              <p className="text-sm">C.F.: {formData.codice_fiscale_impresa || 'N/D'}</p>
            </>
          )}
          {formData.tipo_cliente === 'professionista' && (
            <>
              <p className="text-sm">P.IVA: {formData.partita_iva_prof || 'N/D'}</p>
              <p className="text-sm">C.F.: {formData.codice_fiscale_prof || 'N/D'}</p>
            </>
          )}
          {formData.tipo_cliente === 'persona_fisica' && (
            <p className="text-sm">C.F.: {formData.codice_fiscale_pf || 'N/D'}</p>
          )}
        </div>
        
        {formData.tipo_cliente === 'impresa' && formData.titolari_effettivi.length > 0 && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-bold mb-2">Titolari Effettivi: {formData.titolari_effettivi.length}</h3>
            <ul className="text-sm space-y-1">
              {formData.titolari_effettivi.map((t, i) => (
                <li key={i}>• {t.nome_cognome} - {t.codice_fiscale}</li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <p className="text-sm text-yellow-800">
            ℹ️ Verifica i dati prima di salvare. Il sistema determinerà automaticamente<br/>
            lo status del cliente (BOZZA o ATTIVO) in base alla completezza dei campi obbligatori.
          </p>
        </div>
      </div>
    </Card>
  );
}
