import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { obterContrato, obterProviderPublico } from "../contracts";
import { REDES } from "../contracts/redes";
import { mapearErroContrato } from "../lib/erros";
import {
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

/**
 * Página do consumidor final. Deliberadamente NÃO usa CarteiraContexto nem
 * `window.ethereum` — só um `JsonRpcProvider` somente leitura, para que a
 * consulta funcione sem a MetaMask instalada ou conectada.
 */
export function ConsultaPublica() {
  const { chainId: chainIdParam, tokenId } = useParams<{ chainId: string; tokenId: string }>();
  const [dados, setDados] = useState<DadosConsulta | null>(null);
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

        if (cancelado) return;
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

  return (
    <div className="consulta-publica">

      {/* ── Hero ── */}
      <header className="cp-hero">
        <p className="cp-hero__sistema">Destiloc</p>
        <h1 className="cp-hero__titulo">Rastreabilidade de bebidas destiladas</h1>
        <p className="cp-hero__descricao">Consulta pública · sem necessidade de MetaMask</p>
      </header>

      {/* ── Carregando ── */}
      {carregando && (
        <div className="cp-carregando">
          <span className="cp-carregando__indicador" aria-hidden="true" />
          <span>Consultando a blockchain…</span>
        </div>
      )}

      {/* ── Erro ── */}
      {erro && (
        <div className="cp-estado-erro">
          <p>{erro}</p>
        </div>
      )}

      {/* ── Dados ── */}
      {dados && (
        <div className="cp-conteudo">

          {/* Identidade da garrafa */}
          <div className="cp-identidade">
            <div className="cp-identidade__cabecalho">
              <span className="cp-identidade__rotulo">Garrafa certificada</span>
              <span className="cp-identidade__numero">#{dados.garrafa.tokenId.toString()}</span>
            </div>
            <div className="cp-identidade__meta">
              <span>Rede: {rede?.rotulo ?? `chainId ${chainId}`}</span>
              <span className="cp-sep">·</span>
              <span>Envasamento #{dados.garrafa.envasamentoId.toString()}</span>
              <span className="cp-sep">·</span>
              <span>Emitida em {formatarTimestamp(dados.garrafa.emitidaEm)}</span>
            </div>
          </div>

          {/* Envasamento */}
          <section className="cp-secao">
            <header className="cp-secao__header">
              <h2 className="cp-secao__titulo">Envasamento</h2>
            </header>
            <div className="cp-secao__corpo">
              <dl className="cp-campos">
                <div className="cp-campo">
                  <dt className="cp-campo__rotulo">Envasador</dt>
                  <dd className="cp-campo__valor cp-mono">{dados.envasamento.envasador}</dd>
                </div>
                <div className="cp-campo">
                  <dt className="cp-campo__rotulo">Garrafas emitidas / declaradas</dt>
                  <dd className="cp-campo__valor">
                    {dados.envasamento.quantidadeEmitida.toString()} / {dados.envasamento.quantidadeDeclarada.toString()}
                  </dd>
                </div>
                <div className="cp-campo">
                  <dt className="cp-campo__rotulo">Registrado em</dt>
                  <dd className="cp-campo__valor">{formatarTimestamp(dados.envasamento.registradoEm)}</dd>
                </div>
                <div className="cp-campo">
                  <dt className="cp-campo__rotulo">Situação</dt>
                  <dd className="cp-campo__valor">
                    {dados.envasamento.concluidoEm !== 0n
                      ? `Concluído em ${formatarTimestamp(dados.envasamento.concluidoEm)}`
                      : "Em andamento"}
                  </dd>
                </div>
                <div className="cp-campo cp-campo--largo">
                  <dt className="cp-campo__rotulo">Metadados</dt>
                  <dd className="cp-campo__valor cp-mono">{dados.envasamento.metadataURI}</dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Lote de produção */}
          <section className="cp-secao">
            <header className="cp-secao__header">
              <h2 className="cp-secao__titulo">Lote de produção</h2>
              <span className={`cp-badge ${dados.lote.estado === EstadoProducao.Concluido ? "cp-badge--ok" : "cp-badge--neutro"}`}>
                {RETULO_ESTADO_PRODUCAO[dados.lote.estado]}
              </span>
            </header>
            <div className="cp-secao__corpo">
              <dl className="cp-campos">
                <div className="cp-campo">
                  <dt className="cp-campo__rotulo">Identificação</dt>
                  <dd className="cp-campo__valor">
                    Lote #{dados.lote.id.toString()} — {RETULO_TIPO_BEBIDA[dados.lote.tipoBebida]}
                  </dd>
                </div>
                <div className="cp-campo">
                  <dt className="cp-campo__rotulo">Criado em</dt>
                  <dd className="cp-campo__valor">{formatarTimestamp(dados.lote.criadoEm)}</dd>
                </div>
                <div className="cp-campo cp-campo--largo">
                  <dt className="cp-campo__rotulo">Produtor</dt>
                  <dd className="cp-campo__valor cp-mono">{dados.lote.produtor}</dd>
                </div>
                {dados.lote.estado === EstadoProducao.Concluido && (
                  <>
                    <div className="cp-campo">
                      <dt className="cp-campo__rotulo">Produção concluída em</dt>
                      <dd className="cp-campo__valor">{formatarTimestamp(dados.lote.concluidoEm)}</dd>
                    </div>
                    <div className="cp-campo cp-campo--largo">
                      <dt className="cp-campo__rotulo">Metadados de conclusão</dt>
                      <dd className="cp-campo__valor cp-mono">{dados.lote.metadataURIConclusao}</dd>
                    </div>
                  </>
                )}
                <div className="cp-campo cp-campo--largo">
                  <dt className="cp-campo__rotulo">Metadados do lote</dt>
                  <dd className="cp-campo__valor cp-mono">{dados.lote.metadataURI}</dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Configuração da produção */}
          <section className="cp-secao">
            <header className="cp-secao__header">
              <h2 className="cp-secao__titulo">Configuração da produção</h2>
            </header>
            <div className="cp-secao__corpo">
              <ul className="cp-config-grade">
                <li className={`cp-config-item ${dados.configuracao.maturacaoAplicavel ? "cp-config-item--sim" : "cp-config-item--nao"}`}>
                  <span className="cp-config-item__icone" aria-hidden="true">
                    {dados.configuracao.maturacaoAplicavel ? "✓" : "—"}
                  </span>
                  <span className="cp-config-item__rotulo">Maturação</span>
                </li>
                <li className={`cp-config-item ${dados.configuracao.retificacaoAplicavel ? "cp-config-item--sim" : "cp-config-item--nao"}`}>
                  <span className="cp-config-item__icone" aria-hidden="true">
                    {dados.configuracao.retificacaoAplicavel ? "✓" : "—"}
                  </span>
                  <span className="cp-config-item__rotulo">Retificação</span>
                </li>
                <li className={`cp-config-item ${dados.configuracao.blendagemAplicavel ? "cp-config-item--sim" : "cp-config-item--nao"}`}>
                  <span className="cp-config-item__icone" aria-hidden="true">
                    {dados.configuracao.blendagemAplicavel ? "✓" : "—"}
                  </span>
                  <span className="cp-config-item__rotulo">Blendagem</span>
                </li>
                <li className={`cp-config-item ${dados.configuracao.ajusteFinalAplicavel ? "cp-config-item--sim" : "cp-config-item--nao"}`}>
                  <span className="cp-config-item__icone" aria-hidden="true">
                    {dados.configuracao.ajusteFinalAplicavel ? "✓" : "—"}
                  </span>
                  <span className="cp-config-item__rotulo">Ajuste final</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Insumos vinculados */}
          <section className="cp-secao">
            <header className="cp-secao__header">
              <h2 className="cp-secao__titulo">Insumos vinculados ao lote</h2>
            </header>
            <div className="cp-secao__corpo--sem-padding">
              {dados.insumosVinculados.length === 0 ? (
                <p className="cp-vazio">Nenhum insumo vinculado.</p>
              ) : (
                <ul className="cp-insumos">
                  {dados.insumosVinculados.map((insumo) => (
                    <li key={insumo.id.toString()} className="cp-insumo">
                      <div className="cp-insumo__id">#{insumo.id.toString()}</div>
                      <div className="cp-insumo__info">
                        <span className="cp-insumo__tipo">{RETULO_TIPO_INSUMO[insumo.tipo]}</span>
                        <span className="cp-insumo__fornecedor cp-mono">{insumo.fornecedor}</span>
                        <span className="cp-insumo__metadados cp-mono">{insumo.metadataURI}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Etapas registradas */}
          <section className="cp-secao">
            <header className="cp-secao__header">
              <h2 className="cp-secao__titulo">Etapas registradas</h2>
            </header>
            {dados.etapas.length === 0 ? (
              <p className="cp-vazio">Nenhuma etapa registrada ainda.</p>
            ) : (
              <div className="cp-tabela-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Etapa</th>
                      <th>Executado por</th>
                      <th>Início informado</th>
                      <th>Fim informado</th>
                      <th>Registrado em</th>
                      <th>Metadados</th>
                      <th>Insumos utilizados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.etapas.map((evento) => (
                      <tr key={evento.indice}>
                        <td>{RETULO_ETAPA_PRODUCAO[evento.etapa]}</td>
                        <td className="cp-mono">{evento.executadoPor}</td>
                        <td>{formatarTimestamp(evento.inicioInformado)}</td>
                        <td>{formatarTimestamp(evento.fimInformado)}</td>
                        <td>{formatarTimestamp(evento.registradoEm)}</td>
                        <td className="cp-mono">{evento.metadataURI}</td>
                        <td>
                          {evento.insumosUtilizados.length === 0
                            ? "—"
                            : evento.insumosUtilizados.map((insumoId) => `#${insumoId.toString()}`).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  );
}
