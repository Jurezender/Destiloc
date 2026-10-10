import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { obterPool } from '../db/cliente.js';

const BCRYPT_ROUNDS = 12;

export class EmailJaCadastradoError extends Error {
  constructor() {
    super('E-mail já cadastrado.');
    this.name = 'EmailJaCadastradoError';
  }
}

export interface PerfilRegistro {
  nome_responsavel: string;
  nome_empresa: string;
  tipo_participante?: 'fornecedor' | 'produtor' | 'envasador' | 'admin';
  cnpj?: string;
}

export async function registrarUsuario(
  email: string,
  senha: string,
  perfil: PerfilRegistro,
): Promise<{ id: number; email: string }> {
  const emailNorm = email.toLowerCase().trim();
  const senhaHash = await bcrypt.hash(senha, BCRYPT_ROUNDS);

  try {
    const res = await obterPool().query<{ id: number; email: string }>(
      `INSERT INTO usuarios (email, senha_hash, nome_responsavel, nome_empresa, tipo_participante, cnpj)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email`,
      [emailNorm, senhaHash, perfil.nome_responsavel.trim(), perfil.nome_empresa.trim(), perfil.tipo_participante, perfil.cnpj ?? null],
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

export async function buscarCarteiraPorEmail(
  email: string,
): Promise<{ usuarioId: number; address: string } | null> {
  const emailNorm = email.toLowerCase().trim();

  const res = await obterPool().query<{ usuario_id: number; address: string }>(
    `SELECT cv.usuario_id, cv.address
     FROM carteiras_vinculadas cv
     JOIN usuarios u ON u.id = cv.usuario_id
     WHERE u.email = $1
     LIMIT 1`,
    [emailNorm],
  );

  if (res.rows.length === 0) return null;
  return { usuarioId: res.rows[0].usuario_id, address: res.rows[0].address };
}

export async function gerarTokenRedefinicao(usuarioId: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expira = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  await obterPool().query(
    `UPDATE usuarios SET reset_token = $1, reset_token_expira_em = $2 WHERE id = $3`,
    [tokenHash, expira, usuarioId],
  );

  return token;
}

export async function redefinirSenha(token: string, novaSenha: string): Promise<boolean> {
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const res = await obterPool().query<{ id: number }>(
    `SELECT id FROM usuarios WHERE reset_token = $1 AND reset_token_expira_em > now()`,
    [tokenHash],
  );

  if (res.rows.length === 0) return false;

  const senhaHash = await bcrypt.hash(novaSenha, BCRYPT_ROUNDS);

  await obterPool().query(
    `UPDATE usuarios
     SET senha_hash = $1, reset_token = NULL, reset_token_expira_em = NULL
     WHERE id = $2`,
    [senhaHash, res.rows[0].id],
  );

  return true;
}
