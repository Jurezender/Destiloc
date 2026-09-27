import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/cliente.js', () => ({ obterPool: vi.fn() }));
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$hash'),
    compare: vi.fn(),
  },
}));

import { registrarUsuario, autenticarUsuario, EmailJaCadastradoError } from './auth.js';
import { obterPool } from '../db/cliente.js';
import bcrypt from 'bcryptjs';

const mockPool = () => {
  const query = vi.fn();
  vi.mocked(obterPool).mockReturnValue({ query } as never);
  return query;
};

describe('registrarUsuario', () => {
  beforeEach(() => vi.clearAllMocks());

  it('insere usuário e retorna id e email', async () => {
    const query = mockPool();
    query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com' }] });

    const resultado = await registrarUsuario('A@B.COM', 'senha123');
    expect(resultado).toEqual({ id: 1, email: 'a@b.com' });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO usuarios'),
      ['a@b.com', '$hash'],
    );
  });

  it('normaliza email para lowercase', async () => {
    const query = mockPool();
    query.mockResolvedValueOnce({ rows: [{ id: 2, email: 'user@example.com' }] });
    await registrarUsuario('User@Example.COM', 'senha123');
    expect(query).toHaveBeenCalledWith(expect.any(String), ['user@example.com', '$hash']);
  });

  it('lança EmailJaCadastradoError em conflito único', async () => {
    const query = mockPool();
    query.mockRejectedValueOnce({ code: '23505' });
    await expect(registrarUsuario('a@b.com', 'senha')).rejects.toBeInstanceOf(
      EmailJaCadastradoError,
    );
  });

  it('repropaga outros erros do banco', async () => {
    const query = mockPool();
    query.mockRejectedValueOnce(new Error('conexão perdida'));
    await expect(registrarUsuario('a@b.com', 'senha')).rejects.toThrow('conexão perdida');
  });
});

describe('autenticarUsuario', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna null quando email não encontrado', async () => {
    const query = mockPool();
    query.mockResolvedValueOnce({ rows: [] });
    expect(await autenticarUsuario('nao@existe.com', 'senha')).toBeNull();
  });

  it('retorna null quando senha errada', async () => {
    const query = mockPool();
    query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'a@b.com', senha_hash: '$hash' }],
    });
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);
    expect(await autenticarUsuario('a@b.com', 'errada')).toBeNull();
  });

  it('retorna usuario quando credenciais corretas', async () => {
    const query = mockPool();
    query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'a@b.com', senha_hash: '$hash' }],
    });
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);
    const res = await autenticarUsuario('a@b.com', 'correta');
    expect(res).toEqual({ id: 1, email: 'a@b.com' });
  });
});
