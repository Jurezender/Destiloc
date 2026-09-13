/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL_LOCALHOST: string;
  readonly VITE_RPC_URL_SEPOLIA: string;
  readonly VITE_PINATA_JWT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
