import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../blockchain/index.js", () => ({ obterContrato: vi.fn() }));
vi.mock("../db/cliente.js", () => ({ obterPool: vi.fn() }));

import {
  haversine,
  detectarComportamentoIncomum,
  detectarTipoDispositivo,
  registrarScan,
  listarScans,
} from "./scans.js";
import { GarrafaNaoEncontradaError } from "./consulta.js";
import { obterContrato } from "../blockchain/index.js";
import { obterPool } from "../db/cliente.js";

// ─── haversine ─────────────────────────────────────────────────────────────

describe("haversine", () => {
  it("São Paulo → Rio de Janeiro ≈ 350–370 km", () => {
    const km = haversine(-23.55, -46.63, -22.91, -43.17);
    expect(km).toBeGreaterThan(350);
    expect(km).toBeLessThan(370);
  });

  it("mesma localização retorna 0", () => {
    expect(haversine(-23.55, -46.63, -23.55, -46.63)).toBeCloseTo(0, 1);
  });
});

// ─── detectarComportamentoIncomum ───────────────────────────────────────────

describe("detectarComportamentoIncomum", () => {
  it("sem registro anterior: não é suspeito", () => {
    const result = detectarComportamentoIncomum(-22.91, -43.17, new Date(), null);
    expect(result.suspeito).toBe(false);
    expect(result.motivo).toBeNull();
  });

  it("velocidade > 500 km/h: suspeito com motivo", () => {
    const agora = new Date();
    const trintaMinAtras = new Date(agora.getTime() - 30 * 60 * 1000);
    // SP → RJ (~357 km) em 30 min ≈ 714 km/h
    const anterior = { latitude: -23.55, longitude: -46.63, escaneadoEm: trintaMinAtras };
    const result = detectarComportamentoIncomum(-22.91, -43.17, agora, anterior);
    expect(result.suspeito).toBe(true);
    expect(result.motivo).not.toBeNull();
    expect(result.motivo).toContain("km/h");
  });

  it("velocidade < 500 km/h: não é suspeito", () => {
    const agora = new Date();
    const quatroHorasAtras = new Date(agora.getTime() - 4 * 60 * 60 * 1000);
    // SP → RJ (~357 km) em 4h ≈ 89 km/h
    const anterior = { latitude: -23.55, longitude: -46.63, escaneadoEm: quatroHorasAtras };
    const result = detectarComportamentoIncomum(-22.91, -43.17, agora, anterior);
    expect(result.suspeito).toBe(false);
  });

  it("intervalo < 1 s: não é suspeito (evita divisão por zero)", () => {
    const agora = new Date();
    const menosDeUmSegundo = new Date(agora.getTime() - 100);
    const anterior = { latitude: -22.91, longitude: -43.17, escaneadoEm: menosDeUmSegundo };
    const result = detectarComportamentoIncomum(-23.55, -46.63, agora, anterior);
    expect(result.suspeito).toBe(false);
  });
});

// ─── detectarTipoDispositivo ────────────────────────────────────────────────

describe("detectarTipoDispositivo", () => {
  it("iPhone → mobile", () => {
    expect(detectarTipoDispositivo("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)")).toBe("mobile");
  });

  it("Android phone → mobile", () => {
    expect(detectarTipoDispositivo("Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile Safari")).toBe("mobile");
  });

  it("iPad → tablet", () => {
    expect(detectarTipoDispositivo("Mozilla/5.0 (iPad; CPU OS 16_0)")).toBe("tablet");
  });

  it("Android tablet (sem 'mobile') → tablet", () => {
    expect(detectarTipoDispositivo("Mozilla/5.0 (Linux; Android 12; SM-T870) AppleWebKit")).toBe("tablet");
  });

  it("desktop Chrome → desktop", () => {
    expect(detectarTipoDispositivo("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/115")).toBe("desktop");
  });
});

// ─── registrarScan ──────────────────────────────────────────────────────────

