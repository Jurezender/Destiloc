const API_URL = import.meta.env.VITE_KUBO_API_URL;
const GATEWAY_URL = import.meta.env.VITE_KUBO_GATEWAY_URL;
const GATEWAY_PUBLICO = "https://ipfs.io";

export class KuboIndisponivelError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "KuboIndisponivelError";
  }
}

function extrairCid(referencia: string): string {
  if (!referencia.startsWith("ipfs://")) {
    throw new Error('Referência fora do formato "ipfs://<CID>".');
  }
  return referencia.slice("ipfs://".length);
}

/**
 * Envia um objeto como JSON para o nó Kubo local (`/api/v0/add`) e devolve a
 * referência no formato `ipfs://<CID>`, já em CIDv1 (mesmo formato usado nos
 * testes de contrato e aceito por `ReferenciaIPFS`).
 *
 * Exige que o daemon Kubo esteja rodando e com CORS liberado para a origem
 * desta aplicação (ver frontend/README.md).
 */
export async function adicionarJSON(objeto: unknown): Promise<string> {
  const corpo = new FormData();
  corpo.append("arquivo", new Blob([JSON.stringify(objeto, null, 2)], { type: "application/json" }));

  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}/api/v0/add?cid-version=1&pin=true`, {
      method: "POST",
      body: corpo,
    });
  } catch {
    throw new KuboIndisponivelError(
      `Não foi possível conectar ao nó Kubo em ${API_URL}. Verifique se o daemon está rodando ("ipfs daemon") e se o CORS foi liberado para esta origem.`
    );
  }

  if (!resposta.ok) {
    throw new KuboIndisponivelError(`O nó Kubo recusou o envio (HTTP ${resposta.status}).`);
  }

  const { Hash } = (await resposta.json()) as { Hash: string };
  return `ipfs://${Hash}`;
}

/**
 * Recupera o JSON de uma referência ipfs://. Tenta primeiro o gateway local
 * (rápido, mesma máquina) e cai para um gateway público se o nó local não
 * responder — os contratos não garantem disponibilidade do conteúdo, só a
 * validade sintática da referência, então a leitura precisa ser resiliente.
 */
export async function obterJSON<T = unknown>(referencia: string): Promise<T> {
  const cid = extrairCid(referencia);

  try {
    const respostaLocal = await fetch(`${GATEWAY_URL}/ipfs/${cid}`);
    if (respostaLocal.ok) return (await respostaLocal.json()) as T;
  } catch {
    // segue para o gateway público
  }

  const respostaPublica = await fetch(`${GATEWAY_PUBLICO}/ipfs/${cid}`);
  if (!respostaPublica.ok) {
    throw new KuboIndisponivelError(
      `Não foi possível recuperar o conteúdo de ${referencia}, nem pelo nó local nem pelo gateway público.`
    );
  }
  return (await respostaPublica.json()) as T;
}
