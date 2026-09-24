import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { obterContrato, obterProviderPublico } from "../contracts";
import { REDES } from "../contracts/redes";
import { mapearErroContrato } from "../lib/erros";
import {
  encurtarEndereco,
  formatarTimestamp,
  RETULO_ESTADO_PRODUCAO,
  RETULO_ETAPA_PRODUCAO,
  RETULO_TIPO_BEBIDA,
  RETULO_TIPO_INSUMO,
} from "../lib/formatadores";
import { EstadoProducao, EtapaProducao, TipoBebida, TipoInsumo } from "../lib/tipos";

interface DadosGarrafa {
  tokenId: bigint;
  envasamentoId: bigint;
  emitidaEm: bigint;
}

interface DadosEnvasamento {
  envasador: string;
  quantidadeDeclarada: bigint;
  quantidadeEmitida: bigint;
  registradoEm: bigint;
  concluidoEm: bigint;
  metadataURI: string;
}

interface DadosLote {
  id: bigint;
  produtor: string;
  tipoBebida: TipoBebida;
  estado: EstadoProducao;
  criadoEm: bigint;
  concluidoEm: bigint;
  metadataURI: string;
  metadataURIConclusao: string;
}

interface ConfiguracaoLote {
  maturacaoAplicavel: boolean;
  retificacaoAplicavel: boolean;
  blendagemAplicavel: boolean;
  ajusteFinalAplicavel: boolean;
}

interface InsumoInfo {
  id: bigint;
  tipo: TipoInsumo;
  fornecedor: string;
  metadataURI: string;
}

interface EtapaInfo {
  indice: number;
  etapa: EtapaProducao;
  executadoPor: string;
  inicioInformado: bigint;
  fimInformado: bigint;
  registradoEm: bigint;
  metadataURI: string;
  insumosUtilizados: bigint[];
}