describe("registrarScan", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(obterPool).mockReturnValue({ query: mockQuery } as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          address: { city: "São Paulo", state: "São Paulo", country: "Brasil" },
        }),
    }));
  });

  const ENTRADA_BASE = {
    chainId: 11155111,
    tokenId: "1",
    latitude: -23.55,
    longitude: -46.63,
    precisao: 42,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0) Mobile",
    ip: "192.168.1.100",
  };

  it("garrafa no cache: registra sem chamar blockchain", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })  // cache hit
      .mockResolvedValueOnce({ rows: [] })              // sem scan anterior
      .mockResolvedValueOnce({ rows: [] });             // INSERT

    await registrarScan(ENTRADA_BASE);

    expect(obterContrato).not.toHaveBeenCalled();
    const inseriu = mockQuery.mock.calls.some(
      (c) => (c[0] as string).includes("INSERT") && (c[0] as string).includes("scan_garrafa")
    );
    expect(inseriu).toBe(true);
  });

  it("garrafa fora do cache, existe na blockchain: registra scan", async () => {
    const contratoFake = { garrafaExiste: vi.fn().mockResolvedValue(true) };
    vi.mocked(obterContrato).mockReturnValue(contratoFake as any);

    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // cache miss
      .mockResolvedValueOnce({ rows: [] })   // sem scan anterior
      .mockResolvedValueOnce({ rows: [] });  // INSERT

    await registrarScan(ENTRADA_BASE);

    expect(contratoFake.garrafaExiste).toHaveBeenCalledWith("1");
    const inseriu = mockQuery.mock.calls.some(
      (c) => (c[0] as string).includes("INSERT")
    );
    expect(inseriu).toBe(true);
  });

  it("garrafa não existe: lança GarrafaNaoEncontradaError", async () => {
    vi.mocked(obterContrato).mockReturnValue({
      garrafaExiste: vi.fn().mockResolvedValue(false),
    } as any);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // cache miss

    await expect(registrarScan(ENTRADA_BASE)).rejects.toThrow(GarrafaNaoEncontradaError);
  });

  it("erro no cache check: faz fallback para blockchain e registra scan", async () => {
    const contratoFake = { garrafaExiste: vi.fn().mockResolvedValue(true) };
    vi.mocked(obterContrato).mockReturnValue(contratoFake as any);

    mockQuery
      .mockRejectedValueOnce(new Error("DB connection error")) // cache check falha
      .mockResolvedValueOnce({ rows: [] })                     // sem scan anterior
      .mockResolvedValueOnce({ rows: [] });                    // INSERT

    await registrarScan(ENTRADA_BASE);

    expect(contratoFake.garrafaExiste).toHaveBeenCalledWith("1");
    const inseriu = mockQuery.mock.calls.some(
      (c) => (c[0] as string).includes("INSERT")
    );
    expect(inseriu).toBe(true);
  });

  it("consulta anterior com velocidade > 500 km/h: marca suspeito=true", async () => {
    const trintaMinAtras = new Date(Date.now() - 30 * 60 * 1000);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })   // cache hit
      .mockResolvedValueOnce({
        rows: [{
          latitude: "-22.91",
          longitude: "-43.17",
          escaneado_em: trintaMinAtras,
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // INSERT

    // Nova consulta em SP (-23.55, -46.63) — anterior era no RJ → ~357 km em 30 min
    await registrarScan({ ...ENTRADA_BASE, latitude: -23.55, longitude: -46.63 });

    const insertCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes("INSERT")
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    const suspeito = params[10]; // posição 10 = suspeito (índice 0-base: $11)
    expect(suspeito).toBe(true);
    const motivo = params[11];   // posição 11 = motivo_suspeita
    expect(motivo).toContain("km/h");
  });

  it("primeiro scan (sem histórico): suspeito=false", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // cache hit
      .mockResolvedValueOnce({ rows: [] })             // sem anterior
      .mockResolvedValueOnce({ rows: [] });            // INSERT

    await registrarScan(ENTRADA_BASE);

    const insertCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes("INSERT")
    );
    const suspeito = (insertCall![1] as unknown[])[10];
    expect(suspeito).toBe(false);
  });

  it("trunca coordenadas para 2 casas decimais antes de persistir", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await registrarScan({
      ...ENTRADA_BASE,
      latitude: -23.556789,
      longitude: -46.638901,
    });

    const insertCall = mockQuery.mock.calls.find(
      (c) => (c[0] as string).includes("INSERT")
    );
    const params = insertCall![1] as unknown[];
    expect(params[2]).toBeCloseTo(-23.56, 5);
    expect(params[3]).toBeCloseTo(-46.64, 5);
  });
});

// ─── listarScans ───────────────────────────────────────────────────────────

describe("listarScans", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(obterPool).mockReturnValue({ query: mockQuery } as any);
  });

  it("retorna lista formatada com campos corretos", async () => {
    const dataExemplo = new Date("2025-06-15T14:30:00Z");
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "1",
          cidade: "São Paulo",
          estado: "São Paulo",
          pais: "Brasil",
          escaneado_em: dataExemplo,
          suspeito: false,
          motivo_suspeita: null,
        },
      ],
    });

    const resultado = await listarScans(11155111, "1");

    expect(resultado.total).toBe(1);
    expect(resultado.scans[0].id).toBe(1);
    expect(resultado.scans[0].cidade).toBe("São Paulo");
    expect(resultado.scans[0].escaneadoEm).toBe(dataExemplo.toISOString());
    expect(resultado.scans[0].suspeito).toBe(false);
    expect(resultado.scans[0].motivo).toBeNull();
  });

  it("retorna lista vazia quando não há scans", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const resultado = await listarScans(31337, "99");

    expect(resultado.total).toBe(0);
    expect(resultado.scans).toEqual([]);
  });
});
