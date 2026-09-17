import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/db/cliente.js', () => ({ obterPool: vi.fn() }));
vi.mock('../src/servicos/pinata.js', () => ({ fixarJsonNoPinata: vi.fn() }));

import { construirApp } from '../src/app.js';
import { obterPool } from '../src/db/cliente.js';
import { fixarJsonNoPinata } from '../src/servicos/pinata.js';

const CONTEUDO_VALIDO = { tipo: 'insumo', versao: 1, tipoInsumo: 'Milho' };
const CID_FAKE = 'ipfs://QmFakeCID1234567890abcdef';

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

describe('POST /ipfs/upload', () => {
  let app: Awaited<ReturnType<typeof construirApp>>;

  beforeEach(async () => {
    vi.mocked(obterPool).mockReturnValue(mockPool as any);
    app = await construirApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('retorna 400 quando conteudo está ausente', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload',
      payload: { tipo: 'insumo' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('retorna 400 quando tipo está ausente', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload',
      payload: { conteudo: CONTEUDO_VALIDO },
    });
    expect(res.statusCode).toBe(400);
  });

  it('retorna 400 para tipo não reconhecido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload',
      payload: { conteudo: CONTEUDO_VALIDO, tipo: 'tipo-invalido' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('cache hit — retorna CID existente sem chamar o Pinata', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ cid: CID_FAKE }] });

    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload',
      payload: { conteudo: CONTEUDO_VALIDO, tipo: 'insumo' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ cid: CID_FAKE, origem: 'cache' });
    expect(fixarJsonNoPinata).not.toHaveBeenCalled();
  });

  it('cache hit — geradoEm é excluído do hash (mesmo conteúdo, timestamps distintos)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ cid: CID_FAKE }] })
      .mockResolvedValueOnce({ rows: [{ cid: CID_FAKE }] });

    const base = { tipo: 'insumo', versao: 1, tipoInsumo: 'Milho' };

    await app.inject({
      method: 'POST',
      url: '/ipfs/upload',
      payload: { conteudo: { ...base, geradoEm: '2024-01-01T00:00:00.000Z' }, tipo: 'insumo' },
    });
    await app.inject({
      method: 'POST',
      url: '/ipfs/upload',
      payload: { conteudo: { ...base, geradoEm: '2026-09-17T15:00:00.000Z' }, tipo: 'insumo' },
    });

    // Ambas as chamadas devem consultar o cache com o mesmo hash
    const [, params1] = mockQuery.mock.calls[0];
    const [, params2] = mockQuery.mock.calls[1];
    expect(params1).toEqual(params2);
  });

  it('cache miss — chama o Pinata, salva no banco e retorna 201', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // SELECT: cache miss
      .mockResolvedValueOnce({ rows: [] }); // INSERT
    vi.mocked(fixarJsonNoPinata).mockResolvedValueOnce(CID_FAKE);

    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload',
      payload: { conteudo: CONTEUDO_VALIDO, tipo: 'insumo' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ cid: CID_FAKE, origem: 'pinata' });
    expect(fixarJsonNoPinata).toHaveBeenCalledOnce();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('cache miss — INSERT usa consulta parametrizada com ON CONFLICT', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    vi.mocked(fixarJsonNoPinata).mockResolvedValueOnce(CID_FAKE);

    await app.inject({
      method: 'POST',
      url: '/ipfs/upload',
      payload: { conteudo: CONTEUDO_VALIDO, tipo: 'insumo' },
    });

    const [insertSql, insertParams] = mockQuery.mock.calls[1];
    expect(insertSql).toContain('$1');
    expect(insertSql).toContain('ON CONFLICT');
    expect(insertParams[1]).toBe(CID_FAKE);
    expect(insertParams[2]).toBe('insumo');
  });

  it('retorna 502 quando o Pinata falha', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    vi.mocked(fixarJsonNoPinata).mockRejectedValueOnce(new Error('Pinata indisponível'));

    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload',
      payload: { conteudo: CONTEUDO_VALIDO, tipo: 'insumo' },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ erro: expect.any(String) });
    // Banco não deve ser escrito em caso de erro do Pinata
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('resposta nunca contém o JWT do Pinata', async () => {
    const jwtFake = 'jwt-secreto-nao-deve-aparecer-na-resposta';
    process.env.PINATA_JWT = jwtFake;
    mockQuery.mockResolvedValueOnce({ rows: [{ cid: CID_FAKE }] });

    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload',
      payload: { conteudo: CONTEUDO_VALIDO, tipo: 'insumo' },
    });

    expect(res.payload).not.toContain(jwtFake);
    delete process.env.PINATA_JWT;
  });
});
