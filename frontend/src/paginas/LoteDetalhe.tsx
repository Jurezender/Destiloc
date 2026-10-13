import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx, mapearErroContrato } from "../lib/erros";
import {
  encurtarEndereco,
  formatarTimestamp,
  RETULO_ESTADO_PRODUCAO,
  RETULO_ETAPA_PRODUCAO,
  RETULO_TIPO_BEBIDA,
  RETULO_TIPO_INSUMO,
  UNIDADE_INSUMO,
} from "../lib/formatadores";
import { EstadoProducao, EtapaProducao, TipoBebida, TipoInsumo } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import {
  obterEtapasAplicaveis,
  validarConfiguracaoProducao,
  validarInsumosParaConclusao,
  validarRegistroEtapa,
  type ConfiguracaoProducao,
} from "../lib/validacaoSequencia";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosConclusaoProducao, montarMetadadosEtapaProducao } from "../ipfs/metadados";
import { AnexosIpfs } from "../componentes/AnexosIpfs";
import { LinkMetadados } from "../componentes/LinkMetadados";

type Signer = NonNullable<ReturnType<typeof useCarteira>["signer"]>;

interface LoteProducaoInfo {
  id: bigint;
  produtor: string;
  tipoBebida: TipoBebida;
  estado: EstadoProducao;
  envasadorDesignado: string;
  criadoEm: bigint;
  concluidoEm: bigint;
  metadataURI: string;
  metadataURIConclusao: string;
}

interface InsumoVinculado {
  id: bigint;
  tipo: TipoInsumo;
  quantidade: bigint;
  produtorDestinatario: string;
  fornecedor: string;
}

interface EtapaRegistrada {
  indice: number;
  etapa: EtapaProducao;
  executadoPor: string;
  inicioInformado: bigint;
  fimInformado: bigint;
  registradoEm: bigint;
  metadataURI: string;
  insumosUtilizados: bigint[];
}

function segundosDoDatetimeLocal(valor: string): number {
  return Math.floor(new Date(valor).getTime() / 1000);
}

