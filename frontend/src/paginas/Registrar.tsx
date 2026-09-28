import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../contexto/AuthContexto";
import { API_URL, fetchApi } from "../lib/api";

export function Registrar() {
  const { token } = useAuth();
  const navegar = useNavigate();
  const [nomeResponsavel, setNomeResponsavel] = useState("");
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [tipoParticipante, setTipoParticipante] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  if (token) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (senha !== confirmacao) {
      setErro("As senhas não coincidem.");
      return;
    }

    setEnviando(true);
    try {
      const res = await fetchApi(`${API_URL}/auth/registrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          senha,
          nome_responsavel: nomeResponsavel,
          nome_empresa: nomeEmpresa,
          ...(tipoParticipante ? { tipo_participante: tipoParticipante } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { erro?: string; message?: string };
        if (res.status === 409) {
          throw new Error("Este e-mail já está cadastrado.");
        }
        if (res.status === 400) {
          const msg = body.erro ?? body.message ?? "";
          if (msg.includes("shorter than 8") || msg.toLowerCase().includes("senha")) {
            throw new Error("A senha precisa ter no mínimo 8 caracteres.");
          }
          throw new Error(body.erro ?? "Verifique os campos e tente novamente.");
        }
        if (res.status >= 500) {
          throw new Error("Serviço temporariamente indisponível. Tente novamente em instantes.");
        }
        throw new Error(body.erro ?? "Não foi possível criar a conta.");
      }

      setSucesso(true);
      setTimeout(() => navegar("/login", { replace: true }), 2500);
    } catch (erroRegistro) {
      setErro(erroRegistro instanceof Error ? erroRegistro.message : "Erro ao registrar.");
    } finally {
      setEnviando(false);
    }
  };

  if (sucesso) {
    return (
      <div className="auth-pagina">
        <header className="auth-cabecalho">
          <span className="auth-cabecalho__logo">Destiloc</span>
        </header>
        <main className="auth-conteudo">
          <div className="auth-painel">
            <h1 className="auth-painel__titulo">Conta criada</h1>
            <p className="ok">
              Sua conta foi criada com sucesso. O próximo passo é vincular sua carteira Ethereum
              e aguardar aprovação do administrador.
            </p>
            <p className="auth-painel__subtitulo" style={{ marginTop: "1rem" }}>
              Redirecionando para o login…
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-pagina">
      <header className="auth-cabecalho">
        <span className="auth-cabecalho__logo">Destiloc</span>
      </header>
      <main className="auth-conteudo">
        <div className="auth-painel">
          <h1 className="auth-painel__titulo">Criar conta</h1>
          <p className="auth-painel__subtitulo">
            Após criar a conta você precisará vincular sua carteira Ethereum.
            O acesso operacional requer aprovação do administrador.
          </p>
          <form onSubmit={(e) => void handleSubmit(e)}>
            <fieldset disabled={enviando}>
              <legend>Dados do responsável</legend>
              <label>
                Nome do responsável
                <input
                  type="text"
                  value={nomeResponsavel}
                  onChange={(e) => setNomeResponsavel(e.target.value)}
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="Nome completo"
                />
              </label>
              <label>
                Nome da empresa ou produtor
                <input
                  type="text"
                  value={nomeEmpresa}
                  onChange={(e) => setNomeEmpresa(e.target.value)}
                  required
                  minLength={2}
                  autoComplete="organization"
                  placeholder="Razão social ou nome fantasia"
                />
              </label>
              <label>
                Tipo de participante (opcional)
                <select
                  value={tipoParticipante}
                  onChange={(e) => setTipoParticipante(e.target.value)}
                >
                  <option value="">Selecione o tipo de participante (opcional)</option>
                  <option value="fornecedor">Fornecedor de Insumos</option>
                  <option value="produtor">Produtor</option>
                  <option value="envasador">Envasador</option>
                </select>
              </label>
            </fieldset>
            <fieldset disabled={enviando}>
              <legend>Acesso ao sistema</legend>
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
                Senha (mínimo 8 caracteres)
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirmar senha
                <input
                  type="password"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              {erro && <p className="erro">{erro}</p>}
              <button type="submit" className="auth-btn-principal">
                {enviando ? "Criando conta…" : "Criar conta"}
              </button>
            </fieldset>
          </form>
          <p className="auth-rodape">
            Já tem conta? <Link to="/login">Entrar</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
