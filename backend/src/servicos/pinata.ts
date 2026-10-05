interface RespostaPinata {
  IpfsHash: string;
}

function obterJwt(): string {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error('PINATA_JWT não configurado. Copie .env.example para .env.');
  return jwt;
}

export async function fixarJsonNoPinata(
  conteudo: Record<string, unknown>,
  tipo: string,
): Promise<string> {
  const jwt = obterJwt();

  let resposta: Response;
  try {
    resposta = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ pinataContent: conteudo, pinataMetadata: { name: tipo } }),
    });
  } catch {
    throw new Error('Não foi possível conectar ao Pinata. Verifique sua conexão com a internet.');
  }

  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new Error(`Pinata recusou o envio (HTTP ${resposta.status}): ${texto}`);
  }

  const { IpfsHash } = (await resposta.json()) as RespostaPinata;
  return `ipfs://${IpfsHash}`;
}

export async function fixarArquivoNoPinata(
  buffer: Buffer,
  nome: string,
  mimeType: string,
): Promise<string> {
  const jwt = obterJwt();

  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, nome);
  form.append('pinataMetadata', JSON.stringify({ name: nome }));

  let resposta: Response;
  try {
    resposta = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });
  } catch {
    throw new Error('Não foi possível conectar ao Pinata. Verifique sua conexão com a internet.');
  }

  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new Error(`Pinata recusou o envio (HTTP ${resposta.status}): ${texto}`);
  }

  const { IpfsHash } = (await resposta.json()) as RespostaPinata;
  return `ipfs://${IpfsHash}`;
}
