import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { encurtarEndereco, formatarTimestamp, ROTULO_TIPO_INSUMO, UNIDADE_INSUMO } from "../lib/formatadores";
import { TipoInsumo } from "../lib/tipos";
import { useNomesParticipantes } from "../lib/useNomesParticipantes";

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

export function Insumos() {
  const { conta, chainId, signer } = useCarteira();
  const nomes = useNomesParticipantes();
  const [linhas, setLinhas] = useState<LinhaInsumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer) return;
    setCarregando(true);
    setErro(null);
    try {
      const insumos = obterContrato("ContratoInsumos", chainId, signer);
      const total = (await insumos.totalLotesInsumo()) as bigint;
      const ids = Array.from({ length: Number(total) }, (_, i) => BigInt(i + 1));
      const todas = await Promise.all(ids.map((id) => carregarLote(insumos, id)));
      setLinhas(todas.reverse());
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
          <span>Carregando insumos…</span>
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
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
              {conta?.toLowerCase() === linha.produtorDestinatario.toLowerCase() && (
                <span className="badge badge--neutro">Para você</span>
              )}
            </div>
            <p className="item-lista__meta">
              {linha.quantidade.toString()} {UNIDADE_INSUMO[linha.tipo]}
              {" · "}Fornecedor: {nomes.get(linha.fornecedor.toLowerCase()) ?? encurtarEndereco(linha.fornecedor)}
              {" · "}Produtor: {nomes.get(linha.produtorDestinatario.toLowerCase()) ?? encurtarEndereco(linha.produtorDestinatario)}
              {" · "}Registrado em {formatarTimestamp(linha.registradoEm)}
            </p>
          </li>
        ))}
        {!carregando && linhas.length === 0 && (
          <li className="lista-vazia">Nenhum insumo cadastrado ainda.</li>
        )}
      </ul>
    </>
  );
}
