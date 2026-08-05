import { BrowserProvider, type JsonRpcSigner } from "ethers";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface ProvedorEthereum {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(evento: string, ouvinte: (...args: unknown[]) => void): void;
  removeListener(evento: string, ouvinte: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: ProvedorEthereum;
  }
}

interface EstadoCarteira {
  /** null = MetaMask não detectada nesta janela. */
  disponivel: boolean;
  conectando: boolean;
  conta: string | null;
  chainId: number | null;
  signer: JsonRpcSigner | null;
  erro: string | null;
  conectar: () => Promise<void>;
}

const CarteiraContexto = createContext<EstadoCarteira | null>(null);

export function CarteiraProvedor({ children }: { children: ReactNode }) {
  const disponivel = typeof window !== "undefined" && !!window.ethereum;
  const [conectando, setConectando] = useState(false);
  const [conta, setConta] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const atualizarSigner = useCallback(async (contaAtual: string | null) => {
    if (!window.ethereum || !contaAtual) {
      setSigner(null);
      return;
    }
    const provider = new BrowserProvider(window.ethereum);
    setSigner(await provider.getSigner(contaAtual));
    const rede = await provider.getNetwork();
    setChainId(Number(rede.chainId));
  }, []);

  const conectar = useCallback(async () => {
    if (!window.ethereum) {
      setErro("MetaMask não detectada. Instale a extensão para usar as rotas operacionais.");
      return;
    }
    setConectando(true);
    setErro(null);
    try {
      const contas = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const contaEscolhida = contas[0] ?? null;
      setConta(contaEscolhida);
      await atualizarSigner(contaEscolhida);
    } catch (erroConexao) {
      const mensagem =
        erroConexao && typeof erroConexao === "object" && "message" in erroConexao
          ? String((erroConexao as { message: unknown }).message)
          : "Não foi possível conectar à MetaMask.";
      setErro(mensagem);
    } finally {
      setConectando(false);
    }
  }, [atualizarSigner]);

  useEffect(() => {
    if (!window.ethereum) return;
    const eth = window.ethereum;

    const aoTrocarContas = (...args: unknown[]) => {
      const contas = args[0] as string[];
      const contaEscolhida = contas[0] ?? null;
      setConta(contaEscolhida);
      void atualizarSigner(contaEscolhida);
    };
    const aoTrocarRede = () => {
      // A forma mais segura de refletir uma troca de rede é recarregar o
      // estado derivado dela; a MetaMask recomenda inclusive recarregar a
      // página nesse evento para evitar estado inconsistente entre partes
      // da aplicação que já leram o chainId anterior.
      window.location.reload();
    };

    eth.on("accountsChanged", aoTrocarContas);
    eth.on("chainChanged", aoTrocarRede);
    return () => {
      eth.removeListener("accountsChanged", aoTrocarContas);
      eth.removeListener("chainChanged", aoTrocarRede);
    };
  }, [atualizarSigner]);

  // Reconecta silenciosamente se a MetaMask já tiver uma conta autorizada
  // para este site (evita pedir "Conectar" de novo a cada recarregamento).
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((contas) => {
        const lista = contas as string[];
        if (lista[0]) {
          setConta(lista[0]);
          void atualizarSigner(lista[0]);
        }
      })
      .catch(() => undefined);
  }, [atualizarSigner]);

  const valor = useMemo<EstadoCarteira>(
    () => ({ disponivel, conectando, conta, chainId, signer, erro, conectar }),
    [disponivel, conectando, conta, chainId, signer, erro, conectar]
  );

  return <CarteiraContexto.Provider value={valor}>{children}</CarteiraContexto.Provider>;
}

export function useCarteira(): EstadoCarteira {
  const contexto = useContext(CarteiraContexto);
  if (!contexto) throw new Error("useCarteira precisa estar dentro de <CarteiraProvedor>.");
  return contexto;
}
