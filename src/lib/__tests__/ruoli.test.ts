import { describe, it, expect } from 'vitest';
import { amministraStudio } from '../ruoli';

describe('amministraStudio', () => {
  it('riconosce chi amministra lo studio', () => {
    expect(amministraStudio('admin')).toBe(true);
    expect(amministraStudio('superadmin')).toBe(true);
  });

  it('esclude entrambi i ruoli operativi', () => {
    // Sono due nomi per la stessa cosa: trattarne uno solo era il bug che
    // mostrava la voce RT1 in barra a chi poi trovava una pagina vuota.
    expect(amministraStudio('user')).toBe(false);
    expect(amministraStudio('collaboratore')).toBe(false);
  });

  it('esclude ruolo assente o non riconosciuto', () => {
    expect(amministraStudio('')).toBe(false);
    expect(amministraStudio(null)).toBe(false);
    expect(amministraStudio(undefined)).toBe(false);
    expect(amministraStudio('qualcosaltro')).toBe(false);
  });
});
