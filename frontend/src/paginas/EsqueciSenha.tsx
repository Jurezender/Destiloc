import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

export function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setEnviado(true);
  };

  return (
    <div className="auth-pagina">
      <div className="auth-painel">
        <span className="auth-painel__logo">Destiloc</span>
        <h1 className="auth-painel__titulo">Recuperar senha</h1>
        {enviado ? (
          <>
            <p className="auth-ok">
              Se este e-mail estiver cadastrado, você receberá as instruções de recuperação em breve.
            </p>
            <div className="auth-links">
              <Link to="/login" className="auth-link">Voltar ao login</Link>
            </div>
          </>
        ) : (
          <>
            <form onSubmit={handleSubmit}>
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
              <button type="submit" className="auth-btn-principal">
                Enviar instruções
              </button>
            </form>
            <div className="auth-links">
              <Link to="/login" className="auth-link">Voltar ao login</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
