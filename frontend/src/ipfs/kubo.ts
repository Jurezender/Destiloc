const PINATA_JWT = import.meta.env.VITE_PINATA_JWT as string;

export class KuboIndisponivelError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "KuboIndisponivelError";
  }
}

/**
 * Envia um objeto como JSON ao Pinata e devolve a referência no formato
 * `ipfs://<CID>`, em CIDv1 — mesmo formato aceito por `ReferenciaIPFS` e
 * usado nos testes de contrato.
 *
 * Requer VITE_PINATA_JWT configurado no .env (ver frontend/.env.example).
 */
export async function adicionarJSON(objeto: unknown): Promise<string> {
  let resposta: Response;
  try {
    resposta = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pinataContent: objeto }),
    });
  } catch {
    throw new KuboIndisponivelError(
      "Não foi possível conectar ao Pinata. Verifique sua conexão com a internet."
    );
  }

  if (!resposta.ok) {
    throw new KuboIndisponivelError(
      `O Pinata recusou o envio (HTTP ${resposta.status}). Verifique se VITE_PINATA_JWT está correto no .env.`
    );
  }

  const { IpfsHash } = (await resposta.json()) as { IpfsHash: string };
  return `ipfs://${IpfsHash}`;
}
