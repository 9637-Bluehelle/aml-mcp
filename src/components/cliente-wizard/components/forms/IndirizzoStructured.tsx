import { useState, useEffect, useRef, useMemo } from 'react';
import { getProvince, getSiglaByCity, searchCitta } from '../../../../lib/provinceHelper';
import { NAZIONALITA } from '../../../../lib/nazionalitaHelper';

const PROVINCE = getProvince().sort((a, b) => a.sigla.localeCompare(b.sigla));

interface IndirizzoParts {
  via: string;
  numeroCivico: string;
  cap: string;
  citta: string;
  provincia: string; // sigla
}

/** Parsa una stringa indirizzo in vari formati possibili */
function parseIndirizzo(value: string): IndirizzoParts {
  const empty = { via: '', numeroCivico: '', cap: '', citta: '', provincia: '' };
  if (!value || !value.trim()) return empty;

  // Regex per numero civico: cifre seguite opzionalmente da barra/trattino + lettera (2, 2/C, 2c, 2-C, 15/A, SNC)
  const NUM_CIVICO = '\\d+\\s*[\\/-]?\\s*[A-Za-z]?';

  // Pattern 1 - formato strutturato nostro: "Via Roma, 2/C, 00100 Roma (RM)"
  const re1 = new RegExp(`^(.+?),\\s*(${NUM_CIVICO}|\\S+),\\s*(\\d{5})\\s+(.+?)\\s*\\(([A-Z]{2})\\)$`);
  const match1 = value.match(re1);
  if (match1) {
    return {
      via: match1[1].trim(),
      numeroCivico: match1[2].trim(),
      cap: match1[3],
      citta: match1[4].trim(),
      provincia: match1[5],
    };
  }

  // Pattern 2 - numero civico nella via con virgola prima del CAP: "VIA MANDARINI 2/C, 95025 ACI SANT'ANTONIO (CT)"
  const re2 = new RegExp(`^(.+?)\\s+(${NUM_CIVICO}),\\s*(\\d{5})\\s+(.+?)\\s*\\(([A-Z]{2})\\)$`);
  const match2 = value.match(re2);
  if (match2) {
    return {
      via: match2[1].trim(),
      numeroCivico: match2[2].trim(),
      cap: match2[3],
      citta: match2[4].trim(),
      provincia: match2[5],
    };
  }

  // Pattern 3 - senza virgole, con provincia: "VIA MANDARINI 2/C 95025 ACI SANT'ANTONIO (CT)"
  const re3 = new RegExp(`^(.+?)\\s+(${NUM_CIVICO})\\s+(\\d{5})\\s+(.+?)\\s*\\(([A-Z]{2})\\)$`);
  const match3 = value.match(re3);
  if (match3) {
    return {
      via: match3[1].trim(),
      numeroCivico: match3[2].trim(),
      cap: match3[3],
      citta: match3[4].trim(),
      provincia: match3[5],
    };
  }

  // Pattern 4 - senza numero civico con provincia: "VIA ROMA, 00100 ROMA (RM)"
  const match4 = value.match(/^(.+?),\s*(\d{5})\s+(.+?)\s*\(([A-Z]{2})\)$/);
  if (match4) {
    return {
      via: match4[1].trim(),
      numeroCivico: '',
      cap: match4[2],
      citta: match4[3].trim(),
      provincia: match4[4],
    };
  }

  // Pattern 5 - con provincia tra parentesi, formato libero
  const provMatch = value.match(/\(([A-Z]{2})\)\s*$/);
  if (provMatch) {
    const senzaProv = value.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim();
    const capCittaMatch = senzaProv.match(/^(.*?),?\s*(\d{5})\s+(.+)$/);
    if (capCittaMatch) {
      const viaNumeroPart = capCittaMatch[1].trim();
      const viaNumRe = new RegExp(`^(.+?)\\s+(${NUM_CIVICO})$`);
      const viaNumMatch = viaNumeroPart.match(viaNumRe);
      if (viaNumMatch) {
        return {
          via: viaNumMatch[1].trim(),
          numeroCivico: viaNumMatch[2].trim(),
          cap: capCittaMatch[2],
          citta: capCittaMatch[3].trim(),
          provincia: provMatch[1],
        };
      }
      return { via: viaNumeroPart, numeroCivico: '', cap: capCittaMatch[2], citta: capCittaMatch[3].trim(), provincia: provMatch[1] };
    }
    return { ...empty, via: senzaProv, provincia: provMatch[1] };
  }

  // Pattern 6 - SENZA provincia: "VIA MANDARINI 2/C, 95025 ACI SANT'ANTONIO" o "VIA MANDARINI 2/C 95025 ACI SANT'ANTONIO"
  // Cerca CAP (5 cifre) e poi la città, e da lì ricava la provincia dal JSON
  const capMatch = value.match(/(\d{5})\s+(.+)$/);
  if (capMatch) {
    const beforeCap = value.substring(0, capMatch.index).replace(/,\s*$/, '').trim();
    const citta = capMatch[2].trim();
    const provSigla = getSiglaByCity(citta);

    // Prova a separare via e numero civico dalla parte prima del CAP
    const viaNumRe = new RegExp(`^(.+?)\\s+(${NUM_CIVICO})$`);
    const viaNumMatch = beforeCap.match(viaNumRe);
    if (viaNumMatch) {
      return {
        via: viaNumMatch[1].trim(),
        numeroCivico: viaNumMatch[2].trim(),
        cap: capMatch[1],
        citta,
        provincia: provSigla || '',
      };
    }
    return { via: beforeCap, numeroCivico: '', cap: capMatch[1], citta, provincia: provSigla || '' };
  }

  // Nessun pattern riconosciuto: metti tutto nel campo via
  return { ...empty, via: value };
}

