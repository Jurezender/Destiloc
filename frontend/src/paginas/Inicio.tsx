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
      {papeis.carregando && <p>Carregando papéis…</p>}
      {papeis.erro && <p className="erro">{papeis.erro}</p>}
      {!papeis.carregando && !papeis.erro && (
        <ul>
          <li>Administrador: {papeis.admin ? "sim" : "não"}</li>
          <li>Fornecedor: {papeis.fornecedor ? "sim" : "não"}</li>
          <li>Produtor: {papeis.produtor ? "sim" : "não"}</li>
          <li>Envasador: {papeis.envasador ? "sim" : "não"}</li>
        </ul>
      )}

      <h2>Contadores gerais</h2>
      {erro && <p className="erro">{erro}</p>}
      {contadores ? (
        <ul>
          <li>Lotes de insumo: {contadores.totalInsumos.toString()}</li>
          <li>Lotes de produção: {contadores.totalLotesProducao.toString()}</li>
          <li>Envasamentos: {contadores.totalEnvasamentos.toString()}</li>
          <li>Garrafas emitidas: {contadores.totalGarrafas.toString()}</li>
        </ul>
      ) : (
        !erro && <p>Carregando…</p>
      )}
    </section>
  );
}
