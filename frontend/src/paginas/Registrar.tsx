import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../contexto/AuthContexto";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function Registrar() {
  const { token } = useAuth();
  const navegar = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  if (token) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`${API_URL}/auth/registrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { erro?: string };
        throw new Error(body.erro ?? "Não foi possível criar a conta.");
      }
      setSucesso(true);
      setTimeout(() => navegar("/login", { replace: true }), 2000);
    } catch (erroRegistro) {
      setErro(erroRegistro instanceof Error ? erroRegistro.message : "Erro ao registrar.");
    } finally {
      setEnviando(false);
    }
  };

  if (sucesso) {
    return (
      <div className="pagina-auth">
        <h1>Conta criada!</h1>
        <p>Sua conta foi criada com sucesso. Redirecionando para o login…</p>
      </div>
    );
  }

  return (
    <div className="pagina-auth">
      <h1>Criar conta</h1>
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
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button type="submit" disabled={enviando}>
          {enviando ? "Criando conta…" : "Criar conta"}
        </button>
      </form>
      <p>
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </div>
  );
}
