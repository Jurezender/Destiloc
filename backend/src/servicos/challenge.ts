import { randomUUID } from 'node:crypto';
import { getAddress, verifyMessage } from 'ethers';
import { obterPool } from '../db/cliente.js';

const DURACAO_MS = 15 * 60 * 1000;

export class ChallengeInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChallengeInvalidoError';
  }
}

export class AssinaturaInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssinaturaInvalidaError';
  }
}

export function validarEndereco(address: string): boolean {
  try {
    getAddress(address);
    return true;
  } catch {
    return false;
  }
}

export function normalizarEndereco(address: string): string {
  return getAddress(address);
}

function construirMensagem(nonce: string, expiraEm: Date): string {
  return `Destiloc: vincule sua carteira ao sistema.\nNonce: ${nonce}\nVálido até: ${expiraEm.toISOString()}`;
}

export async function gerarChallenge(
  usuarioId: number,
  address: string,
): Promise<{ mensagem: string; nonce: string }> {
  const pool = obterPool();
  const nonce = randomUUID();
  const expiraEm = new Date(Date.now() + DURACAO_MS);
  const mensagem = construirMensagem(nonce, expiraEm);

  await pool.query(
    `UPDATE auth_challenges SET usado_em = now()
     WHERE usuario_id = $1 AND address = $2 AND usado_em IS NULL`,
    [usuarioId, address],
  );

  await pool.query(
    `INSERT INTO auth_challenges (usuario_id, address, nonce, mensagem, expira_em)
     VALUES ($1, $2, $3, $4, $5)`,
    [usuarioId, address, nonce, mensagem, expiraEm],
  );

  return { mensagem, nonce };
}

export async function verificarChallenge(
  usuarioId: number,
  nonce: string,
  assinatura: string,
): Promise<{ address: string }> {
  const pool = obterPool();

  const res = await pool.query<{
    id: number;
    address: string;
    mensagem: string;
    expira_em: Date;
    usado_em: Date | null;
  }>(
    `SELECT id, address, mensagem, expira_em, usado_em
     FROM auth_challenges
     WHERE nonce = $1 AND usuario_id = $2`,
    [nonce, usuarioId],
  );

  if (res.rows.length === 0) {
    throw new ChallengeInvalidoError('Challenge não encontrado.');
  }

  const challenge = res.rows[0];

  if (challenge.usado_em !== null) {
    throw new ChallengeInvalidoError('Challenge já utilizado.');
  }

  if (new Date() > challenge.expira_em) {
    throw new ChallengeInvalidoError('Challenge expirado.');
  }

  let enderecoRecuperado: string;
  try {
    enderecoRecuperado = verifyMessage(challenge.mensagem, assinatura);
  } catch {
    throw new AssinaturaInvalidaError('Assinatura malformada.');
  }

  if (enderecoRecuperado.toLowerCase() !== challenge.address.toLowerCase()) {
    throw new AssinaturaInvalidaError('Assinatura não corresponde ao endereço informado.');
  }

  await pool.query(
    `UPDATE auth_challenges SET usado_em = now() WHERE id = $1 AND usado_em IS NULL`,
    [challenge.id],
  );

  return { address: challenge.address };
}
