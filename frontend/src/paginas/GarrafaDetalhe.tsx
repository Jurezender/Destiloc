import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeGarrafa } from "../componentes/QRCodeGarrafa";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { formatarTimestamp } from "../lib/formatadores";

interface DadosGarrafa {
  tokenId: bigint;
  envasamentoId: bigint;
  emitidaEm: bigint;
  enderecoTecnico: string;
  loteProducaoId: bigint;
  envasador: string;
  quantidadeDeclarada: bigint;
  quantidadeEmitida: bigint;
  registradoEm: bigint;
  concluidoEm: bigint;
  metadataURI: string;
}

export function GarrafaDetalhe() {
  const { tokenId } = useParams<{ tokenId: string }>();
  const { chainId, signer } = useCarteira();
  const [dados, setDados] = useState<DadosGarrafa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer || !tokenId) return;
    setCarregando(true);
    setErro(null);
    try {
      const envasamento = obterContrato("ContratoEnvasamento", chainId, signer);
      const existe = (await envasamento.garrafaExiste(tokenId)) as boolean;
      if (!existe) {
        setErro("Esta garrafa não existe.");
        return;
      }

      const [garrafa, enderecoOwnerOf] = await Promise.all([
        envasamento.obterGarrafa(tokenId),
        envasamento.ownerOf(tokenId) as Promise<string>,
      ]);
      const dadoEnvasamento = await envasamento.obterEnvasamento(garrafa.envasamentoId);

      setDados({
        tokenId: BigInt(tokenId),
        envasamentoId: garrafa.envasamentoId as bigint,
        emitidaEm: garrafa.emitidaEm as bigint,
        enderecoTecnico: enderecoOwnerOf,
        loteProducaoId: dadoEnvasamento.loteProducaoId as bigint,
        envasador: dadoEnvasamento.envasador as string,
        quantidadeDeclarada: dadoEnvasamento.quantidadeDeclarada as bigint,
        quantidadeEmitida: dadoEnvasamento.quantidadeEmitida as bigint,
        registradoEm: dadoEnvasamento.registradoEm as bigint,
        concluidoEm: dadoEnvasamento.concluidoEm as bigint,
        metadataURI: dadoEnvasamento.metadataURI as string,
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
      <h1>Garrafa #{dados.tokenId.toString()}</h1>
      <p>
        Envasamento: #{dados.envasamentoId.toString()} — envasador {dados.envasador}
        <br />
        Lote de produção: <Link to={`/lotes/${dados.loteProducaoId}`}>#{dados.loteProducaoId.toString()}</Link>
        <br />
        Emitida em: {formatarTimestamp(dados.emitidaEm)}
        <br />
        Quantidade do envasamento: {dados.quantidadeEmitida.toString()}/{dados.quantidadeDeclarada.toString()}
        <br />
        {dados.concluidoEm !== 0n ? (
          <>Envasamento concluído em: {formatarTimestamp(dados.concluidoEm)}</>
        ) : (
          "Envasamento em andamento"
        )}
        <br />
        Metadados do envasamento: {dados.metadataURI}
      </p>

      <p className="dica">
        Endereço técnico do ERC-721: {dados.enderecoTecnico}
        <br />
        A garrafa não é transferível; este endereço corresponde ao envasador responsável pelo envasamento.
      </p>

      {chainId && <QRCodeGarrafa chainId={chainId} tokenId={dados.tokenId.toString()} />}
    </section>
  );
}
