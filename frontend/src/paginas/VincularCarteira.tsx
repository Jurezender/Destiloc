import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexto/AuthContexto";
import { useCarteira } from "../contexto/CarteiraContexto";
import { API_URL, fetchApi } from "../lib/api";

export function VincularCarteira() {
  const { token, usuario, carteira, atualizarCarteira } = useAuth();
  const { disponivel, conta, conectando, erro: erroMeta, conectar, signer } = useCarteira();
  const navegar = useNavigate();
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (carteira?.status === "autorizada") {
    return (
      <div className="aviso-acesso">
        <h2>Carteira já autorizada</h2>
        <p>
          Sua carteira <strong className="mono">{carteira.address}</strong> está autorizada.
        </p>
        <button onClick={() => navegar("/", { replace: true })}>Ir para o início</button>
      </div>
    );
  }

  const vincular = async () => {
    if (!conta || !signer || !token) return;
    setProcessando(true);
    setErro(null);
    try {
      const challengeRes = await fetchApi(`${API_URL}/auth/carteira/challenge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ address: conta }),
      });

      if (!challengeRes.ok) {
        const body = await challengeRes.json().catch(() => ({})) as { erro?: string };
        if (challengeRes.status === 409) {
          throw new Error("Esta carteira já está vinculada a outra conta.");
        }
        throw new Error(body.erro ?? "Não foi possível iniciar a verificação.");
      }

      const { mensagem, nonce } = (await challengeRes.json()) as {
        mensagem: string;
        nonce: string;
      };

      const assinatura = await signer.signMessage(mensagem);

      const verificarRes = await fetchApi(`${API_URL}/auth/carteira/verificar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nonce, assinatura }),
      });

      if (!verificarRes.ok) {
        const body = await verificarRes.json().catch(() => ({})) as { erro?: string };
        if (verificarRes.status === 422) {
          throw new Error("Assinatura inválida. Tente novamente.");
        }
        throw new Error(body.erro ?? "Não foi possível verificar a assinatura.");
      }

      const data = (await verificarRes.json()) as { address: string; status: string };
      atualizarCarteira({ address: data.address, status: data.status });
    } catch (erroVincular) {
      const msg =
        erroVincular instanceof Error ? erroVincular.message : "Não foi possível vincular a carteira.";
      setErro(
        msg.includes("rejected") || msg.includes("ACTION_REJECTED")
          ? "Assinatura cancelada na MetaMask."
          : msg,
      );
    } finally {
      setProcessando(false);
    }
  };

  const nomeExibicao = usuario?.nome_responsavel || usuario?.email;

  return (
    <section>
      <h1>Vincular carteira</h1>
      <p className="dica">
        Para acessar as áreas operacionais você precisa vincular uma carteira Ethereum e aguardar
        aprovação do administrador. Nenhuma transação será realizada neste processo.
      </p>

      {nomeExibicao && (
        <p style={{ marginBlock: "var(--s-md)" }}>
          Olá, <strong>{nomeExibicao}</strong>.
        </p>
      )}

      {carteira?.status === "pendente" && (
        <div className="aviso-acesso">
          <h2>Aguardando aprovação</h2>
          <p>
            Sua carteira <strong className="mono">{carteira.address}</strong> foi vinculada e está
            aguardando aprovação do administrador. Você receberá acesso assim que for aprovado.
          </p>
        </div>
      )}

      {carteira?.status === "revogada" && (
        <div className="aviso-acesso">
          <h2>Acesso revogado</h2>
          <p>
            O acesso da carteira <strong className="mono">{carteira.address}</strong> foi revogado.
            Você pode vincular uma nova carteira ou entrar em contato com o administrador.
          </p>
        </div>
      )}

      {(!carteira || carteira.status === "revogada") && (
        <>
          <h2 style={{ marginTop: "var(--s-xl)" }}>Vincular com MetaMask</h2>

          {!disponivel && (
            <p className="erro" style={{ marginTop: "var(--s-md)" }}>
              MetaMask não detectada. Instale a extensão para continuar.
            </p>
          )}

          {disponivel && !conta && (
            <div style={{ marginTop: "var(--s-md)" }}>
              <button onClick={() => void conectar()} disabled={conectando}>
                {conectando ? "Conectando…" : "Conectar MetaMask"}
              </button>
              {erroMeta && <p className="erro">{erroMeta}</p>}
            </div>
          )}

          {disponivel && conta && (
            <div style={{ marginTop: "var(--s-md)" }}>
              <p>
                Conta detectada: <strong className="mono">{conta}</strong>
              </p>
              <div className="acoes">
                <button onClick={() => void vincular()} disabled={processando}>
                  {processando ? "Aguarde…" : "Vincular esta carteira"}
                </button>
              </div>
              {erro && <p className="erro">{erro}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
