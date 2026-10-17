import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { formatarTimestamp, ROTULO_TIPO_INSUMO, UNIDADE_INSUMO } from "../lib/formatadores";
import { useNomesParticipantes } from "../lib/useNomesParticipantes";
import type { DadosParticipante } from "../lib/useNomesParticipantes";
import { ResultadoAvaliacao, TipoInsumo } from "../lib/tipos";

export type Signer = NonNullable<ReturnType<typeof useCarteira>["signer"]>;

export interface LoteInsumoInfo {
  id: bigint;
  fornecedor: string;
  tipo: TipoInsumo;
  quantidade: bigint;
  produtorDestinatario: string;
  registradoEm: bigint;
  metadataURI: string;
}

export interface InvalidacaoInfo {
  invalidado: boolean;
  registradoEm: bigint;
  metadataURI: string;
}

export interface CorrecaoInfo {
  indice: number;
  registradoEm: bigint;
  metadataURI: string;
}

export interface AvaliacaoInfo {
  indice: number;
  resultado: ResultadoAvaliacao;
  registradoEm: bigint;
  metadataURI: string;
}

export interface InsumoContexto {
  lote: LoteInsumoInfo;
  invalidacao: InvalidacaoInfo;
  correcoes: CorrecaoInfo[];
  avaliacoes: AvaliacaoInfo[];
  resultadoAtual: ResultadoAvaliacao | null;
  chainId: number;
  signer: Signer;
  conta: string;
  papeis: ReturnType<typeof usePapeis>;
  souFornecedorOriginal: boolean;
  podeCorrigirOuInvalidar: boolean;
  souProdutorDestinatario: boolean;
  carregar: () => void;
}

export function useInsumoContexto() {
  return useOutletContext<InsumoContexto>();
}

