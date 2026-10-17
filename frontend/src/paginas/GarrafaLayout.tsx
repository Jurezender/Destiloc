import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { formatarTimestamp } from "../lib/formatadores";
import { useNomesParticipantes } from "../lib/useNomesParticipantes";
import type { DadosParticipante } from "../lib/useNomesParticipantes";

export interface DadosGarrafa {
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

export interface GarrafaContexto {
  dados: DadosGarrafa;
  chainId: number;
}

export function useGarrafaContexto() {
  return useOutletContext<GarrafaContexto>();
}

export function GarrafaLayout() {
  const { tokenId } = useParams<{ tokenId: string }>();
  const { chainId, signer } = useCarteira();
  const [dados, setDados] = useState<DadosGarrafa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const nomes = useNomesParticipantes();

  const carregar = useCallback(async () => {
    if (!chainId || !signer || !tokenId) return;
    setCarregando(true);
    setErro(null);
    try {
      const envasamento = obterContrato("ContratoEnvasamento", chainId, signer);
      const existe = (await envasamento.garrafaExiste(tokenId)) as boolean;
      if (!existe) {
        setErro("Esta garrafa não existe.");
        setDados(null);
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

  const dadosEnvasador: DadosParticipante | undefined = nomes.get(dados.envasador.toLowerCase());

  return (
    <section>
      <Link className="link-voltar" to="/garrafas">← Garrafas</Link>
      <div className="secao-titulo-area">
        <h1>Garrafa #{dados.tokenId.toString()}</h1>
      </div>
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
        {dadosEnvasador?.empresa && (
          <div className="info-campo">
            <dt className="info-campo__rotulo">Empresa envasadora</dt>
            <dd className="info-campo__valor">{dadosEnvasador.empresa}</dd>
          </div>
        )}
        {dadosEnvasador?.responsavel && (
          <div className="info-campo">
            <dt className="info-campo__rotulo">Responsável</dt>
            <dd className="info-campo__valor">{dadosEnvasador.responsavel}</dd>
          </div>
        )}
        <div className="info-campo info-campo--largo">
          <dt className="info-campo__rotulo">Carteira do envasador</dt>
          <dd className="info-campo__valor mono">{dados.envasador}</dd>
        </div>
      </dl>

      <nav className="abas">
        <NavLink
          to={`/garrafas/${tokenId}`}
          end
          className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
        >
          Detalhes
        </NavLink>
        <NavLink
          to={`/garrafas/${tokenId}/qrcode`}
          className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
        >
          QR Code
        </NavLink>
      </nav>

      <Outlet context={{ dados, chainId: chainId! } satisfies GarrafaContexto} />
    </section>
  );
}
