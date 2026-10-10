import type { FastifyPluginAsync } from 'fastify';
import { registrarUsuario, autenticarUsuario, buscarCarteiraPorEmail, gerarTokenRedefinicao, redefinirSenha, EmailJaCadastradoError, type PerfilRegistro } from '../servicos/auth.js';
import {
  gerarChallenge,
  verificarChallenge,
  validarEndereco,
  normalizarEndereco,
  ChallengeInvalidoError,
  AssinaturaInvalidaError,
} from '../servicos/challenge.js';
import {
  vincularCarteira,
  buscarCarteiraVinculada,
  CarteiraDuplicadaError,
} from '../servicos/carteiraVinculada.js';
import { autenticarJWT } from '../middlewares/autorizacao.js';
import { obterPool } from '../db/cliente.js';

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const auth: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { email: string; senha: string } & PerfilRegistro }>(
    '/auth/registrar',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'senha', 'nome_responsavel', 'tipo_participante'],
          properties: {
            email: { type: 'string', minLength: 5 },
            senha: { type: 'string', minLength: 8 },
            nome_responsavel: { type: 'string', minLength: 2 },
            nome_empresa: { type: 'string' },
            tipo_participante: { type: 'string', enum: ['fornecedor', 'produtor', 'envasador', 'admin'] },
            cnpj: { type: 'string', minLength: 14 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { email, senha, nome_responsavel, nome_empresa, tipo_participante, cnpj } = req.body;

      if (!REGEX_EMAIL.test(email)) {
        return reply.status(400).send({ erro: 'E-mail inválido.' });
      }

      try {
        const usuario = await registrarUsuario(email, senha, { nome_responsavel, nome_empresa, tipo_participante, cnpj });
        return reply.status(201).send({ id: usuario.id, email: usuario.email });
      } catch (err) {
        if (err instanceof EmailJaCadastradoError) {
          return reply.status(409).send({ erro: 'E-mail já cadastrado.' });
        }
        throw err;
      }
    },
  );

  app.post<{ Body: { email: string; senha: string } }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'senha'],
          properties: {
            email: { type: 'string' },
            senha: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { email, senha } = req.body;

      const usuario = await autenticarUsuario(email, senha);
      if (!usuario) {
        return reply.status(401).send({ erro: 'E-mail ou senha incorretos.' });
      }

      const token = app.jwt.sign(
        { sub: usuario.id, email: usuario.email },
        { expiresIn: '24h' },
      );

      const carteira = await buscarCarteiraVinculada(usuario.id);

      return reply.send({
        token,
        usuario: { id: usuario.id, email: usuario.email },
        carteira,
      });
    },
  );

  app.get(
    '/auth/eu',
    { preHandler: [autenticarJWT] },
    async (req, reply) => {
      const usuarioId = req.user.sub;

      const res = await obterPool().query<{
        id: number;
        email: string;
        nome_responsavel: string;
        nome_empresa: string;
        tipo_participante: string | null;
      }>(
        `SELECT id, email, nome_responsavel, nome_empresa, tipo_participante
         FROM usuarios WHERE id = $1`,
        [usuarioId],
      );

      if (res.rows.length === 0) {
        return reply.status(404).send({ erro: 'Usuário não encontrado.' });
      }

      const carteira = await buscarCarteiraVinculada(usuarioId);
      return reply.send({ usuario: res.rows[0], carteira });
    },
  );

  app.post<{ Body: { address: string } }>(
    '/auth/carteira/challenge',
    {
      preHandler: [autenticarJWT],
      schema: {
        body: {
          type: 'object',
          required: ['address'],
          properties: {
            address: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { address } = req.body;

      if (!validarEndereco(address)) {
        return reply.status(400).send({ erro: 'Endereço Ethereum inválido.' });
      }

      const usuarioId = req.user.sub;
      const addressNorm = normalizarEndereco(address);

      const existente = await obterPool().query<{ usuario_id: number }>(
        `SELECT usuario_id FROM carteiras_vinculadas WHERE address = $1`,
        [addressNorm],
      );
      if (existente.rows.length > 0 && existente.rows[0].usuario_id !== usuarioId) {
        return reply.status(409).send({ erro: 'Carteira já vinculada a outra conta.' });
      }

      const { mensagem, nonce } = await gerarChallenge(usuarioId, addressNorm);
      return reply.send({ mensagem, nonce });
    },
  );

  app.post<{ Body: { nonce: string; assinatura: string } }>(
    '/auth/carteira/verificar',
    {
      preHandler: [autenticarJWT],
      schema: {
        body: {
          type: 'object',
          required: ['nonce', 'assinatura'],
          properties: {
            nonce: { type: 'string' },
            assinatura: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { nonce, assinatura } = req.body;
      const usuarioId = req.user.sub;

      try {
        const { address } = await verificarChallenge(usuarioId, nonce, assinatura);
        const carteira = await vincularCarteira(usuarioId, address);
        return reply.status(201).send({
          address: carteira.address,
          status: carteira.status,
        });
      } catch (err) {
        if (err instanceof ChallengeInvalidoError || err instanceof AssinaturaInvalidaError) {
          return reply.status(422).send({ erro: (err as Error).message });
        }
        if (err instanceof CarteiraDuplicadaError) {
          return reply.status(409).send({ erro: (err as Error).message });
        }
        throw err;
      }
    },
  );
  // Etapa 0: gera challenge de reset (sem JWT — usuário ainda não está logado)
  app.post<{ Body: { email: string } }>(
    '/auth/esqueci-senha/challenge',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string' } },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const resultado = await buscarCarteiraPorEmail(req.body.email);
      if (!resultado) {
        return reply.status(404).send({ erro: 'Nenhuma conta encontrada com este e-mail.' });
      }
      const { mensagem, nonce } = await gerarChallenge(resultado.usuarioId, resultado.address);
      return reply.send({ mensagem, nonce, address: resultado.address });
    },
  );

  // Etapa 2: valida assinatura e emite token de reset
  app.post<{ Body: { email: string; nonce: string; assinatura: string } }>(
    '/auth/esqueci-senha/verificar-carteira',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'nonce', 'assinatura'],
          properties: {
            email: { type: 'string' },
            nonce: { type: 'string' },
            assinatura: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { email, nonce, assinatura } = req.body;

      const resultado = await buscarCarteiraPorEmail(email);
      if (!resultado) {
        return reply.status(404).send({ erro: 'Nenhuma conta encontrada com este e-mail.' });
      }

      try {
        await verificarChallenge(resultado.usuarioId, nonce, assinatura);
      } catch (err) {
        if (err instanceof ChallengeInvalidoError || err instanceof AssinaturaInvalidaError) {
          return reply.status(422).send({ erro: (err as Error).message });
        }
        throw err;
      }

      const token = await gerarTokenRedefinicao(resultado.usuarioId);
      return reply.send({ token });
    },
  );

  // Etapa 3: salva nova senha usando o token emitido na etapa 2
  app.post<{ Body: { token: string; novaSenha: string } }>(
    '/auth/redefinir-senha',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token', 'novaSenha'],
          properties: {
            token: { type: 'string', minLength: 64, maxLength: 64 },
            novaSenha: { type: 'string', minLength: 8 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const sucesso = await redefinirSenha(req.body.token, req.body.novaSenha);
      if (!sucesso) {
        return reply.status(400).send({ erro: 'Sessão de redefinição expirada. Comece novamente.' });
      }
      return reply.send({ ok: true });
    },
  );
};

export default auth;
