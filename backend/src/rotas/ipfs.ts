import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { obterPool } from '../db/cliente.js';
import { calcularHashConteudo } from '../servicos/hash.js';
import { fixarArquivoNoPinata, fixarJsonNoPinata } from '../servicos/pinata.js';
import { exigirCarteiraAutorizada } from '../middlewares/autorizacao.js';

const TIPOS_VALIDOS = [
  'insumo',
  'avaliacao-insumo',
  'correcao-documental',
  'invalidacao-insumo',
  'lote-producao',
  'etapa-producao',
  'conclusao-producao',
  'envasamento',
] as const;

const MIME_TYPES_VALIDOS = ['application/pdf', 'image/jpeg', 'image/png'] as const;

const ipfs: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { conteudo: Record<string, unknown>; tipo: string } }>(
    '/ipfs/upload',
    {
      preHandler: [exigirCarteiraAutorizada],
      schema: {
        body: {
          type: 'object',
          required: ['conteudo', 'tipo'],
          properties: {
            conteudo: { type: 'object' },
            tipo: { type: 'string', enum: TIPOS_VALIDOS },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { conteudo, tipo } = req.body;
      const hash = calcularHashConteudo(conteudo);
      const pool = obterPool();

      const cache = await pool.query<{ cid: string }>(
        'SELECT cid FROM ipfs_cache WHERE hash_conteudo = $1',
        [hash],
      );

      if (cache.rows.length > 0) {
        return reply.send({ cid: cache.rows[0].cid, origem: 'cache' });
      }

      let cid: string;
      try {
        cid = await fixarJsonNoPinata(conteudo, tipo);
      } catch (erro) {
        req.log.error(erro, 'Falha ao enviar ao Pinata');
        return reply.status(502).send({ erro: 'Falha ao comunicar com o serviço IPFS.' });
      }

      const tamanhoBytes = Buffer.byteLength(JSON.stringify(conteudo), 'utf8');
      await pool.query(
        `INSERT INTO ipfs_cache (hash_conteudo, cid, tipo, tamanho_bytes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (hash_conteudo) DO NOTHING`,
        [hash, cid, tipo, tamanhoBytes],
      );

      return reply.status(201).send({ cid, origem: 'pinata' });
    },
  );

  app.post(
    '/ipfs/upload-arquivo',
    { preHandler: [exigirCarteiraAutorizada] },
    async (req, reply) => {
      let arquivo: Awaited<ReturnType<typeof req.file>>;
      try {
        arquivo = await req.file();
      } catch {
        return reply.status(400).send({ erro: 'Envie o arquivo via multipart/form-data.' });
      }

      if (!arquivo) {
        return reply.status(400).send({ erro: 'Nenhum arquivo encontrado no corpo da requisição.' });
      }

      if (!(MIME_TYPES_VALIDOS as readonly string[]).includes(arquivo.mimetype)) {
        arquivo.file.resume();
        return reply.status(415).send({
          erro: 'Tipo de arquivo não permitido. Aceitos: PDF, JPG e PNG.',
        });
      }

      const buffer = await arquivo.toBuffer();
      const hash = createHash('sha256').update(buffer).digest('hex');
      const pool = obterPool();

      const cache = await pool.query<{ cid: string }>(
        'SELECT cid FROM ipfs_cache WHERE hash_conteudo = $1',
        [hash],
      );

      if (cache.rows.length > 0) {
        return reply.send({
          cid: cache.rows[0].cid,
          origem: 'cache',
          nome: arquivo.filename,
          mimeType: arquivo.mimetype,
        });
      }

      let cid: string;
      try {
        cid = await fixarArquivoNoPinata(buffer, arquivo.filename, arquivo.mimetype);
      } catch (erro) {
        req.log.error(erro, 'Falha ao enviar arquivo ao Pinata');
        return reply.status(502).send({ erro: 'Falha ao comunicar com o serviço IPFS.' });
      }

      await pool.query(
        `INSERT INTO ipfs_cache (hash_conteudo, cid, tipo, tamanho_bytes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (hash_conteudo) DO NOTHING`,
        [hash, cid, 'arquivo', buffer.byteLength],
      );

      return reply.status(201).send({
        cid,
        origem: 'pinata',
        nome: arquivo.filename,
        mimeType: arquivo.mimetype,
      });
    },
  );
};

export default ipfs;
