import type { JsonRpcSigner } from "ethers";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx } from "../lib/erros";
import { PAPEL_ADMIN, PAPEL_ENVASADOR, PAPEL_FORNECEDOR, PAPEL_PRODUTOR } from "../lib/papeis";

async function aplicarPapel(
  papel: string,
  conta: string,
  acao: "conceder" | "revogar",
  signer: JsonRpcSigner,
  chainId: number,
) {
  const acesso = obterContrato("ContratoAcesso", chainId, signer);
  const tx =
    acao === "conceder"
      ? await acesso.grantRole(papel, conta)
      : await acesso.revokeRole(papel, conta);
  await tx.wait();
}

function SecaoPapel({
  titulo,
  papel,
  chainId,
  signer,
  aoConcluir,
}: {
  titulo: string;
  papel: string;
  chainId: number;
  signer: JsonRpcSigner;
  aoConcluir: () => void;
}) {
  const [endereco, setEndereco] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTx | null>(null);
  const [executando, setExecutando] = useState(false);

  async function executar(acao: "conceder" | "revogar") {
    setErro(null);
    setStatus(null);
    setFeedback(null);
    if (!endereco) {
      setErro("Informe o endereço da conta.");
      return;
    }
    setExecutando(true);
    try {
      const acesso = obterContrato("ContratoAcesso", chainId, signer);
      const possuiPapel = (await acesso.hasRole(papel, endereco)) as boolean;
      if (acao === "conceder" && possuiPapel) {
        setErro("Esta conta já possui este papel.");
        return;
      }
      if (acao === "revogar" && !possuiPapel) {
        setErro("Esta conta não possui este papel.");
        return;
      }
      setStatus(`${acao === "conceder" ? "Concedendo" : "Revogando"} papel…`);
      await aplicarPapel(papel, endereco, acao, signer, chainId);
      setStatus(null);
      setFeedback({
        tipo: "ok",
        texto: `Papel ${acao === "conceder" ? "concedido" : "revogado"} com sucesso.`,
      });
      aoConcluir();
    } catch (erroAcao) {
      setStatus(null);
      setFeedback(feedbackDaTransacao(erroAcao));
    } finally {
      setExecutando(false);
    }
  }

  return (
    <div className={`secao-papel${executando ? " secao-papel--desabilitado" : ""}`}>
      <span className="secao-papel__rotulo">{titulo}</span>
      <label>
        Endereço da conta
        <input
          value={endereco}
          onChange={(e) => setEndereco(e.target.value.trim())}
          placeholder="0x…"
          disabled={executando}
        />
      </label>
      <div className="acoes">
        <button type="button" onClick={() => void executar("conceder")} disabled={executando}>
          Conceder
        </button>
        <button type="button" onClick={() => void executar("revogar")} disabled={executando}>
          Revogar
        </button>
      </div>
      {status && <p className="dica">{status}</p>}
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </div>
  );
}

export function PapeisParticipantes() {
  const { chainId, signer } = useCarteira();
  const papeis = usePapeis();

  if (!chainId || !signer) return null;

  const aoConcluir = () => papeis.recarregar();

  return (
    <section>
      <Link to="/participantes" className="link-voltar">← Participantes</Link>
      <h1>Gerenciar papéis</h1>
      <p className="dica">
        Uma mesma conta pode acumular os papéis de administrador, fornecedor, produtor e envasador.
      </p>
      <div className="grade-formularios">
        <SecaoPapel
          titulo="Fornecedor"
          papel={PAPEL_FORNECEDOR}
          chainId={chainId}
          signer={signer}
          aoConcluir={aoConcluir}
        />
        <SecaoPapel
          titulo="Produtor"
          papel={PAPEL_PRODUTOR}
          chainId={chainId}
          signer={signer}
          aoConcluir={aoConcluir}
        />
        <SecaoPapel
          titulo="Envasador"
          papel={PAPEL_ENVASADOR}
          chainId={chainId}
          signer={signer}
          aoConcluir={aoConcluir}
        />
        <SecaoPapel
          titulo="Administrador"
          papel={PAPEL_ADMIN}
          chainId={chainId}
          signer={signer}
          aoConcluir={aoConcluir}
        />
      </div>
    </section>
  );
}
