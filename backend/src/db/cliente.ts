import pg from 'pg';

const { Pool } = pg;

let _pool: InstanceType<typeof Pool> | undefined;

// Retorna (ou cria) a conexão com o banco PostgreSQL. Leitura lazy: só conecta quando chamado.
export function obterPool(): InstanceType<typeof Pool> {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL não configurado. Copie .env.example para .env e preencha os valores.'
      );
    }
    _pool = new Pool({
      connectionString: url,
      max: 3,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    });
  }
  return _pool;
}
