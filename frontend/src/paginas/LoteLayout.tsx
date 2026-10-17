import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import {
  encurtarEndereco,
  formatarTimestamp,
  ROTULO_ESTADO_PRODUCAO,
  ROTULO_TIPO_BEBIDA,
} from "../lib/formatadores";
import { useNomesParticipantes } from "../lib/useNomesParticipantes";
import type { DadosParticipante } from "../lib/useNomesParticipantes";
import { EstadoProducao, EtapaProducao, TipoBebida, TipoInsumo } from "../lib/tipos";
import {
  obterEtapasAplicaveis,
  validarInsumosParaConclusao,
  type ConfiguracaoProducao,
} from "../lib/validacaoSequencia";
import { LinkMetadados } from "../componentes/LinkMetadados";

export type Signer = NonNullable<ReturnType<typeof useCarteira>["signer"]>;

export interface LoteProducaoInfo {
  id: bigint;
  produtor: string;
  tipoBebida: TipoBebida;
  estado: EstadoProducao;
  envasadorDesignado: string;
  criadoEm: bigint;
  concluidoEm: bigint;
  canceladoEm: bigint;
  metadataURI: string;
  metadataURIConclusao: string;
  metadataURICancelamento: string;
}

export interface InsumoVinculado {
  id: bigint;
  tipo: TipoInsumo;
  quantidade: bigint;
  produtorDestinatario: string;
  fornecedor: string;
}

export interface EtapaRegistrada {
  indice: number;
  etapa: EtapaProducao;
  executadoPor: string;
  inicioInformado: bigint;
  fimInformado: bigint;
  registradoEm: bigint;
  metadataURI: string;
  insumosUtilizados: bigint[];
}

export interface LoteContexto {
  lote: LoteProducaoInfo;
  configuracao: ConfiguracaoProducao;
  insumosVinculados: InsumoVinculado[];
  etapas: EtapaRegistrada[];
  chainId: number;
  signer: Signer;
  conta: string;
  papeis: ReturnType<typeof usePapeis>;
  podeOperar: boolean;
  etapasPendentes: EtapaProducao[];
  etapasRegistradas: EtapaProducao[];
  erroInsumosConclusao: string | null;
  carregar: () => void;
}

export function useLoteContexto() {
  return useOutletContext<LoteContexto>();
}

