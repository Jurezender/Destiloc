import { useCallback, useState } from "react";
import { encurtarEndereco, formatarTimestamp, ROTULO_RESULTADO_AVALIACAO } from "../lib/formatadores";
import { ResultadoAvaliacao } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosAvaliacao } from "../ipfs/metadados";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx } from "../lib/erros";
import { AnexosIpfs } from "../componentes/AnexosIpfs";
import { LinkMetadados } from "../componentes/LinkMetadados";
import { useInsumoContexto, type Signer } from "./InsumoLayout";

const OPCOES_RESULTADO_AVALIACAO = [ResultadoAvaliacao.Aprovado, ResultadoAvaliacao.Rejeitado];

export function InsumoAvaliacao() {
  const {
    lote,
    invalidacao,
    avaliacoes,
    resultadoAtual,
    chainId,
    signer,
    papeis,
    souProdutorDestinatario,
    carregar,
  } = useInsumoContexto();

  return (
    <>
      <h2>Avaliação</h2>
      {!papeis.produtor ? (
        <p className="dica">Sua conta não tem papel de Produtor, você não pode avaliar insumos.</p>
      ) : !souProdutorDestinatario ? (
        <p className="dica">
          Este insumo é destinado a {encurtarEndereco(lote.produtorDestinatario)}. Somente o produtor destinatário pode avaliá-lo.
        </p>
      ) : (
        <>
          <p>
            Avaliação atual da sua conta:{" "}
            {resultadoAtual !== null ? ROTULO_RESULTADO_AVALIACAO[resultadoAtual] : "carregando…"}
          </p>
          {invalidacao.invalidado && (
            <p className="dica">Lote invalidado, não aceita novas avaliações.</p>
          )}
          <h3>Histórico das suas avaliações</h3>
          {avaliacoes.length === 0 ? (
            <p className="dica">Você ainda não avaliou este insumo.</p>
          ) : (
            <ul className="lista-compacta">
              {avaliacoes.map((avaliacao) => (
                <li key={avaliacao.indice}>
                  {formatarTimestamp(avaliacao.registradoEm)}
                  {" · "}{ROTULO_RESULTADO_AVALIACAO[avaliacao.resultado]}
                  {" · "}<LinkMetadados uri={avaliacao.metadataURI} />
                </li>
              ))}
            </ul>
          )}
          {!invalidacao.invalidado && (
            <AvaliarInsumo loteId={lote.id} chainId={chainId} signer={signer} aoAvaliar={carregar} />
          )}
        </>
      )}
    </>
  );
}

function AvaliarInsumo({
  loteId,
  chainId,
  signer,
  aoAvaliar,
}: {
  loteId: bigint;
  chainId: number;
  signer: Signer;
  aoAvaliar: () => void;
}) {
  const [resultado, setResultado] = useState("");
  const [observacoes, setObservacoes] = useState("");
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

  async function gerarViaIpfs() {
    if (resultado === "") {
      setErroIpfs("Selecione o resultado antes de gerar os metadados.");
      return;
    }
    if (arquivosSubindo) {
      setErroIpfs("Aguarde o envio dos arquivos antes de gerar a referência.");
      return;
    }
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosAvaliacao({
        insumoId: loteId.toString(),
        resultado: Number(resultado) as ResultadoAvaliacao,
        documentos: documentosCids.length > 0 ? documentosCids : undefined,
        observacoes: observacoes.trim() || undefined,
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
    if (resultado === "") {
      setErro("Selecione o resultado da avaliação.");
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
      const insumos = obterContrato("ContratoInsumos", chainId, signer);
      const tx = await insumos.avaliarInsumo(loteId, Number(resultado) as ResultadoAvaliacao, metadataURI.trim());
      await tx.wait();
      setResultado("");
      setObservacoes("");
      setDocumentosCids([]);
      setArquivosSubindo(false);
      setChaveAnexos((k) => k + 1);
      setMetadataURI("");
      setFeedback({ tipo: "ok", texto: "Avaliação registrada com sucesso." });
      aoAvaliar();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
      <label>
        Resultado
        <select value={resultado} onChange={(e) => setResultado(e.target.value)}>
          <option value="">Selecione…</option>
          {OPCOES_RESULTADO_AVALIACAO.map((opcao) => (
            <option key={opcao} value={opcao}>
              {ROTULO_RESULTADO_AVALIACAO[opcao]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Observações (opcional, vai para os metadados enviados ao IPFS)
        <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
      </label>
      <AnexosIpfs
        key={chaveAnexos}
        rotulo="Documentos/evidências (PDF, JPG, PNG - opcional)"
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
        {enviando ? "Avaliando…" : "Registrar avaliação"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}
