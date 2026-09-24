import Fastify from 'fastify';
import cors from '@fastify/cors';
import carteiras from './rotas/carteiras.js';
import ipfs from './rotas/ipfs.js';
import garrafa from './rotas/garrafa.js';

export async function construirApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  await app.register(carteiras);
  await app.register(ipfs);
  await app.register(garrafa);

  return app;
}
