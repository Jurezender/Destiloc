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
      <header>
        <h1>Rastreabilidade de bebidas destiladas</h1>
        <p className="dica">Consulta pública, somente leitura. Não é necessário ter a MetaMask instalada.</p>
      </header>

      {carregando && <p>Carregando…</p>}
      {erro && <p className="erro">{erro}</p>}

      {dados && (
        <>
          <h2>Garrafa #{dados.garrafa.tokenId.toString()}</h2>
          <p>
            Rede: {rede?.rotulo ?? `chainId ${chainId}`}
            <br />
            Envasamento de origem: #{dados.garrafa.envasamentoId.toString()}
            <br />
            Emitida em: {formatarTimestamp(dados.garrafa.emitidaEm)}
          </p>

          <h3>Envasamento</h3>
          <p>
            Envasador: {dados.envasamento.envasador}
            <br />
            Quantidade: {dados.envasamento.quantidadeEmitida.toString()}/
            {dados.envasamento.quantidadeDeclarada.toString()}
            <br />
            Registrado em: {formatarTimestamp(dados.envasamento.registradoEm)}
            <br />
            {dados.envasamento.concluidoEm !== 0n ? (
              <>Concluído em: {formatarTimestamp(dados.envasamento.concluidoEm)}</>
            ) : (
              "Em andamento"
            )}
            <br />
            Metadados do envasamento: {dados.envasamento.metadataURI}
          </p>

          <h3>Lote de produção</h3>
          <p>
            Lote #{dados.lote.id.toString()} — {RETULO_TIPO_BEBIDA[dados.lote.tipoBebida]}
            <br />
            Produtor: {dados.lote.produtor}
            <br />
            Estado: {RETULO_ESTADO_PRODUCAO[dados.lote.estado]}
            <br />
            Criado em: {formatarTimestamp(dados.lote.criadoEm)}
            <br />
            {dados.lote.estado === EstadoProducao.Concluido && (
              <>
                Produção concluída em: {formatarTimestamp(dados.lote.concluidoEm)}
                <br />
                Metadados de conclusão: {dados.lote.metadataURIConclusao}
                <br />
              </>
            )}
            Metadados do lote: {dados.lote.metadataURI}
          </p>

          <h3>Configuração da produção</h3>
          <ul>
            <li>Maturação aplicável: {dados.configuracao.maturacaoAplicavel ? "sim" : "não"}</li>
            <li>Retificação aplicável: {dados.configuracao.retificacaoAplicavel ? "sim" : "não"}</li>
            <li>Blendagem aplicável: {dados.configuracao.blendagemAplicavel ? "sim" : "não"}</li>
            <li>Ajuste final aplicável: {dados.configuracao.ajusteFinalAplicavel ? "sim" : "não"}</li>
          </ul>

          <h3>Insumos vinculados ao lote</h3>
          <ul>
            {dados.insumosVinculados.map((insumo) => (
              <li key={insumo.id.toString()}>
                #{insumo.id.toString()} — {RETULO_TIPO_INSUMO[insumo.tipo]} — fornecedor {insumo.fornecedor}
                <br />
                Metadados: {insumo.metadataURI}
              </li>
            ))}
            {dados.insumosVinculados.length === 0 && <li>Nenhum insumo vinculado.</li>}
          </ul>

          <h3>Etapas registradas</h3>
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
                  <td>{evento.executadoPor}</td>
                  <td>{formatarTimestamp(evento.inicioInformado)}</td>
                  <td>{formatarTimestamp(evento.fimInformado)}</td>
                  <td>{formatarTimestamp(evento.registradoEm)}</td>
                  <td>{evento.metadataURI}</td>
                  <td>
                    {evento.insumosUtilizados.length === 0
                      ? "—"
                      : evento.insumosUtilizados.map((insumoId) => `#${insumoId.toString()}`).join(", ")}
                  </td>
                </tr>
              ))}
              {dados.etapas.length === 0 && (
                <tr>
                  <td colSpan={7}>Nenhuma etapa registrada ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
