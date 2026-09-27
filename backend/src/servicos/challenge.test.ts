import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Wallet } from 'ethers';

vi.mock('../db/cliente.js', () => ({ obterPool: vi.fn() }));

import {
  gerarChallenge,
  verificarChallenge,
  validarEndereco,
  normalizarEndereco,
  ChallengeInvalidoError,
  AssinaturaInvalidaError,
} from './challenge.js';
import { obterPool } from '../db/cliente.js';

// Chave privada pública do Hardhat/Anvil #0 — não é segredo
const CHAVE_PRIVADA = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const carteiraTest = new Wallet(CHAVE_PRIVADA);
const ADDR = carteiraTest.address;

const mockPool = () => {
  const query = vi.fn();
  vi.mocked(obterPool).mockReturnValue({ query } as never);
  return query;
};

describe('validarEndereco', () => {
  it('aceita endereço válido', () => {
    expect(validarEndereco(ADDR)).toBe(true);
  });
  it('rejeita string inválida', () => {
    expect(validarEndereco('nao-e-endereco')).toBe(false);
  });
});

describe('normalizarEndereco', () => {
  it('normaliza para checksum EIP-55', () => {
    expect(normalizarEndereco(ADDR.toLowerCase())).toBe(ADDR);
  });
});

describe('gerarChallenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invalida challenges anteriores e insere novo', async () => {
    const query = mockPool();
    query.mockResolvedValue({ rows: [] });

    const { mensagem, nonce } = await gerarChallenge(1, ADDR);

    expect(typeof nonce).toBe('string');
    expect(mensagem).toContain(nonce);
    expect(mensagem).toContain('Destiloc');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE auth_challenges'),
      [1, ADDR],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO auth_challenges'),
      expect.arrayContaining([1, ADDR]),
    );
  });
});

describe('verificarChallenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('valida assinatura correta e marca como usada', async () => {
    const query = mockPool();
    const expiraEm = new Date(Date.now() + 900_000);
    const nonce = 'test-nonce-uuid';
    const mensagem = `Destiloc: vincule sua carteira ao sistema.\nNonce: ${nonce}\nVálido até: ${expiraEm.toISOString()}`;
    const assinatura = await carteiraTest.signMessage(mensagem);

    query.mockResolvedValueOnce({
      rows: [{ id: 99, address: ADDR, mensagem, expira_em: expiraEm, usado_em: null }],
    });
    query.mockResolvedValueOnce({ rows: [] });

    const { address } = await verificarChallenge(1, nonce, assinatura);
    expect(address).toBe(ADDR);
  });

  it('lança ChallengeInvalidoError quando não encontrado', async () => {
    const query = mockPool();
    query.mockResolvedValueOnce({ rows: [] });
    await expect(verificarChallenge(1, 'nonce-inexistente', '0x')).rejects.toBeInstanceOf(
      ChallengeInvalidoError,
    );
  });

  it('lança ChallengeInvalidoError quando já usado', async () => {
    const query = mockPool();
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          address: ADDR,
          mensagem: 'msg',
          expira_em: new Date(Date.now() + 9000),
          usado_em: new Date(),
        },
      ],
    });
    await expect(verificarChallenge(1, 'nonce', '0x')).rejects.toBeInstanceOf(
      ChallengeInvalidoError,
    );
  });

  it('lança ChallengeInvalidoError quando expirado', async () => {
    const query = mockPool();
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          address: ADDR,
          mensagem: 'msg',
          expira_em: new Date(Date.now() - 1000),
          usado_em: null,
        },
      ],
    });
    await expect(verificarChallenge(1, 'nonce', '0x')).rejects.toBeInstanceOf(
      ChallengeInvalidoError,
    );
  });

  it('lança AssinaturaInvalidaError quando endereço não bate', async () => {
    const query = mockPool();
    const expiraEm = new Date(Date.now() + 900_000);
    const outraCarteira = Wallet.createRandom();
    const mensagem = `Destiloc: vincule sua carteira ao sistema.\nNonce: n\nVálido até: ${expiraEm.toISOString()}`;
    const assinaturaOutra = await outraCarteira.signMessage(mensagem);

    query.mockResolvedValueOnce({
      rows: [{ id: 1, address: ADDR, mensagem, expira_em: expiraEm, usado_em: null }],
    });

    await expect(verificarChallenge(1, 'n', assinaturaOutra)).rejects.toBeInstanceOf(
      AssinaturaInvalidaError,
    );
  });
});
