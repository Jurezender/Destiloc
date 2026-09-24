import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks devem ser declarados antes dos imports que os usam
vi.mock("../blockchain/index.js", () => ({ obterContrato: vi.fn() }));
vi.mock("../db/cliente.js", () => ({ obterPool: vi.fn() }));

import { consultarGarrafa, GarrafaNaoEncontradaError, type RespostaGarrafa } from "./consulta.js";
import { obterContrato } from "../blockchain/index.js";
import { obterPool } from "../db/cliente.js";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const ADDR_PRODUTOR  = "0xC13299B5C96f9b377F15c8756Ab47f870aA04bc4";
const ADDR_ENVASADOR = "0x26993ea09DDA8568805248e9CeBDAa012eA0666D";
const CHAIN_ID = 31337;
const TOKEN_ID = "1";

const RESPOSTA_CACHE: RespostaGarrafa = {
  garrafa:      { tokenId: TOKEN_ID, envasamentoId: "1", emitidaEm: "100" },
  envasamento:  {
    envasador: ADDR_ENVASADOR, quantidadeDeclarada: "5", quantidadeEmitida: "3",
    registradoEm: "50", concluidoEm: "0", metadataURI: "ipfs://env",
  },
  lote: {
    id: "1", produtor: ADDR_PRODUTOR, tipoBebida: 1, estado: 2,
    criadoEm: "1", concluidoEm: "2", metadataURI: "ipfs://lote",
    metadataURIConclusao: "ipfs://conclusao",
  },
  configuracao: { maturacaoAplicavel: false, retificacaoAplicavel: false, blendagemAplicavel: false, ajusteFinalAplicavel: true },
  insumosVinculados: [],
  etapas: [],
  nomesCarteiras: { [ADDR_PRODUTOR]: "Fazenda Exemplo" },
};

// Fake contract que responde com dados mínimos para lote sem insumos/etapas.
function criarContratosFake() {
  const envasamento = {
    garrafaExiste:     vi.fn().mockResolvedValue(true),
    obterGarrafa:      vi.fn().mockResolvedValue({ envasamentoId: 1n, emitidaEm: 100n }),
    obterEnvasamento:  vi.fn().mockResolvedValue({
      loteProducaoId: 1n, envasador: ADDR_ENVASADOR,
      quantidadeDeclarada: 5n, quantidadeEmitida: 3n,
      registradoEm: 50n, concluidoEm: 0n, metadataURI: "ipfs://env",
    }),
  };
  const producao = {
    loteProducaoExiste:       vi.fn().mockResolvedValue(true),
    obterLoteProducao:        vi.fn().mockResolvedValue({
      produtor: ADDR_PRODUTOR, tipoBebida: 1n, estado: 2n,
      criadoEm: 1n, concluidoEm: 2n,
      metadataURI: "ipfs://lote", metadataURIConclusao: "ipfs://conclusao",
    }),
    obterConfiguracao:        vi.fn().mockResolvedValue({
      maturacaoAplicavel: false, retificacaoAplicavel: false,
      blendagemAplicavel: false, ajusteFinalAplicavel: true,
    }),
    totalInsumosVinculados:   vi.fn().mockResolvedValue(0n),
    totalEtapas:              vi.fn().mockResolvedValue(0n),
    insumoVinculadoPorIndice: vi.fn(),
    etapaPorIndice:           vi.fn(),
    totalInsumosDaEtapa:      vi.fn(),
    insumoDaEtapaPorIndice:   vi.fn(),
  };
  const insumos = {};

  vi.mocked(obterContrato).mockImplementation((nome) => {
    if (nome === "ContratoEnvasamento") return envasamento as any;
    if (nome === "ContratoProducao")    return producao as any;
    return insumos as any;
  });

  return { envasamento, producao };
}

// ─── Testes ────────────────────────────────────────────────────────────────

