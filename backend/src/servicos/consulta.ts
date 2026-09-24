import { obterContrato } from "../blockchain/index.js";
import { obterPool } from "../db/cliente.js";

export class GarrafaNaoEncontradaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "GarrafaNaoEncontradaError";
  }
}

// Shape da resposta — todos os valores bigint são serializados como string
// para compatibilidade com JSON e para evitar perda de precisão.
export interface RespostaGarrafa {
  garrafa: {
    tokenId: string;
    envasamentoId: string;
    emitidaEm: string;
  };
  envasamento: {
    envasador: string;
    quantidadeDeclarada: string;
    quantidadeEmitida: string;
    registradoEm: string;
    concluidoEm: string;
    metadataURI: string;
  };
  lote: {
    id: string;
    produtor: string;
    tipoBebida: number;
    estado: number;
    criadoEm: string;
    concluidoEm: string;
    metadataURI: string;
    metadataURIConclusao: string;
  };
  configuracao: {
    maturacaoAplicavel: boolean;
    retificacaoAplicavel: boolean;
    blendagemAplicavel: boolean;
    ajusteFinalAplicavel: boolean;
  };
  insumosVinculados: Array<{
    id: string;
    tipo: number;
    fornecedor: string;
    metadataURI: string;
  }>;
  etapas: Array<{
    indice: number;
    etapa: number;
    executadoPor: string;
    inicioInformado: string;
    fimInformado: string;
    registradoEm: string;
    metadataURI: string;
    insumosUtilizados: string[];
  }>;
  nomesCarteiras: Record<string, string>;
}

async function buscarCache(
  chainId: number,
  tokenId: string
): Promise<RespostaGarrafa | null> {
  try {
    const pool = obterPool();
    const resultado = await pool.query<{ dados: RespostaGarrafa }>(
      "SELECT dados FROM garrafa_cache WHERE chain_id = $1 AND token_id = $2",
      [chainId, tokenId]
    );
    return resultado.rows[0]?.dados ?? null;
  } catch {
    // Cache indisponível — trata como miss para não bloquear a consulta.
    return null;
  }
}

async function salvarCache(
  chainId: number,
  tokenId: string,
  dados: RespostaGarrafa
): Promise<void> {
  const inserir = async () => {
    const pool = obterPool();
    await pool.query(
      `INSERT INTO garrafa_cache (chain_id, token_id, dados)
       VALUES ($1, $2, $3)
       ON CONFLICT (chain_id, token_id) DO NOTHING`,
      [chainId, tokenId, JSON.stringify(dados)]
    );
  };
  try {
    await inserir();
  } catch (erro) {
    console.error('[garrafa_cache] tentativa 1 falhou:', erro);
    await new Promise((r) => setTimeout(r, 200));
    try {
      await inserir();
    } catch (erro2) {
      console.error('[garrafa_cache] tentativa 2 falhou:', erro2);
    }
  }
}

