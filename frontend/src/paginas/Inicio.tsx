import { useEffect, useState } from "react";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { REDES } from "../contracts/redes";
import { mapearErroContrato } from "../lib/erros";

interface Contadores {
  totalInsumos: bigint;
  totalLotesProducao: bigint;
  totalEnvasamentos: bigint;
  totalGarrafas: bigint;
}

export function Inicio() {
  const { conta, chainId, signer } = useCarteira();
  const papeis = usePapeis();
  const [contadores, setContadores] = useState<Contadores | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!chainId || !signer) return;
    let cancelado = false;
    (async () => {
      try {
        const insumos = obterContrato("ContratoInsumos", chainId, signer);
        const producao = obterContrato("ContratoProducao", chainId, signer);
        const envasamento = obterContrato("ContratoEnvasamento", chainId, signer);
        const [totalInsumos, totalLotesProducao, totalEnvasamentos, totalGarrafas] = await Promise.all([
          insumos.totalLotesInsumo() as Promise<bigint>,
          producao.totalLotesProducao() as Promise<bigint>,
          envasamento.totalEnvasamentos() as Promise<bigint>,
          envasamento.totalGarrafas() as Promise<bigint>,
        ]);
        if (!cancelado) {
          setContadores({ totalInsumos, totalLotesProducao, totalEnvasamentos, totalGarrafas });
        }
      } catch (erroLeitura) {
        if (!cancelado) setErro(mapearErroContrato(erroLeitura));
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [chainId, signer]);

  const rede = chainId ? REDES[chainId] : undefined;

  return (
    <section>
      <h1>Início</h1>
      <p>
        Conta conectada: <strong>{conta}</strong>
        <br />
        Rede: <strong>{rede ? rede.rotulo : `chainId ${chainId}`}</strong>
      </p>

      <h2>Seus papéis</h2>
      {papeis.carregando && (
        <div className="carregando">
          <span className="carregando__indicador" aria-hidden="true" />
          <span>Carregando papéis…</span>
        </div>
      )}
      {papeis.erro && <p className="erro">{papeis.erro}</p>}
      {!papeis.carregando && !papeis.erro && (
        <ul className="lista-papeis">
          <li>Administrador <span className={`badge ${papeis.admin ? "badge--ok" : "badge--neutro"}`}>{papeis.admin ? "Sim" : "Não"}</span></li>
          <li>Fornecedor <span className={`badge ${papeis.fornecedor ? "badge--ok" : "badge--neutro"}`}>{papeis.fornecedor ? "Sim" : "Não"}</span></li>
          <li>Produtor <span className={`badge ${papeis.produtor ? "badge--ok" : "badge--neutro"}`}>{papeis.produtor ? "Sim" : "Não"}</span></li>
          <li>Envasador <span className={`badge ${papeis.envasador ? "badge--ok" : "badge--neutro"}`}>{papeis.envasador ? "Sim" : "Não"}</span></li>
        </ul>
      )}

      <h2>Contadores gerais</h2>
      {erro && <p className="erro">{erro}</p>}
      {contadores ? (
        <div className="grade-contadores">
          <div className="contador">
            <span className="contador__numero">{contadores.totalInsumos.toString()}</span>
            <span className="contador__rotulo">Lotes de insumo</span>
          </div>
          <div className="contador">
            <span className="contador__numero">{contadores.totalLotesProducao.toString()}</span>
            <span className="contador__rotulo">Lotes de produção</span>
          </div>
          <div className="contador">
            <span className="contador__numero">{contadores.totalEnvasamentos.toString()}</span>
            <span className="contador__rotulo">Envasamentos</span>
          </div>
          <div className="contador">
            <span className="contador__numero">{contadores.totalGarrafas.toString()}</span>
            <span className="contador__rotulo">Garrafas emitidas</span>
          </div>
        </div>
      ) : (
        !erro && (
          <div className="carregando">
            <span className="carregando__indicador" aria-hidden="true" />
            <span>Carregando…</span>
          </div>
        )
      )}
    </section>
  );
}
