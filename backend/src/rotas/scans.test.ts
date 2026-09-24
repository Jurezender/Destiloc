import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import scansRota from "./scans.js";
import * as scansServico from "../servicos/scans.js";
import { GarrafaNaoEncontradaError } from "../servicos/consulta.js";

vi.mock("../servicos/scans.js", () => ({
  registrarScan: vi.fn(),
  listarScans: vi.fn(),
}));

const CORPO_VALIDO = {
  chainId: 11155111,
  tokenId: "1",
  latitude: -23.55,
  longitude: -46.63,
  precisao: 42,
};

const HISTORICO_EXEMPLO: scansServico.HistoricoScans = {
  total: 1,
  scans: [
    {
      id: 1,
      cidade: "São Paulo",
      estado: "São Paulo",
      pais: "Brasil",
      escaneadoEm: "2025-06-15T14:30:00.000Z",
      suspeito: false,
      motivo: null,
    },
  ],
};

async function montarApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(scansRota);
  await app.ready();
  return app;
}

// ─── POST /scans ───────────────────────────────────────────────────────────

describe("POST /scans", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await montarApp();
    vi.mocked(scansServico.registrarScan).mockReset();
  });

  afterEach(async () => {
    await app.close();
  });

  it("retorna 201 quando scan é registrado com sucesso", async () => {
    vi.mocked(scansServico.registrarScan).mockResolvedValue(undefined);

    const res = await app.inject({
      method: "POST",
      url: "/scans",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(CORPO_VALIDO),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json<{ registrado: boolean }>().registrado).toBe(true);
    expect(vi.mocked(scansServico.registrarScan)).toHaveBeenCalledOnce();
  });

  it("retorna 422 quando GarrafaNaoEncontradaError é lançado", async () => {
    vi.mocked(scansServico.registrarScan).mockRejectedValue(
      new GarrafaNaoEncontradaError("Esta garrafa não existe.")
    );

    const res = await app.inject({
      method: "POST",
      url: "/scans",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(CORPO_VALIDO),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ erro: string }>().erro).toContain("garrafa");
  });

  it("retorna 503 para erros inesperados", async () => {
    vi.mocked(scansServico.registrarScan).mockRejectedValue(new Error("DB connection failed"));

    const res = await app.inject({
      method: "POST",
      url: "/scans",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(CORPO_VALIDO),
    });

    expect(res.statusCode).toBe(503);
    expect(vi.mocked(scansServico.registrarScan)).toHaveBeenCalledOnce();
  });

  it("retorna 400 quando chainId não é inteiro positivo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/scans",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...CORPO_VALIDO, chainId: 0 }),
    });

    expect(res.statusCode).toBe(400);
    expect(vi.mocked(scansServico.registrarScan)).not.toHaveBeenCalled();
  });

  it("retorna 400 quando tokenId não é numérico", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/scans",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...CORPO_VALIDO, tokenId: "abc" }),
    });

    expect(res.statusCode).toBe(400);
    expect(vi.mocked(scansServico.registrarScan)).not.toHaveBeenCalled();
  });

  it("retorna 400 quando latitude está fora do intervalo -90/90", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/scans",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...CORPO_VALIDO, latitude: 91 }),
    });

    expect(res.statusCode).toBe(400);
  });

  it("retorna 400 quando longitude está fora do intervalo -180/180", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/scans",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...CORPO_VALIDO, longitude: -181 }),
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── GET /garrafa/:chainId/:tokenId/scans ─────────────────────────────────

describe("GET /garrafa/:chainId/:tokenId/scans", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await montarApp();
    vi.mocked(scansServico.listarScans).mockReset();
  });

  afterEach(async () => {
    await app.close();
  });

  it("retorna 200 com o histórico de scans", async () => {
    vi.mocked(scansServico.listarScans).mockResolvedValue(HISTORICO_EXEMPLO);

    const res = await app.inject({
      method: "GET",
      url: "/garrafa/11155111/1/scans",
    });

    expect(res.statusCode).toBe(200);
    const corpo = res.json<scansServico.HistoricoScans>();
    expect(corpo.total).toBe(1);
    expect(corpo.scans[0].cidade).toBe("São Paulo");
    expect(vi.mocked(scansServico.listarScans)).toHaveBeenCalledWith(11155111, "1");
  });

  it("retorna 200 com lista vazia quando não há scans", async () => {
    vi.mocked(scansServico.listarScans).mockResolvedValue({ total: 0, scans: [] });

    const res = await app.inject({
      method: "GET",
      url: "/garrafa/11155111/99/scans",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<scansServico.HistoricoScans>().total).toBe(0);
  });

  it("retorna 400 quando chainId é inválido", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/garrafa/abc/1/scans",
    });

    expect(res.statusCode).toBe(400);
    expect(vi.mocked(scansServico.listarScans)).not.toHaveBeenCalled();
  });

  it("retorna 400 quando tokenId não é numérico", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/garrafa/31337/xyz/scans",
    });

    expect(res.statusCode).toBe(400);
  });

  it("retorna 503 para erros de banco de dados", async () => {
    vi.mocked(scansServico.listarScans).mockRejectedValue(new Error("DB timeout"));

    const res = await app.inject({
      method: "GET",
      url: "/garrafa/11155111/1/scans",
    });

    expect(res.statusCode).toBe(503);
  });
});