describe("consultarGarrafa — cache", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(obterPool).mockReturnValue({ query: mockQuery } as any);
  });

  it("cache hit: retorna dados do banco sem consultar blockchain", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ dados: RESPOSTA_CACHE }] });

    const resultado = await consultarGarrafa(CHAIN_ID, TOKEN_ID);

    expect(resultado).toEqual(RESPOSTA_CACHE);
    expect(obterContrato).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("garrafa_cache"),
      [CHAIN_ID, TOKEN_ID]
    );
  });

  it("cache miss: consulta blockchain e salva no banco", async () => {
    // SELECT retorna vazio (miss)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // SELECT carteiras_conhecidas
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT garrafa_cache
    mockQuery.mockResolvedValueOnce({ rows: [] });

    criarContratosFake();

    const resultado = await consultarGarrafa(CHAIN_ID, TOKEN_ID);

    expect(resultado.garrafa.tokenId).toBe(TOKEN_ID);
    expect(resultado.lote.id).toBe("1");

    // Deve ter chamado INSERT no cache
    const chamadas = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(chamadas.some((sql) => sql.includes("INSERT") && sql.includes("garrafa_cache"))).toBe(true);
    expect(obterContrato).toHaveBeenCalled();
  });

  it("cache miss: resposta contém os campos corretos após lote sem insumos e sem etapas", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    criarContratosFake();

    const resultado = await consultarGarrafa(CHAIN_ID, TOKEN_ID);

    expect(resultado.insumosVinculados).toEqual([]);
    expect(resultado.etapas).toEqual([]);
    expect(resultado.configuracao.ajusteFinalAplicavel).toBe(true);
    expect(resultado.envasamento.envasador).toBe(ADDR_ENVASADOR);
  });

  it("cache read error: trata como miss e consulta blockchain normalmente", async () => {
    // SELECT lança erro (banco fora do ar)
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));
    // SELECT carteiras_conhecidas
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT garrafa_cache — falha nas duas tentativas (retry incluído)
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    criarContratosFake();

    const resultado = await consultarGarrafa(CHAIN_ID, TOKEN_ID);

    expect(resultado.garrafa.tokenId).toBe(TOKEN_ID);
    expect(obterContrato).toHaveBeenCalled();
  });

  it("cache write error: retorna resposta mesmo quando INSERT falha", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });         // SELECT miss
    mockQuery.mockResolvedValueOnce({ rows: [] });         // carteiras
    mockQuery.mockRejectedValueOnce(new Error("timeout")); // INSERT falha tentativa 1
    mockQuery.mockRejectedValueOnce(new Error("timeout")); // INSERT falha tentativa 2

    criarContratosFake();

    // Não deve lançar — falha no cache é silenciosa
    const resultado = await consultarGarrafa(CHAIN_ID, TOKEN_ID);
    expect(resultado.garrafa.tokenId).toBe(TOKEN_ID);
  });

  it("garrafa inexistente lança GarrafaNaoEncontradaError mesmo com cache disponível", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // cache miss

    vi.mocked(obterContrato).mockImplementation((nome) => {
      if (nome === "ContratoEnvasamento") {
        return { garrafaExiste: vi.fn().mockResolvedValue(false) } as any;
      }
      return {} as any;
    });

    await expect(consultarGarrafa(CHAIN_ID, "999")).rejects.toThrow(
      GarrafaNaoEncontradaError
    );
  });

  it("cache hit com nomesCarteiras: retorna apelidos sem nova consulta ao banco", async () => {
    const comNomes: RespostaGarrafa = {
      ...RESPOSTA_CACHE,
      nomesCarteiras: { [ADDR_PRODUTOR]: "Destilaria Boa Vista" },
    };
    mockQuery.mockResolvedValueOnce({ rows: [{ dados: comNomes }] });

    const resultado = await consultarGarrafa(CHAIN_ID, TOKEN_ID);

    expect(resultado.nomesCarteiras[ADDR_PRODUTOR]).toBe("Destilaria Boa Vista");
    // Apenas 1 query (SELECT cache) — sem nova consulta de carteiras
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("retry em 429: retenta após rate limit e retorna resposta correta", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // cache miss
    mockQuery.mockResolvedValueOnce({ rows: [] }); // carteiras
    mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT

    const erroRateLimit = Object.assign(new Error("Too Many Requests"), {
      info: { error: { code: -32005 } },
    });

    const { envasamento } = criarContratosFake();
    // garrafaExiste falha na 1ª tentativa (429), sucede na 2ª (retry)
    envasamento.garrafaExiste = vi.fn()
      .mockRejectedValueOnce(erroRateLimit)
      .mockResolvedValue(true);

    const resultado = await consultarGarrafa(CHAIN_ID, TOKEN_ID);

    expect(resultado.garrafa.tokenId).toBe(TOKEN_ID);
    expect(envasamento.garrafaExiste).toHaveBeenCalledTimes(2);
  }, 10_000); // timeout estendido para cobrir o backoff de 1 s
});
