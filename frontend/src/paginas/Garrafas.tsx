import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AcoesCustodia } from "../componentes/AcoesCustodia";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";

interface LinhaGarrafa {
  tokenId: bigint;
  loteId: bigint;
  custodianteAtual: string;
  pendente: boolean;
  destinatarioPendente: string;
}

export function Garrafas() {
  const { conta, chainId, signer } = useCarteira();
  const [linhas, setLinhas] = useState<LinhaGarrafa[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [apenasMinhas, setApenasMinhas] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer) return;
    setCarregando(true);
    setErro(null);
    try {
      const tokenizacao = obterContrato("ContratoTokenizacao", chainId, signer);
      const rastreamento = obterContrato("ContratoRastreamento", chainId, signer);
      const total = Number((await tokenizacao.totalEmitidas()) as bigint);
      const ids = Array.from({ length: total }, (_, i) => BigInt(i + 1));

      const dados = await Promise.all(
        ids.map(async (tokenId) => {
          const [dadosGarrafa, situacao] = await Promise.all([
            tokenizacao.dadosDaGarrafa(tokenId),
            rastreamento.situacaoCustodia(tokenId),
          ]);
          return {
            tokenId,
            loteId: dadosGarrafa.loteId as bigint,
            custodianteAtual: situacao.custodiante as string,
            pendente: situacao.pendente as boolean,
            destinatarioPendente: situacao.destinatario as string,
          } satisfies LinhaGarrafa;
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

  const visiveis = linhas.filter((linha) => {
    if (!apenasMinhas || !conta) return true;
    const c = conta.toLowerCase();
    return linha.custodianteAtual.toLowerCase() === c || (linha.pendente && linha.destinatarioPendente.toLowerCase() === c);
  });

  return (
    <section>
      <h1>Garrafas</h1>
      <label>
        <input type="checkbox" checked={apenasMinhas} onChange={(e) => setApenasMinhas(e.target.checked)} />
        Mostrar só as garrafas que exigem alguma ação minha
      </label>

      {carregando && <p>Carregando…</p>}
      {erro && <p className="erro">{erro}</p>}

      <ul className="lista-garrafas">
        {visiveis.map((linha) => (
          <li key={linha.tokenId.toString()}>
            <p>
              <Link to={`/garrafas/${linha.tokenId}`}>Garrafa #{linha.tokenId.toString()}</Link> — lote #
              {linha.loteId.toString()}
              <br />
              Custodiante atual: {linha.custodianteAtual}
              {linha.pendente && <> — expedição pendente para {linha.destinatarioPendente}</>}
            </p>
            {conta && chainId && signer && (
              <AcoesCustodia
                tokenId={linha.tokenId}
                chainId={chainId}
                signer={signer}
                conta={conta}
                custodianteAtual={linha.custodianteAtual}
                pendente={linha.pendente}
                destinatarioPendente={linha.destinatarioPendente}
                aoAtualizar={carregar}
              />
            )}
          </li>
        ))}
        {!carregando && visiveis.length === 0 && <li>Nenhuma garrafa nesta visão.</li>}
      </ul>
    </section>
  );
}
