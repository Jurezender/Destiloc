import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { obterContrato, obterProviderPublico } from "../contracts";
import { REDES } from "../contracts/redes";
import { mapearErroContrato } from "../lib/erros";
import { formatarTimestamp, RETULO_ETAPA, RETULO_EVENTO_CUSTODIA } from "../lib/formatadores";
import { EtapaProdutiva, TipoEventoCustodia } from "../lib/tipos";

interface EventoProducao {
  etapa: EtapaProdutiva;
  ator: string;
  timestamp: bigint;
  localizacao: string;
}

interface EventoCustodia {
  tipo: TipoEventoCustodia;
  ator: string;
  contraparte: string;
  timestamp: bigint;
  localizacao: string;
}

interface DadosConsulta {
  tokenId: string;
  loteId: bigint;
  uri: string;
  tipoBebida: string;
  custodianteAtual: string;
  historicoProducao: EventoProducao[];
  historicoCustodia: EventoCustodia[];
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
        const tokenizacao = obterContrato("ContratoTokenizacao", chainId, provider);
        const existe = (await tokenizacao.existeGarrafa(tokenId)) as boolean;
        if (!existe) {
          if (!cancelado) setErro("Esta garrafa não existe.");
          return;
        }
        const lote = obterContrato("ContratoLote", chainId, provider);
        const rastreamento = obterContrato("ContratoRastreamento", chainId, provider);

        const dadosGarrafa = await tokenizacao.dadosDaGarrafa(tokenId);
        const loteId = dadosGarrafa.loteId as bigint;
        const [loteInfo, histProducao, situacao, histCustodia] = await Promise.all([
          lote.obterLote(loteId),
          lote.historicoProducao(loteId),
          rastreamento.situacaoCustodia(tokenId),
          rastreamento.getHistorico(tokenId),
        ]);

        if (cancelado) return;
        setDados({
          tokenId,
          loteId,
          uri: dadosGarrafa.uri as string,
          tipoBebida: loteInfo.tipoBebida as string,
          custodianteAtual: situacao.custodiante as string,
          historicoProducao: (
            histProducao as Array<{ etapa: bigint; ator: string; timestamp: bigint; localizacao: string }>
          ).map((e) => ({
            etapa: Number(e.etapa) as EtapaProdutiva,
            ator: e.ator,
            timestamp: e.timestamp,
            localizacao: e.localizacao,
          })),
          historicoCustodia: (
            histCustodia as Array<{ tipo: bigint; ator: string; contraparte: string; timestamp: bigint; localizacao: string }>
          ).map((e) => ({
            tipo: Number(e.tipo) as TipoEventoCustodia,
            ator: e.ator,
            contraparte: e.contraparte,
            timestamp: e.timestamp,
            localizacao: e.localizacao,
          })),
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
          <h2>
            Garrafa #{dados.tokenId} — {dados.tipoBebida}
          </h2>
          <p>
            Rede: {rede?.rotulo ?? `chainId ${chainId}`}
            <br />
            Lote de origem: #{dados.loteId.toString()}
            <br />
            Metadados: {dados.uri}
            <br />
            Custodiante atual: {dados.custodianteAtual}
          </p>

          <h3>Produção</h3>
          <table>
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Ator</th>
                <th>Local</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {dados.historicoProducao.map((evento, indice) => (
                <tr key={indice}>
                  <td>{RETULO_ETAPA[evento.etapa]}</td>
                  <td>{evento.ator}</td>
                  <td>{evento.localizacao}</td>
                  <td>{formatarTimestamp(evento.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Custódia</h3>
          <table>
            <thead>
              <tr>
                <th>Evento</th>
                <th>Ator</th>
                <th>Contraparte</th>
                <th>Local</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {dados.historicoCustodia.map((evento, indice) => (
                <tr key={indice}>
                  <td>{RETULO_EVENTO_CUSTODIA[evento.tipo]}</td>
                  <td>{evento.ator}</td>
                  <td>{evento.contraparte}</td>
                  <td>{evento.localizacao}</td>
                  <td>{formatarTimestamp(evento.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
