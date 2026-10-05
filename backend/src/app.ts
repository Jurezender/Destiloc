import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import carteiras from './rotas/carteiras.js';
import ipfs from './rotas/ipfs.js';
import garrafa from './rotas/garrafa.js';
import scans from './rotas/scans.js';
import auth from './rotas/auth.js';
import admin from './rotas/admin.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: number; email: string };
    user: { sub: number; email: string };
  }
}

export async function construirApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  });

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB por arquivo
  });

  const jwtSecret = process.env.JWT_SECRET ?? 'secret-apenas-para-testes-nunca-em-producao';
  if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'test') {
    throw new Error('JWT_SECRET não configurado. Defina a variável de ambiente.');
  }
  await app.register(jwt, { secret: jwtSecret });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  await app.register(auth);
  await app.register(admin);
  await app.register(carteiras);
  await app.register(ipfs);
  await app.register(garrafa);
  await app.register(scans);

  return app;
}
