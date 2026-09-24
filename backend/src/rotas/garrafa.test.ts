import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import garrafaRota from "./garrafa.js";
import * as consultaModulo from "../servicos/consulta.js";

vi.mock("../servicos/consulta.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../servicos/consulta.js")>();
  return {
    ...original,
    consultarGarrafa: vi.fn(),
  };
});

const consultarGarrafaMock = vi.mocked(consultaModulo.consultarGarrafa);

const RESPOSTA_EXEMPLO: consultaModulo.RespostaGarrafa = {
  garrafa: {
    tokenId: "1",
    envasamentoId: "1",
    emitidaEm: "1700000000",
  },
  envasamento: {
    envasador: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    quantidadeDeclarada: "500",
    quantidadeEmitida: "500",
    registradoEm: "1699990000",
    concluidoEm: "1700000000",
    metadataURI: "ipfs://QmEnvasamento",
  },
  lote: {
    id: "1",
    produtor: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    tipoBebida: 0,
    estado: 2,
    criadoEm: "1699900000",
    concluidoEm: "1699990000",
    metadataURI: "ipfs://QmLote",
    metadataURIConclusao: "ipfs://QmLoteConclusao",
  },
  configuracao: {
    maturacaoAplicavel: true,
    retificacaoAplicavel: false,
    blendagemAplicavel: false,
    ajusteFinalAplicavel: true,
  },
  insumosVinculados: [
    {
      id: "1",
      tipo: 0,
      fornecedor: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      metadataURI: "ipfs://QmInsumo1",
    },
  ],
  etapas: [
    {
      indice: 0,
      etapa: 0,
      executadoPor: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      inicioInformado: "1699900000",
      fimInformado: "1699950000",
      registradoEm: "1699950001",
      metadataURI: "ipfs://QmEtapa0",
      insumosUtilizados: ["1"],
    },
  ],
  nomesCarteiras: {
    "0x5FbDB2315678afecb367f032d93F642f64180aa3": "Destilaria Exemplo",
  },
};

async function montarApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(garrafaRota);
  await app.ready();
  return app;
}

describe("GET /garrafa/:chainId/:tokenId", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await montarApp();
    consultarGarrafaMock.mockReset();
  });

  afterEach(async () => {
    await app.close();
  });

  it("retorna 200 com os dados da garrafa quando encontrada", async () => {
    consultarGarrafaMock.mockResolvedValue(RESPOSTA_EXEMPLO);

    const res = await app.inject({
      method: "GET",
      url: "/garrafa/31337/1",
    });

    expect(res.statusCode).toBe(200);
    const corpo = res.json() as consultaModulo.RespostaGarrafa;
    expect(corpo.garrafa.tokenId).toBe("1");
    expect(corpo.lote.id).toBe("1");
    expect(corpo.nomesCarteiras["0x5FbDB2315678afecb367f032d93F642f64180aa3"]).toBe(
      "Destilaria Exemplo"
    );
    expect(consultarGarrafaMock).toHaveBeenCalledWith(31337, "1");
  });

  it("retorna 404 quando GarrafaNaoEncontradaError é lançado", async () => {
    consultarGarrafaMock.mockRejectedValue(
      new consultaModulo.GarrafaNaoEncontradaError("Esta garrafa não existe.")
    );

    const res = await app.inject({
      method: "GET",
      url: "/garrafa/31337/999",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ erro: string }>().erro).toBe("Esta garrafa não existe.");
  });

  it("retorna 503 para erros inesperados de blockchain", async () => {
    consultarGarrafaMock.mockRejectedValue(new Error("Connection refused"));

    const res = await app.inject({
      method: "GET",
      url: "/garrafa/11155111/1",
    });

    expect(res.statusCode).toBe(503);
    expect(res.json<{ erro: string }>().erro).toContain("blockchain");
  });

  it("retorna 400 quando chainId não é um inteiro positivo", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/garrafa/abc/1",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ erro: string }>().erro).toContain("chainId");
    expect(consultarGarrafaMock).not.toHaveBeenCalled();
  });

  it("retorna 400 quando chainId é zero", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/garrafa/0/1",
    });

    expect(res.statusCode).toBe(400);
  });

  it("retorna 400 quando tokenId não é numérico", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/garrafa/31337/abc",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ erro: string }>().erro).toContain("tokenId");
    expect(consultarGarrafaMock).not.toHaveBeenCalled();
  });
});
