import type { FastifyPluginAsync } from 'fastify';
import { obterPool } from '../db/cliente.js';

const denuncia: FastifyPluginAsync = async (app) => {
  // Permite qualquer pessoa (sem autenticação) denunciar um lote suspeito.
  app.post<{
    Body: {
      chainId: number;
      loteId: string;
      tokenId: string;
      motivo: string;
      localConsumo?: string;
      dataConsumo?: string;
    };
  }>(
    '/denuncia',
    {
      schema: {
        body: {
          type: 'object',
          required: ['chainId', 'loteId', 'tokenId', 'motivo'],
          properties: {
            chainId:      { type: 'integer', minimum: 1 },
            loteId:       { type: 'string', minLength: 1 },
            tokenId:      { type: 'string', minLength: 1 },
            motivo:       { type: 'string', minLength: 10, maxLength: 1000 },
            localConsumo: { type: 'string', maxLength: 200 },
            dataConsumo:  { type: 'string', format: 'date' },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { chainId, loteId, tokenId, motivo, localConsumo, dataConsumo } = req.body;

      await obterPool().query(
        `INSERT INTO denuncias (chain_id, lote_id, token_id, motivo, local_consumo, data_consumo)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [chainId, loteId, tokenId, motivo, localConsumo ?? null, dataConsumo ?? null],
      );

      return reply.status(201).send({ mensagem: 'Denúncia registrada com sucesso.' });
    },
  );
};

export default denuncia;
