import type { FastifyRequest, FastifyReply } from 'fastify';
import { obterPool } from '../db/cliente.js';

declare module 'fastify' {
  interface FastifyRequest {
    carteiraAddress?: string;
  }
}

// Verifica se o token JWT enviado no cabeçalho é válido.
export async function autenticarJWT(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await req.jwtVerify();
  } catch {
    await reply.status(401).send({ erro: 'Token inválido ou ausente.' });
  }
}

// Exige JWT válido + carteira vinculada e aprovada pelo admin.
export async function exigirCarteiraAutorizada(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await autenticarJWT(req, reply);
  if (reply.sent) return;

  const usuarioId = req.user.sub;

  const res = await obterPool().query<{ address: string; status: string }>(
    `SELECT address, status FROM carteiras_vinculadas WHERE usuario_id = $1 LIMIT 1`,
    [usuarioId],
  );

  if (res.rows.length === 0) {
    await reply.status(403).send({ erro: 'Nenhuma carteira vinculada a esta conta.' });
    return;
  }

  const { address, status } = res.rows[0];

  if (status === 'pendente') {
    await reply.status(403).send({
      erro: 'Carteira aguardando autorização do administrador.',
      status: 'pendente',
    });
    return;
  }

  if (status === 'revogada') {
    await reply.status(403).send({
      erro: 'Acesso revogado. Entre em contato com o administrador.',
      status: 'revogada',
    });
    return;
  }

  // Disponibiliza o endereço para as rotas sem nova consulta ao banco.
  req.carteiraAddress = address;
}

// Exige carteira autorizada + papel de admin (via variável de ambiente ou banco).
export async function exigirAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await exigirCarteiraAutorizada(req, reply);
  if (reply.sent) return;

  const address = req.carteiraAddress!;

  const eAdmin = await verificarAdmin(address);
  if (!eAdmin) {
    await reply.status(403).send({ erro: 'Acesso restrito a administradores.' });
  }
}

// Retorna true se o endereço constar na variável ADMIN_WALLET ou na tabela carteiras_conhecidas como admin.
// ADMIN_WALLET no .env é o bootstrap — permite o primeiro admin antes de existir qualquer admin no banco.
async function verificarAdmin(address: string): Promise<boolean> {
  const adminWallets = (process.env.ADMIN_WALLET ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

  if (adminWallets.includes(address.toLowerCase())) return true;

  const res = await obterPool().query(
    `SELECT 1 FROM carteiras_conhecidas WHERE LOWER(address) = LOWER($1) AND papel_principal = 'admin'`,
    [address],
  );
  return res.rows.length > 0;
}
