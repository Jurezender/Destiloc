require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const {
  SEPOLIA_RPC_URL,
  ARBITRUM_SEPOLIA_RPC_URL,
  BASE_SEPOLIA_RPC_URL,
  MONAD_TESTNET_RPC_URL,
  MEGAETH_TESTNET_RPC_URL,
  LINEA_SEPOLIA_RPC_URL,
  PRIVATE_KEY,
  ETHERSCAN_API_KEY,
} = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      viaIR: true,
    },
  },
  gasReporter: {
    enabled: true,
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
    customChains: [
      {
        network: "megaethTestnet",
        chainId: 6343,
        urls: {
          apiURL: "https://mega.etherscan.io/api",
          browserURL: "https://mega.etherscan.io",
        },
      },
    ],
  },
  networks: {
    // Rede local em memória (padrão dos testes automatizados)
    hardhat: {},
    // Nó local persistente (`npm run node:local`), usado para validar o fluxo
    // completo com a interface e a MetaMask antes de cogitar a Sepolia.
    // Sem `accounts` explícito: usa "remote", que consulta as contas já
    // disponíveis no próprio nó (as 20 contas padrão do `hardhat node`).
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Sepolia Testnet — preencha o .env antes de usar
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    arbitrumSepolia: {
      url: ARBITRUM_SEPOLIA_RPC_URL || "",
      chainId: 421614,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL || "",
      chainId: 84532,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    lineaSepolia: {
      url: LINEA_SEPOLIA_RPC_URL || "",
      chainId: 59141,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    // Chain ID e RPC: confirmar na documentação oficial antes de usar
    monadTestnet: {
      url: MONAD_TESTNET_RPC_URL || "",
      chainId: 10143,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    megaethTestnet: {
      url: MEGAETH_TESTNET_RPC_URL || "",
      chainId: 6343,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
