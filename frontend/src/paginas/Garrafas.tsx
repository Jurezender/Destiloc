import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { formatarTimestamp } from "../lib/formatadores";

interface LinhaGarrafa {
  tokenId: bigint;
  envasamentoId: bigint;
  loteProducaoId: bigint;
  emitidaEm: bigint;
}

export function Garrafas() {
  const { chainId, signer } = useCarteira();
  const [linhas, setLinhas] = useState<LinhaGarrafa[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer) return;
    setCarregando(true);
    setErro(null);
    try {
      const envasamento = obterContrato("ContratoEnvasamento", chainId, signer);
      const total = Number(await envasamento.totalGarrafas());
      const tokenIds = Array.from({ length: total }, (_, i) => BigInt(i + 1));

      const garrafas = await Promise.all(
        tokenIds.map(async (tokenId) => {
          const dado = await envasamento.obterGarrafa(tokenId);
          return {
            tokenId,
            envasamentoId: dado.envasamentoId as bigint,
            emitidaEm: dado.emitidaEm as bigint,
          };
        })
      );

      const idsEnvasamentosUnicos = Array.from(new Set(garrafas.map((g) => g.envasamentoId.toString())));
      const paresEnvasamento = await Promise.all(
        idsEnvasamentosUnicos.map(async (chave) => {
          const envasamentoId = BigInt(chave);
          const dadoEnvasamento = await envasamento.obterEnvasamento(envasamentoId);
          return [chave, dadoEnvasamento.loteProducaoId as bigint] as const;
        })
      );
      const loteProducaoIdPorEnvasamento = new Map(paresEnvasamento);

      const dados = garrafas.map(
        (g) =>
          ({
            tokenId: g.tokenId,
            envasamentoId: g.envasamentoId,
            loteProducaoId: loteProducaoIdPorEnvasamento.get(g.envasamentoId.toString())!,
            emitidaEm: g.emitidaEm,
          }) satisfies LinhaGarrafa
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
    <section>
      <h1>Garrafas</h1>

      {carregando && <p>Carregando…</p>}
      {erro && <p className="erro">{erro}</p>}

      <ul className="lista-garrafas">
        {linhas.map((linha) => (
          <li key={linha.tokenId.toString()}>
            <p>
              <Link to={`/garrafas/${linha.tokenId}`}>Garrafa #{linha.tokenId.toString()}</Link> — envasamento #
              {linha.envasamentoId.toString()} — lote{" "}
              <Link to={`/lotes/${linha.loteProducaoId}`}>#{linha.loteProducaoId.toString()}</Link>
              <br />
              Emitida em: {formatarTimestamp(linha.emitidaEm)}
            </p>
          </li>
        ))}
        {!carregando && linhas.length === 0 && <li>Nenhuma garrafa emitida ainda.</li>}
      </ul>
    </section>
  );
}
