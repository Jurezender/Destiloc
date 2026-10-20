import { useCallback, useState } from "react";
import { formatarTimestamp } from "../lib/formatadores";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import {
  montarMetadadosCorrecaoDocumental,
  montarMetadadosInvalidacao,
} from "../ipfs/metadados";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx } from "../lib/erros";
import { AnexosIpfs } from "../componentes/AnexosIpfs";
import { LinkMetadados } from "../componentes/LinkMetadados";
import { useInsumoContexto, type Signer } from "./InsumoLayout";

export function InsumoCorrecoes() {
  const {
    lote,
    invalidacao,
    correcoes,
    chainId,
    signer,
    podeCorrigirOuInvalidar,
    carregar,
  } = useInsumoContexto();

  return (
    <>
      <h2>Invalidação</h2>
      {invalidacao.invalidado ? (
        <div className="dica">
          Este lote foi invalidado em {formatarTimestamp(invalidacao.registradoEm)} e está definitivamente
          encerrado, não aceita novas avaliações nem correções documentais.
          {" "}Metadados: <LinkMetadados uri={invalidacao.metadataURI} />
        </div>
      ) : podeCorrigirOuInvalidar ? (
        <InvalidarLote loteId={lote.id} chainId={chainId} signer={signer} aoInvalidar={carregar} />
      ) : (
        <p className="dica">Só o fornecedor original, com papel de Fornecedor, pode invalidar este lote.</p>
      )}

      <h2>Correções documentais</h2>
      {invalidacao.invalidado && (
        <p className="dica">Lote invalidado, não aceita novas correções documentais.</p>
      )}
      {!podeCorrigirOuInvalidar && !invalidacao.invalidado && (
        <p className="dica">Somente o fornecedor original, com papel de Fornecedor, pode registrar correções documentais.</p>
      )}
      {correcoes.length === 0 ? (
        <p className="dica">Nenhuma correção registrada ainda.</p>
      ) : (
        <ul className="lista-compacta">
          {correcoes.map((correcao) => (
            <li key={correcao.indice}>
              {formatarTimestamp(correcao.registradoEm)}
              {" · "}<LinkMetadados uri={correcao.metadataURI} />
            </li>
          ))}
        </ul>
      )}
      {podeCorrigirOuInvalidar && !invalidacao.invalidado && (
        <RegistrarCorrecao loteId={lote.id} chainId={chainId} signer={signer} aoRegistrar={carregar} />
      )}
    </>
  );
}

function InvalidarLote({
  loteId,
  chainId,
  signer,
  aoInvalidar,
}: {
  loteId: bigint;
  chainId: number;
  signer: Signer;
  aoInvalidar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [documentosCids, setDocumentosCids] = useState<string[]>([]);
  const [arquivosSubindo, setArquivosSubindo] = useState(false);
  const [chaveAnexos, setChaveAnexos] = useState(0);
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
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
      const metadados = montarMetadadosInvalidacao({
        insumoId: loteId.toString(),
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

  async function enviar() {
    if (!confirmado) {
      setErro("Confirme que está ciente de que a invalidação é definitiva.");
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
      const tx = await insumos.invalidarLoteInsumo(loteId, metadataURI.trim());
      await tx.wait();
      setChaveAnexos((k) => k + 1);
      setFeedback({ tipo: "ok", texto: "Lote invalidado com sucesso." });
      aoInvalidar();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
      <p className="dica">Esta ação é definitiva: o lote não poderá ser reativado, avaliado ou corrigido depois.</p>
      <label>
        Motivo (opcional, vai para os metadados enviados ao IPFS)
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <p className="dica">O conteúdo enviado ao IPFS e à blockchain é público e permanente.</p>
      <p className="dica">Não inclua dados pessoais em documentos ou campos de texto.</p>
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
      <label>
        <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
        Confirmo que esta invalidação é definitiva e não pode ser desfeita.
      </label>
      <button type="button" onClick={() => void enviar()} disabled={!confirmado}>
        {enviando ? "Invalidando…" : "Invalidar lote"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

function RegistrarCorrecao({
  loteId,
  chainId,
  signer,
  aoRegistrar,
}: {
  loteId: bigint;
  chainId: number;
  signer: Signer;
  aoRegistrar: () => void;
}) {
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
    if (arquivosSubindo) {
      setErroIpfs("Aguarde o envio dos arquivos antes de gerar a referência.");
      return;
    }
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosCorrecaoDocumental({
        insumoId: loteId.toString(),
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
    if (erroReferencia) {
      setErro(erroReferencia);
      return;
    }
    setErro(null);
    setFeedback(null);
    setEnviando(true);
    try {
      const insumos = obterContrato("ContratoInsumos", chainId, signer);
      const tx = await insumos.registrarCorrecaoDocumental(loteId, metadataURI.trim());
      await tx.wait();
      setDocumentosCids([]);
      setArquivosSubindo(false);
      setChaveAnexos((k) => k + 1);
      setMetadataURI("");
      setFeedback({ tipo: "ok", texto: "Correção documental registrada com sucesso." });
      aoRegistrar();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
      <p className="dica">O conteúdo enviado ao IPFS e à blockchain é público e permanente.</p>
      <p className="dica">Não inclua dados pessoais em documentos ou campos de texto.</p>
      <AnexosIpfs
        key={chaveAnexos}
        rotulo="Documentos da correção (PDF, JPG, PNG - opcional)"
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
        {enviando ? "Registrando…" : "Registrar correção"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}
