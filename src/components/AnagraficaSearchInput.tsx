import { useState, useRef, useEffect, useMemo, type InputHTMLAttributes } from 'react';
import { Search, FileText, Building2, User } from 'lucide-react';
import { searchPersone, detectTipoSoggetto, type PersonaFisicaRecord } from '../lib/personeHelper';

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onSelect'>;

interface AnagraficaSearchInputProps extends NativeInputProps {
  /** Callback called when the user picks a record from the dropdown — should populate the form. */
  onSelectAnagrafica: (persona: PersonaFisicaRecord) => void;
  /** Restrict results to a single subject type. Omit to show both. */
  tipoFilter?: 'persona_fisica' | 'azienda';
}

const DOC_LABEL: Record<string, string> = {
  'carta-identita': 'C.I.',
  'carta_identita': 'C.I.',
  patente: 'Patente',
  passaporto: 'Passaporto',
};

/**
 * Drop-in replacement for a plain text `<input>` that, while the user types,
 * shows a dropdown of matching anagrafica records. Picking one fires
 * `onSelectAnagrafica` so the parent form can populate every field.
 *
 * The visible behavior is meant to be indistinguishable from a normal input
 * until the user types ≥2 chars — at which point the dropdown opens.
 */
export function AnagraficaSearchInput({
  onSelectAnagrafica,
  tipoFilter,
  value,
  onChange,
  className,
  placeholder,
  ...inputProps
}: AnagraficaSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PersonaFisicaRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Strip leading hint-text and re-prefix with the magnifier glyph used inside
  // the placeholder. The icon is rendered separately (see below) but the
  // textual placeholder also nudges users toward the search.
  const enrichedPlaceholder = placeholder ?? '';

  // Make room on the left for the search icon. All existing inputs use `px-3`
  // — swap that for `pl-9 pr-3` so we don't fight Tailwind's class merging.
  const inputClassName = useMemo(() => {
    const base = className ?? '';
    if (base.includes('px-3')) return base.replace('px-3', 'pl-9 pr-3');
    if (base.includes('pl-')) return base;
    return `${base} pl-9`.trim();
  }, [className]);

  const query = typeof value === 'string' ? value : '';

  // Debounced search whenever the field's value changes.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const data = await searchPersone(query);
      if (cancelled) return;
      const filtered = tipoFilter
        ? data.filter(p => (p.tipo_soggetto ?? detectTipoSoggetto(p.codice_fiscale) ?? 'persona_fisica') === tipoFilter)
        : data;
      setResults(filtered);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, tipoFilter]);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function handleSelect(p: PersonaFisicaRecord) {
    onSelectAnagrafica(p);
    setOpen(false);
    setResults([]);
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="relative" ref={containerRef}>
      <Search
        className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        aria-hidden="true"
      />
      <input
        {...inputProps}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          if (!open) setOpen(true);
        }}
        onFocus={(e) => {
          inputProps.onFocus?.(e);
          setOpen(true);
        }}
        placeholder={enrichedPlaceholder}
        className={inputClassName}
        autoComplete="off"
      />

      {showDropdown && (
        <div className="absolute z-30 top-full mt-1 left-0 w-full md:min-w-[420px] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Ricerca in corso...
                </div>
              </div>
            )}

            {!loading && results.length === 0 && (
              <div className="text-center py-6 px-4">
                <p className="text-sm text-gray-500">Nessun risultato in anagrafica</p>
                <p className="text-xs text-gray-400 mt-1">Continua a digitare per inserire un nuovo soggetto</p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="py-1">
                {results.map((p, i) => {
                  const isAzienda = (p.tipo_soggetto ?? detectTipoSoggetto(p.codice_fiscale) ?? 'persona_fisica') === 'azienda';
                  return (
                    <button
                      key={p.id || i}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(p)}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-center gap-3 group"
                    >
                      <div className={`w-9 h-9 bg-gradient-to-br ${isAzienda ? 'from-indigo-500 to-indigo-600 group-hover:from-indigo-600 group-hover:to-indigo-700' : 'from-blue-500 to-blue-600 group-hover:from-blue-600 group-hover:to-blue-700'} rounded-full flex items-center justify-center text-white shrink-0 transition-colors`}>
                        {isAzienda
                          ? <Building2 className="w-4 h-4" />
                          : <span className="text-xs font-semibold">{p.nome_cognome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                            {p.nome_cognome}
                          </p>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${isAzienda ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isAzienda ? <Building2 className="inline w-2.5 h-2.5" /> : <User className="inline w-2.5 h-2.5" />}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {p.codice_fiscale && (
                            <span className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                              {p.codice_fiscale}
                            </span>
                          )}
                          {isAzienda && p.partita_iva && p.partita_iva !== p.codice_fiscale && (
                            <span className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded">P.IVA {p.partita_iva}</span>
                          )}
                          {p.professione && (
                            <span className="text-xs text-gray-400 truncate">{p.professione}</span>
                          )}
                          {!isAzienda && p.documento_tipo && (
                            <span className="text-xs text-gray-400 flex items-center gap-0.5">
                              <FileText className="w-3 h-3" />
                              {DOC_LABEL[p.documento_tipo] || p.documento_tipo}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {results.length > 0 && (
            <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">
                {results.length} risultat{results.length === 1 ? 'o' : 'i'} — clicca per importare
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
