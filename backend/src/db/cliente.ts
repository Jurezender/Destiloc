import pg from 'pg';

const { Pool } = pg;

let _pool: InstanceType<typeof Pool> | undefined;

// Inicialização lazy — não falha em módulos que importam sem usar o pool (ex.: testes de rota sem banco)
export function obterPool(): InstanceType<typeof Pool> {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL não configurado. Copie .env.example para .env e preencha os valores.'
      );
    }
    _pool = new Pool({ connectionString: url });
  }
  return _pool;
}
