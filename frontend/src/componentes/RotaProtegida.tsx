import type { ReactNode } from "react";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";

interface Props {
  children: ReactNode;
  /** Quando informado, a conta só passa se esta função devolver true. */
  exigirPapel?: (papeis: ReturnType<typeof usePapeis>) => boolean;
  mensagemPapel?: string;
}

/**
 * Guarda de rota para as áreas operacionais: exige MetaMask instalada,
 * carteira conectada, e (opcionalmente) um papel específico nos contratos.
 * As rotas de consulta pública NÃO usam este componente — de propósito.
 */
export function RotaProtegida({ children, exigirPapel, mensagemPapel }: Props) {
  const { disponivel, conta, conectando, erro, conectar } = useCarteira();
  const papeis = usePapeis();

  if (!disponivel) {
    return (
      <div className="aviso-acesso">
        <h2>MetaMask não encontrada</h2>
        <p>Instale a extensão MetaMask para acessar esta área operacional.</p>
      </div>
    );
  }

  if (!conta) {
    return (
      <div className="aviso-acesso">
        <h2>Conecte sua carteira</h2>
        <p>Esta área exige uma conta conectada via MetaMask.</p>
        <button onClick={() => void conectar()} disabled={conectando}>
          {conectando ? "Conectando…" : "Conectar MetaMask"}
        </button>
        {erro && <p className="erro">{erro}</p>}
      </div>
    );
  }

  if (papeis.erro) {
    return (
      <div className="aviso-acesso">
        <h2>Não foi possível verificar seus papéis</h2>
        <p className="erro">{papeis.erro}</p>
        <button onClick={papeis.recarregar}>Tentar de novo</button>
      </div>
    );
  }

  if (papeis.carregando) {
    return <p>Carregando papéis desta conta…</p>;
  }

  if (exigirPapel && !exigirPapel(papeis)) {
    return (
      <div className="aviso-acesso">
        <h2>Acesso restrito</h2>
        <p>{mensagemPapel ?? "Sua conta não tem o papel necessário para acessar esta área."}</p>
      </div>
    );
  }

  return <>{children}</>;
}
