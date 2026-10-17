import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx } from "../lib/erros";
import { formatarTimestamp } from "../lib/formatadores";
import { EstadoProducao } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosConclusaoProducao } from "../ipfs/metadados";
import { AnexosIpfs } from "../componentes/AnexosIpfs";
import { LinkMetadados } from "../componentes/LinkMetadados";
import { useLoteContexto, type Signer } from "./LoteLayout";

function ehEnderecoValido(valor: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(valor.trim());
}

export function LoteConclusao() {
  const {
    lote,
    podeOperar,
    erroInsumosConclusao,
    chainId,
    signer,
    carregar,
  } = useLoteContexto();

  return (
    <>
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
            <ConcluirProducao loteId={lote.id} chainId={chainId} signer={signer} aoConcluir={carregar} />
          )
        ) : (
          <p className="dica">Só o produtor responsável, com papel de Produtor, pode concluir a produção.</p>
        )
      ) : (
        <p className="dica">A produção precisa ter ao menos uma etapa registrada antes de poder ser concluída.</p>
      )}
    </>
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
        Metadados
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
