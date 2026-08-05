/**
 * Redes suportadas pela interface. `nome` é a chave usada nos arquivos
 * `enderecos.<nome>.json`, gerados por `contratos/scripts/deploy.js`.
 */
export interface ConfiguracaoRede {
  chainId: number;
  nome: string;
  rotulo: string;
  /** RPC usada pela consulta pública (sem MetaMask), via JsonRpcProvider. */
  urlRpcPublica: string;
}

export const REDES: Record<number, ConfiguracaoRede> = {
  31337: {
    chainId: 31337,
    nome: "localhost",
    rotulo: "Hardhat Local",
    urlRpcPublica: import.meta.env.VITE_RPC_URL_LOCALHOST,
  },
  11155111: {
    chainId: 11155111,
    nome: "sepolia",
    rotulo: "Sepolia",
    urlRpcPublica: import.meta.env.VITE_RPC_URL_SEPOLIA,
  },
};

export function obterConfiguracaoRede(chainId: number): ConfiguracaoRede | undefined {
  return REDES[chainId];
}
