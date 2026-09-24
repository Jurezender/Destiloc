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

  if (carregando) return (
    <div className="carregando">
      <span className="carregando__indicador" aria-hidden="true" />
      <span>Carregando garrafa…</span>
    </div>
  );
  if (erro && !dados) return <p className="erro">{erro}</p>;
  if (!dados) return null;

  return (
    <section>
      <Link className="link-voltar" to="/garrafas">← Garrafas</Link>
      <h1>Garrafa #{dados.tokenId.toString()}</h1>

      <dl className="info-grade">
        <div className="info-campo">
          <dt className="info-campo__rotulo">Envasamento</dt>
          <dd className="info-campo__valor">#{dados.envasamentoId.toString()}</dd>
        </div>
        <div className="info-campo">
          <dt className="info-campo__rotulo">Lote de produção</dt>
          <dd className="info-campo__valor">
            <Link to={`/lotes/${dados.loteProducaoId}`}>#{dados.loteProducaoId.toString()}</Link>
          </dd>
        </div>
        <div className="info-campo">
          <dt className="info-campo__rotulo">Emitida em</dt>
          <dd className="info-campo__valor">{formatarTimestamp(dados.emitidaEm)}</dd>
        </div>
        <div className="info-campo">
          <dt className="info-campo__rotulo">Garrafas emitidas / declaradas</dt>
          <dd className="info-campo__valor">
            {dados.quantidadeEmitida.toString()} / {dados.quantidadeDeclarada.toString()}
          </dd>
        </div>
        <div className="info-campo">
          <dt className="info-campo__rotulo">Situação do envasamento</dt>
          <dd className="info-campo__valor">
            {dados.concluidoEm !== 0n
              ? `Concluído em ${formatarTimestamp(dados.concluidoEm)}`
              : "Em andamento"}
          </dd>
        </div>
        <div className="info-campo info-campo--largo">
          <dt className="info-campo__rotulo">Envasador</dt>
          <dd className="info-campo__valor mono">{dados.envasador}</dd>
        </div>
        <div className="info-campo info-campo--largo">
          <dt className="info-campo__rotulo">Metadados do envasamento</dt>
          <dd className="info-campo__valor mono">{dados.metadataURI}</dd>
        </div>
        <div className="info-campo info-campo--largo">
          <dt className="info-campo__rotulo">Endereço técnico ERC-721</dt>
          <dd className="info-campo__valor mono">{dados.enderecoTecnico}</dd>
        </div>
      </dl>
      <p className="dica">A garrafa não é transferível; o endereço técnico corresponde ao envasador responsável.</p>

      {chainId && <QRCodeGarrafa chainId={chainId} tokenId={dados.tokenId.toString()} />}
    </section>
  );
}
