export function ipfsParaUrl(uri: string): string {
  if (uri.startsWith("ipfs://")) return `https://dweb.link/ipfs/${uri.slice(7)}`;
  return uri;
}
