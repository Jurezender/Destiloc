import { getAddress } from 'ethers';
import { obterPool } from '../db/cliente.js';

export type StatusCarteira = 'pendente' | 'autorizada' | 'revogada';

export interface CarteiraVinculada {
  address: string;
  status: StatusCarteira;
  vinculadaEm: Date;
}

export class CarteiraDuplicadaError extends Error {
  constructor() {
    super('Carteira já vinculada a outra conta.');
    this.name = 'CarteiraDuplicadaError';
  }
}

function obterAdminWallets(): string[] {
  return (process.env.ADMIN_WALLET ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

export async function vincularCarteira(
  usuarioId: number,
  address: string,
): Promise<CarteiraVinculada> {
  const addressNorm = getAddress(address);
  const pool = obterPool();

  const conflito = await pool.query<{ usuario_id: number }>(
    `SELECT usuario_id FROM carteiras_vinculadas WHERE address = $1`,
    [addressNorm],
  );
  if (conflito.rows.length > 0 && conflito.rows[0].usuario_id !== usuarioId) {
    throw new CarteiraDuplicadaError();
  }

  const adminWallets = obterAdminWallets();
  const statusInicial: StatusCarteira = adminWallets.includes(addressNorm.toLowerCase())
    ? 'autorizada'
    : 'pendente';

  const res = await pool.query<{
    address: string;
    status: string;
    vinculada_em: Date;
  }>(
    `INSERT INTO carteiras_vinculadas (usuario_id, address, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (address) DO UPDATE SET
       usuario_id   = EXCLUDED.usuario_id,
       status       = CASE
                        WHEN carteiras_vinculadas.status = 'revogada' THEN $3
                        ELSE carteiras_vinculadas.status
                      END,
       vinculada_em = now()
     RETURNING address, status, vinculada_em`,
    [usuarioId, addressNorm, statusInicial],
  );

  const row = res.rows[0];
  return {
    address: row.address,
    status: row.status as StatusCarteira,
    vinculadaEm: row.vinculada_em,
  };
}

export async function buscarCarteiraVinculada(
  usuarioId: number,
): Promise<{ address: string; status: StatusCarteira } | null> {
  const res = await obterPool().query<{ address: string; status: string }>(
    `SELECT address, status FROM carteiras_vinculadas WHERE usuario_id = $1 LIMIT 1`,
    [usuarioId],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return { address: row.address, status: row.status as StatusCarteira };
}
