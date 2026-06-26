// @vitest-environment node
// Moduli server: ambiente node (non jsdom), altrimenti jose fallisce sul check cross-realm
// `payload instanceof Uint8Array` (il Uint8Array di jsdom è di un realm diverso).
import { describe, it, expect } from 'vitest';
import { jwtVerify } from 'jose';
import { hashPat, tierAllows, mintUserJwt, PAT_PREFIX } from '../mcpAuth';

const enc = (s: string) => new TextEncoder().encode(s);

describe('hashPat', () => {
  it('è deterministico e produce SHA-256 esadecimale (64 char)', () => {
    const pat = `${PAT_PREFIX}abc123`;
    const h1 = hashPat(pat);
    const h2 = hashPat(pat);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cambia se cambia il PAT', () => {
    expect(hashPat('aml_pat_a')).not.toBe(hashPat('aml_pat_b'));
  });
});

describe('tierAllows', () => {
  it('rispetta la gerarchia read < draft < modify', () => {
    expect(tierAllows('modify', 'draft')).toBe(true);
    expect(tierAllows('draft', 'draft')).toBe(true);
    expect(tierAllows('read', 'draft')).toBe(false);
    expect(tierAllows('read', 'read')).toBe(true);
    expect(tierAllows('draft', 'modify')).toBe(false);
  });
});

describe('mintUserJwt', () => {
  const SECRET = 'test-secret-please-change';
  const USER = '11111111-1111-1111-1111-111111111111';

  it('produce un JWT verificabile col segreto, con i claim Supabase + origine=ai', async () => {
    const token = await mintUserJwt(USER, SECRET, 300);
    const { payload } = await jwtVerify(token, enc(SECRET));
    expect(payload.sub).toBe(USER);
    expect(payload.aud).toBe('authenticated');
    expect(payload.role).toBe('authenticated');
    expect(payload.origine).toBe('ai'); // claim usato dall'audit (source='ai', §7.6)
    expect(payload.exp!).toBeGreaterThan(payload.iat!);
  });

  it('non verifica con un segreto sbagliato', async () => {
    const token = await mintUserJwt(USER, SECRET, 300);
    await expect(jwtVerify(token, enc('segreto-diverso'))).rejects.toThrow();
  });
});
