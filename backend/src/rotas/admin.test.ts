import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import adminRota from './admin.js';

vi.mock('../db/cliente.js', () => ({ obterPool: vi.fn() }));
vi.mock('../middlewares/autorizacao.js', () => ({
  exigirAdmin: vi.fn(async (req: { carteiraAddress: string }) => {
    req.carteiraAddress = '0xAdminAddress';
  }),
}));

import { obterPool } from '../db/cliente.js';

async function montarApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(jwt, { secret: 'test-secret' });
  await app.register(adminRota);
  await app.ready();
  return app;
}

describe('GET /admin/carteiras', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna lista de carteiras', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          address: '0xAAA',
          status: 'pendente',
          vinculada_em: new Date(),
          revisada_em: null,
          revisada_por: null,
          usuario_email: 'a@b.com',
          usuario_id: 1,
        },
      ],
    });
    vi.mocked(obterPool).mockReturnValue({ query } as never);

    const app = await montarApp();
    const res = await app.inject({ method: 'GET', url: '/admin/carteiras' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { carteiras: unknown[] };
    expect(body.carteiras).toHaveLength(1);
  });
});

describe('PATCH /admin/carteiras/:address/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('autoriza carteira', async () => {
    const address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ address, status: 'autorizada' }],
    });
    vi.mocked(obterPool).mockReturnValue({ query } as never);

    const app = await montarApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/carteiras/${address}/status`,
      payload: { status: 'autorizada' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string };
    expect(body.status).toBe('autorizada');
  });

  it('retorna 404 quando carteira não existe', async () => {
    const address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    vi.mocked(obterPool).mockReturnValue({ query } as never);

    const app = await montarApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/carteiras/${address}/status`,
      payload: { status: 'autorizada' },
    });
    expect(res.statusCode).toBe(404);
  });
});
