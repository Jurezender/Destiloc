/**
 * Espelha, no cliente, a validação SINTÁTICA de `ReferenciaIPFS.sol`: mesmo
 * prefixo e os mesmos limites de comprimento (em bytes, como `bytes(uri).length`
 * na Solidity). Serve só para dar feedback antes de gastar gas — a validação
 * que vale é a do contrato.
 */
const PREFIXO = "ipfs://";
const COMPRIMENTO_MINIMO = 53;
const COMPRIMENTO_MAXIMO = 120;

function comprimentoEmBytes(texto: string): number {
  return new TextEncoder().encode(texto).length;
}

export function ehVazia(uri: string): boolean {
  return comprimentoEmBytes(uri) === 0;
}

export function ehReferenciaIpfsValida(uri: string): boolean {
  const bytes = comprimentoEmBytes(uri);
  if (bytes < COMPRIMENTO_MINIMO) return false;
  if (bytes > COMPRIMENTO_MAXIMO) return false;
  return uri.startsWith(PREFIXO);
}

/** Mensagem explicando por que uma referência não passaria na validação, ou null se for válida. */
export function motivoReferenciaInvalida(uri: string): string | null {
  if (ehVazia(uri)) return null; // vazio é aceito onde a referência é opcional
  if (!uri.startsWith(PREFIXO)) return 'A referência precisa começar com "ipfs://".';
  const bytes = comprimentoEmBytes(uri);
  if (bytes < COMPRIMENTO_MINIMO) {
    return `A referência é muito curta (${bytes} bytes; mínimo ${COMPRIMENTO_MINIMO}).`;
  }
  if (bytes > COMPRIMENTO_MAXIMO) {
    return `A referência é muito longa (${bytes} bytes; máximo ${COMPRIMENTO_MAXIMO}).`;
  }
  return null;
}