export async function consultarGarrafa(
  chainId: number,
  tokenId: string
): Promise<RespostaGarrafa> {
  const cached = await buscarCache(chainId, tokenId);
  if (cached) return cached;

  const envasamentoContrato = obterContrato("ContratoEnvasamento", chainId);

  const existeGarrafa = (await envasamentoContrato.garrafaExiste(tokenId)) as boolean;
  if (!existeGarrafa) {
    throw new GarrafaNaoEncontradaError("Esta garrafa não existe.");
  }

  const dadoGarrafa = await envasamentoContrato.obterGarrafa(tokenId);
  const envasamentoId = dadoGarrafa.envasamentoId as bigint;
  const dadoEnvasamento = await envasamentoContrato.obterEnvasamento(envasamentoId);
  const loteProducaoId = dadoEnvasamento.loteProducaoId as bigint;

  const producaoContrato = obterContrato("ContratoProducao", chainId);

  const existeLote = (await producaoContrato.loteProducaoExiste(loteProducaoId)) as boolean;
  if (!existeLote) {
    throw new GarrafaNaoEncontradaError("O lote de produção desta garrafa não existe.");
  }

  const [dadoLote, dadoConfiguracao] = await Promise.all([
    producaoContrato.obterLoteProducao(loteProducaoId),
    producaoContrato.obterConfiguracao(loteProducaoId),
  ]);

  const insumosContrato = obterContrato("ContratoInsumos", chainId);

  const totalVinculados = Number(await producaoContrato.totalInsumosVinculados(loteProducaoId));
  const idsVinculados = (await Promise.all(
    Array.from({ length: totalVinculados }, (_, i) =>
      producaoContrato.insumoVinculadoPorIndice(loteProducaoId, i)
    )
  )) as bigint[];

  const insumosVinculados = await Promise.all(
    idsVinculados.map(async (insumoId) => {
      const dado = await insumosContrato.obterLoteInsumo(insumoId);
      return {
        id: insumoId.toString(),
        tipo: Number(dado.tipo),
        fornecedor: dado.fornecedor as string,
        metadataURI: dado.metadataURI as string,
      };
    })
  );

  const totalEtapas = Number(await producaoContrato.totalEtapas(loteProducaoId));
  const etapas = await Promise.all(
    Array.from({ length: totalEtapas }, async (_, indice) => {
      const registro = await producaoContrato.etapaPorIndice(loteProducaoId, indice);
      const totalInsumosEtapa = Number(
        await producaoContrato.totalInsumosDaEtapa(loteProducaoId, indice)
      );
      const insumosDaEtapa = (await Promise.all(
        Array.from({ length: totalInsumosEtapa }, (_, j) =>
          producaoContrato.insumoDaEtapaPorIndice(loteProducaoId, indice, j)
        )
      )) as bigint[];

      return {
        indice,
        etapa: Number(registro.etapa),
        executadoPor: registro.executadoPor as string,
        inicioInformado: (registro.inicioInformado as bigint).toString(),
        fimInformado: (registro.fimInformado as bigint).toString(),
        registradoEm: (registro.registradoEm as bigint).toString(),
        metadataURI: registro.metadataURI as string,
        insumosUtilizados: insumosDaEtapa.map(String),
      };
    })
  );

  // Busca apelidos de todos os endereços em uma única query — sem N chamadas HTTP.
  const enderecoUnicos = [
    ...new Set([
      dadoLote.produtor as string,
      dadoEnvasamento.envasador as string,
      ...etapas.map((e) => e.executadoPor),
    ]),
  ];

  const nomesCarteiras: Record<string, string> = {};
  try {
    const pool = obterPool();
    const resultado = await pool.query<{ address: string; apelido: string }>(
      "SELECT address, apelido FROM carteiras_conhecidas WHERE address = ANY($1)",
      [enderecoUnicos]
    );
    for (const row of resultado.rows) {
      nomesCarteiras[row.address] = row.apelido;
    }
  } catch {
    // Apelidos são opcionais — falha no banco não interrompe a resposta.
  }

  const resposta: RespostaGarrafa = {
    garrafa: {
      tokenId,
      envasamentoId: envasamentoId.toString(),
      emitidaEm: (dadoGarrafa.emitidaEm as bigint).toString(),
    },
    envasamento: {
      envasador: dadoEnvasamento.envasador as string,
      quantidadeDeclarada: (dadoEnvasamento.quantidadeDeclarada as bigint).toString(),
      quantidadeEmitida: (dadoEnvasamento.quantidadeEmitida as bigint).toString(),
      registradoEm: (dadoEnvasamento.registradoEm as bigint).toString(),
      concluidoEm: (dadoEnvasamento.concluidoEm as bigint).toString(),
      metadataURI: dadoEnvasamento.metadataURI as string,
    },
    lote: {
      id: loteProducaoId.toString(),
      produtor: dadoLote.produtor as string,
      tipoBebida: Number(dadoLote.tipoBebida),
      estado: Number(dadoLote.estado),
      criadoEm: (dadoLote.criadoEm as bigint).toString(),
      concluidoEm: (dadoLote.concluidoEm as bigint).toString(),
      metadataURI: dadoLote.metadataURI as string,
      metadataURIConclusao: dadoLote.metadataURIConclusao as string,
    },
    configuracao: {
      maturacaoAplicavel: dadoConfiguracao.maturacaoAplicavel as boolean,
      retificacaoAplicavel: dadoConfiguracao.retificacaoAplicavel as boolean,
      blendagemAplicavel: dadoConfiguracao.blendagemAplicavel as boolean,
      ajusteFinalAplicavel: dadoConfiguracao.ajusteFinalAplicavel as boolean,
    },
    insumosVinculados,
    etapas,
    nomesCarteiras,
  };

  await salvarCache(chainId, tokenId, resposta);

  return resposta;
}