export function LoteLayout() {
  const { id } = useParams<{ id: string }>();
  const { conta, chainId, signer } = useCarteira();
  const papeis = usePapeis();

  const [lote, setLote] = useState<LoteProducaoInfo | null>(null);
  const [configuracao, setConfiguracao] = useState<ConfiguracaoProducao | null>(null);
  const [insumosVinculados, setInsumosVinculados] = useState<InsumoVinculado[]>([]);
  const [etapas, setEtapas] = useState<EtapaRegistrada[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const nomes = useNomesParticipantes();

  const carregar = useCallback(async () => {
    if (!chainId || !signer || !id) return;
    setCarregando(true);
    setErro(null);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const existe = (await producao.loteProducaoExiste(id)) as boolean;
      if (!existe) {
        setErro("Este lote de produção não existe.");
        setLote(null);
        return;
      }

      const [dadoLote, config] = await Promise.all([
        producao.obterLoteProducao(id),
        producao.obterConfiguracao(id),
      ]);

      const totalVinculados = Number(await producao.totalInsumosVinculados(id));
      const idsVinculados = await Promise.all(
        Array.from({ length: totalVinculados }, (_, indice) => producao.insumoVinculadoPorIndice(id, indice))
      );

      const insumosContrato = obterContrato("ContratoInsumos", chainId, signer);
      const dadosInsumosVinculados = await Promise.all(
        (idsVinculados as bigint[]).map(async (insumoId) => {
          const dadoInsumo = await insumosContrato.obterLoteInsumo(insumoId);
          return {
            id: insumoId,
            tipo: Number(dadoInsumo.tipo) as TipoInsumo,
            quantidade: dadoInsumo.quantidade as bigint,
            produtorDestinatario: dadoInsumo.produtorDestinatario as string,
            fornecedor: dadoInsumo.fornecedor as string,
          } satisfies InsumoVinculado;
        })
      );

      const totalEtapasRegistradas = Number(await producao.totalEtapas(id));
      const dadosEtapas = await Promise.all(
        Array.from({ length: totalEtapasRegistradas }, async (_, indice) => {
          const registro = await producao.etapaPorIndice(id, indice);
          const totalInsumosEtapa = Number(await producao.totalInsumosDaEtapa(id, indice));
          const insumosDaEtapa = await Promise.all(
            Array.from({ length: totalInsumosEtapa }, (_, indiceInsumo) =>
              producao.insumoDaEtapaPorIndice(id, indice, indiceInsumo)
            )
          );
          return {
            indice,
            etapa: Number(registro.etapa) as EtapaProducao,
            executadoPor: registro.executadoPor as string,
            inicioInformado: registro.inicioInformado as bigint,
            fimInformado: registro.fimInformado as bigint,
            registradoEm: registro.registradoEm as bigint,
            metadataURI: registro.metadataURI as string,
            insumosUtilizados: insumosDaEtapa as bigint[],
          } satisfies EtapaRegistrada;
        })
      );

      setLote({
        id: BigInt(id),
        produtor: dadoLote.produtor as string,
        tipoBebida: Number(dadoLote.tipoBebida) as TipoBebida,
        estado: Number(dadoLote.estado) as EstadoProducao,
        envasadorDesignado: dadoLote.envasadorDesignado as string,
        criadoEm: dadoLote.criadoEm as bigint,
        concluidoEm: dadoLote.concluidoEm as bigint,
        canceladoEm: dadoLote.canceladoEm as bigint,
        metadataURI: dadoLote.metadataURI as string,
        metadataURIConclusao: dadoLote.metadataURIConclusao as string,
        metadataURICancelamento: dadoLote.metadataURICancelamento as string,
      });
      setConfiguracao({
        maturacaoAplicavel: config.maturacaoAplicavel as boolean,
        retificacaoAplicavel: config.retificacaoAplicavel as boolean,
        blendagemAplicavel: config.blendagemAplicavel as boolean,
        ajusteFinalAplicavel: config.ajusteFinalAplicavel as boolean,
      });
      setInsumosVinculados(dadosInsumosVinculados);
      setEtapas(dadosEtapas);
    } catch (erroLeitura) {
      setErro(mapearErroContrato(erroLeitura));
    } finally {
      setCarregando(false);
    }
  }, [chainId, signer, id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) return (
    <div className="carregando">
      <span className="carregando__indicador" aria-hidden="true" />
      <span>Carregando lote…</span>
    </div>
  );
  if (erro && !lote) return <p className="erro">{erro}</p>;
  if (!lote || !configuracao) return null;

  const dadosProdutor: DadosParticipante | undefined = nomes.get(lote.produtor.toLowerCase());
  const souProdutorResponsavel = conta?.toLowerCase() === lote.produtor.toLowerCase();
  const podeOperar = papeis.produtor && souProdutorResponsavel;
  const etapasRegistradas = etapas.map((e) => e.etapa);
  const etapasPendentes = obterEtapasAplicaveis(lote.tipoBebida, configuracao).filter(
    (etapa) => !etapasRegistradas.includes(etapa)
  );
  const idsUtilizados = etapas.flatMap((e) => e.insumosUtilizados);
  const erroInsumosConclusao = validarInsumosParaConclusao(lote.tipoBebida, idsUtilizados, insumosVinculados);

  const ctx: LoteContexto = {
    lote,
    configuracao,
    insumosVinculados,
    etapas,
    chainId: chainId!,
    signer: signer!,
    conta: conta!,
    papeis,
    podeOperar,
    etapasPendentes,
    etapasRegistradas,
    erroInsumosConclusao,
    carregar,
  };

  return (
    <section>
      <Link className="link-voltar" to="/lotes">← Lotes de produção</Link>
      <div className="secao-titulo-area">
        <h1>Lote #{lote.id.toString()} - {ROTULO_TIPO_BEBIDA[lote.tipoBebida]}</h1>
        <span className={`badge ${lote.estado === EstadoProducao.Concluido ? "badge--ok" : lote.estado === EstadoProducao.EmProducao ? "badge--neutro" : lote.estado === EstadoProducao.Cancelado ? "badge--erro" : "badge--aviso"}`}>
          {ROTULO_ESTADO_PRODUCAO[lote.estado]}
        </span>
      </div>
      <dl className="info-grade">
        <div className="info-campo">
          <dt className="info-campo__rotulo">Criado em</dt>
          <dd className="info-campo__valor">{formatarTimestamp(lote.criadoEm)}</dd>
        </div>
        {dadosProdutor?.empresa && (
          <div className="info-campo">
            <dt className="info-campo__rotulo">Empresa produtora</dt>
            <dd className="info-campo__valor">{dadosProdutor.empresa}</dd>
          </div>
        )}
        {dadosProdutor?.responsavel && (
          <div className="info-campo">
            <dt className="info-campo__rotulo">Responsável</dt>
            <dd className="info-campo__valor">{dadosProdutor.responsavel}</dd>
          </div>
        )}
        <div className="info-campo info-campo--largo">
          <dt className="info-campo__rotulo">Carteira do produtor</dt>
          <dd className="info-campo__valor mono">{lote.produtor}</dd>
        </div>
        <div className="info-campo info-campo--largo">
          <dt className="info-campo__rotulo">Metadados</dt>
          <dd className="info-campo__valor"><LinkMetadados uri={lote.metadataURI} /></dd>
        </div>
      </dl>
      {erro && <p className="erro">{erro}</p>}

      <nav className="abas">
        <NavLink
          to={`/lotes/${id}`}
          end
          className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
        >
          Detalhes
        </NavLink>
        <NavLink
          to={`/lotes/${id}/insumos`}
          className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
        >
          Insumos
        </NavLink>
        <NavLink
          to={`/lotes/${id}/etapas`}
          className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
        >
          Etapas
        </NavLink>
        <NavLink
          to={`/lotes/${id}/conclusao`}
          className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
        >
          Conclusão
        </NavLink>
      </nav>

      <Outlet context={ctx} />
    </section>
  );
}
