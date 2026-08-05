import { useEffect, useState } from "react";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { REDES } from "../contracts/redes";
import { mapearErroContrato } from "../lib/erros";

interface Contadores {
  totalLotes: bigint;
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
        const lote = obterContrato("ContratoLote", chainId, signer);
        const tokenizacao = obterContrato("ContratoTokenizacao", chainId, signer);
        const [totalLotes, totalGarrafas] = await Promise.all([
          lote.totalLotes() as Promise<bigint>,
          tokenizacao.totalEmitidas() as Promise<bigint>,
        ]);
        if (!cancelado) setContadores({ totalLotes, totalGarrafas });
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
      <ul>
        <li>ContratoLote: {papeis.lote.admin && "administrador"} {papeis.lote.fabricante && "fabricante"} {!papeis.lote.admin && !papeis.lote.fabricante && "nenhum"}</li>
        <li>ContratoTokenizacao: {papeis.tokenizacao.admin && "administrador"} {papeis.tokenizacao.fabricante && "fabricante"} {!papeis.tokenizacao.admin && !papeis.tokenizacao.fabricante && "nenhum"}</li>
        <li>
          ContratoRastreamento: {papeis.rastreamento.admin && "administrador "}
          {papeis.rastreamento.fabricante && "fabricante "}
          {papeis.rastreamento.distribuidor && "distribuidor "}
          {papeis.rastreamento.varejista && "varejista "}
          {!papeis.rastreamento.admin &&
            !papeis.rastreamento.fabricante &&
            !papeis.rastreamento.distribuidor &&
            !papeis.rastreamento.varejista &&
            "nenhum"}
        </li>
      </ul>
      {!papeis.fabricanteCompleto && (papeis.lote.fabricante || papeis.tokenizacao.fabricante || papeis.rastreamento.fabricante) && (
        <p className="aviso">
          Esta conta tem o papel de fabricante em apenas parte dos contratos. Para operar o fluxo completo
          (lote, emissão e expedição), ela precisa de FABRICANTE_ROLE nos três — peça a um administrador para
          completar em "Participantes".
        </p>
      )}

      <h2>Contadores gerais</h2>
      {erro && <p className="erro">{erro}</p>}
      {contadores ? (
        <ul>
          <li>Lotes cadastrados: {contadores.totalLotes.toString()}</li>
          <li>Garrafas emitidas: {contadores.totalGarrafas.toString()}</li>
        </ul>
      ) : (
        !erro && <p>Carregando…</p>
      )}
    </section>
  );
}
