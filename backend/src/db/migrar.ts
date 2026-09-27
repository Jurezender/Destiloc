import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  '001_usuarios.sql',
  '002_carteiras_vinculadas.sql',
  '003_auth_challenges.sql',
];

async function migrar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não configurado.');

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    for (const arquivo of MIGRATIONS) {
      const caminho = join(__dirname, 'migrations', arquivo);
      const sql = readFileSync(caminho, 'utf-8');
      console.log(`Aplicando ${arquivo}…`);
      await client.query(sql);
      console.log(`  OK`);
    }
    console.log('Migrations concluídas.');
  } finally {
    await client.end();
  }
}

migrar().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
