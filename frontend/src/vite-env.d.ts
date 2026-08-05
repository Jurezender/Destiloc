/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL_LOCALHOST: string;
  readonly VITE_RPC_URL_SEPOLIA: string;
  readonly VITE_KUBO_API_URL: string;
  readonly VITE_KUBO_GATEWAY_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
