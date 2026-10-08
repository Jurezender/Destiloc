import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../contexto/AuthContexto";

export function Login() {
  const { login, token } = useAuth();
  const navegar = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (token) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await login(email, senha);
      navegar("/", { replace: true });
    } catch (erroLogin) {
      setErro(erroLogin instanceof Error ? erroLogin.message : "Não foi possível fazer login.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="auth-pagina">
      <div className="auth-painel">
        <span className="auth-painel__logo">Destiloc</span>
        <h1 className="auth-painel__titulo">Login</h1>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <label className="auth-label">
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="auth-label">
            Senha
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {erro && <p className="auth-erro">{erro}</p>}
          <button type="submit" className="auth-btn-principal" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <div className="auth-links">
          <Link to="/esqueci-senha" className="auth-link">Esqueci minha senha</Link>
          <Link to="/registrar" className="auth-link">Criar conta</Link>
        </div>
      </div>
    </div>
  );
}
