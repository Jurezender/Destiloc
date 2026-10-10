import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { API_URL, fetchApi } from "../lib/api";

type Etapa = "email" | "carteira" | "senha" | "concluido";

export function EsqueciSenha() {
  const { disponivel, conta, conectando, erro: erroMeta, conectar, signer } = useCarteira();

  const [etapa, setEtapa] = useState<Etapa>("email");
  const [email, setEmail] = useState("");
  const [carteiraEsperada, setCarteiraEsperada] = useState("");
  const [nonce, setNonce] = useState("");
  const [mensagemChallenge, setMensagemChallenge] = useState("");
  const [tokenReset, setTokenReset] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const verificarEmail = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setProcessando(true);
    try {
      const res = await fetchApi(`${API_URL}/auth/esqueci-senha/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 404) {
        setErro("Nenhuma conta encontrada com este e-mail.");
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { mensagem: string; nonce: string; address: string };
      setCarteiraEsperada(data.address.toLowerCase());
      setNonce(data.nonce);
      setMensagemChallenge(data.mensagem);
      setEtapa("carteira");
    } catch {
      setErro("Não foi possível processar a solicitação. Tente novamente.");
    } finally {
      setProcessando(false);
    }
  };

  const verificarCarteira = async () => {
    if (!signer || !conta) return;
    setErro(null);

    if (conta.toLowerCase() !== carteiraEsperada) {
      setErro(
        "A carteira conectada não corresponde à conta vinculada a este e-mail. Troque a conta na MetaMask e tente novamente.",
      );
      return;
    }

    setProcessando(true);
    try {
      const res = await fetchApi(`${API_URL}/auth/esqueci-senha/verificar-carteira`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nonce, assinatura: await signer.signMessage(mensagemChallenge) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { erro?: string };
        setErro(body.erro ?? "Verificação falhou. Tente novamente.");
        return;
      }
      const data = (await res.json()) as { token: string };
      setTokenReset(data.token);
      setEtapa("senha");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setErro(
        msg.includes("rejected") || msg.includes("ACTION_REJECTED")
          ? "Assinatura cancelada na MetaMask."
          : "Não foi possível verificar a carteira.",
      );
    } finally {
      setProcessando(false);
    }
  };

  const salvarSenha = async (e: FormEvent) => {
    e.preventDefault();
    if (novaSenha !== confirmar) {
      setErro("As senhas não coincidem.");
      return;
    }
    setErro(null);
    setProcessando(true);
    try {
      const res = await fetchApi(`${API_URL}/auth/redefinir-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenReset, novaSenha }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { erro?: string };
        setErro(body.erro ?? "Não foi possível salvar a nova senha.");
        return;
      }
      setEtapa("concluido");
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="auth-pagina">
      <div className="auth-painel">
        <span className="auth-painel__logo">Destiloc</span>
        <h1 className="auth-painel__titulo">Recuperar senha</h1>

        {etapa === "email" && (
          <form onSubmit={(e) => void verificarEmail(e)}>
            <label className="auth-label">
              E-mail cadastrado
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            {erro && <p className="auth-erro">{erro}</p>}
            <button type="submit" className="auth-btn-principal" disabled={processando}>
              {processando ? "Verificando…" : "Continuar"}
            </button>
            <div className="auth-links">
              <Link to="/login" className="auth-link">Voltar ao login</Link>
            </div>
          </form>
        )}

        {etapa === "carteira" && (
          <div>
            <p className="dica" style={{ color: "rgba(245,239,227,0.65)", marginBottom: "var(--s-md)" }}>
              Para confirmar sua identidade, conecte a carteira vinculada à conta e assine uma
              mensagem. Nenhuma transação será realizada.
            </p>

            {!disponivel && (
              <p className="auth-erro">MetaMask não detectada. Instale a extensão para continuar.</p>
            )}

            {disponivel && !conta && (
              <button className="auth-btn-principal" onClick={() => void conectar()} disabled={conectando}>
                {conectando ? "Conectando…" : "Conectar MetaMask"}
              </button>
            )}

            {disponivel && conta && (
              <button className="auth-btn-principal" onClick={() => void verificarCarteira()} disabled={processando}>
                {processando ? "Aguarde…" : "Verificar carteira"}
              </button>
            )}

            {erroMeta && <p className="auth-erro">{erroMeta}</p>}
            {erro && <p className="auth-erro">{erro}</p>}

            <div className="auth-links">
              <button
                type="button"
                className="auth-link"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                onClick={() => { setEtapa("email"); setErro(null); }}
              >
                ← Voltar
              </button>
            </div>
          </div>
        )}

        {etapa === "senha" && (
          <form onSubmit={(e) => void salvarSenha(e)}>
            <p className="auth-ok" style={{ marginBottom: "var(--s-md)" }}>
              Carteira verificada. Defina sua nova senha.
            </p>
            <label className="auth-label">
              Nova senha
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label className="auth-label">
              Confirmar nova senha
              <input
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            {erro && <p className="auth-erro">{erro}</p>}
            <button type="submit" className="auth-btn-principal" disabled={processando}>
              {processando ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}

        {etapa === "concluido" && (
          <>
            <p className="auth-ok">Senha redefinida com sucesso.</p>
            <div className="auth-links">
              <Link to="/login" className="auth-link">Fazer login</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
