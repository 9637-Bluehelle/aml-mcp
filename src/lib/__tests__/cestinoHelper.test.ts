import { describe, it, expect, vi, beforeEach } from 'vitest';

// Il modulo parla con Supabase e con il log utente: qui interessa solo cosa fa
// l'eliminazione definitiva quando la pulizia dei file va storta, che è il caso
// difficile da riprodurre a mano.
const h = vi.hoisted(() => {
  const rpc = vi.fn();
  const storageRemove = vi.fn();
  const insert = vi.fn();
  const getUser = vi.fn();
  return {
    rpc, storageRemove, insert, getUser,
    supabase: {
      rpc,
      storage: { from: () => ({ remove: storageRemove }) },
      auth: { getUser },
      from: () => ({ insert }),
    },
  };
});

vi.mock('../supabase', () => ({ supabase: h.supabase }));
vi.mock('../../components/LogUtente', () => ({ addUserLog: vi.fn() }));

import { svuotaElemento, svuotaCestino } from '../cestinoHelper';

beforeEach(() => {
  vi.clearAllMocks();
  h.getUser.mockResolvedValue({ data: { user: { id: 'utente-1' } } });
  h.insert.mockResolvedValue({ error: null });
  h.storageRemove.mockResolvedValue({ error: null });
});

describe('svuotaElemento', () => {
  it('senza intoppi non segnala nulla', async () => {
    h.rpc.mockResolvedValue({ data: { file_paths: ['a.pdf', 'b.pdf'] }, error: null });

    const esito = await svuotaElemento('cestino-1');

    expect(esito).toEqual({ nonRimossi: 0, errore: null });
    expect(h.storageRemove).toHaveBeenCalledWith(['a.pdf', 'b.pdf']);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('riporta il fallimento dello Storage invece di ingoiarlo', async () => {
    // storage.remove() non solleva eccezioni: mette l'errore nell'oggetto di
    // ritorno. Prima veniva perso, e i file restavano orfani senza che nessuno
    // lo sapesse.
    h.rpc.mockResolvedValue({ data: { file_paths: ['a.pdf', 'b.pdf'] }, error: null });
    h.storageRemove.mockResolvedValue({ error: { message: 'bucket non raggiungibile' } });

    const esito = await svuotaElemento('cestino-1');

    expect(esito.nonRimossi).toBe(2);
    expect(esito.errore).toContain('bucket non raggiungibile');
  });

  it('apre un avviso di piattaforma per i file rimasti indietro', async () => {
    h.rpc.mockResolvedValue({ data: { file_paths: ['a.pdf'] }, error: null });
    h.storageRemove.mockResolvedValue({ error: { message: 'timeout' } });

    await svuotaElemento('cestino-1');

    expect(h.insert).toHaveBeenCalledTimes(1);
    const avviso = h.insert.mock.calls[0][0];
    expect(avviso.automatica).toBe(true);        // visibile al solo superadmin
    expect(avviso.user_id).toBe('utente-1');     // RLS: l'autore è chi ha eliminato
    expect(avviso.descrizione).toContain('timeout');
    expect(avviso.descrizione).toContain('a.pdf');
  });

  it('un avviso che non parte non fa fallire l\'eliminazione', async () => {
    h.rpc.mockResolvedValue({ data: { file_paths: ['a.pdf'] }, error: null });
    h.storageRemove.mockResolvedValue({ error: { message: 'timeout' } });
    h.insert.mockRejectedValue(new Error('segnalazioni offline'));

    const esito = await svuotaElemento('cestino-1');

    expect(esito.nonRimossi).toBe(1);
  });

  it('senza file allegati non chiama lo Storage', async () => {
    h.rpc.mockResolvedValue({ data: { file_paths: [] }, error: null });

    const esito = await svuotaElemento('cestino-1');

    expect(h.storageRemove).not.toHaveBeenCalled();
    expect(esito).toEqual({ nonRimossi: 0, errore: null });
  });

  it('se l\'eliminazione nel database fallisce, l\'errore risale', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'permesso negato' } });

    await expect(svuotaElemento('cestino-1')).rejects.toMatchObject({ message: 'permesso negato' });
    expect(h.storageRemove).not.toHaveBeenCalled();
  });
});

describe('svuotaCestino', () => {
  it('restituisce il conteggio insieme all\'esito dei file', async () => {
    h.rpc.mockResolvedValue({ data: { eliminati: 3, file_paths: ['a.pdf'] }, error: null });

    const esito = await svuotaCestino();

    expect(esito).toEqual({ eliminati: 3, nonRimossi: 0, errore: null });
  });

  it('il conteggio resta valido anche se i file non vengono rimossi', async () => {
    // I dati SONO stati eliminati: l'operazione è riuscita, i file sono un di più.
    h.rpc.mockResolvedValue({ data: { eliminati: 3, file_paths: ['a.pdf', 'b.pdf'] }, error: null });
    h.storageRemove.mockResolvedValue({ error: { message: 'quota superata' } });

    const esito = await svuotaCestino();

    expect(esito.eliminati).toBe(3);
    expect(esito.nonRimossi).toBe(2);
    expect(esito.errore).toContain('quota superata');
  });
});