/** Ricostruisce la stringa indirizzo dai campi strutturati */
function buildIndirizzo(parts: IndirizzoParts): string {
  const { via, numeroCivico, cap, citta, provincia } = parts;
  if (via && numeroCivico && cap && citta && provincia) {
    return `${via}, ${numeroCivico}, ${cap} ${citta} (${provincia})`;
  }
  const segments: string[] = [];
  if (via) segments.push(via);
  if (numeroCivico) segments.push(numeroCivico);
  const capCitta = [cap, citta].filter(Boolean).join(' ');
  if (capCitta) segments.push(capCitta);
  let result = segments.join(', ');
  if (provincia) result += ` (${provincia})`;
  return result;
}

interface IndirizzoStructuredProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
  /** Se true, la nazionalità non è italiana */
  nazionalitaEstera?: boolean;
  /** Nome nazione derivato dalla nazionalità (es. "Germania") */
  nazione?: string;
  /** Flag residenza estera salvato nel form */
  residenzaEstera?: boolean;
  /** Callback per aggiornare il flag residenza estera */
  onResidenzaEsteraChange?: (val: boolean) => void;
}

export function IndirizzoStructured({
  value, onChange, label, required,
  nazionalitaEstera, nazione,
  residenzaEstera, onResidenzaEsteraChange,
}: IndirizzoStructuredProps) {
  const [parts, setParts] = useState<IndirizzoParts>(() => parseIndirizzo(value));
  const [cittaSuggestions, setCittaSuggestions] = useState<{ citta: string; sigla: string }[]>([]);
  const [showCittaDropdown, setShowCittaDropdown] = useState(false);
  const cittaRef = useRef<HTMLDivElement>(null);
  // Ref che memorizza l'ultimo valore emesso dal componente, per ignorare il re-parse nel useEffect
  const lastEmittedValue = useRef(value);
  // Per indirizzo estero: "NAZIONE | indirizzo libero"
  const [esteroIndirizzo, setEsteroIndirizzo] = useState(() => {
    if (!residenzaEstera) return '';
    const sep = value.indexOf(' | ');
    return sep >= 0 ? value.substring(sep + 3) : value;
  });
  const [esteroNazione, setEsteroNazione] = useState(() => {
    if (!residenzaEstera) return nazione || '';
    const sep = value.indexOf(' | ');
    return sep >= 0 ? value.substring(0, sep) : (nazione || '');
  });

  const isEstero = !!residenzaEstera;

  // Traccia il valore precedente di nazione per distinguere il mount dal cambio effettivo
  const prevNazioneRef = useRef(nazione);
  // Idem per nazionalitaEstera, così l'auto-check del flag estero non scatta al mount
  const prevNazionalitaEsteraRef = useRef(nazionalitaEstera);
  // Flag per sapere se il componente ha completato il primo render
  const initializedRef = useRef(false);

  // Sincronizza solo quando il valore cambia dall'esterno (es. reset form, import anagrafica)
  useEffect(() => {
    if (value === lastEmittedValue.current) return;
    lastEmittedValue.current = value;
    if (isEstero) {
      const sep = value.indexOf(' | ');
      if (sep >= 0) {
        setEsteroNazione(value.substring(0, sep));
        setEsteroIndirizzo(value.substring(sep + 3));
      } else {
        setEsteroNazione(nazione || '');
        setEsteroIndirizzo(value);
      }
    } else {
      setParts(parseIndirizzo(value));
    }
  }, [value, isEstero]);

  // Segna il componente come inizializzato dopo il primo render
  useEffect(() => {
    initializedRef.current = true;
  }, []);

  // Quando cambia la nazione prop dall'esterno (cambio nazionalità), aggiorna
  // Solo se l'utente ha effettivamente cambiato la nazionalità (non al primo caricamento)
  useEffect(() => {
    if (!initializedRef.current) {
      // Primo render: salva il valore iniziale senza sovrascrivere
      prevNazioneRef.current = nazione;
      return;
    }
    if (nazione === prevNazioneRef.current) return; // nessun cambio reale
    prevNazioneRef.current = nazione;
    if (isEstero && nazione) {
      setEsteroNazione(nazione);
      const newVal = nazione + (esteroIndirizzo ? ` | ${esteroIndirizzo}` : '');
      lastEmittedValue.current = newVal;
      onChange(newVal);
    }
  }, [nazione, isEstero]);

  // Quando la nazionalità diventa estera, auto-check il checkbox
  // Solo se l'utente ha effettivamente cambiato la nazionalità (non al primo
  // caricamento), altrimenti per anagrafiche con nazionalità estera ma residenza
  // italiana il flag estero verrebbe forzato a true sovrascrivendo il dato salvato.
  useEffect(() => {
    if (nazionalitaEstera === prevNazionalitaEsteraRef.current) return;
    prevNazionalitaEsteraRef.current = nazionalitaEstera;
    if (nazionalitaEstera && !residenzaEstera && onResidenzaEsteraChange) {
      onResidenzaEsteraChange(true);
    }
  }, [nazionalitaEstera]);

  // Chiudi suggerimenti città al click esterno
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (cittaRef.current && !cittaRef.current.contains(e.target as Node)) {
        setShowCittaDropdown(false);
      }
    }
    if (showCittaDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCittaDropdown]);

  const handleCittaInput = (val: string) => {
    handleChange('citta', val);
    const results = searchCitta(val);
    setCittaSuggestions(results);
    setShowCittaDropdown(results.length > 0);
  };

  const handleCittaSelect = (citta: string, sigla: string) => {
    const updated = { ...parts, citta, provincia: sigla };
    setParts(updated);
    emitChange(buildIndirizzo(updated));
    setShowCittaDropdown(false);
  };

  const emitChange = (val: string) => {
    lastEmittedValue.current = val;
    onChange(val);
  };

  const handleChange = (field: keyof IndirizzoParts, fieldValue: string) => {
    const updated = { ...parts, [field]: fieldValue };
    if (field === 'citta' && fieldValue.length >= 3) {
      const sigla = getSiglaByCity(fieldValue);
      if (sigla) updated.provincia = sigla;
    }
    setParts(updated);
    emitChange(buildIndirizzo(updated));
  };

  const handleEsteroChange = (field: 'nazione' | 'indirizzo', fieldValue: string) => {
    const newNazione = field === 'nazione' ? fieldValue : esteroNazione;
    const newIndirizzo = field === 'indirizzo' ? fieldValue : esteroIndirizzo;
    if (field === 'nazione') setEsteroNazione(fieldValue);
    if (field === 'indirizzo') setEsteroIndirizzo(fieldValue);
    emitChange(newNazione + (newIndirizzo ? ` | ${newIndirizzo}` : ''));
  };

  return (
    <div>
      <div className="flex items-center mb-2">
        <label className="block text-sm font-medium text-gray-700">{label}{required && ' *'}</label>
        {/* Checkbox residenza estera - sempre visibile */}
        {onResidenzaEsteraChange && (
          <label className="flex items-center gap-1.5 ml-10 cursor-pointer">
            <input
              type="checkbox"
              checked={isEstero}
              onChange={(e) => {
                const checked = e.target.checked;
                if (checked) {
                  // Italiano → Estero: converti il valore corrente aggiungendo nazione
                  const currentBuilt = buildIndirizzo(parts);
                  const nazioneLabel = nazione || '';
                  setEsteroNazione(nazioneLabel);
                  setEsteroIndirizzo(currentBuilt);
                  emitChange(nazioneLabel + (currentBuilt ? ` | ${currentBuilt}` : ''));
                } else {
                  // Estero → Italiano: ripristina solo l'indirizzo senza nazione
                  const cleanValue = esteroIndirizzo || '';
                  setParts(parseIndirizzo(cleanValue));
                  emitChange(cleanValue);
                }
                onResidenzaEsteraChange(checked);
              }}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs font-medium text-gray-600">Residenza estera</span>
          </label>
        )}
      </div>

      {isEstero ? (
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-3">
            <div className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
              <select
                value={esteroNazione}
                onChange={(e) => handleEsteroChange('nazione', e.target.value)}
                className="w-full rounded-lg text-sm bg-white focus:outline-none focus:ring-0"
              >
                <option value="">Seleziona nazione...</option>
                {[...NAZIONALITA].sort((a, b) => a.nazione.localeCompare(b.nazione)).map(n => (
                  <option key={n.nazione} value={n.nazione}>{n.nazione}</option>
                ))}
              </select>
            </div>
            <span className="text-[10px] text-gray-400">Nazione</span>
          </div>
          <div className="col-span-9">
            <input
              type="text"
              value={esteroIndirizzo}
              onChange={(e) => handleEsteroChange('indirizzo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Indirizzo completo..."
            />
            <span className="text-[10px] text-gray-400">Indirizzo</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-2">
          {/* Via - 5 colonne */}
          <div className="col-span-5">
            <input
              type="text"
              value={parts.via}
              onChange={(e) => handleChange('via', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Via/Piazza..."
            />
            <span className="text-[10px] text-gray-400">Via/Piazza</span>
          </div>
          {/* Numero civico - 1 colonna */}
          <div className="col-span-1">
            <input
              type="text"
              value={parts.numeroCivico}
              onChange={(e) => handleChange('numeroCivico', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="N°"
            />
            <span className="text-[10px] text-gray-400">N°</span>
          </div>
          {/* CAP - 2 colonne */}
          <div className="col-span-2">
            <input
              type="text"
              value={parts.cap}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 5);
                handleChange('cap', v);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="CAP"
              maxLength={5}
            />
            <span className="text-[10px] text-gray-400">CAP</span>
          </div>
          {/* Città - 2 colonne */}
          <div className="col-span-2 relative" ref={cittaRef}>
            <input
              type="text"
              value={parts.citta}
              onChange={(e) => handleCittaInput(e.target.value)}
              onFocus={() => { if (cittaSuggestions.length > 0) setShowCittaDropdown(true); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Città"
            />
            {showCittaDropdown && cittaSuggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {cittaSuggestions.map((s) => (
                  <button
                    key={s.citta + s.sigla}
                    type="button"
                    onClick={() => handleCittaSelect(s.citta, s.sigla)}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-b-0"
                  >
                    {s.citta} <span className="text-gray-400">({s.sigla})</span>
                  </button>
                ))}
              </div>
            )}
            <span className="text-[10px] text-gray-400">Città</span>
          </div>
          {/* Provincia - 2 colonne */}
          <div className="col-span-2">
            <div className="w-full px-2 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
              <select
                value={parts.provincia}
                onChange={(e) => handleChange('provincia', e.target.value)}
                className="w-full rounded-lg text-sm bg-white focus:outline-none focus:ring-0"
              >
                <option value="">Prov.</option>
                {parts.provincia && (
                  <option hidden value={parts.provincia}>{parts.provincia}</option>
                )}
                {PROVINCE.map(p => (
                  <option key={p.sigla} value={p.sigla}>{p.sigla} - {p.nome}</option>
                ))}
              </select>
            </div>
            <span className="text-[10px] text-gray-400">Provincia</span>
          </div>
        </div>
      )}
    </div>
  );
}
