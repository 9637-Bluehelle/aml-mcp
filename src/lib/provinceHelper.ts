import provinceCittaJson from '../data/province_citta.json';

export interface ProvinciaRecord {
  sigla: string;
  nome: string;
  citta: string[];
}

// Parsa "CT (Catania)" -> { sigla: "CT", nome: "Catania" }
function parseProvinciaLabel(label: string): { sigla: string; nome: string } {
  const match = label.match(/^([A-Z]{2})\s+\((.+)\)$/);
  if (match) return { sigla: match[1], nome: match[2] };
  return { sigla: label, nome: label };
}

// Cache pre-calcolata
const _province: ProvinciaRecord[] = (provinceCittaJson as { provincia: string; 'città': string[] }[]).map(p => {
  const { sigla, nome } = parseProvinciaLabel(p.provincia);
  return { sigla, nome, citta: p['città'] };
});

// Mappa città (lowercase) -> sigla provincia
const _cittaToSigla = new Map<string, string>();
for (const prov of _province) {
  for (const c of prov.citta) {
    _cittaToSigla.set(c.toLowerCase(), prov.sigla);
  }
}

// Mappa sigla -> nome provincia
const _siglaToNome = new Map<string, string>();
for (const prov of _province) {
  _siglaToNome.set(prov.sigla, prov.nome);
}

/** Tutte le province ordinate per sigla */
export function getProvince(): ProvinciaRecord[] {
  return _province;
}

/** Dato un nome città, restituisce la sigla della provincia (o null) */
export function getSiglaByCity(citta: string): string | null {
  if (!citta) return null;
  return _cittaToSigla.get(citta.toLowerCase()) || null;
}

/** Data una sigla, restituisce il nome completo della provincia (o null) */
export function getNomeBySigla(sigla: string): string | null {
  if (!sigla) return null;
  return _siglaToNome.get(sigla.toUpperCase()) || null;
}

/** Cerca città che iniziano con il testo dato, restituisce max 10 risultati con sigla provincia */
export function searchCitta(query: string, limit = 10): { citta: string; sigla: string }[] {
  if (!query || query.length < 2) return [];
  const lower = query.toLowerCase();
  const results: { citta: string; sigla: string }[] = [];
  for (const prov of _province) {
    for (const c of prov.citta) {
      if (c.toLowerCase().startsWith(lower)) {
        results.push({ citta: c, sigla: prov.sigla });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

/** Data una sigla provincia, restituisce la lista delle città */
export function getCittaBySigla(sigla: string): string[] {
  const prov = _province.find(p => p.sigla === sigla.toUpperCase());
  return prov?.citta || [];
}
