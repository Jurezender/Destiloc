import type { FastifyPluginAsync } from 'fastify';
import { obterPool } from '../db/cliente.js';
import { exigirAdmin } from '../middlewares/autorizacao.js';
import { getAddress } from 'ethers';

const REGEX_ENDERECO = /^0x[0-9a-fA-F]{40}$/;

const admin: FastifyPluginAsync = async (app) => {
  app.get(
    '/admin/carteiras',
    { preHandler: [exigirAdmin] },
    async (_req, reply) => {
      const res = await obterPool().query<{
        address: string;
        vinculada_em: Date;
        usuario_email: string;
        nome_responsavel: string;
        nome_empresa: string;
        tipo_participante: string | null;
      }>(
        `SELECT cv.address, cv.vinculada_em,
                u.email AS usuario_email,
                u.nome_responsavel, u.nome_empresa, u.tipo_participante
         FROM carteiras_vinculadas cv
         JOIN usuarios u ON u.id = cv.usuario_id
         WHERE cv.status = 'pendente'
         ORDER BY cv.vinculada_em ASC`,
      );

      return reply.send({ carteiras: res.rows });
    },
  );

  app.get(
    '/admin/participantes',
    { preHandler: [exigirAdmin] },
    async (_req, reply) => {
      const res = await obterPool().query<{
        address: string;
        nome_responsavel: string;
        nome_empresa: string;
        tipo_participante: string | null;
      }>(
        `SELECT cv.address, u.nome_responsavel, u.nome_empresa, u.tipo_participante
         FROM carteiras_vinculadas cv
         JOIN usuarios u ON u.id = cv.usuario_id
         WHERE cv.status = 'autorizada'
         ORDER BY u.nome_responsavel, u.nome_empresa`,
      );
      return reply.send({ participantes: res.rows });
    },
  );

  app.patch<{
    Params: { address: string };
    Body: { status: 'autorizada' | 'revogada' };
  }>(
    '/admin/carteiras/:address/status',
    {
      preHandler: [exigirAdmin],
      schema: {
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['autorizada', 'revogada'] },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { address } = req.params;

      if (!REGEX_ENDERECO.test(address)) {
        return reply.status(400).send({ erro: 'Endereço inválido.' });
      }

      let addressNorm: string;
      try {
        addressNorm = getAddress(address);
      } catch {
        return reply.status(400).send({ erro: 'Endereço Ethereum inválido.' });
      }

      const { status } = req.body;
      const adminAddress = req.carteiraAddress!;

      const res = await obterPool().query<{ address: string; status: string }>(
        `UPDATE carteiras_vinculadas
         SET status = $1, revisada_em = now(), revisada_por = $2
         WHERE address = $3
         RETURNING address, status`,
        [status, adminAddress, addressNorm],
      );

      if (res.rows.length === 0) {
        return reply.status(404).send({ erro: 'Carteira não encontrada.' });
      }

      return reply.send(res.rows[0]);
    },
  );
};

export default admin;
