import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexto/AuthContexto";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx } from "../lib/erros";
import { encurtarEndereco, formatarTimestamp } from "../lib/formatadores";
import { PAPEL_ENVASADOR } from "../lib/papeis";
import { EstadoProducao } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosConclusaoProducao } from "../ipfs/metadados";
import { AnexosIpfs } from "../componentes/AnexosIpfs";
import { LinkMetadados } from "../componentes/LinkMetadados";
import { useLoteContexto, type Signer } from "./LoteLayout";
import { API_URL, fetchApi } from "../lib/api";
import { useNomesParticipantes } from "../lib/useNomesParticipantes";

interface OpcaoEnvasador {
  address: string;
  nome: string;
}

export function LoteConclusao() {
  const {
    lote,
    podeOperar,
    erroInsumosConclusao,
    erroEtapasConclusao,
    chainId,
    signer,
    carregar,
  } = useLoteContexto();
  const nomes = useNomesParticipantes();
  const dadosEnvasador = nomes.get(lote.envasadorDesignado.toLowerCase());

  return (
    <>
      <h2>Conclusão</h2>
      {lote.estado === EstadoProducao.Concluido ? (
        <>
          <p className="ok">Produção concluída em {formatarTimestamp(lote.concluidoEm)}.</p>
          <dl className="info-grade">
            <div className="info-campo info-campo--largo">
              <dt className="info-campo__rotulo">Metadados de conclusão</dt>
              <dd className="info-campo__valor"><LinkMetadados uri={lote.metadataURIConclusao} /></dd>
            </div>
            {dadosEnvasador?.empresa && (
              <div className="info-campo info-campo--largo">
                <dt className="info-campo__rotulo">Empresa envasadora</dt>
                <dd className="info-campo__valor">{dadosEnvasador.empresa}</dd>
              </div>
            )}
            {dadosEnvasador?.responsavel && (
              <div className="info-campo info-campo--largo">
                <dt className="info-campo__rotulo">Responsável pelo envasamento</dt>
                <dd className="info-campo__valor">{dadosEnvasador.responsavel}</dd>
              </div>
            )}
            <div className="info-campo info-campo--largo">
              <dt className="info-campo__rotulo">Carteira do envasador</dt>
              <dd className="info-campo__valor mono">{lote.envasadorDesignado}</dd>
            </div>
          </dl>
          <Link className="botao--primario" to={`/lotes/${lote.id.toString()}/emitir`}>
            Ir para envasamento e emissão
          </Link>
        </>
      ) : lote.estado === EstadoProducao.EmProducao ? (
        podeOperar ? (
          erroEtapasConclusao ? (
            <p className="dica">{erroEtapasConclusao}</p>
          ) : erroInsumosConclusao ? (
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
  const { token } = useAuth();
  const [envasadores, setEnvasadores] = useState<OpcaoEnvasador[]>([]);
  const [carregandoEnvasadores, setCarregandoEnvasadores] = useState(true);
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

  useEffect(() => {
    if (!token || !chainId || !signer) return;
    setCarregandoEnvasadores(true);
    void (async () => {
      try {
        const acesso = obterContrato("ContratoAcesso", chainId, signer);
        const [resDB, totalBc] = await Promise.all([
          fetchApi(`${API_URL}/participantes`, { headers: { Authorization: `Bearer ${token}` } }),
          acesso.getRoleMemberCount(PAPEL_ENVASADOR) as Promise<bigint>,
        ]);
        const { participantes } = (await resDB.json()) as {
          participantes: { address: string; nome_responsavel: string; nome_empresa: string }[];
        };
        const mapaDB = new Map(participantes.map((p) => [p.address.toLowerCase(), p]));
        const enderecosBc = await Promise.all(
          Array.from({ length: Number(totalBc) }, (_, i) =>
            acesso.getRoleMember(PAPEL_ENVASADOR, i) as Promise<string>
          )
        );
        const lista = enderecosBc.map((address) => {
          const db = mapaDB.get(address.toLowerCase());
          const nome = db
            ? [db.nome_empresa, db.nome_responsavel].filter(Boolean).join(" — ")
            : encurtarEndereco(address);
          return { address, nome };
        });
        setEnvasadores(lista);
      } catch {
        setEnvasadores([]);
      } finally {
        setCarregandoEnvasadores(false);
      }
    })();
  }, [token, chainId, signer]);

  const atualizarAnexos = useCallback((cids: string[], subindo: boolean) => {
    setDocumentosCids(cids);
    setArquivosSubindo(subindo);
  }, []);

  async function gerarViaIpfs() {
    if (!envasadorDesignado) {
      setErroIpfs("Selecione o envasador designado antes de gerar os metadados.");
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
    if (!envasadorDesignado) {
      setErro("Selecione o envasador designado.");
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
        Envasador designado
        <select
          value={envasadorDesignado}
          onChange={(e) => setEnvasadorDesignado(e.target.value)}
          disabled={carregandoEnvasadores}
        >
          <option value="">
            {carregandoEnvasadores ? "Carregando…" : "Selecione…"}
          </option>
          {envasadores.map((e) => (
            <option key={e.address} value={e.address}>{e.nome}</option>
          ))}
        </select>
        {envasadorDesignado && (
          <span className="mono" style={{ fontSize: "0.75rem", color: "var(--cor-texto-secundario)", marginTop: "0.25rem", display: "block" }}>
            {envasadorDesignado}
          </span>
        )}
        {!carregandoEnvasadores && envasadores.length === 0 && (
          <span className="dica">Nenhum envasador cadastrado no sistema.</span>
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
