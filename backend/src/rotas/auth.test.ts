import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import authRota from './auth.js';

vi.mock('../servicos/auth.js', () => ({
  registrarUsuario: vi.fn(),
  autenticarUsuario: vi.fn(),
  EmailJaCadastradoError: class EmailJaCadastradoError extends Error {
    constructor() {
      super('E-mail já cadastrado.');
      this.name = 'EmailJaCadastradoError';
    }
  },
}));
vi.mock('../servicos/challenge.js', () => ({
  gerarChallenge: vi.fn(),
  verificarChallenge: vi.fn(),
  validarEndereco: vi.fn().mockReturnValue(true),
  normalizarEndereco: vi.fn((a: string) => a),
  ChallengeInvalidoError: class ChallengeInvalidoError extends Error {
    constructor(m: string) {
      super(m);
      this.name = 'ChallengeInvalidoError';
    }
  },
  AssinaturaInvalidaError: class AssinaturaInvalidaError extends Error {
    constructor(m: string) {
      super(m);
      this.name = 'AssinaturaInvalidaError';
    }
  },
}));
vi.mock('../servicos/carteiraVinculada.js', () => ({
  vincularCarteira: vi.fn(),
  buscarCarteiraVinculada: vi.fn().mockResolvedValue(null),
  CarteiraDuplicadaError: class CarteiraDuplicadaError extends Error {
    constructor() {
      super('Carteira já vinculada a outra conta.');
      this.name = 'CarteiraDuplicadaError';
    }
  },
}));
vi.mock('../db/cliente.js', () => ({ obterPool: vi.fn() }));
vi.mock('../middlewares/autorizacao.js', () => ({
  autenticarJWT: vi.fn(async (req: { user: { sub: number; email: string } }) => {
    req.user = { sub: 1, email: 'a@b.com' };
  }),
}));

import * as authServico from '../servicos/auth.js';
import * as challengeServico from '../servicos/challenge.js';
import * as carteiraServico from '../servicos/carteiraVinculada.js';
import { obterPool } from '../db/cliente.js';

async function montarApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(jwt, { secret: 'test-secret' });
  await app.register(authRota);
  await app.ready();
  return app;
}

describe('POST /auth/registrar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria conta e retorna 201', async () => {
    vi.mocked(authServico.registrarUsuario).mockResolvedValueOnce({ id: 1, email: 'a@b.com' });
    const app = await montarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/registrar',
      payload: { email: 'a@b.com', senha: 'senha123' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toMatchObject({ id: 1, email: 'a@b.com' });
  });

  it('retorna 400 para e-mail inválido', async () => {
    const app = await montarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/registrar',
      payload: { email: 'invalido', senha: 'senha123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('retorna 409 quando e-mail duplicado', async () => {
    const { EmailJaCadastradoError } = await import('../servicos/auth.js');
    vi.mocked(authServico.registrarUsuario).mockRejectedValueOnce(new EmailJaCadastradoError());
    const app = await montarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/registrar',
      payload: { email: 'dup@b.com', senha: 'senha123' },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /auth/login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna token quando credenciais corretas', async () => {
    vi.mocked(authServico.autenticarUsuario).mockResolvedValueOnce({ id: 1, email: 'a@b.com' });
    vi.mocked(carteiraServico.buscarCarteiraVinculada).mockResolvedValueOnce(null);
    const app = await montarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'a@b.com', senha: 'senha123' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { token: string; usuario: { id: number } };
    expect(typeof body.token).toBe('string');
    expect(body.usuario).toMatchObject({ id: 1, email: 'a@b.com' });
  });

  it('retorna 401 para credenciais erradas', async () => {
    vi.mocked(authServico.autenticarUsuario).mockResolvedValueOnce(null);
    const app = await montarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'a@b.com', senha: 'errada' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /auth/eu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna dados do usuário autenticado', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com' }] });
    vi.mocked(obterPool).mockReturnValue({ query } as never);
    vi.mocked(carteiraServico.buscarCarteiraVinculada).mockResolvedValueOnce(null);

    const app = await montarApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/eu',
      headers: { authorization: 'Bearer fake-but-mocked' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { usuario: { id: number; email: string } };
    expect(body.usuario).toMatchObject({ id: 1, email: 'a@b.com' });
  });
});

describe('POST /auth/carteira/challenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna mensagem e nonce', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    vi.mocked(obterPool).mockReturnValue({ query } as never);
    vi.mocked(challengeServico.gerarChallenge).mockResolvedValueOnce({
      mensagem: 'msg de teste',
      nonce: 'uuid-test',
    });

    const app = await montarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/carteira/challenge',
      headers: { authorization: 'Bearer token' },
      payload: { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ mensagem: 'msg de teste', nonce: 'uuid-test' });
  });
});

describe('POST /auth/carteira/verificar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('vincula carteira com sucesso', async () => {
    vi.mocked(challengeServico.verificarChallenge).mockResolvedValueOnce({
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    });
    vi.mocked(carteiraServico.vincularCarteira).mockResolvedValueOnce({
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      status: 'pendente',
      vinculadaEm: new Date(),
    });

    const app = await montarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/carteira/verificar',
      headers: { authorization: 'Bearer token' },
      payload: { nonce: 'uuid', assinatura: '0xsig' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toMatchObject({ status: 'pendente' });
  });
});
