import type { FastifyPluginAsync } from 'fastify';
import { obterPool } from '../db/cliente.js';

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
  app.get<{ Params: { address: string } }>('/carteiras/:address', async (req, reply) => {
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
  });

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
