// TODO(shared-package): mover para packages/contratos/ quando o monorepo for extraído.
// O shape de ConfiguracaoRede é intencionalmente compatível com o do frontend,
// exceto por `urlRpc` (backend, server-side) vs `urlRpcPublica` (frontend, exposta no bundle).

export interface ConfiguracaoRede {
  chainId: number;
  nome: string;
  rotulo: string;
  /** URL do nó RPC — lida de variável de ambiente, nunca exposta ao cliente. */
  urlRpc: string;
}

export const REDES: Record<number, ConfiguracaoRede> = {
  31337: {
    chainId: 31337,
    nome: "localhost",
    rotulo: "Hardhat Local",
    get urlRpc() { return process.env.RPC_URL_LOCALHOST ?? "http://127.0.0.1:8545"; },
  },
  11155111: {
    chainId: 11155111,
    nome: "sepolia",
    rotulo: "Sepolia",
    get urlRpc() { return process.env.RPC_URL_SEPOLIA ?? ""; },
  },
};

export function obterConfiguracaoRede(chainId: number): ConfiguracaoRede | undefined {
  return REDES[chainId];
}
