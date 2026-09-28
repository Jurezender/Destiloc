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
      <header className="auth-cabecalho">
        <span className="auth-cabecalho__logo">Destiloc</span>
      </header>
      <main className="auth-conteudo">
        <div className="auth-painel">
          <h1 className="auth-painel__titulo">Entrar no sistema</h1>
          <p className="auth-painel__subtitulo">
            Acesso exclusivo para participantes autorizados da cadeia produtiva.
          </p>
          <form onSubmit={(e) => void handleSubmit(e)}>
            <fieldset disabled={enviando}>
              <legend>Credenciais</legend>
              <label>
                E-mail
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
              {erro && <p className="erro">{erro}</p>}
              <button type="submit" className="auth-btn-principal">
                {enviando ? "Entrando…" : "Entrar"}
              </button>
            </fieldset>
          </form>
          <p className="auth-rodape">
            Não tem conta? <Link to="/registrar">Criar conta</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
