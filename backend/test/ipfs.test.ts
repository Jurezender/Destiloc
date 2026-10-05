import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/db/cliente.js', () => ({ obterPool: vi.fn() }));
vi.mock('../src/servicos/pinata.js', () => ({
  fixarJsonNoPinata: vi.fn(),
  fixarArquivoNoPinata: vi.fn(),
}));
vi.mock('../src/middlewares/autorizacao.js', () => ({
  autenticarJWT: vi.fn(async () => {}),
  exigirCarteiraAutorizada: vi.fn(async (req: { carteiraAddress: string }) => {
    req.carteiraAddress = '0xTestAddress';
  }),
  exigirAdmin: vi.fn(async (req: { carteiraAddress: string }) => {
    req.carteiraAddress = '0xTestAddress';
  }),
}));

import { construirApp } from '../src/app.js';
import { obterPool } from '../src/db/cliente.js';
import { fixarArquivoNoPinata, fixarJsonNoPinata } from '../src/servicos/pinata.js';

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

// ──────────────────────────────────────────────────────────────────────────────
// Helpers para construir corpo multipart/form-data nos testes
// ──────────────────────────────────────────────────────────────────────────────

function construirMultipart(
  nomeArquivo: string,
  conteudo: Buffer,
  mimeType: string,
): { body: Buffer; headers: Record<string, string> } {
  const boundary = 'testboundary12345678';
  const cabecalho = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${nomeArquivo}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const rodape = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([cabecalho, conteudo, rodape]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

const PDF_FAKE = Buffer.from('%PDF-1.4 fake pdf content');
const CID_ARQUIVO_FAKE = 'ipfs://QmArquivoFakeCID1234567890abcdef';

describe('POST /ipfs/upload-arquivo', () => {
  let app: Awaited<ReturnType<typeof construirApp>>;

  beforeEach(async () => {
    vi.mocked(obterPool).mockReturnValue(mockPool as any);
    app = await construirApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('retorna 400 quando o corpo não é multipart', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload-arquivo',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(400);
  });

  it('retorna 415 para tipo MIME não permitido', async () => {
    const { body, headers } = construirMultipart(
      'script.js',
      Buffer.from('alert(1)'),
      'application/javascript',
    );
    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload-arquivo',
      headers,
      body,
    });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ erro: expect.stringContaining('não permitido') });
  });

  it('cache hit — retorna CID sem chamar o Pinata', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ cid: CID_ARQUIVO_FAKE }] });
    const { body, headers } = construirMultipart('laudo.pdf', PDF_FAKE, 'application/pdf');

    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload-arquivo',
      headers,
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ cid: CID_ARQUIVO_FAKE, origem: 'cache' });
    expect(fixarArquivoNoPinata).not.toHaveBeenCalled();
  });

  it('cache miss — chama o Pinata, salva no banco e retorna 201', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // SELECT: cache miss
      .mockResolvedValueOnce({ rows: [] });  // INSERT
    vi.mocked(fixarArquivoNoPinata).mockResolvedValueOnce(CID_ARQUIVO_FAKE);
    const { body, headers } = construirMultipart('nota.pdf', PDF_FAKE, 'application/pdf');

    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload-arquivo',
      headers,
      body,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ cid: CID_ARQUIVO_FAKE, origem: 'pinata', nome: 'nota.pdf' });
    expect(fixarArquivoNoPinata).toHaveBeenCalledOnce();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('cache miss — INSERT usa tipo "arquivo" e hash SHA-256 do buffer', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    vi.mocked(fixarArquivoNoPinata).mockResolvedValueOnce(CID_ARQUIVO_FAKE);
    const { body, headers } = construirMultipart('doc.pdf', PDF_FAKE, 'application/pdf');

    await app.inject({ method: 'POST', url: '/ipfs/upload-arquivo', headers, body });

    const [insertSql, insertParams] = mockQuery.mock.calls[1];
    expect(insertSql).toContain('ON CONFLICT');
    expect(insertParams[1]).toBe(CID_ARQUIVO_FAKE);
    expect(insertParams[2]).toBe('arquivo');
    // hash é SHA-256 hex de 64 chars
    expect(typeof insertParams[0]).toBe('string');
    expect(insertParams[0]).toHaveLength(64);
  });

  it('retorna 502 quando o Pinata falha', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    vi.mocked(fixarArquivoNoPinata).mockRejectedValueOnce(new Error('Pinata fora do ar'));
    const { body, headers } = construirMultipart('doc.pdf', PDF_FAKE, 'application/pdf');

    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload-arquivo',
      headers,
      body,
    });

    expect(res.statusCode).toBe(502);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('resposta nunca contém o JWT do Pinata', async () => {
    const jwtFake = 'jwt-arquivo-secreto-nao-deve-vazar';
    process.env.PINATA_JWT = jwtFake;
    mockQuery.mockResolvedValueOnce({ rows: [{ cid: CID_ARQUIVO_FAKE }] });
    const { body, headers } = construirMultipart('doc.pdf', PDF_FAKE, 'application/pdf');

    const res = await app.inject({
      method: 'POST',
      url: '/ipfs/upload-arquivo',
      headers,
      body,
    });

    expect(res.payload).not.toContain(jwtFake);
    delete process.env.PINATA_JWT;
  });
});
