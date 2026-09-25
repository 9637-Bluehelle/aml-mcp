import { useState, useRef, useEffect, useMemo } from 'react';
import codiciAtecoData from '../../../../data/codici_ateco_2025_rischio.json'; // codici_ateco_rischio.json

interface CodiceAteco {
  codice: string;
  attivita: string;
  rischio_indicativo: number;
  rischio_indicativo_label: string;
}

interface CodiceAtecoSearchProps {
  codiceAteco: string;
  attivitaSvolta: string;
  onSelect: (codice: string, attivita: string) => void;
  raeDescription?: string;
}

const codici: CodiceAteco[] = codiciAtecoData.codici;

export function CodiceAtecoSearch({ codiceAteco, attivitaSvolta, onSelect, raeDescription }: CodiceAtecoSearchProps) {
  const [searchCodice, setSearchCodice] = useState(codiceAteco || '');
  const [searchAttivita, setSearchAttivita] = useState(attivitaSvolta || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeField, setActiveField] = useState<'codice' | 'attivita' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync from parent
  useEffect(() => { setSearchCodice(codiceAteco || ''); }, [codiceAteco]);
  useEffect(() => { setSearchAttivita(attivitaSvolta || ''); }, [attivitaSvolta]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setActiveField(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(() => {
    const query = activeField === 'codice' ? searchCodice.trim() : searchAttivita.trim();
    if (!query) return [];
    const lower = query.toLowerCase();
    return codici.filter(c =>
      activeField === 'codice'
        ? c.codice.startsWith(query)
        : c.attivita.toLowerCase().includes(lower)
    ).slice(0, 50);
  }, [searchCodice, searchAttivita, activeField]);

  function handleSelect(item: CodiceAteco) {
    setSearchCodice(item.codice);
    setSearchAttivita(item.attivita);
    setShowDropdown(false);
    setActiveField(null);
    onSelect(item.codice, item.attivita);
  }

  /** Auto-formatta il codice ATECO (XX.XX.XX): "478300" → "47.83.00", "47.8300" → "47.83.00" */
  function formatAtecoInput(val: string): string {
    if (!val.includes('.')) {
      // Nessun punto: formatta tutto automaticamente
      const digits = val.replace(/\D/g, '');
      if (digits.length <= 2) return digits;
      if (digits.length <= 4) return digits.slice(0, 2) + '.' + digits.slice(2);
      return digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4, 6);
    }
    // L'utente ha scritto almeno un punto: rispettalo, aggiungi solo il secondo se manca
    const parts = val.split('.');
    if (parts.length === 2 && parts[1].length > 2) {
      // Es. "47.8300" → "47.83.00"
      return parts[0] + '.' + parts[1].slice(0, 2) + '.' + parts[1].slice(2, 4);
    }
    return val;
  }

  function handleCodiceChange(val: string) {
    const formatted = formatAtecoInput(val);
    setSearchCodice(formatted);
    setActiveField('codice');
    setShowDropdown(formatted.trim().length > 0);
  }

  function handleAttivitaChange(val: string) {
    setSearchAttivita(val);
    setActiveField('attivita');
    setShowDropdown(val.trim().length >= 2);
  }

  return (
    <div ref={containerRef} className="md:col-span-2 relative">
      <div className='flex flex-row'>
        <label className="block text-sm font-medium text-gray-700 mb-2 mr-[50px]">Principale Attività Svolta</label>
        {raeDescription && !codiceAteco && (
          <div className="mb-2">
            <span className="inline-block text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
              <span className='font-bold'>Classificazione RAE :</span> {raeDescription}
            </span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <input
            type="text"
            value={searchCodice}
            onChange={(e) => handleCodiceChange(e.target.value)}
            onFocus={() => { if (searchCodice.trim()) { setActiveField('codice'); setShowDropdown(true); } }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Cerca codice ATECO..."
          />
        </div>
        <div className="md:col-span-2">
          <input
            type="text"
            value={searchAttivita}
            onChange={(e) => handleAttivitaChange(e.target.value)}
            onFocus={() => { if (searchAttivita.trim().length >= 2) { setActiveField('attivita'); setShowDropdown(true); } }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Cerca tipologia attività..."
          />
        </div>
      </div>

      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {filtered.map((item) => (
            <button
              key={item.codice}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 flex items-start gap-3 transition-colors"
            >
              <span className="font-mono text-sm text-blue-700 font-semibold whitespace-nowrap pt-0.5">
                {item.codice}
              </span>
              <span className="text-sm text-gray-800 break-words leading-snug">
                {item.attivita}
              </span>
            </button>
          ))}
        </div>
      )}

      {showDropdown && filtered.length === 0 && (activeField === 'codice' ? searchCodice.trim() : searchAttivita.trim().length >= 2) && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg px-4 py-3 text-sm text-gray-500">
          Nessun risultato trovato
        </div>
      )}
    </div>
  );
}
