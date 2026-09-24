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

// ─── Helpers RPC ────────────────────────────────────────────────────────────

function ehErroRateLimit(erro: unknown): boolean {
  if (!(erro instanceof Error)) return false;
  const msg = erro.message.toLowerCase();
  if (msg.includes('too many requests') || msg.includes('rate limit')) return true;
  // ethers v6 embute o código JSONRPC em .code ou em .info.error.code
  type EthersLike = { code?: unknown; info?: { error?: { code?: unknown } } };
  const e = erro as EthersLike;
  return e.code === -32005 || e.info?.error?.code === -32005;
}

async function rpcComRetry<T>(fn: () => Promise<T>): Promise<T> {
  const MAX = 3;
  for (let i = 0; i < MAX; i++) {
    try {
      return await fn();
    } catch (erro) {
      if (!ehErroRateLimit(erro) || i === MAX - 1) throw erro;
      const ms = 1_000 * 2 ** i; // 1 s → 2 s
      console.warn(`[rpc] rate limit — tentativa ${i + 1}/${MAX}, aguardando ${ms} ms`);
      await new Promise((r) => setTimeout(r, ms));
    }
  }
  throw new Error('unreachable');
}

// Semáforo: limita o número de chamadas RPC em voo simultâneo.
// Previne burst de N + 2M requests ao Infura que causa 429.
function criarSemaforo(max: number) {
  let ativas = 0;
  const fila: Array<() => void> = [];
  return async function<T>(fn: () => Promise<T>): Promise<T> {
    while (ativas >= max) {
      await new Promise<void>((r) => fila.push(r));
    }
    ativas++;
    try {
      return await fn();
    } finally {
      ativas--;
      fila.shift()?.();
    }
  };
}

const _semaforo = criarSemaforo(4);
const rpc = <T>(fn: () => Promise<T>): Promise<T> =>
  _semaforo(() => rpcComRetry(fn));

// ─── Cache ──────────────────────────────────────────────────────────────────

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

// ─── Consulta principal ─────────────────────────────────────────────────────

export async function consultarGarrafa(
  chainId: number,
  tokenId: string
): Promise<RespostaGarrafa> {
  const cached = await buscarCache(chainId, tokenId);
  if (cached) return cached;

  const envasamentoContrato = obterContrato("ContratoEnvasamento", chainId);

  // Round 1: verificar existência (necessário antes de obterGarrafa — early exit)
  const existeGarrafa = (await rpc(() => envasamentoContrato.garrafaExiste(tokenId))) as boolean;
  if (!existeGarrafa) {
    throw new GarrafaNaoEncontradaError("Esta garrafa não existe.");
  }

  // Round 2: dados da garrafa
  const dadoGarrafa = await rpc(() => envasamentoContrato.obterGarrafa(tokenId));
  const envasamentoId = dadoGarrafa.envasamentoId as bigint;

  // Round 3: dados do envasamento (necessário para obter loteProducaoId)
  const dadoEnvasamento = await rpc(() => envasamentoContrato.obterEnvasamento(envasamentoId));
  const loteProducaoId = dadoEnvasamento.loteProducaoId as bigint;

  const producaoContrato = obterContrato("ContratoProducao", chainId);

  // Round 4: 5 chamadas independentes em paralelo — todas tomam loteProducaoId.
  // Antes: loteProducaoExiste → [obterLote+config] → totalInsumos → totalEtapas = 4 rounds.
  // Agora: 1 round com semáforo(4) que processa em 2 sub-lotes (5 calls > limit 4).
  const [
    existeLote,
    dadoLote,
    dadoConfiguracao,
    totalVinculadosRaw,
    totalEtapasRaw,
  ] = await Promise.all([
    rpc(() => producaoContrato.loteProducaoExiste(loteProducaoId)),
    rpc(() => producaoContrato.obterLoteProducao(loteProducaoId)),
    rpc(() => producaoContrato.obterConfiguracao(loteProducaoId)),
    rpc(() => producaoContrato.totalInsumosVinculados(loteProducaoId)),
    rpc(() => producaoContrato.totalEtapas(loteProducaoId)),
  ]);

  if (!(existeLote as boolean)) {
    throw new GarrafaNaoEncontradaError("O lote de produção desta garrafa não existe.");
  }

  const N = Number(totalVinculadosRaw as bigint);
  const M = Number(totalEtapasRaw as bigint);
  const insumosContrato = obterContrato("ContratoInsumos", chainId);

  // Round 5: índices de insumos + dados de cada etapa — N + 2M chamadas em paralelo.
  // Antes: insumoVinculadoPorIndice → totalEtapas → etapaPorIndice → totalInsumosDaEtapa = 4 rounds.
  // Agora: 1 round; etapaPorIndice(i) e totalInsumosDaEtapa(i) são paralelos entre si.
  interface MetaEtapa {
    indice: number;
    registro: unknown;
    K: number;
  }

  const [idsVinculados, metaEtapas] = await Promise.all([
    Promise.all(
      Array.from({ length: N }, (_, i) =>
        rpc(() => producaoContrato.insumoVinculadoPorIndice(loteProducaoId, i))
      )
    ) as Promise<bigint[]>,
    Promise.all(
      Array.from({ length: M }, (_, indice) =>
        Promise.all([
          rpc(() => producaoContrato.etapaPorIndice(loteProducaoId, indice)),
          rpc(() => producaoContrato.totalInsumosDaEtapa(loteProducaoId, indice)),
        ]).then(([registro, totalRaw]) => ({
          indice,
          registro,
          K: Number(totalRaw as bigint),
        } as MetaEtapa))
      )
    ),
  ]);

  // Round 6: dados folha — obterLoteInsumo×N + insumoDaEtapaPorIndice×ΣK em paralelo.
  const [insumosVinculados, etapas] = await Promise.all([
    Promise.all(
      idsVinculados.map(async (insumoId) => {
        const dado = await rpc(() => insumosContrato.obterLoteInsumo(insumoId));
        return {
          id: insumoId.toString(),
          tipo: Number((dado as { tipo: bigint }).tipo),
          fornecedor: (dado as { fornecedor: string }).fornecedor,
          metadataURI: (dado as { metadataURI: string }).metadataURI,
        };
      })
    ),
    Promise.all(
      metaEtapas.map(async ({ indice, registro, K }) => {
        const insumosDaEtapa = (await Promise.all(
          Array.from({ length: K }, (_, j) =>
            rpc(() => producaoContrato.insumoDaEtapaPorIndice(loteProducaoId, indice, j))
          )
        )) as bigint[];
        const reg = registro as {
          etapa: bigint;
          executadoPor: string;
          inicioInformado: bigint;
          fimInformado: bigint;
          registradoEm: bigint;
          metadataURI: string;
        };
        return {
          indice,
          etapa: Number(reg.etapa),
          executadoPor: reg.executadoPor,
          inicioInformado: reg.inicioInformado.toString(),
          fimInformado: reg.fimInformado.toString(),
          registradoEm: reg.registradoEm.toString(),
          metadataURI: reg.metadataURI,
          insumosUtilizados: insumosDaEtapa.map(String),
        };
      })
    ),
  ]);

  // Apelidos de carteiras — única query ao banco para todos os endereços.
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
