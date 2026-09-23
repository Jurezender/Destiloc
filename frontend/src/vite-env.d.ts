/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL_LOCALHOST: string;
  readonly VITE_RPC_URL_SEPOLIA: string;
  readonly VITE_API_URL: string;
  /** URL base pública da aplicação. Em produção, defina como https://destiloc.vercel.app.
   *  Se ausente, o QR code usa window.location.origin (útil em desenvolvimento local). */
  readonly VITE_PUBLIC_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
