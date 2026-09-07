import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import {
  encurtarEndereco,
  formatarTimestamp,
  RETULO_ESTADO_PRODUCAO,
  RETULO_ETAPA_PRODUCAO,
  RETULO_TIPO_BEBIDA,
  RETULO_TIPO_INSUMO,
} from "../lib/formatadores";
import { EstadoProducao, EtapaProducao, TipoBebida, TipoInsumo } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import {
  obterEtapasAplicaveis,
  validarConfiguracaoProducao,
  validarRegistroEtapa,
  type ConfiguracaoProducao,
} from "../lib/validacaoSequencia";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosConclusaoProducao, montarMetadadosEtapaProducao } from "../ipfs/metadados";

type Signer = NonNullable<ReturnType<typeof useCarteira>["signer"]>;

interface LoteProducaoInfo {
  id: bigint;
  produtor: string;
  tipoBebida: TipoBebida;
  estado: EstadoProducao;
  criadoEm: bigint;
  concluidoEm: bigint;
  metadataURI: string;
  metadataURIConclusao: string;
}

interface InsumoVinculado {
  id: bigint;
  tipo: TipoInsumo;
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

function documentosEmLinhas(texto: string): string[] {
  return texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);
}

function segundosDoDatetimeLocal(valor: string): number {
  return Math.floor(new Date(valor).getTime() / 1000);
}

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

  if (carregando) return <p>Carregando…</p>;
  if (erro && !lote) return <p className="erro">{erro}</p>;
  if (!lote || !configuracao) return null;

  const souProdutorResponsavel = conta?.toLowerCase() === lote.produtor.toLowerCase();
  const podeOperar = papeis.produtor && souProdutorResponsavel;
  const etapasRegistradas = etapas.map((e) => e.etapa);
  const etapasPendentes = obterEtapasAplicaveis(lote.tipoBebida, configuracao).filter(
    (etapa) => !etapasRegistradas.includes(etapa)
  );

  return (
    <section>
      <p>
        <Link to="/lotes">← Lotes de produção</Link>
      </p>
      <h1>
        Lote #{lote.id.toString()} — {RETULO_TIPO_BEBIDA[lote.tipoBebida]}
      </h1>
      <p>
        Produtor: {lote.produtor}
        <br />
        Estado: {RETULO_ESTADO_PRODUCAO[lote.estado]}
        <br />
        Criado em: {formatarTimestamp(lote.criadoEm)}
        <br />
        Metadados do lote: {lote.metadataURI}
      </p>
      {erro && <p className="erro">{erro}</p>}

      <h2>Configuração de produção</h2>
      <ul>
        <li>Maturação aplicável: {configuracao.maturacaoAplicavel ? "sim" : "não"}</li>
        <li>Retificação aplicável: {configuracao.retificacaoAplicavel ? "sim" : "não"}</li>
        <li>Blendagem aplicável: {configuracao.blendagemAplicavel ? "sim" : "não"}</li>
        <li>Ajuste final aplicável: {configuracao.ajusteFinalAplicavel ? "sim" : "não"}</li>
      </ul>
      {lote.estado === EstadoProducao.Criado ? (
        podeOperar ? (
          <AtualizarConfiguracao
            loteId={lote.id}
            tipoBebida={lote.tipoBebida}
            configuracaoAtual={configuracao}
            chainId={chainId!}
            signer={signer!}
            aoAtualizar={carregar}
          />
        ) : (
          <p className="dica">Só o produtor responsável, com PRODUTOR_ROLE, pode alterar a configuração.</p>
        )
      ) : (
        <p className="dica">Configuração congelada — só pode ser alterada enquanto o lote está em "Criado".</p>
      )}

      <h2>Insumos vinculados</h2>
      <ul>
        {insumosVinculados.map((insumo) => (
          <li key={insumo.id.toString()}>
            #{insumo.id.toString()} — {RETULO_TIPO_INSUMO[insumo.tipo]} — fornecedor {encurtarEndereco(insumo.fornecedor)}
          </li>
        ))}
        {insumosVinculados.length === 0 && <li>Nenhum insumo vinculado ainda.</li>}
      </ul>
      {lote.estado === EstadoProducao.Concluido ? (
        <p className="dica">Produção concluída — não aceita novos vínculos de insumo.</p>
      ) : podeOperar ? (
        <VincularInsumo loteId={lote.id} chainId={chainId!} signer={signer!} aoVincular={carregar} />
      ) : (
        <p className="dica">Só o produtor responsável, com PRODUTOR_ROLE, pode vincular insumos.</p>
      )}

      <h2>Etapas registradas</h2>
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
              <td>{evento.metadataURI}</td>
              <td>
                {evento.insumosUtilizados.length === 0
                  ? "—"
                  : evento.insumosUtilizados.map((insumoId) => `#${insumoId.toString()}`).join(", ")}
              </td>
            </tr>
          ))}
          {etapas.length === 0 && (
            <tr>
              <td colSpan={7}>Nenhuma etapa registrada ainda.</td>
            </tr>
          )}
        </tbody>
      </table>

      {lote.estado !== EstadoProducao.Concluido &&
        (podeOperar ? (
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
        ) : (
          <p className="dica">Só o produtor responsável, com PRODUTOR_ROLE, pode registrar etapas.</p>
        ))}

      <h2>Conclusão</h2>
      {lote.estado === EstadoProducao.Concluido ? (
        <p className="ok">
          Produção concluída em {formatarTimestamp(lote.concluidoEm)}.
          <br />
          Metadados de conclusão: {lote.metadataURIConclusao}
          <br />
          Produção concluída — apta para envasamento.
        </p>
      ) : lote.estado === EstadoProducao.EmProducao ? (
        podeOperar ? (
          <ConcluirProducao loteId={lote.id} chainId={chainId!} signer={signer!} aoConcluir={carregar} />
        ) : (
          <p className="dica">Só o produtor responsável, com PRODUTOR_ROLE, pode concluir a produção.</p>
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
    setEnviando(true);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const tx = await producao.atualizarConfiguracao(loteId, configuracao);
      await tx.wait();
      aoAtualizar();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Atualizar configuração</legend>
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
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
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
  const [insumoId, setInsumoId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    if (!/^\d+$/.test(insumoId.trim())) {
      setErro("Informe um ID de insumo válido (número inteiro).");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const tx = await producao.vincularInsumoAoLote(loteId, insumoId.trim());
      await tx.wait();
      setInsumoId("");
      aoVincular();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Vincular insumo ao lote</legend>
      <label>
        ID do lote de insumo
        <input value={insumoId} onChange={(e) => setInsumoId(e.target.value.trim())} placeholder="Ex.: 1" />
      </label>
      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Vinculando…" : "Vincular insumo"}
      </button>
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
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [documentos, setDocumentos] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function alternarInsumo(id: string) {
    setInsumosSelecionados((atual) => {
      const copia = new Set(atual);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

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
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosEtapaProducao({
        loteProducaoId: loteId.toString(),
        etapa: Number(etapaSelecionada) as EtapaProducao,
        insumosUtilizados: Array.from(insumosSelecionados),
        inicioInformado: String(segundosDoDatetimeLocal(inicio)),
        fimInformado: String(segundosDoDatetimeLocal(fim)),
        documentos: documentosEmLinhas(documentos),
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
    if (erroReferencia) {
      setErro(erroReferencia);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const tx = await producao.registrarEtapa(
        loteId,
        Number(etapaSelecionada) as EtapaProducao,
        Array.from(insumosSelecionados),
        inicioSegundos,
        fimSegundos,
        metadataURI.trim()
      );
      await tx.wait();
      setEtapaSelecionada("");
      setInsumosSelecionados(new Set());
      setInicio("");
      setFim("");
      setDocumentos("");
      setMetadataURI("");
      aoRegistrar();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Registrar etapa</legend>
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

      <fieldset>
        <legend>Insumos utilizados nesta etapa (dentre os vinculados ao lote)</legend>
        {insumosVinculados.length === 0 && <p className="dica">Nenhum insumo vinculado ao lote ainda.</p>}
        {insumosVinculados.map((insumo) => (
          <label key={insumo.id.toString()}>
            <input
              type="checkbox"
              checked={insumosSelecionados.has(insumo.id.toString())}
              onChange={() => alternarInsumo(insumo.id.toString())}
            />
            #{insumo.id.toString()} — {RETULO_TIPO_INSUMO[insumo.tipo]}
          </label>
        ))}
      </fieldset>

      <label>
        Início informado
        <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
      </label>
      <label>
        Fim informado
        <input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
      </label>

      <label>
        Documentos desta etapa (um por linha, opcional — vira um JSON enviado ao IPFS)
        <textarea rows={3} value={documentos} onChange={(e) => setDocumentos(e.target.value)} />
      </label>
      <button type="button" onClick={() => void gerarViaIpfs()} disabled={enviandoIpfs}>
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
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
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
  const [documentos, setDocumentos] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerarViaIpfs() {
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosConclusaoProducao({
        loteProducaoId: loteId.toString(),
        documentos: documentosEmLinhas(documentos),
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
    if (erroReferencia) {
      setErro(erroReferencia);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const tx = await producao.concluirProducao(loteId, metadataURI.trim());
      await tx.wait();
      setDocumentos("");
      setMetadataURI("");
      aoConcluir();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Concluir produção</legend>
      <label>
        Documentos da conclusão (um por linha, opcional — vira um JSON enviado ao IPFS)
        <textarea rows={3} value={documentos} onChange={(e) => setDocumentos(e.target.value)} />
      </label>
      <button type="button" onClick={() => void gerarViaIpfs()} disabled={enviandoIpfs}>
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
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}
