import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { encurtarEndereco, formatarTimestamp, ROTULO_ESTADO_PRODUCAO, ROTULO_TIPO_BEBIDA } from "../lib/formatadores";
import { EstadoProducao, TipoBebida } from "../lib/tipos";
import { nomeResumido, useNomesParticipantes } from "../lib/useNomesParticipantes";

interface LinhaLote {
  id: bigint;
  tipoBebida: TipoBebida;
  produtor: string;
  estado: EstadoProducao;
  criadoEm: bigint;
  totalEtapas: bigint;
}

export function Lotes() {
  const { chainId, signer } = useCarteira();
  const nomes = useNomesParticipantes();
  const [linhas, setLinhas] = useState<LinhaLote[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer) return;
    setCarregando(true);
    setErro(null);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const total = (await producao.totalLotesProducao()) as bigint;
      const ids = Array.from({ length: Number(total) }, (_, i) => BigInt(i + 1));
      const dados = await Promise.all(
        ids.map(async (id) => {
          const [dado, totalEtapas] = await Promise.all([
            producao.obterLoteProducao(id),
            producao.totalEtapas(id) as Promise<bigint>,
          ]);
          return {
            id,
            tipoBebida: Number(dado.tipoBebida) as TipoBebida,
            produtor: dado.produtor as string,
            estado: Number(dado.estado) as EstadoProducao,
            criadoEm: dado.criadoEm as bigint,
            totalEtapas,
          } satisfies LinhaLote;
        })
      );
      setLinhas(dados.reverse());
    } catch (erroLeitura) {
      setErro(mapearErroContrato(erroLeitura));
    } finally {
      setCarregando(false);
    }
  }, [chainId, signer]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <>
      {carregando && (
        <div className="carregando">
          <span className="carregando__indicador" aria-hidden="true" />
          <span>Carregando lotes…</span>
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
      <ul className="lista-lotes">
        {linhas.map((linha) => (
          <li key={linha.id.toString()}>
            <div className="item-lista__cabecalho">
              <Link className="item-lista__titulo" to={`/lotes/${linha.id}`}>
                #{linha.id.toString()} - {ROTULO_TIPO_BEBIDA[linha.tipoBebida]}
              </Link>
              <span className={`badge ${linha.estado === EstadoProducao.Concluido ? "badge--ok" : linha.estado === EstadoProducao.EmProducao ? "badge--neutro" : "badge--aviso"}`}>
                {ROTULO_ESTADO_PRODUCAO[linha.estado]}
              </span>
            </div>
            <p className="item-lista__meta">
              Produtor: {nomeResumido(nomes.get(linha.produtor.toLowerCase()), encurtarEndereco(linha.produtor))}
              {" · "}Criado em {formatarTimestamp(linha.criadoEm)}
              {" · "}{linha.totalEtapas.toString()} etapa(s)
            </p>
          </li>
        ))}
        {!carregando && linhas.length === 0 && <li className="lista-vazia">Nenhum lote cadastrado ainda.</li>}
      </ul>
    </>
  );
}
