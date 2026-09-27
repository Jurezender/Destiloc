import bcrypt from 'bcryptjs';
import { obterPool } from '../db/cliente.js';

const BCRYPT_ROUNDS = 12;

export class EmailJaCadastradoError extends Error {
  constructor() {
    super('E-mail já cadastrado.');
    this.name = 'EmailJaCadastradoError';
  }
}

export async function registrarUsuario(
  email: string,
  senha: string,
): Promise<{ id: number; email: string }> {
  const emailNorm = email.toLowerCase().trim();
  const senhaHash = await bcrypt.hash(senha, BCRYPT_ROUNDS);

  try {
    const res = await obterPool().query<{ id: number; email: string }>(
      `INSERT INTO usuarios (email, senha_hash) VALUES ($1, $2) RETURNING id, email`,
      [emailNorm, senhaHash],
    );
    return res.rows[0];
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    ) {
      throw new EmailJaCadastradoError();
    }
    throw err;
  }
}

export async function autenticarUsuario(
  email: string,
  senha: string,
): Promise<{ id: number; email: string } | null> {
  const emailNorm = email.toLowerCase().trim();

  const res = await obterPool().query<{
    id: number;
    email: string;
    senha_hash: string;
  }>(
    `SELECT id, email, senha_hash FROM usuarios WHERE email = $1`,
    [emailNorm],
  );

  if (res.rows.length === 0) return null;

  const usuario = res.rows[0];
  const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
  if (!senhaOk) return null;

  return { id: usuario.id, email: usuario.email };
}
