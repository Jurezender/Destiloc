import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx } from "../lib/erros";
import { ROTULO_TIPO_BEBIDA } from "../lib/formatadores";
import { TipoBebida } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosLoteProducao, type ConfiguracaoProducaoMetadados } from "../ipfs/metadados";
import { AnexosIpfs } from "../componentes/AnexosIpfs";

const OPCOES_TIPO_BEBIDA = [TipoBebida.Cachaca, TipoBebida.Whisky, TipoBebida.Vodca, TipoBebida.Gin];

const CONFIGURACAO_PADRAO: ConfiguracaoProducaoMetadados = {
  maturacaoAplicavel: false,
  retificacaoAplicavel: false,
  blendagemAplicavel: false,
  ajusteFinalAplicavel: false,
};

const FLAGS_INVALIDAS: Partial<Record<TipoBebida, (keyof ConfiguracaoProducaoMetadados)[]>> = {
  [TipoBebida.Cachaca]: ["retificacaoAplicavel", "blendagemAplicavel"],
  [TipoBebida.Whisky]:  ["maturacaoAplicavel", "retificacaoAplicavel"],
  [TipoBebida.Vodca]:   ["maturacaoAplicavel", "blendagemAplicavel"],
  [TipoBebida.Gin]:     ["maturacaoAplicavel", "retificacaoAplicavel", "blendagemAplicavel"],
};

function NovoLoteProducao({ onCriado }: { onCriado: () => void }) {
  const { chainId, signer } = useCarteira();
  const [tipoBebida, setTipoBebida] = useState("");
  const [configuracao, setConfiguracao] = useState<ConfiguracaoProducaoMetadados>(CONFIGURACAO_PADRAO);
  const [descricao, setDescricao] = useState("");
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

  function flagBloqueada(campo: keyof ConfiguracaoProducaoMetadados): boolean {
    if (tipoBebida === "") return false;
    return (FLAGS_INVALIDAS[Number(tipoBebida) as TipoBebida] ?? []).includes(campo);
  }

  function alternarConfiguracao(campo: keyof ConfiguracaoProducaoMetadados) {
    setConfiguracao((atual) => ({ ...atual, [campo]: !atual[campo] }));
  }

  async function gerarViaIpfs() {
    if (tipoBebida === "") {
      setErroIpfs("Selecione o tipo de bebida antes de gerar os metadados.");
      return;
    }
    if (arquivosSubindo) {
      setErroIpfs("Aguarde o envio dos arquivos antes de gerar a referência.");
      return;
    }
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosLoteProducao({
        tipoBebida: Number(tipoBebida) as TipoBebida,
        configuracao,
        descricao: descricao.trim() || undefined,
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
    if (!chainId || !signer) return;
    if (tipoBebida === "") {
      setErro("Selecione o tipo de bebida.");
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
      const tx = await producao.criarLoteProducao(Number(tipoBebida) as TipoBebida, configuracao, metadataURI.trim());
      await tx.wait();
      setTipoBebida("");
      setConfiguracao(CONFIGURACAO_PADRAO);
      setDescricao("");
      setDocumentosCids([]);
      setArquivosSubindo(false);
      setChaveAnexos((k) => k + 1);
      setMetadataURI("");
      setFeedback({ tipo: "ok", texto: "Lote de produção criado com sucesso." });
      onCriado();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
      <label>
        Tipo de bebida
        <select value={tipoBebida} onChange={(e) => { setTipoBebida(e.target.value); setConfiguracao(CONFIGURACAO_PADRAO); }}>
          <option value="">Selecione…</option>
          {OPCOES_TIPO_BEBIDA.map((opcao) => (
            <option key={opcao} value={opcao}>
              {ROTULO_TIPO_BEBIDA[opcao]}
            </option>
          ))}
        </select>
      </label>

      <fieldset style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
        <p style={{ fontWeight: 500, marginTop: "0.75rem", marginBottom: "0.25rem" }}>Configuração de produção</p>
        <label>
          <input
            type="checkbox"
            checked={configuracao.maturacaoAplicavel}
            onChange={() => alternarConfiguracao("maturacaoAplicavel")}
            disabled={flagBloqueada("maturacaoAplicavel")}
          />
          Maturação aplicável
        </label>
        <label>
          <input
            type="checkbox"
            checked={configuracao.retificacaoAplicavel}
            onChange={() => alternarConfiguracao("retificacaoAplicavel")}
            disabled={flagBloqueada("retificacaoAplicavel")}
          />
          Retificação aplicável
        </label>
        <label>
          <input
            type="checkbox"
            checked={configuracao.blendagemAplicavel}
            onChange={() => alternarConfiguracao("blendagemAplicavel")}
            disabled={flagBloqueada("blendagemAplicavel")}
          />
          Blendagem aplicável
        </label>
        <label>
          <input
            type="checkbox"
            checked={configuracao.ajusteFinalAplicavel}
            onChange={() => alternarConfiguracao("ajusteFinalAplicavel")}
            disabled={flagBloqueada("ajusteFinalAplicavel")}
          />
          Ajuste final aplicável
        </label>
      </fieldset>

      <label>
        Descrição (opcional, vai para os metadados enviados ao IPFS)
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </label>
      <AnexosIpfs
        key={chaveAnexos}
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

      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Registrando…" : "Registrar lote"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

export function LoteNovo() {
  const navigate = useNavigate();
  return (
    <>
      <h2>Novo lote de produção</h2>
      <NovoLoteProducao onCriado={() => navigate("/lotes")} />
    </>
  );
}
