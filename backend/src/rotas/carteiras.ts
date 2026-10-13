import type { FastifyPluginAsync } from 'fastify';
import { obterPool } from '../db/cliente.js';
import { exigirAdmin, exigirCarteiraAutorizada } from '../middlewares/autorizacao.js';

const REGEX_ENDERECO = /^0x[0-9a-fA-F]{40}$/;

interface RegistroCarteira {
  address: string;
  apelido: string;
  papel_principal: string | null;
  anotacoes: string | null;
  cadastrada_em: Date;
  atualizada_em: Date;
}

interface RegistroUpsert extends RegistroCarteira {
  inserido: boolean;
}

const carteiras: FastifyPluginAsync = async (app) => {
  // Lista todos os participantes com carteira autorizada (acessível a qualquer usuário autenticado).
  app.get(
    '/participantes',
    { preHandler: [exigirCarteiraAutorizada] },
    async (_req, reply) => {
      const res = await obterPool().query<{
        address: string;
        nome_responsavel: string;
        nome_empresa: string;
      }>(
        `SELECT cv.address, u.nome_responsavel, u.nome_empresa
         FROM carteiras_vinculadas cv
         JOIN usuarios u ON u.id = cv.usuario_id
         WHERE cv.status = 'autorizada'
         ORDER BY u.nome_responsavel, u.nome_empresa`,
      );
      return reply.send({ participantes: res.rows });
    },
  );

  // Busca os dados (apelido, papel) de uma carteira conhecida pelo endereço.
  app.get<{ Params: { address: string } }>(
    '/carteiras/:address',
    { preHandler: [exigirCarteiraAutorizada] },
    async (req, reply) => {
      const { address } = req.params;

      if (!REGEX_ENDERECO.test(address)) {
        return reply.status(400).send({ erro: 'Endereço de carteira inválido.' });
      }

      const resultado = await obterPool().query<RegistroCarteira>(
        `SELECT address, apelido, papel_principal, anotacoes, cadastrada_em, atualizada_em
         FROM carteiras_conhecidas
         WHERE address = $1`,
        [address],
      );

      if (resultado.rows.length === 0) {
        return reply.status(404).send({ erro: 'Carteira não encontrada.' });
      }

      return reply.send(resultado.rows[0]);
    },
  );

  // Cria ou atualiza o registro de uma carteira conhecida (apelido, papel, anotações). Só admin.
  app.put<{
    Params: { address: string };
    Body: {
      apelido: string;
      papel_principal?: 'admin' | 'fornecedor' | 'produtor' | 'envasador';
      anotacoes?: string;
    };
  }>(
    '/carteiras/:address',
    {
      preHandler: [exigirAdmin],
      schema: {
        body: {
          type: 'object',
          required: ['apelido'],
          properties: {
            apelido: { type: 'string', minLength: 1 },
            papel_principal: {
              type: 'string',
              enum: ['admin', 'fornecedor', 'produtor', 'envasador'],
            },
            anotacoes: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { address } = req.params;

      if (!REGEX_ENDERECO.test(address)) {
        return reply.status(400).send({ erro: 'Endereço de carteira inválido.' });
      }

      const { apelido, papel_principal = null, anotacoes = null } = req.body;

      const resultado = await obterPool().query<RegistroUpsert>(
        `INSERT INTO carteiras_conhecidas (address, apelido, papel_principal, anotacoes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (address) DO UPDATE SET
           apelido         = EXCLUDED.apelido,
           papel_principal = EXCLUDED.papel_principal,
           anotacoes       = EXCLUDED.anotacoes,
           atualizada_em   = now()
         RETURNING
           address, apelido, papel_principal, anotacoes, cadastrada_em, atualizada_em,
           (xmax = 0) AS inserido`,
        [address, apelido, papel_principal, anotacoes],
      );

      const { inserido, ...registro } = resultado.rows[0];
      return reply.status(inserido ? 201 : 200).send(registro);
    },
  );
};

export default carteiras;
