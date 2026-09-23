import 'dotenv/config';
import { construirApp } from '../src/app.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Instância cacheada: recriada apenas em cold start, reutilizada em warm starts.
let appPromise: ReturnType<typeof construirApp> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!appPromise) appPromise = construirApp();
  const app = await appPromise;
  app.server.emit('request', req, res);
}
