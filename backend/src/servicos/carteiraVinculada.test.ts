import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/cliente.js', () => ({ obterPool: vi.fn() }));

import {
  vincularCarteira,
  buscarCarteiraVinculada,
  CarteiraDuplicadaError,
} from './carteiraVinculada.js';
import { obterPool } from '../db/cliente.js';

const ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const mockPool = (rows: unknown[] = []) => {
  const query = vi.fn().mockResolvedValue({ rows });
  vi.mocked(obterPool).mockReturnValue({ query } as never);
  return query;
};

describe('vincularCarteira', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_WALLET;
  });

  it('vincula carteira com status pendente por padrão', async () => {
    const query = vi.fn();
    vi.mocked(obterPool).mockReturnValue({ query } as never);
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({
      rows: [{ address: ADDR, status: 'pendente', vinculada_em: new Date() }],
    });

    const res = await vincularCarteira(1, ADDR);
    expect(res.status).toBe('pendente');
  });

  it('auto-autoriza quando address é ADMIN_WALLET', async () => {
    process.env.ADMIN_WALLET = ADDR.toLowerCase();
    const query = vi.fn();
    vi.mocked(obterPool).mockReturnValue({ query } as never);
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({
      rows: [{ address: ADDR, status: 'autorizada', vinculada_em: new Date() }],
    });

    const res = await vincularCarteira(1, ADDR);
    expect(res.status).toBe('autorizada');
  });

  it('lança CarteiraDuplicadaError quando vinculada a outro usuário', async () => {
    const query = vi.fn();
    vi.mocked(obterPool).mockReturnValue({ query } as never);
    query.mockResolvedValueOnce({ rows: [{ usuario_id: 99 }] });

    await expect(vincularCarteira(1, ADDR)).rejects.toBeInstanceOf(CarteiraDuplicadaError);
  });
});

describe('buscarCarteiraVinculada', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna null quando não há carteira', async () => {
    mockPool([]);
    expect(await buscarCarteiraVinculada(1)).toBeNull();
  });

  it('retorna address e status quando existe', async () => {
    mockPool([{ address: ADDR, status: 'autorizada' }]);
    expect(await buscarCarteiraVinculada(1)).toEqual({
      address: ADDR,
      status: 'autorizada',
    });
  });
});