// Detalhe de um lote de produção: exibe etapas, insumos vinculados e permite registrar novas etapas.
export function LoteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { conta, chainId, signer } = useCarteira();
  const papeis = usePapeis();

  const [lote, setLote] = useState<LoteProducaoInfo | null>(null);
  const [configuracao, setConfiguracao] = useState<ConfiguracaoProducao | null>(null);
  const [insumosVinculados, setInsumosVinculados] = useState<InsumoVinculado[]>([]);
  const [etapas, setEtapas] = useState<EtapaRegistrada[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

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
        metadataURI: dadoLote.metadataURI as string,
        metadataURIConclusao: dadoLote.metadataURIConclusao as string,
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

  const souProdutorResponsavel = conta?.toLowerCase() === lote.produtor.toLowerCase();
  const podeOperar = papeis.produtor && souProdutorResponsavel;
  const etapasRegistradas = etapas.map((e) => e.etapa);
  const etapasPendentes = obterEtapasAplicaveis(lote.tipoBebida, configuracao).filter(
    (etapa) => !etapasRegistradas.includes(etapa)
  );

  const idsUtilizados = etapas.flatMap((e) => e.insumosUtilizados);
  const erroInsumosConclusao = validarInsumosParaConclusao(
    lote.tipoBebida,
    idsUtilizados,
    insumosVinculados
  );

  return (
    <section>
      <Link className="link-voltar" to="/lotes">← Lotes de produção</Link>
      <div className="secao-titulo-area">
        <h1>Lote #{lote.id.toString()} - {RETULO_TIPO_BEBIDA[lote.tipoBebida]}</h1>
        <span className={`badge ${lote.estado === EstadoProducao.Concluido ? "badge--ok" : lote.estado === EstadoProducao.EmProducao ? "badge--neutro" : "badge--aviso"}`}>
          {RETULO_ESTADO_PRODUCAO[lote.estado]}
        </span>
      </div>
      <dl className="info-grade">
        <div className="info-campo">
          <dt className="info-campo__rotulo">Criado em</dt>
          <dd className="info-campo__valor">{formatarTimestamp(lote.criadoEm)}</dd>
        </div>
        <div className="info-campo info-campo--largo">
          <dt className="info-campo__rotulo">Produtor</dt>
          <dd className="info-campo__valor mono">{lote.produtor}</dd>
        </div>
        <div className="info-campo info-campo--largo">
          <dt className="info-campo__rotulo">Metadados</dt>
          <dd className="info-campo__valor"><LinkMetadados uri={lote.metadataURI} /></dd>
        </div>
      </dl>
      {erro && <p className="erro">{erro}</p>}

      <h2>Configuração de produção</h2>
      {lote.estado !== EstadoProducao.Criado && (
        <p className="dica">Configuração congelada, só pode ser alterada enquanto o lote está em "Criado".</p>
      )}
      {lote.estado === EstadoProducao.Criado && !podeOperar && (
        <p className="dica">Só o produtor responsável, com papel de Produtor, pode alterar a configuração.</p>
      )}
      <ul>
        <li>Maturação aplicável: {configuracao.maturacaoAplicavel ? "sim" : "não"}</li>
        <li>Retificação aplicável: {configuracao.retificacaoAplicavel ? "sim" : "não"}</li>
        <li>Blendagem aplicável: {configuracao.blendagemAplicavel ? "sim" : "não"}</li>
        <li>Ajuste final aplicável: {configuracao.ajusteFinalAplicavel ? "sim" : "não"}</li>
      </ul>
      {lote.estado === EstadoProducao.Criado && podeOperar && (
        <AtualizarConfiguracao
          loteId={lote.id}
          tipoBebida={lote.tipoBebida}
          configuracaoAtual={configuracao}
          chainId={chainId!}
          signer={signer!}
          aoAtualizar={carregar}
        />
      )}

      <h2>Insumos vinculados</h2>
      {lote.estado === EstadoProducao.Concluido && (
        <p className="dica">Produção concluída, não aceita novos vínculos de insumo.</p>
      )}
      {lote.estado !== EstadoProducao.Concluido && !podeOperar && (
        <p className="dica">Só o produtor responsável, com papel de Produtor, pode vincular insumos.</p>
      )}
      <ul>
        {insumosVinculados.map((insumo) => (
          <li key={insumo.id.toString()}>
            #{insumo.id.toString()} - {RETULO_TIPO_INSUMO[insumo.tipo]} - fornecedor {encurtarEndereco(insumo.fornecedor)}
          </li>
        ))}
        {insumosVinculados.length === 0 && <li className="lista-vazia">Nenhum insumo vinculado ainda.</li>}
      </ul>
      {lote.estado !== EstadoProducao.Concluido && podeOperar && (
        <VincularInsumo loteId={lote.id} chainId={chainId!} signer={signer!} aoVincular={carregar} />
      )}

      <h2>Etapas registradas</h2>
      {lote.estado !== EstadoProducao.Concluido && !podeOperar && (
        <p className="dica">Só o produtor responsável, com papel de Produtor, pode registrar etapas.</p>
      )}
      <div className="tabela-wrapper">
        <table>
          <thead>
            <tr>
              <th>Etapa</th>
              <th>Executado por</th>
              <th>Início informado</th>
              <th>Fim informado</th>
              <th>Registrado em</th>
              <th>Metadados</th>
              <th>Insumos usados</th>
            </tr>
          </thead>
          <tbody>
            {etapas.map((evento) => (
              <tr key={evento.indice}>
                <td>{RETULO_ETAPA_PRODUCAO[evento.etapa]}</td>
                <td>{encurtarEndereco(evento.executadoPor)}</td>
                <td>{formatarTimestamp(evento.inicioInformado)}</td>
                <td>{formatarTimestamp(evento.fimInformado)}</td>
                <td>{formatarTimestamp(evento.registradoEm)}</td>
                <td><LinkMetadados uri={evento.metadataURI} /></td>
                <td>
                  {evento.insumosUtilizados.length === 0
                    ? "-"
                    : evento.insumosUtilizados.map((insumoId) => `#${insumoId.toString()}`).join(", ")}
                </td>
              </tr>
            ))}
            {etapas.length === 0 && (
              <tr>
                <td colSpan={7} className="celula-vazia">Nenhuma etapa registrada ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {lote.estado !== EstadoProducao.Concluido && podeOperar && (
        etapasPendentes.length > 0 ? (
          <RegistrarEtapa
            loteId={lote.id}
            tipoBebida={lote.tipoBebida}
            configuracao={configuracao}
            etapasPendentes={etapasPendentes}
            etapasRegistradas={etapasRegistradas}
            insumosVinculados={insumosVinculados}
            chainId={chainId!}
            signer={signer!}
            aoRegistrar={carregar}
          />
        ) : (
          <p className="dica">Nenhuma etapa aplicável está pendente de registro.</p>
        )
      )}

      <h2>Conclusão</h2>
      {lote.estado === EstadoProducao.Concluido ? (
        <div className="ok">
          Produção concluída em {formatarTimestamp(lote.concluidoEm)}.
          <br />
          Metadados de conclusão: <LinkMetadados uri={lote.metadataURIConclusao} />
          <br />
          Envasador designado: <span className="mono">{lote.envasadorDesignado}</span>
          <br />
          Produção concluída, apta para envasamento.{" "}
          <Link to={`/lotes/${lote.id.toString()}/emitir`}>Ir para envasamento e emissão</Link>
        </div>
      ) : lote.estado === EstadoProducao.EmProducao ? (
        podeOperar ? (
          erroInsumosConclusao ? (
            <p className="dica">{erroInsumosConclusao}</p>
          ) : (
            <ConcluirProducao loteId={lote.id} chainId={chainId!} signer={signer!} aoConcluir={carregar} />
          )
        ) : (
          <p className="dica">Só o produtor responsável, com papel de Produtor, pode concluir a produção.</p>
        )
      ) : (
        <p className="dica">A produção precisa ter ao menos uma etapa registrada antes de poder ser concluída.</p>
      )}
    </section>
  );
}

function AtualizarConfiguracao({
  loteId,
  tipoBebida,
  configuracaoAtual,
  chainId,
  signer,
  aoAtualizar,
}: {
  loteId: bigint;
  tipoBebida: TipoBebida;
  configuracaoAtual: ConfiguracaoProducao;
  chainId: number;
  signer: Signer;
  aoAtualizar: () => void;
}) {
  const [configuracao, setConfiguracao] = useState<ConfiguracaoProducao>(configuracaoAtual);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTx | null>(null);

  function alternar(campo: keyof ConfiguracaoProducao) {
    setConfiguracao((atual) => ({ ...atual, [campo]: !atual[campo] }));
  }

  const erroValidacao = validarConfiguracaoProducao(tipoBebida, configuracao);

  async function enviar() {
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }
    setErro(null);
    setFeedback(null);
    setEnviando(true);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const tx = await producao.atualizarConfiguracao(loteId, configuracao);
      await tx.wait();
      setFeedback({ tipo: "ok", texto: "Configuração atualizada com sucesso." });
      aoAtualizar();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
      <label>
        <input
          type="checkbox"
          checked={configuracao.maturacaoAplicavel}
          onChange={() => alternar("maturacaoAplicavel")}
        />
        Maturação aplicável
      </label>
      <label>
        <input
          type="checkbox"
          checked={configuracao.retificacaoAplicavel}
          onChange={() => alternar("retificacaoAplicavel")}
        />
        Retificação aplicável
      </label>
      <label>
        <input
          type="checkbox"
          checked={configuracao.blendagemAplicavel}
          onChange={() => alternar("blendagemAplicavel")}
        />
        Blendagem aplicável
      </label>
      <label>
        <input
          type="checkbox"
          checked={configuracao.ajusteFinalAplicavel}
          onChange={() => alternar("ajusteFinalAplicavel")}
        />
        Ajuste final aplicável
      </label>
      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Salvando…" : "Salvar configuração"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

interface OpcaoInsumo {
  id: bigint;
  tipo: TipoInsumo;
  quantidade: bigint;
}

function VincularInsumo({
  loteId,
  chainId,
  signer,
  aoVincular,
}: {
  loteId: bigint;
  chainId: number;
  signer: Signer;
  aoVincular: () => void;
}) {
  const { conta } = useCarteira();
  const [opcoes, setOpcoes] = useState<OpcaoInsumo[]>([]);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(true);
  const [insumoId, setInsumoId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTx | null>(null);

  useEffect(() => {
    if (!conta) return;
    let cancelado = false;
    setCarregandoOpcoes(true);
    void (async () => {
      try {
        const insumosContrato = obterContrato("ContratoInsumos", chainId, signer);
        const producaoContrato = obterContrato("ContratoProducao", chainId, signer);
        const total = Number(await insumosContrato.totalInsumosDoProdutor(conta));
        const ids = await Promise.all(
          Array.from({ length: total }, (_, i) =>
            insumosContrato.insumoDoProdutor(conta, i) as Promise<bigint>
          )
        );
        const detalhes = await Promise.all(
          ids.map(async (id) => {
            const [dado, valido, aprovado, jaVinculado] = await Promise.all([
              insumosContrato.obterLoteInsumo(id),
              insumosContrato.loteInsumoValido(id) as Promise<boolean>,
              insumosContrato.aprovadoPor(id, conta) as Promise<boolean>,
              producaoContrato.insumoEstaVinculado(loteId, id) as Promise<boolean>,
            ]);
            return { id, dado, valido, aprovado, jaVinculado };
          })
        );
        if (cancelado) return;
        const disponiveis = detalhes
          .filter((d) => d.valido && d.aprovado && !d.jaVinculado)
          .map((d) => ({
            id: d.id,
            tipo: Number(d.dado.tipo) as TipoInsumo,
            quantidade: d.dado.quantidade as bigint,
          }));
        setOpcoes(disponiveis);
      } catch {
        // carregamento de opções é melhor-esforço
      } finally {
        if (!cancelado) setCarregandoOpcoes(false);
      }
    })();
    return () => { cancelado = true; };
  }, [chainId, signer, conta, loteId]);

  async function enviar() {
    if (!insumoId) {
      setErro("Selecione um insumo.");
      return;
    }
    setErro(null);
    setFeedback(null);
    setEnviando(true);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const tx = await producao.vincularInsumoAoLote(loteId, insumoId);
      await tx.wait();
      setInsumoId("");
      setFeedback({ tipo: "ok", texto: "Insumo vinculado com sucesso." });
      aoVincular();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
      {carregandoOpcoes ? (
        <p className="dica">Carregando insumos disponíveis…</p>
      ) : opcoes.length === 0 ? (
        <p className="dica">Nenhum insumo aprovado e disponível para vincular. Certifique-se de que o insumo foi aprovado por você e ainda não está vinculado a este lote.</p>
      ) : (
        <label>
          Insumo
          <select value={insumoId} onChange={(e) => setInsumoId(e.target.value)}>
            <option value="">Selecione…</option>
            {opcoes.map((op) => (
              <option key={op.id.toString()} value={op.id.toString()}>
                #{op.id.toString()} — {RETULO_TIPO_INSUMO[op.tipo]} · {op.quantidade.toString()} {UNIDADE_INSUMO[op.tipo]}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="button" onClick={() => void enviar()} disabled={opcoes.length === 0 || carregandoOpcoes}>
        {enviando ? "Vinculando…" : "Vincular insumo"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

function RegistrarEtapa({
  loteId,
  tipoBebida,
  configuracao,
  etapasPendentes,
  etapasRegistradas,
  insumosVinculados,
  chainId,
  signer,
  aoRegistrar,
}: {
  loteId: bigint;
  tipoBebida: TipoBebida;
  configuracao: ConfiguracaoProducao;
  etapasPendentes: EtapaProducao[];
  etapasRegistradas: EtapaProducao[];
  insumosVinculados: InsumoVinculado[];
  chainId: number;
  signer: Signer;
  aoRegistrar: () => void;
}) {
  const [etapaSelecionada, setEtapaSelecionada] = useState("");
  const [insumosSelecionados, setInsumosSelecionados] = useState<Set<string>>(new Set());
  const [quantidadesConsumidas, setQuantidadesConsumidas] = useState<Map<string, string>>(new Map());
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [documentosCids, setDocumentosCids] = useState<string[]>([]);
  const [arquivosSubindo, setArquivosSubindo] = useState(false);
  const [chaveAnexos, setChaveAnexos] = useState(0);
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTx | null>(null);

  const atualizarAnexos = useCallback((cids: string[], subindo: boolean) => {
    setDocumentosCids(cids);
    setArquivosSubindo(subindo);
  }, []);

  function alternarInsumo(id: string) {
    setInsumosSelecionados((atual) => {
      const copia = new Set(atual);
      if (copia.has(id)) {
        copia.delete(id);
        setQuantidadesConsumidas((q) => { const m = new Map(q); m.delete(id); return m; });
      } else {
        copia.add(id);
        setQuantidadesConsumidas((q) => new Map(q).set(id, ""));
      }
      return copia;
    });
  }

  function atualizarQuantidade(id: string, valor: string) {
    setQuantidadesConsumidas((q) => new Map(q).set(id, valor));
  }

  const insumosArray = Array.from(insumosSelecionados);
  const todasQuantidadesValidas = insumosArray.every((id) => {
    const v = quantidadesConsumidas.get(id) ?? "";
    return /^\d+$/.test(v.trim()) && BigInt(v.trim()) > 0n;
  });

  const erroValidacao =
    etapaSelecionada === ""
      ? "Selecione a etapa."
      : validarRegistroEtapa({
          tipoBebida,
          configuracao,
          etapa: Number(etapaSelecionada) as EtapaProducao,
          etapasRegistradas,
        });

  async function gerarViaIpfs() {
    if (etapaSelecionada === "") {
      setErroIpfs("Selecione a etapa antes de gerar os metadados.");
      return;
    }
    if (!inicio || !fim) {
      setErroIpfs("Informe o início e o fim informados antes de gerar os metadados.");
      return;
    }
    if (insumosArray.length > 0 && !todasQuantidadesValidas) {
      setErroIpfs("Informe a quantidade consumida de cada insumo selecionado antes de gerar os metadados.");
      return;
    }
    if (arquivosSubindo) {
      setErroIpfs("Aguarde o envio dos arquivos antes de gerar a referência.");
      return;
    }
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const insumosConsumidos = insumosArray.map((id) => {
        const insumo = insumosVinculados.find((i) => i.id.toString() === id)!;
        return { id, quantidade: (quantidadesConsumidas.get(id) ?? "0").trim(), unidade: UNIDADE_INSUMO[insumo.tipo] };
      });
      const metadados = montarMetadadosEtapaProducao({
        loteProducaoId: loteId.toString(),
        etapa: Number(etapaSelecionada) as EtapaProducao,
        insumosConsumidos,
        inicioInformado: String(segundosDoDatetimeLocal(inicio)),
        fimInformado: String(segundosDoDatetimeLocal(fim)),
        documentos: documentosCids.length > 0 ? documentosCids : undefined,
      });
      const referencia = await adicionarJSON(metadados);
      setMetadataURI(referencia);
    } catch (erroUpload) {
      setErroIpfs(erroUpload instanceof Error ? erroUpload.message : "Não foi possível enviar ao IPFS.");
    } finally {
      setEnviandoIpfs(false);
    }
  }

  const erroReferencia =
    motivoReferenciaInvalida(metadataURI) ?? (metadataURI.trim() === "" ? "Informe a referência ipfs://." : null);

  async function enviar() {
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }
    if (!inicio || !fim) {
      setErro("Informe o início e o fim informados.");
      return;
    }
    const inicioSegundos = segundosDoDatetimeLocal(inicio);
    const fimSegundos = segundosDoDatetimeLocal(fim);
    if (inicioSegundos > fimSegundos) {
      setErro("O início informado não pode ser posterior ao fim informado.");
      return;
    }
    if (insumosArray.length > 0 && !todasQuantidadesValidas) {
      setErro("Informe a quantidade consumida (número inteiro maior que zero) de cada insumo selecionado.");
      return;
    }
    if (erroReferencia) {
      setErro(erroReferencia);
      return;
    }
    setErro(null);
    setFeedback(null);
    setEnviando(true);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const qtds = insumosArray.map((id) => BigInt((quantidadesConsumidas.get(id) ?? "0").trim()));
      const tx = await producao.registrarEtapa(
        loteId,
        Number(etapaSelecionada) as EtapaProducao,
        insumosArray,
        qtds,
        inicioSegundos,
        fimSegundos,
        metadataURI.trim()
      );
      await tx.wait();
      setEtapaSelecionada("");
      setInsumosSelecionados(new Set());
      setQuantidadesConsumidas(new Map());
      setInicio("");
      setFim("");
      setDocumentosCids([]);
      setArquivosSubindo(false);
      setChaveAnexos((k) => k + 1);
      setMetadataURI("");
      setFeedback({ tipo: "ok", texto: "Etapa registrada com sucesso." });
      aoRegistrar();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
      <label>
        Etapa
        <select value={etapaSelecionada} onChange={(e) => setEtapaSelecionada(e.target.value)}>
          <option value="">Selecione…</option>
          {etapasPendentes.map((etapa) => (
            <option key={etapa} value={etapa}>
              {RETULO_ETAPA_PRODUCAO[etapa]}
            </option>
          ))}
        </select>
      </label>
      {etapaSelecionada !== "" &&
        (erroValidacao ? <p className="erro">{erroValidacao}</p> : <p className="ok">Etapa válida para registro.</p>)}

      <fieldset style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
        <p style={{ fontWeight: 500, marginTop: "0.75rem", marginBottom: "0.25rem" }}>Insumos utilizados nesta etapa (dentre os vinculados ao lote)</p>
        {insumosVinculados.length === 0 && <p className="dica">Nenhum insumo vinculado ao lote ainda.</p>}
        {insumosVinculados.map((insumo) => {
          const idStr = insumo.id.toString();
          const selecionado = insumosSelecionados.has(idStr);
          return (
            <div key={idStr} style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="checkbox"
                  checked={selecionado}
                  onChange={() => alternarInsumo(idStr)}
                />
                #{idStr} - {RETULO_TIPO_INSUMO[insumo.tipo]}
              </label>
              {selecionado && (
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  Qtd:
                  <input
                    type="number"
                    min="1"
                    step="1"
                    style={{ width: "90px" }}
                    value={quantidadesConsumidas.get(idStr) ?? ""}
                    onChange={(e) => atualizarQuantidade(idStr, e.target.value)}
                    placeholder="0"
                  />
                  <span>{UNIDADE_INSUMO[insumo.tipo]}</span>
                </label>
              )}
            </div>
          );
        })}
      </fieldset>

      <label>
        Início informado
        <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
      </label>
      <label>
        Fim informado
        <input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
      </label>

      <AnexosIpfs
        key={chaveAnexos}
        rotulo="Documentos desta etapa (PDF, JPG, PNG - opcional)"
        onChange={atualizarAnexos}
        desabilitado={enviandoIpfs || enviando}
      />
      <button type="button" onClick={() => void gerarViaIpfs()} disabled={enviandoIpfs || arquivosSubindo}>
        {enviandoIpfs ? "Enviando ao IPFS…" : "Gerar referência no IPFS"}
      </button>
      {erroIpfs && <p className="erro">{erroIpfs}</p>}
      <label>
        Metadados (ipfs://…, preenchido automaticamente pelo botão acima, ou cole uma referência já existente)
        <input value={metadataURI} onChange={(e) => setMetadataURI(e.target.value.trim())} />
      </label>

      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Registrando…" : "Registrar etapa"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

function ehEnderecoValido(valor: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(valor.trim());
}

function ConcluirProducao({
  loteId,
  chainId,
  signer,
  aoConcluir,
}: {
  loteId: bigint;
  chainId: number;
  signer: Signer;
  aoConcluir: () => void;
}) {
  const [envasadorDesignado, setEnvasadorDesignado] = useState("");
  const [documentosCids, setDocumentosCids] = useState<string[]>([]);
  const [arquivosSubindo, setArquivosSubindo] = useState(false);
  const [chaveAnexos, setChaveAnexos] = useState(0);
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTx | null>(null);

  const atualizarAnexos = useCallback((cids: string[], subindo: boolean) => {
    setDocumentosCids(cids);
    setArquivosSubindo(subindo);
  }, []);

  const envasadorValido = ehEnderecoValido(envasadorDesignado);

  async function gerarViaIpfs() {
    if (!envasadorValido) {
      setErroIpfs("Informe um endereço válido para o envasador designado antes de gerar os metadados.");
      return;
    }
    if (arquivosSubindo) {
      setErroIpfs("Aguarde o envio dos arquivos antes de gerar a referência.");
      return;
    }
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosConclusaoProducao({
        loteProducaoId: loteId.toString(),
        envasadorDesignado: envasadorDesignado.trim(),
        documentos: documentosCids.length > 0 ? documentosCids : undefined,
      });
      const referencia = await adicionarJSON(metadados);
      setMetadataURI(referencia);
    } catch (erroUpload) {
      setErroIpfs(erroUpload instanceof Error ? erroUpload.message : "Não foi possível enviar ao IPFS.");
    } finally {
      setEnviandoIpfs(false);
    }
  }

  const erroReferencia =
    motivoReferenciaInvalida(metadataURI) ?? (metadataURI.trim() === "" ? "Informe a referência ipfs://." : null);

  async function enviar() {
    if (!envasadorValido) {
      setErro("Informe um endereço Ethereum válido para o envasador designado.");
      return;
    }
    if (erroReferencia) {
      setErro(erroReferencia);
      return;
    }
    setErro(null);
    setFeedback(null);
    setEnviando(true);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const tx = await producao.concluirProducao(loteId, envasadorDesignado.trim(), metadataURI.trim());
      await tx.wait();
      setEnvasadorDesignado("");
      setDocumentosCids([]);
      setArquivosSubindo(false);
      setChaveAnexos((k) => k + 1);
      setMetadataURI("");
      setFeedback({ tipo: "ok", texto: "Produção concluída com sucesso." });
      aoConcluir();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
      <label>
        Envasador designado (endereço Ethereum)
        <input
          value={envasadorDesignado}
          onChange={(e) => setEnvasadorDesignado(e.target.value.trim())}
          placeholder="0x…"
        />
        {envasadorDesignado && !envasadorValido && (
          <span className="erro">Endereço inválido.</span>
        )}
      </label>
      <AnexosIpfs
        key={chaveAnexos}
        rotulo="Documentos da conclusão (PDF, JPG, PNG - opcional)"
        onChange={atualizarAnexos}
        desabilitado={enviandoIpfs || enviando}
      />
      <button type="button" onClick={() => void gerarViaIpfs()} disabled={enviandoIpfs || arquivosSubindo}>
        {enviandoIpfs ? "Enviando ao IPFS…" : "Gerar referência no IPFS"}
      </button>
      {erroIpfs && <p className="erro">{erroIpfs}</p>}
      <label>
        Metadados (ipfs://…, preenchido automaticamente pelo botão acima, ou cole uma referência já existente)
        <input value={metadataURI} onChange={(e) => setMetadataURI(e.target.value.trim())} />
      </label>
      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Concluindo…" : "Concluir produção"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}