export function InsumoLayout() {
  const { id } = useParams<{ id: string }>();
  const { conta, chainId, signer } = useCarteira();
  const papeis = usePapeis();

  const [lote, setLote] = useState<LoteInsumoInfo | null>(null);
  const [invalidacao, setInvalidacao] = useState<InvalidacaoInfo | null>(null);
  const [correcoes, setCorrecoes] = useState<CorrecaoInfo[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoInfo[]>([]);
  const [resultadoAtual, setResultadoAtual] = useState<ResultadoAvaliacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const nomes = useNomesParticipantes();

  const carregar = useCallback(async () => {
    if (!chainId || !signer || !id) return;
    setCarregando(true);
    setErro(null);
    try {
      const insumos = obterContrato("ContratoInsumos", chainId, signer);
      const existe = (await insumos.loteInsumoExiste(id)) as boolean;
      if (!existe) {
        setErro("Este lote de insumo não existe.");
        setLote(null);
        return;
      }

      const [dadoLote, dadoInvalidacao] = await Promise.all([
        insumos.obterLoteInsumo(id),
        insumos.obterInvalidacao(id),
      ]);

      const totalCorrecoesRegistradas = Number(await insumos.totalCorrecoes(id));
      const dadosCorrecoes = await Promise.all(
        Array.from({ length: totalCorrecoesRegistradas }, async (_, indice) => {
          const registro = await insumos.correcaoPorIndice(id, indice);
          return {
            indice,
            registradoEm: registro.registradoEm as bigint,
            metadataURI: registro.metadataURI as string,
          } satisfies CorrecaoInfo;
        })
      );

      let avaliacoesProprias: AvaliacaoInfo[] = [];
      let resultadoProprio: ResultadoAvaliacao | null = null;
      if (papeis.produtor && conta) {
        const totalAvaliacoesProprias = Number(await insumos.totalAvaliacoes(id, conta));
        avaliacoesProprias = await Promise.all(
          Array.from({ length: totalAvaliacoesProprias }, async (_, indice) => {
            const registro = await insumos.avaliacaoPorIndice(id, conta, indice);
            return {
              indice,
              resultado: Number(registro.resultado) as ResultadoAvaliacao,
              registradoEm: registro.registradoEm as bigint,
              metadataURI: registro.metadataURI as string,
            } satisfies AvaliacaoInfo;
          })
        );
        resultadoProprio = Number(await insumos.resultadoAtual(id, conta)) as ResultadoAvaliacao;
      }

      setLote({
        id: BigInt(id),
        fornecedor: dadoLote.fornecedor as string,
        tipo: Number(dadoLote.tipo) as TipoInsumo,
        quantidade: dadoLote.quantidade as bigint,
        produtorDestinatario: dadoLote.produtorDestinatario as string,
        registradoEm: dadoLote.registradoEm as bigint,
        metadataURI: dadoLote.metadataURI as string,
      });
      setInvalidacao({
        invalidado: dadoInvalidacao.invalidado as boolean,
        registradoEm: dadoInvalidacao.registradoEm as bigint,
        metadataURI: dadoInvalidacao.metadataURI as string,
      });
      setCorrecoes(dadosCorrecoes);
      setAvaliacoes(avaliacoesProprias);
      setResultadoAtual(resultadoProprio);
    } catch (erroLeitura) {
      setErro(mapearErroContrato(erroLeitura));
    } finally {
      setCarregando(false);
    }
  }, [chainId, signer, id, papeis.produtor, conta]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) return (
    <div className="carregando">
      <span className="carregando__indicador" aria-hidden="true" />
      <span>Carregando insumo…</span>
    </div>
  );
  if (erro && !lote) return <p className="erro">{erro}</p>;
  if (!lote || !invalidacao) return null;

  const dadosFornecedor: DadosParticipante | undefined = nomes.get(lote.fornecedor.toLowerCase());
  const dadosDestinatario: DadosParticipante | undefined = nomes.get(lote.produtorDestinatario.toLowerCase());
  const mesmoParticipante = lote.fornecedor.toLowerCase() === lote.produtorDestinatario.toLowerCase();
  const souFornecedorOriginal = conta?.toLowerCase() === lote.fornecedor.toLowerCase();
  const podeCorrigirOuInvalidar = papeis.fornecedor && souFornecedorOriginal;
  const souProdutorDestinatario = papeis.produtor && conta?.toLowerCase() === lote.produtorDestinatario.toLowerCase();

  const ctx: InsumoContexto = {
    lote,
    invalidacao,
    correcoes,
    avaliacoes,
    resultadoAtual,
    chainId: chainId!,
    signer: signer!,
    conta: conta!,
    papeis,
    souFornecedorOriginal,
    podeCorrigirOuInvalidar,
    souProdutorDestinatario,
    carregar,
  };

  return (
    <section>
      <Link className="link-voltar" to="/insumos">← Lotes de insumo</Link>
      <div className="secao-titulo-area">
        <h1>Insumo #{lote.id.toString()} - {ROTULO_TIPO_INSUMO[lote.tipo]}</h1>
        <span className={`badge ${invalidacao.invalidado ? "badge--erro" : "badge--ok"}`}>
          {invalidacao.invalidado ? "Invalidado" : "Válido"}
        </span>
      </div>
      <dl className="info-grade">
        <div className="info-campo">
          <dt className="info-campo__rotulo">Registrado em</dt>
          <dd className="info-campo__valor">{formatarTimestamp(lote.registradoEm)}</dd>
        </div>
        <div className="info-campo">
          <dt className="info-campo__rotulo">Quantidade</dt>
          <dd className="info-campo__valor">{lote.quantidade.toString()} {UNIDADE_INSUMO[lote.tipo]}</dd>
        </div>
        {dadosFornecedor?.empresa && (
          <div className="info-campo">
            <dt className="info-campo__rotulo">Empresa fornecedora</dt>
            <dd className="info-campo__valor">{dadosFornecedor.empresa}</dd>
          </div>
        )}
        {dadosFornecedor?.responsavel && (
          <div className="info-campo">
            <dt className="info-campo__rotulo">Responsável</dt>
            <dd className="info-campo__valor">{dadosFornecedor.responsavel}</dd>
          </div>
        )}
        <div className="info-campo info-campo--largo">
          <dt className="info-campo__rotulo">{mesmoParticipante ? "Carteira do fornecedor / destinatário" : "Carteira do fornecedor"}</dt>
          <dd className="info-campo__valor mono">
            {lote.fornecedor}
            {mesmoParticipante && souProdutorDestinatario && <span className="badge badge--neutro" style={{ marginLeft: "0.5rem" }}>Você</span>}
          </dd>
        </div>
        {!mesmoParticipante && dadosDestinatario?.empresa && (
          <div className="info-campo">
            <dt className="info-campo__rotulo">Empresa produtora</dt>
            <dd className="info-campo__valor">{dadosDestinatario.empresa}</dd>
          </div>
        )}
        {!mesmoParticipante && dadosDestinatario?.responsavel && (
          <div className="info-campo">
            <dt className="info-campo__rotulo">Responsável</dt>
            <dd className="info-campo__valor">{dadosDestinatario.responsavel}</dd>
          </div>
        )}
        {!mesmoParticipante && (
          <div className="info-campo info-campo--largo">
            <dt className="info-campo__rotulo">Carteira do destinatário</dt>
            <dd className="info-campo__valor mono">
              {lote.produtorDestinatario}
              {souProdutorDestinatario && <span className="badge badge--neutro" style={{ marginLeft: "0.5rem" }}>Você</span>}
            </dd>
          </div>
        )}
      </dl>
      {erro && <p className="erro">{erro}</p>}

      <nav className="abas">
        <NavLink
          to={`/insumos/${id}`}
          end
          className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
        >
          Detalhes
        </NavLink>
        <NavLink
          to={`/insumos/${id}/correcoes`}
          className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
        >
          Correções
        </NavLink>
        <NavLink
          to={`/insumos/${id}/avaliacao`}
          className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
        >
          Avaliação
        </NavLink>
      </nav>

      <Outlet context={ctx} />
    </section>
  );
}
