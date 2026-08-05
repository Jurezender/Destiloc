import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { obterContrato } from "../contracts";
import { PAPEL_ADMIN, PAPEL_DISTRIBUIDOR, PAPEL_FABRICANTE, PAPEL_VAREJISTA } from "../lib/papeis";
import { useCarteira } from "./CarteiraContexto";

interface PapeisPorContrato {
  admin: boolean;
  fabricante: boolean;
}

interface EstadoPapeis {
  carregando: boolean;
  erro: string | null;
  lote: PapeisPorContrato;
  tokenizacao: PapeisPorContrato;
  rastreamento: PapeisPorContrato & { distribuidor: boolean; varejista: boolean };
  /** Tem FABRICANTE_ROLE nos três contratos — só assim opera o fluxo completo. */
  fabricanteCompleto: boolean;
  recarregar: () => void;
}

const PADRAO: Omit<EstadoPapeis, "recarregar"> = {
  carregando: false,
  erro: null,
  lote: { admin: false, fabricante: false },
  tokenizacao: { admin: false, fabricante: false },
  rastreamento: { admin: false, fabricante: false, distribuidor: false, varejista: false },
  fabricanteCompleto: false,
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
        const lote = obterContrato("ContratoLote", chainId!, signer!);
        const tokenizacao = obterContrato("ContratoTokenizacao", chainId!, signer!);
        const rastreamento = obterContrato("ContratoRastreamento", chainId!, signer!);

        const [
          adminLote,
          fabricanteLote,
          adminTokenizacao,
          fabricanteTokenizacao,
          adminRastreamento,
          fabricanteRastreamento,
          distribuidor,
          varejista,
        ] = await Promise.all([
          lote.hasRole(PAPEL_ADMIN, conta) as Promise<boolean>,
          lote.hasRole(PAPEL_FABRICANTE, conta) as Promise<boolean>,
          tokenizacao.hasRole(PAPEL_ADMIN, conta) as Promise<boolean>,
          tokenizacao.hasRole(PAPEL_FABRICANTE, conta) as Promise<boolean>,
          rastreamento.hasRole(PAPEL_ADMIN, conta) as Promise<boolean>,
          rastreamento.hasRole(PAPEL_FABRICANTE, conta) as Promise<boolean>,
          rastreamento.hasRole(PAPEL_DISTRIBUIDOR, conta) as Promise<boolean>,
          rastreamento.hasRole(PAPEL_VAREJISTA, conta) as Promise<boolean>,
        ]);

        if (cancelado) return;
        setEstado({
          carregando: false,
          erro: null,
          lote: { admin: adminLote, fabricante: fabricanteLote },
          tokenizacao: { admin: adminTokenizacao, fabricante: fabricanteTokenizacao },
          rastreamento: {
            admin: adminRastreamento,
            fabricante: fabricanteRastreamento,
            distribuidor,
            varejista,
          },
          fabricanteCompleto: fabricanteLote && fabricanteTokenizacao && fabricanteRastreamento,
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