interface DadosConsulta {
  garrafa: DadosGarrafa;
  envasamento: DadosEnvasamento;
  lote: DadosLote;
  configuracao: ConfiguracaoLote;
  insumosVinculados: InsumoInfo[];
  etapas: EtapaInfo[];
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function buscarApelido(endereco: string): Promise<string | null> {
  try {
    const resposta = await fetch(`${API_URL}/carteiras/${endereco}`);
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { apelido: string };
    return dados.apelido || null;
  } catch {
    return null;
  }
}

function ipfsParaUrl(uri: string): string {
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  return uri;
}

function mensagemAmigavel(erro: string): string {
  if (erro.includes("não existe") || erro.includes("não encontrad")) {
    return "Não foi possível verificar esta garrafa. O QR Code pode estar incompleto ou a garrafa não está cadastrada no sistema.";
  }
  if (erro.includes("inválido") || erro.includes("inválida")) {
    return "O link de consulta parece estar incorreto. Verifique se o QR Code foi lido corretamente.";
  }
  return "Ocorreu um erro ao buscar as informações. Tente novamente em instantes.";
}

/**
 * Página do consumidor final. Deliberadamente NÃO usa CarteiraContexto nem
 * `window.ethereum` — só um `JsonRpcProvider` somente leitura, para que a
 * consulta funcione sem a MetaMask instalada ou conectada.
 */
export function ConsultaPublica() {
  const { chainId: chainIdParam, tokenId } = useParams<{ chainId: string; tokenId: string }>();
  const [dados, setDados] = useState<DadosConsulta | null>(null);
  const [nomesCarteiras, setNomesCarteiras] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const chainId = chainIdParam ? Number(chainIdParam) : NaN;
  const rede = REDES[chainId];

  useEffect(() => {
    if (!tokenId || Number.isNaN(chainId)) {
      setErro("Link de consulta inválido.");
      setCarregando(false);
      return;
    }
    let cancelado = false;
    (async () => {
      setCarregando(true);
      setErro(null);
      try {
        const provider = obterProviderPublico(chainId);
        const envasamentoContrato = obterContrato("ContratoEnvasamento", chainId, provider);
        const existeGarrafa = (await envasamentoContrato.garrafaExiste(tokenId)) as boolean;
        if (!existeGarrafa) {
          if (!cancelado) setErro("Esta garrafa não existe.");
          return;
        }

        const dadoGarrafa = await envasamentoContrato.obterGarrafa(tokenId);
        const envasamentoId = dadoGarrafa.envasamentoId as bigint;
        const dadoEnvasamento = await envasamentoContrato.obterEnvasamento(envasamentoId);
        const loteProducaoId = dadoEnvasamento.loteProducaoId as bigint;

        const producaoContrato = obterContrato("ContratoProducao", chainId, provider);
        const existeLote = (await producaoContrato.loteProducaoExiste(loteProducaoId)) as boolean;
        if (!existeLote) {
          if (!cancelado) setErro("O lote de produção desta garrafa não existe.");
          return;
        }

        const [dadoLote, dadoConfiguracao] = await Promise.all([
          producaoContrato.obterLoteProducao(loteProducaoId),
          producaoContrato.obterConfiguracao(loteProducaoId),
        ]);

        const insumosContrato = obterContrato("ContratoInsumos", chainId, provider);
        const totalVinculados = Number(await producaoContrato.totalInsumosVinculados(loteProducaoId));
        const idsVinculados = await Promise.all(
          Array.from({ length: totalVinculados }, (_, indice) =>
            producaoContrato.insumoVinculadoPorIndice(loteProducaoId, indice)
          )
        );
        const insumosVinculados = await Promise.all(
          (idsVinculados as bigint[]).map(async (insumoId) => {
            const dadoInsumo = await insumosContrato.obterLoteInsumo(insumoId);
            return {
              id: insumoId,
              tipo: Number(dadoInsumo.tipo) as TipoInsumo,
              fornecedor: dadoInsumo.fornecedor as string,
              metadataURI: dadoInsumo.metadataURI as string,
            } satisfies InsumoInfo;
          })
        );
        const totalEtapasRegistradas = Number(await producaoContrato.totalEtapas(loteProducaoId));
        const etapas = await Promise.all(
          Array.from({ length: totalEtapasRegistradas }, async (_, indice) => {
            const registro = await producaoContrato.etapaPorIndice(loteProducaoId, indice);
            const totalInsumosEtapa = Number(await producaoContrato.totalInsumosDaEtapa(loteProducaoId, indice));
            const insumosDaEtapa = await Promise.all(
              Array.from({ length: totalInsumosEtapa }, (_, indiceInsumo) =>
                producaoContrato.insumoDaEtapaPorIndice(loteProducaoId, indice, indiceInsumo)
              )
            );
            return {
              indice,
              etapa: Number(registro.etapa) as EtapaProducao,
              executadoPor: registro.executadoPor as string,
              inicioInformado: registro.inicioInformado as bigint,
              fimInformado: registro.fimInformado as bigint,
              registradoEm: registro.registradoEm as bigint,
              metadataURI: registro.metadataURI as string,
              insumosUtilizados: insumosDaEtapa as bigint[],
            } satisfies EtapaInfo;
          })
        );

        const enderecoUnicos = [
          ...new Set([
            dadoLote.produtor as string,
            dadoEnvasamento.envasador as string,
            ...etapas.map((e) => e.executadoPor),
          ]),
        ];
        const resultadosNomes = await Promise.all(
          enderecoUnicos.map(async (end) => [end, await buscarApelido(end)] as [string, string | null])
        );
        const nomes: Record<string, string> = {};
        for (const [end, apelido] of resultadosNomes) {
          if (apelido) nomes[end] = apelido;
        }

        if (cancelado) return;
        setNomesCarteiras(nomes);
        setDados({
          garrafa: {
            tokenId: BigInt(tokenId),
            envasamentoId,
            emitidaEm: dadoGarrafa.emitidaEm as bigint,
          },
          envasamento: {
            envasador: dadoEnvasamento.envasador as string,
            quantidadeDeclarada: dadoEnvasamento.quantidadeDeclarada as bigint,
            quantidadeEmitida: dadoEnvasamento.quantidadeEmitida as bigint,
            registradoEm: dadoEnvasamento.registradoEm as bigint,
            concluidoEm: dadoEnvasamento.concluidoEm as bigint,
            metadataURI: dadoEnvasamento.metadataURI as string,
          },
          lote: {
            id: loteProducaoId,
            produtor: dadoLote.produtor as string,
            tipoBebida: Number(dadoLote.tipoBebida) as TipoBebida,
            estado: Number(dadoLote.estado) as EstadoProducao,
            criadoEm: dadoLote.criadoEm as bigint,
            concluidoEm: dadoLote.concluidoEm as bigint,
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
        });
      } catch (erroConsulta) {
        if (!cancelado) setErro(mapearErroContrato(erroConsulta));
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [chainId, tokenId]);

  const processosAplicados = dados
    ? ([
        dados.configuracao.maturacaoAplicavel && "Maturação",
        dados.configuracao.retificacaoAplicavel && "Retificação",
        dados.configuracao.blendagemAplicavel && "Blendagem",
        dados.configuracao.ajusteFinalAplicavel && "Ajuste final",
      ].filter(Boolean) as string[])
    : [];

  const tiposInsumos = dados
    ? [...new Set(dados.insumosVinculados.map((i) => i.tipo))]
    : [];

  return (
    <div className="consulta-publica">

      <header className="cp-hero">
        <p className="cp-hero__sistema">Destiloc</p>
        <h1 className="cp-hero__titulo">Conheça a origem desta garrafa</h1>
      </header>

      {carregando && (
        <div className="cp-carregando">
          <span className="cp-carregando__indicador" aria-hidden="true" />
          <span>Buscando a história desta garrafa…</span>
        </div>
      )}

      {erro && (
        <div className="cp-estado-erro">
          <p>{mensagemAmigavel(erro)}</p>
        </div>
      )}

      {dados && (
        <div className="cp-conteudo">

          {/* Identidade da garrafa */}
          <div className="cp-identidade">
            <div className="cp-identidade__cabecalho">
              <span className="cp-identidade__rotulo">Garrafa certificada</span>
              <span className="cp-identidade__numero">#{dados.garrafa.tokenId.toString()}</span>
              <span className="cp-identidade__bebida">{RETULO_TIPO_BEBIDA[dados.lote.tipoBebida]}</span>
            </div>
            <div className="cp-identidade__meta">
              <span>Lote #{dados.lote.id.toString()}</span>
              <span className="cp-sep">·</span>
              <span>Envasamento #{dados.garrafa.envasamentoId.toString()}</span>
              <span className="cp-sep">·</span>
              <span>Emitida em {formatarTimestamp(dados.garrafa.emitidaEm)}</span>
            </div>
            <div className="cp-autenticidade">
              <span className="cp-autenticidade__icone" aria-hidden="true">✓</span>
              <span>Produto registrado na blockchain</span>
            </div>
          </div>

          {/* Origem */}
          <section className="cp-secao">
            <header className="cp-secao__header">
              <h2 className="cp-secao__titulo">Origem</h2>
            </header>
            <div className="cp-secao__corpo">
              <dl className="cp-campos">
                <div className="cp-campo cp-campo--largo">
                  <dt className="cp-campo__rotulo">Produtor</dt>
                  <dd className="cp-campo__valor">
                    {nomesCarteiras[dados.lote.produtor] ?? encurtarEndereco(dados.lote.produtor)}
                  </dd>
                </div>
                {processosAplicados.length > 0 && (
                  <div className="cp-campo cp-campo--largo">
                    <dt className="cp-campo__rotulo">Processo aplicado</dt>
                    <dd className="cp-campo__valor cp-tags">
                      {processosAplicados.map((p) => (
                        <span key={p} className="cp-tag">{p}</span>
                      ))}
                    </dd>
                  </div>
                )}
                {tiposInsumos.length > 0 && (
                  <div className="cp-campo cp-campo--largo">
                    <dt className="cp-campo__rotulo">Ingredientes</dt>
                    <dd className="cp-campo__valor cp-tags">
                      {tiposInsumos.map((tipo) => (
                        <span key={tipo} className="cp-tag">{RETULO_TIPO_INSUMO[tipo]}</span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          {/* Jornada de produção */}
          {dados.etapas.length > 0 && (
            <section className="cp-secao">
              <header className="cp-secao__header">
                <h2 className="cp-secao__titulo">Jornada de produção</h2>
              </header>
              <div className="cp-secao__corpo">
                <ol className="cp-timeline">
                  {dados.etapas.map((evento) => (
                    <li key={evento.indice} className="cp-timeline__item">
                      <div className="cp-timeline__ponto" aria-hidden="true" />
                      <div className="cp-timeline__conteudo">
                        <span className="cp-timeline__etapa">{RETULO_ETAPA_PRODUCAO[evento.etapa]}</span>
                        {(evento.inicioInformado !== 0n || evento.fimInformado !== 0n) && (
                          <span className="cp-timeline__periodo">
                            {evento.inicioInformado !== 0n && formatarTimestamp(evento.inicioInformado)}
                            {evento.inicioInformado !== 0n && evento.fimInformado !== 0n && " — "}
                            {evento.fimInformado !== 0n && formatarTimestamp(evento.fimInformado)}
                          </span>
                        )}
                        {evento.metadataURI && (
                          <a
                            href={ipfsParaUrl(evento.metadataURI)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cp-link-ipfs"
                          >
                            Ver detalhes →
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}

          {/* Verificação técnica */}
          <details className="cp-tecnico">
            <summary className="cp-tecnico__gatilho">
              <span>Verificação técnica</span>
              <span className="cp-tecnico__chevron" aria-hidden="true">▾</span>
            </summary>
            <div className="cp-tecnico__corpo">
              <dl className="cp-campos">
                {rede && (
                  <div className="cp-campo">
                    <dt className="cp-campo__rotulo">Rede blockchain</dt>
                    <dd className="cp-campo__valor">{rede.rotulo}</dd>
                  </div>
                )}
                <div className="cp-campo">
                  <dt className="cp-campo__rotulo">Estado do lote</dt>
                  <dd className="cp-campo__valor">
                    <span className={`cp-badge ${dados.lote.estado === EstadoProducao.Concluido ? "cp-badge--ok" : "cp-badge--neutro"}`}>
                      {RETULO_ESTADO_PRODUCAO[dados.lote.estado]}
                    </span>
                  </dd>
                </div>
                <div className="cp-campo">
                  <dt className="cp-campo__rotulo">Garrafas deste envasamento</dt>
                  <dd className="cp-campo__valor">
                    {dados.envasamento.quantidadeEmitida.toString()} emitidas de {dados.envasamento.quantidadeDeclarada.toString()} declaradas
                  </dd>
                </div>
                <div className="cp-campo">
                  <dt className="cp-campo__rotulo">Data de registro do lote</dt>
                  <dd className="cp-campo__valor">{formatarTimestamp(dados.lote.criadoEm)}</dd>
                </div>
                <div className="cp-campo cp-campo--largo">
                  <dt className="cp-campo__rotulo">Endereço do produtor</dt>
                  <dd className="cp-campo__valor cp-mono">{dados.lote.produtor}</dd>
                </div>
                <div className="cp-campo cp-campo--largo">
                  <dt className="cp-campo__rotulo">Endereço do envasador</dt>
                  <dd className="cp-campo__valor cp-mono">{dados.envasamento.envasador}</dd>
                </div>
                {dados.lote.metadataURI && (
                  <div className="cp-campo">
                    <dt className="cp-campo__rotulo">Metadados do lote (IPFS)</dt>
                    <dd className="cp-campo__valor">
                      <a href={ipfsParaUrl(dados.lote.metadataURI)} target="_blank" rel="noopener noreferrer" className="cp-link-ipfs">
                        Abrir no IPFS →
                      </a>
                    </dd>
                  </div>
                )}
                {dados.lote.estado === EstadoProducao.Concluido && dados.lote.metadataURIConclusao && (
                  <div className="cp-campo">
                    <dt className="cp-campo__rotulo">Metadados de conclusão (IPFS)</dt>
                    <dd className="cp-campo__valor">
                      <a href={ipfsParaUrl(dados.lote.metadataURIConclusao)} target="_blank" rel="noopener noreferrer" className="cp-link-ipfs">
                        Abrir no IPFS →
                      </a>
                    </dd>
                  </div>
                )}
                {dados.envasamento.metadataURI && (
                  <div className="cp-campo">
                    <dt className="cp-campo__rotulo">Metadados do envasamento (IPFS)</dt>
                    <dd className="cp-campo__valor">
                      <a href={ipfsParaUrl(dados.envasamento.metadataURI)} target="_blank" rel="noopener noreferrer" className="cp-link-ipfs">
                        Abrir no IPFS →
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </details>

        </div>
      )}
    </div>
  );
}
