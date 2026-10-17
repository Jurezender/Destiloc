import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { encurtarEndereco, formatarTimestamp, ROTULO_TIPO_INSUMO, UNIDADE_INSUMO } from "../lib/formatadores";
import { TipoInsumo } from "../lib/tipos";
import { nomeResumido, useNomesParticipantes } from "../lib/useNomesParticipantes";

interface LinhaInsumo {
  id: bigint;
  tipo: TipoInsumo;
  quantidade: bigint;
  produtorDestinatario: string;
  fornecedor: string;
  registradoEm: bigint;
  valido: boolean;
}

async function carregarLote(
  insumos: ReturnType<typeof obterContrato>,
  id: bigint
): Promise<LinhaInsumo> {
  const [dado, valido] = await Promise.all([
    insumos.obterLoteInsumo(id),
    insumos.loteInsumoValido(id) as Promise<boolean>,
  ]);
  return {
    id,
    tipo: Number(dado.tipo) as TipoInsumo,
    quantidade: dado.quantidade as bigint,
    produtorDestinatario: dado.produtorDestinatario as string,
    fornecedor: dado.fornecedor as string,
    registradoEm: dado.registradoEm as bigint,
    valido,
  };
}

export function InsumosParaMim() {
  const { conta, chainId, signer } = useCarteira();
  const nomes = useNomesParticipantes();
  const [linhas, setLinhas] = useState<LinhaInsumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer || !conta) return;
    setCarregando(true);
    setErro(null);
    try {
      const insumos = obterContrato("ContratoInsumos", chainId, signer);
      const totalProdutor = (await insumos.totalInsumosDoProdutor(conta)) as bigint;
      const idsProdutor = await Promise.all(
        Array.from({ length: Number(totalProdutor) }, (_, i) =>
          insumos.insumoDoProdutor(conta, i) as Promise<bigint>
        )
      );
      const doProdutor = await Promise.all(idsProdutor.map((id) => carregarLote(insumos, id)));
      setLinhas(doProdutor.reverse());
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
        <p className="dica">Nenhum insumo foi direcionado para sua conta ainda.</p>
      )}
      <ul className="lista-lotes">
        {linhas.map((linha) => (
          <li key={linha.id.toString()}>
            <div className="item-lista__cabecalho">
              <Link className="item-lista__titulo" to={`/insumos/${linha.id}`}>
                #{linha.id.toString()} - {ROTULO_TIPO_INSUMO[linha.tipo]}
              </Link>
              <span className={`badge ${linha.valido ? "badge--ok" : "badge--erro"}`}>
                {linha.valido ? "Válido" : "Invalidado"}
              </span>
            </div>
            <p className="item-lista__meta">
              {linha.quantidade.toString()} {UNIDADE_INSUMO[linha.tipo]}
              {" · "}Fornecedor: {nomeResumido(nomes.get(linha.fornecedor.toLowerCase()), encurtarEndereco(linha.fornecedor))}
              {" · "}Registrado em {formatarTimestamp(linha.registradoEm)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
