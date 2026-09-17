import 'dotenv/config';
import { construirApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = await construirApp();

try {
  await app.listen({ port: PORT, host: HOST });
} catch (erro) {
  app.log.error(erro);
  process.exit(1);
}
