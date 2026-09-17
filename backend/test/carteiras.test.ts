import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Intercepta o módulo antes de qualquer import que o carregue
vi.mock('../src/db/cliente.js', () => ({
  obterPool: vi.fn(),
}));

import { construirApp } from '../src/app.js';
import { obterPool } from '../src/db/cliente.js';

const ADDR_VALIDO = '0xCf1C265f662567c499A2CF046Ab555488c2Df399';

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

describe('GET /carteiras/:address', () => {
  let app: Awaited<ReturnType<typeof construirApp>>;

  beforeEach(async () => {
    vi.mocked(obterPool).mockReturnValue(mockPool as any);
    app = await construirApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('retorna 400 para endereço inválido', async () => {
    const res = await app.inject({ method: 'GET', url: '/carteiras/nao-e-endereco' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ erro: expect.any(String) });
  });

  it('retorna 400 para endereço curto demais', async () => {
    const res = await app.inject({ method: 'GET', url: '/carteiras/0x1234' });
    expect(res.statusCode).toBe(400);
  });

  it('retorna 404 quando carteira não existe no banco', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await app.inject({ method: 'GET', url: `/carteiras/${ADDR_VALIDO}` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ erro: expect.any(String) });
  });

  it('retorna 200 com os dados quando carteira existe', async () => {
    const registro = {
      address: ADDR_VALIDO,
      apelido: 'Admin Principal',
      papel_principal: 'admin',
      anotacoes: null,
      cadastrada_em: new Date().toISOString(),
      atualizada_em: new Date().toISOString(),
    };
    mockQuery.mockResolvedValueOnce({ rows: [registro] });

    const res = await app.inject({ method: 'GET', url: `/carteiras/${ADDR_VALIDO}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ address: ADDR_VALIDO, apelido: 'Admin Principal' });
  });

  it('usa consulta parametrizada (não interpola o endereço na query)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await app.inject({ method: 'GET', url: `/carteiras/${ADDR_VALIDO}` });

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('$1');
    expect(params).toEqual([ADDR_VALIDO]);
  });
});

describe('PUT /carteiras/:address', () => {
  let app: Awaited<ReturnType<typeof construirApp>>;

  beforeEach(async () => {
    vi.mocked(obterPool).mockReturnValue(mockPool as any);
    app = await construirApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('retorna 400 para endereço inválido', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/carteiras/nao-e-endereco',
      payload: { apelido: 'Teste' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('retorna 400 quando apelido está ausente', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/carteiras/${ADDR_VALIDO}`,
      payload: { papel_principal: 'admin' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('retorna 400 quando apelido é string vazia', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/carteiras/${ADDR_VALIDO}`,
      payload: { apelido: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('retorna 400 para papel_principal inválido', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/carteiras/${ADDR_VALIDO}`,
      payload: { apelido: 'Teste', papel_principal: 'invalido' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('retorna 201 ao criar nova carteira', async () => {
    const registro = {
      address: ADDR_VALIDO,
      apelido: 'Novo Produtor',
      papel_principal: 'produtor',
      anotacoes: null,
      cadastrada_em: new Date().toISOString(),
      atualizada_em: new Date().toISOString(),
      inserido: true,
    };
    mockQuery.mockResolvedValueOnce({ rows: [registro] });

    const res = await app.inject({
      method: 'PUT',
      url: `/carteiras/${ADDR_VALIDO}`,
      payload: { apelido: 'Novo Produtor', papel_principal: 'produtor' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ address: ADDR_VALIDO, apelido: 'Novo Produtor' });
    expect(body).not.toHaveProperty('inserido');
  });

  it('retorna 200 ao atualizar carteira existente', async () => {
    const registro = {
      address: ADDR_VALIDO,
      apelido: 'Nome Atualizado',
      papel_principal: 'produtor',
      anotacoes: 'observação',
      cadastrada_em: new Date().toISOString(),
      atualizada_em: new Date().toISOString(),
      inserido: false,
    };
    mockQuery.mockResolvedValueOnce({ rows: [registro] });

    const res = await app.inject({
      method: 'PUT',
      url: `/carteiras/${ADDR_VALIDO}`,
      payload: { apelido: 'Nome Atualizado', papel_principal: 'produtor', anotacoes: 'observação' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ apelido: 'Nome Atualizado', anotacoes: 'observação' });
  });

  it('usa consulta parametrizada no UPSERT', async () => {
    const registro = {
      address: ADDR_VALIDO,
      apelido: 'Teste',
      papel_principal: null,
      anotacoes: null,
      cadastrada_em: new Date().toISOString(),
      atualizada_em: new Date().toISOString(),
      inserido: true,
    };
    mockQuery.mockResolvedValueOnce({ rows: [registro] });

    await app.inject({
      method: 'PUT',
      url: `/carteiras/${ADDR_VALIDO}`,
      payload: { apelido: 'Teste' },
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('$1');
    expect(sql).toContain('ON CONFLICT');
    expect(params[0]).toBe(ADDR_VALIDO);
    expect(params[1]).toBe('Teste');
  });
});
