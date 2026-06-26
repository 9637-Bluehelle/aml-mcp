// @vitest-environment node
// Moduli server: ambiente node (non jsdom), altrimenti jose fallisce sul check cross-realm
// `payload instanceof Uint8Array` (il Uint8Array di jsdom è di un realm diverso).
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { jwtVerify } from 'jose';
import {
  sha256Hex,
  verifyPkceS256,
  mintOAuthAccessToken,
  verifyOAuthAccessToken,
  authServerMetadata,
  protectedResourceMetadata,
} from '../mcpOAuth';

describe('sha256Hex', () => {
  it('deterministico, 64 hex', () => {
    expect(sha256Hex('x')).toBe(sha256Hex('x'));
    expect(sha256Hex('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyPkceS256', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  it('accetta la coppia corretta', () => {
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });
  it('rifiuta verifier sbagliato o challenge vuoto', () => {
    expect(verifyPkceS256('altro', challenge)).toBe(false);
    expect(verifyPkceS256(verifier, '')).toBe(false);
  });
});

describe('mint/verify OAuth access token', () => {
  const SECRET = 'oauth-test-secret';
  const USER = '22222222-2222-2222-2222-222222222222';

  it('roundtrip con sub + tier + claim Supabase', async () => {
    const tok = await mintOAuthAccessToken(USER, 'modify', SECRET, 3600);
    const { userId, tier } = await verifyOAuthAccessToken(tok, SECRET);
    expect(userId).toBe(USER);
    expect(tier).toBe('modify');
    const { payload } = await jwtVerify(tok, new TextEncoder().encode(SECRET));
    expect(payload.aud).toBe('authenticated');
    expect(payload.role).toBe('authenticated');
    expect(payload.origine).toBe('ai');
  });

  it('rifiuta con segreto errato', async () => {
    const tok = await mintOAuthAccessToken(USER, 'read', SECRET);
    await expect(verifyOAuthAccessToken(tok, 'altro')).rejects.toThrow();
  });
});

describe('metadata discovery', () => {
  it('AS metadata espone endpoint e PKCE S256', () => {
    const m = authServerMetadata('https://app.example.com/');
    expect(m.issuer).toBe('https://app.example.com');
    expect(m.authorization_endpoint).toBe('https://app.example.com/api/oauth-authorize');
    expect(m.token_endpoint).toBe('https://app.example.com/api/oauth-token');
    expect(m.code_challenge_methods_supported).toContain('S256');
    expect(m.grant_types_supported).toContain('refresh_token');
  });
  it('Protected Resource metadata punta all\'AS e a /api/mcp', () => {
    const m = protectedResourceMetadata('https://app.example.com');
    expect(m.resource).toBe('https://app.example.com/api/mcp');
    expect(m.authorization_servers).toContain('https://app.example.com');
  });
});
