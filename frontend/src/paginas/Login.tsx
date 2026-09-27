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
    <div className="pagina-auth">
      <h1>Entrar no Destiloc</h1>
      <form onSubmit={(e) => void handleSubmit(e)} className="formulario-auth">
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
        <button type="submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p>
        Não tem conta? <Link to="/registrar">Criar conta</Link>
      </p>
    </div>
  );
}
