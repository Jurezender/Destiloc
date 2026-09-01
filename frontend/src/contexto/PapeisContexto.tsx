import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { obterContrato } from "../contracts";
import { useCarteira } from "./CarteiraContexto";

interface EstadoPapeis {
  carregando: boolean;
  erro: string | null;
  admin: boolean;
  fornecedor: boolean;
  produtor: boolean;
  envasador: boolean;
  recarregar: () => void;
}

const PADRAO: Omit<EstadoPapeis, "recarregar"> = {
  carregando: false,
  erro: null,
  admin: false,
  fornecedor: false,
  produtor: false,
  envasador: false,
};

const PapeisContexto = createContext<EstadoPapeis | null>(null);

export function PapeisProvedor({ children }: { children: ReactNode }) {
  const { conta, chainId, signer } = useCarteira();
  const [estado, setEstado] = useState<Omit<EstadoPapeis, "recarregar">>(PADRAO);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let cancelado = false;

    if (!conta || !chainId || !signer) {
      setEstado(PADRAO);
      return;
    }

    setEstado((atual) => ({ ...atual, carregando: true, erro: null }));

    async function carregar() {
      try {
        const acesso = obterContrato("ContratoAcesso", chainId!, signer!);

        const [admin, fornecedor, produtor, envasador] = await Promise.all([
          acesso.ehAdministrador(conta) as Promise<boolean>,
          acesso.ehFornecedor(conta) as Promise<boolean>,
          acesso.ehProdutor(conta) as Promise<boolean>,
          acesso.ehEnvasador(conta) as Promise<boolean>,
        ]);

        if (cancelado) return;
        setEstado({
          carregando: false,
          erro: null,
          admin,
          fornecedor,
          produtor,
          envasador,
        });
      } catch (erro) {
        if (cancelado) return;
        const mensagem = erro instanceof Error ? erro.message : "Não foi possível carregar os papéis desta conta.";
        setEstado({ ...PADRAO, erro: mensagem });
      }
    }

    void carregar();
    return () => {
      cancelado = true;
    };
  }, [conta, chainId, signer, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  const valor = useMemo<EstadoPapeis>(() => ({ ...estado, recarregar }), [estado, recarregar]);

  return <PapeisContexto.Provider value={valor}>{children}</PapeisContexto.Provider>;
}

export function usePapeis(): EstadoPapeis {
  const contexto = useContext(PapeisContexto);
  if (!contexto) throw new Error("usePapeis precisa estar dentro de <PapeisProvedor>.");
  return contexto;
}
