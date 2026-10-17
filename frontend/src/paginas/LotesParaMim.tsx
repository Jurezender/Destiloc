import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { formatarTimestamp, ROTULO_TIPO_BEBIDA } from "../lib/formatadores";
import { nomeResumido, useNomesParticipantes } from "../lib/useNomesParticipantes";
import { EstadoProducao, TipoBebida } from "../lib/tipos";

interface LinhaLote {
  id: bigint;
  tipoBebida: TipoBebida;
  produtor: string;
  criadoEm: bigint;
}

export function LotesParaMim() {
  const { conta, chainId, signer } = useCarteira();
  const nomes = useNomesParticipantes();
  const [linhas, setLinhas] = useState<LinhaLote[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer || !conta) return;
    setCarregando(true);
    setErro(null);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const total = Number((await producao.totalLotesProducao()) as bigint);
      const ids = Array.from({ length: total }, (_, i) => BigInt(i + 1));
      const todos = await Promise.all(
        ids.map(async (id) => {
          const dado = await producao.obterLoteProducao(id);
          return {
            id,
            tipoBebida: Number(dado.tipoBebida) as TipoBebida,
            produtor: dado.produtor as string,
            estado: Number(dado.estado) as EstadoProducao,
            envasadorDesignado: dado.envasadorDesignado as string,
            criadoEm: dado.criadoEm as bigint,
          };
        })
      );
      const paraMim = todos.filter(
        (l) =>
          l.estado === EstadoProducao.Concluido &&
          l.envasadorDesignado.toLowerCase() === conta.toLowerCase()
      );
      setLinhas(paraMim.reverse());
    } catch (erroLeitura) {
      setErro(mapearErroContrato(erroLeitura));
    } finally {
      setCarregando(false);
    }
  }, [chainId, signer, conta]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <>
      {carregando && (
        <div className="carregando">
          <span className="carregando__indicador" aria-hidden="true" />
          <span>Carregando…</span>
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
      {!carregando && linhas.length === 0 && (
        <p className="dica">Nenhum lote concluído está designado para você no momento.</p>
      )}
      <ul className="lista-lotes">
        {linhas.map((linha) => (
          <li key={linha.id.toString()}>
            <div className="item-lista__cabecalho">
              <Link className="item-lista__titulo" to={`/lotes/${linha.id}`}>
                #{linha.id.toString()} - {ROTULO_TIPO_BEBIDA[linha.tipoBebida]}
              </Link>
              <span className="badge badge--ok">Pronto para envasar</span>
            </div>
            <p className="item-lista__meta">
              Produtor: {nomeResumido(nomes.get(linha.produtor.toLowerCase()), linha.produtor)}
              {" · "}Criado em {formatarTimestamp(linha.criadoEm)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
