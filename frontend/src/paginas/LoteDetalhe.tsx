import { useCallback, useState } from "react";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx } from "../lib/erros";
import { formatarTimestamp } from "../lib/formatadores";
import { EstadoProducao, TipoBebida } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosCancelamentoProducao } from "../ipfs/metadados";
import { AnexosIpfs } from "../componentes/AnexosIpfs";
import { LinkMetadados } from "../componentes/LinkMetadados";
import {
  validarConfiguracaoProducao,
  type ConfiguracaoProducao,
} from "../lib/validacaoSequencia";
import { useLoteContexto, type Signer } from "./LoteLayout";

export function LoteDetalhe() {
  const {
    lote,
    configuracao,
    podeOperar,
    chainId,
    signer,
    carregar,
  } = useLoteContexto();

  return (
    <>
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
          chainId={chainId}
          signer={signer}
          aoAtualizar={carregar}
        />
      )}

      {lote.estado === EstadoProducao.Cancelado && (
        <div className="aviso-acesso">
          <h2>Lote cancelado</h2>
          <p>Cancelado em {formatarTimestamp(lote.canceladoEm)}.</p>
          <dl className="info-grade">
            <div className="info-campo info-campo--largo">
              <dt className="info-campo__rotulo">Justificativa</dt>
              <dd className="info-campo__valor"><LinkMetadados uri={lote.metadataURICancelamento} /></dd>
            </div>
          </dl>
        </div>
      )}

      {(lote.estado === EstadoProducao.Criado || lote.estado === EstadoProducao.EmProducao) && podeOperar && (
        <CancelarLote
          loteId={lote.id}
          chainId={chainId}
          signer={signer}
          aoCancelar={carregar}
        />
      )}
    </>
  );
}

function CancelarLote({
  loteId,
  chainId,
  signer,
  aoCancelar,
}: {
  loteId: bigint;
  chainId: number;
  signer: Signer;
  aoCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [documentosCids, setDocumentosCids] = useState<string[]>([]);
  const [arquivosSubindo, setArquivosSubindo] = useState(false);
  const [chaveAnexos, setChaveAnexos] = useState(0);
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackTx | null>(null);

  const atualizarAnexos = useCallback((cids: string[], subindo: boolean) => {
    setDocumentosCids(cids);
    setArquivosSubindo(subindo);
  }, []);

  async function gerarViaIpfs() {
    if (arquivosSubindo) {
      setErroIpfs("Aguarde o envio dos arquivos antes de gerar a referência.");
      return;
    }
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosCancelamentoProducao({
        loteProducaoId: loteId.toString(),
        motivo: motivo.trim() || undefined,
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

  async function cancelar() {
    if (erroReferencia) return;
    setFeedback(null);
    setEnviando(true);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const tx = await producao.cancelarLote(loteId, metadataURI.trim());
      await tx.wait();
      setConfirmando(false);
      setMotivo("");
      setDocumentosCids([]);
      setChaveAnexos((k) => k + 1);
      setMetadataURI("");
      setFeedback({ tipo: "ok", texto: "Lote cancelado. O registro permanece consultável na blockchain." });
      aoCancelar();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  if (!confirmando) {
    return (
      <>
        <hr />
        <h2>Cancelar lote</h2>
        <p className="dica">O cancelamento é permanente e irreversível. O lote ficará registrado como cancelado na blockchain.</p>
        <p className="dica">Não inclua dados pessoais na justificativa nem nos documentos: o conteúdo enviado ao IPFS é público e permanente.</p>
        <button type="button" onClick={() => setConfirmando(true)}>
          Cancelar este lote
        </button>
      </>
    );
  }

  return (
    <>
      <hr />
      <h2>Confirmar cancelamento</h2>
      <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
        <label>
          Motivo do cancelamento (opcional)
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: insumo invalidado pelo fornecedor"
          />
        </label>
        <AnexosIpfs
          key={chaveAnexos}
          rotulo="Documentos de suporte (PDF, JPG, PNG - opcional)"
          onChange={atualizarAnexos}
          desabilitado={enviandoIpfs || enviando}
        />
        <button type="button" onClick={() => void gerarViaIpfs()} disabled={enviandoIpfs || arquivosSubindo}>
          {enviandoIpfs ? "Enviando ao IPFS…" : "Gerar referência no IPFS"}
        </button>
        {erroIpfs && <p className="erro">{erroIpfs}</p>}
        <label>
          Metadados
          <input value={metadataURI} onChange={(e) => setMetadataURI(e.target.value.trim())} />
        </label>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button type="button" onClick={() => void cancelar()} disabled={!!erroReferencia}>
            {enviando ? "Cancelando…" : "Confirmar cancelamento"}
          </button>
          <button type="button" onClick={() => setConfirmando(false)}>
            Voltar
          </button>
        </div>
        {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      </fieldset>
    </>
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
