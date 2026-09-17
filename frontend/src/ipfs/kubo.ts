const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export class KuboIndisponivelError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "KuboIndisponivelError";
  }
}

/**
 * Envia um objeto JSON ao backend (POST /ipfs/upload), que gerencia o cache
 * e o upload ao Pinata. Devolve a referência no formato `ipfs://<CID>`.
 *
 * O JWT do Pinata fica somente no backend/.env — nunca é exposto no bundle.
 */
export async function adicionarJSON(objeto: unknown): Promise<string> {
  const conteudo = objeto as Record<string, unknown>;
  const tipo = conteudo.tipo as string;

  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}/ipfs/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conteudo, tipo }),
    });
  } catch {
    throw new KuboIndisponivelError(
      "Não foi possível conectar ao backend. Verifique se o servidor está em execução."
    );
  }

  if (!resposta.ok) {
    throw new KuboIndisponivelError(
      `O backend recusou o envio (HTTP ${resposta.status}). Verifique os logs do servidor.`
    );
  }

  const { cid } = (await resposta.json()) as { cid: string };
  return cid;
}
