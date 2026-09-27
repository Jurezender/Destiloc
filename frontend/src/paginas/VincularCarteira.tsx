import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexto/AuthContexto";
import { useCarteira } from "../contexto/CarteiraContexto";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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
          Sua carteira <strong>{carteira.address}</strong> está autorizada.
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
      const challengeRes = await fetch(`${API_URL}/auth/carteira/challenge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ address: conta }),
      });

      if (!challengeRes.ok) {
        const body = (await challengeRes.json()) as { erro?: string };
        throw new Error(body.erro ?? "Erro ao solicitar desafio.");
      }

      const { mensagem, nonce } = (await challengeRes.json()) as {
        mensagem: string;
        nonce: string;
      };

      const assinatura = await signer.signMessage(mensagem);

      const verificarRes = await fetch(`${API_URL}/auth/carteira/verificar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nonce, assinatura }),
      });

      if (!verificarRes.ok) {
        const body = (await verificarRes.json()) as { erro?: string };
        throw new Error(body.erro ?? "Erro ao verificar assinatura.");
      }

      const data = (await verificarRes.json()) as { address: string; status: string };
      atualizarCarteira({ address: data.address, status: data.status });
    } catch (erroVincular) {
      const msg =
        erroVincular instanceof Error ? erroVincular.message : "Não foi possível vincular a carteira.";
      setErro(
        msg.includes("rejected") || msg.includes("ACTION_REJECTED")
          ? "Assinatura cancelada na MetaMask."
          : msg
      );
    } finally {
      setProcessando(false);
    }
  };

  return (
    <section>
      <h1>Vincular carteira</h1>
      <p>
        Olá, <strong>{usuario?.email}</strong>.
      </p>

      {carteira && (
        <div className="aviso-acesso">
          {carteira.status === "pendente" && (
            <>
              <h2>Aguardando aprovação</h2>
              <p>
                Sua carteira <strong>{carteira.address}</strong> foi vinculada e está aguardando
                aprovação de um administrador.
              </p>
            </>
          )}
          {carteira.status === "revogada" && (
            <>
              <h2>Acesso revogado</h2>
              <p>
                O acesso da carteira <strong>{carteira.address}</strong> foi revogado. Você pode
                vincular uma nova carteira ou entrar em contato com um administrador.
              </p>
            </>
          )}
        </div>
      )}

      {(!carteira || carteira.status === "revogada") && (
        <>
          <h2>Vincular com MetaMask</h2>
          {!disponivel && (
            <p className="erro">MetaMask não detectada. Instale a extensão para continuar.</p>
          )}
          {disponivel && !conta && (
            <button onClick={() => void conectar()} disabled={conectando}>
              {conectando ? "Conectando…" : "Conectar MetaMask"}
            </button>
          )}
          {erroMeta && <p className="erro">{erroMeta}</p>}
          {disponivel && conta && (
            <>
              <p>
                Conta MetaMask detectada: <strong>{conta}</strong>
              </p>
              <p>
                Ao clicar em "Vincular", você assinará uma mensagem com sua MetaMask para provar que
                é o dono desta carteira. Nenhuma transação será realizada.
              </p>
              <button onClick={() => void vincular()} disabled={processando}>
                {processando ? "Processando…" : "Vincular esta carteira"}
              </button>
              {erro && <p className="erro">{erro}</p>}
            </>
          )}
        </>
      )}
    </section>
  );
}
