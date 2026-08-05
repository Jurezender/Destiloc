import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AcoesCustodia } from "../componentes/AcoesCustodia";
import { QRCodeGarrafa } from "../componentes/QRCodeGarrafa";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { formatarTimestamp, RETULO_ETAPA, RETULO_EVENTO_CUSTODIA } from "../lib/formatadores";
import { EtapaProdutiva, TipoEventoCustodia } from "../lib/tipos";

interface EventoProducao {
  etapa: EtapaProdutiva;
  ator: string;
  timestamp: bigint;
  localizacao: string;
  metadadosEtapaURI: string;
}

interface EventoCustodia {
  tipo: TipoEventoCustodia;
  ator: string;
  contraparte: string;
  timestamp: bigint;
  localizacao: string;
}

interface DadosGarrafa {
  tokenId: bigint;
  loteId: bigint;
  uri: string;
  fabricante: string;
  tipoBebida: string;
  custodianteAtual: string;
  pendente: boolean;
  destinatarioPendente: string;
  historicoProducao: EventoProducao[];
  historicoCustodia: EventoCustodia[];
}

export function GarrafaDetalhe() {
  const { tokenId } = useParams<{ tokenId: string }>();
  const { conta, chainId, signer } = useCarteira();
  const [dados, setDados] = useState<DadosGarrafa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer || !tokenId) return;
    setCarregando(true);
    setErro(null);
    try {
      const tokenizacao = obterContrato("ContratoTokenizacao", chainId, signer);
      const existe = (await tokenizacao.existeGarrafa(tokenId)) as boolean;
      if (!existe) {
        setErro("Esta garrafa não existe.");
        return;
      }
      const lote = obterContrato("ContratoLote", chainId, signer);
      const rastreamento = obterContrato("ContratoRastreamento", chainId, signer);

      const dadosGarrafa = await tokenizacao.dadosDaGarrafa(tokenId);
      const loteId = dadosGarrafa.loteId as bigint;
      const [loteInfo, histProducao, situacao, histCustodia] = await Promise.all([
        lote.obterLote(loteId),
        lote.historicoProducao(loteId),
        rastreamento.situacaoCustodia(tokenId),
        rastreamento.getHistorico(tokenId),
      ]);

      setDados({
        tokenId: BigInt(tokenId),
        loteId,
        uri: dadosGarrafa.uri as string,
        fabricante: dadosGarrafa.fabricante as string,
        tipoBebida: loteInfo.tipoBebida as string,
        custodianteAtual: situacao.custodiante as string,
        pendente: situacao.pendente as boolean,
        destinatarioPendente: situacao.destinatario as string,
        historicoProducao: (
          histProducao as Array<{ etapa: bigint; ator: string; timestamp: bigint; localizacao: string; metadadosEtapaURI: string }>
        ).map((e) => ({
          etapa: Number(e.etapa) as EtapaProdutiva,
          ator: e.ator,
          timestamp: e.timestamp,
          localizacao: e.localizacao,
          metadadosEtapaURI: e.metadadosEtapaURI,
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
    } catch (erroLeitura) {
      setErro(mapearErroContrato(erroLeitura));
    } finally {
      setCarregando(false);
    }
  }, [chainId, signer, tokenId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) return <p>Carregando…</p>;
  if (erro && !dados) return <p className="erro">{erro}</p>;
  if (!dados) return null;

  return (
    <section>
      <p>
        <Link to="/garrafas">← Garrafas</Link>
      </p>
      <h1>
        Garrafa #{dados.tokenId.toString()} — {dados.tipoBebida}
      </h1>
      <p>
        Lote de origem: <Link to={`/lotes/${dados.loteId}`}>#{dados.loteId.toString()}</Link>
        <br />
        Fabricante: {dados.fabricante}
        <br />
        Metadados: {dados.uri}
        <br />
        Custodiante atual: {dados.custodianteAtual}
        {dados.pendente && <> — expedição pendente para {dados.destinatarioPendente}</>}
      </p>

      {conta && chainId && signer && (
        <AcoesCustodia
          tokenId={dados.tokenId}
          chainId={chainId}
          signer={signer}
          conta={conta}
          custodianteAtual={dados.custodianteAtual}
          pendente={dados.pendente}
          destinatarioPendente={dados.destinatarioPendente}
          aoAtualizar={carregar}
        />
      )}

      {chainId && <QRCodeGarrafa chainId={chainId} tokenId={dados.tokenId.toString()} />}

      <h2>Histórico de produção (do lote)</h2>
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

      <h2>Histórico de custódia (da garrafa)</h2>
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
    </section>
  );
}
