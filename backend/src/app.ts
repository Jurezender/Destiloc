import Fastify from 'fastify';
import cors from '@fastify/cors';
import carteiras from './rotas/carteiras.js';

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

  return app;
}
