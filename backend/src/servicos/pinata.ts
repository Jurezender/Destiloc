interface RespostaPinata {
  IpfsHash: string;
}

export async function fixarJsonNoPinata(
  conteudo: Record<string, unknown>,
  tipo: string,
): Promise<string> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error('PINATA_JWT não configurado. Copie .env.example para .env.');

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
