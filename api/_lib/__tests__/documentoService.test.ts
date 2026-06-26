import { describe, it, expect } from 'vitest';
import { descriviTipologie, getTipologia, computeFilePath, TIPOLOGIE_CON_SCADENZA } from '../documentoService';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('descriviTipologie', () => {
  const map = new Map(descriviTipologie().map((t) => [t.value, t]));

  it('mappa level → id_obbligatorio coerente', () => {
    expect(map.get('documento_identita')?.level).toBe('persona');
    expect(map.get('documento_identita')?.id_obbligatorio).toBe('persona_id');
    expect(map.get('codice_fiscale')?.level).toBe('cliente');
    expect(map.get('codice_fiscale')?.id_obbligatorio).toBe('cliente_id');
    expect(map.get('mandato')?.level).toBe('incarico');
    expect(map.get('mandato')?.id_obbligatorio).toBe('incarico_id');
  });

  it('segnala scadenza_obbligatoria secondo TIPOLOGIE_CON_SCADENZA', () => {
    expect(map.get('visura')?.scadenza_obbligatoria).toBe(true);
    expect(map.get('procura')?.scadenza_obbligatoria).toBe(true);
    expect(map.get('codice_fiscale')?.scadenza_obbligatoria).toBe(false);
    // coerenza col set sorgente
    for (const t of descriviTipologie()) {
      expect(t.scadenza_obbligatoria).toBe(TIPOLOGIE_CON_SCADENZA.has(t.value));
    }
  });

  it('getTipologia trova/non trova', () => {
    expect(getTipologia('bilancio')?.level).toBe('incarico');
    expect(getTipologia('inesistente')).toBeUndefined();
  });
});

describe('computeFilePath', () => {
  it('forza estensione .pdf minuscola e include folder+timestamp', () => {
    const p = computeFilePath(UUID, 'Carta Identità.PDF', 1700000000000);
    expect(p.startsWith(`${UUID}/1700000000000_`)).toBe(true);
    expect(p.endsWith('.pdf')).toBe(true);
    expect(p).not.toContain(' '); // caratteri non sicuri sostituiti
  });

  it('aggiunge .pdf se mancante', () => {
    expect(computeFilePath(UUID, 'documento', 1).endsWith('.pdf')).toBe(true);
  });

  it('rifiuta folder non-UUID (anti path-traversal)', () => {
    expect(() => computeFilePath('../etc', 'x.pdf', 1)).toThrow();
  });
});
