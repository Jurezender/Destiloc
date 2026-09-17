import { describe, it, expect } from 'vitest';
import { calcularHashConteudo } from '../src/servicos/hash.js';

describe('calcularHashConteudo', () => {
  it('retorna string hex SHA-256 com 64 caracteres', () => {
    const hash = calcularHashConteudo({ tipo: 'insumo', versao: 1 });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignora geradoEm — timestamps diferentes produzem o mesmo hash', () => {
    const base = { tipo: 'insumo', versao: 1, tipoInsumo: 'Milho amarelo' };
    const h1 = calcularHashConteudo({ ...base, geradoEm: '2024-01-01T00:00:00.000Z' });
    const h2 = calcularHashConteudo({ ...base, geradoEm: '2026-09-17T15:00:00.000Z' });
    expect(h1).toBe(h2);
  });

  it('objetos com as mesmas chaves em ordem diferente produzem o mesmo hash', () => {
    const h1 = calcularHashConteudo({ b: 2, a: 1, tipo: 'insumo' });
    const h2 = calcularHashConteudo({ a: 1, tipo: 'insumo', b: 2 });
    expect(h1).toBe(h2);
  });

  it('canonicaliza chaves aninhadas recursivamente', () => {
    const h1 = calcularHashConteudo({ tipo: 'insumo', config: { z: 1, y: 2 } });
    const h2 = calcularHashConteudo({ tipo: 'insumo', config: { y: 2, z: 1 } });
    expect(h1).toBe(h2);
  });

  it('conteúdos distintos produzem hashes diferentes', () => {
    const h1 = calcularHashConteudo({ tipo: 'insumo', versao: 1 });
    const h2 = calcularHashConteudo({ tipo: 'envasamento', versao: 1 });
    expect(h1).not.toBe(h2);
  });

  it('é determinístico — mesma entrada sempre produz o mesmo hash', () => {
    const conteudo = {
      tipo: 'lote-producao',
      tipoBebida: 'Gin',
      configuracao: { maturacaoAplicavel: false },
    };
    expect(calcularHashConteudo(conteudo)).toBe(calcularHashConteudo(conteudo));
  });
});
