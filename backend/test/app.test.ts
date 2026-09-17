import { describe, it, expect } from 'vitest';
import { construirApp } from '../src/app.js';

describe('scaffold do backend', () => {
  it('constrói o app sem erros', async () => {
    const app = await construirApp();
    expect(app).toBeDefined();
    await app.close();
  });

  it('GET /health responde 200 com status ok', async () => {
    const app = await construirApp();
    const resposta = await app.inject({ method: 'GET', url: '/health' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
