import { describe, it, expect } from "vitest";
import { Contract, JsonRpcProvider } from "ethers";
import {
  obterProvider,
  obterContrato,
  ContratosIndisponiveisError,
  type NomeContrato,
} from "./contratos.js";

// Endereços do localhost.json — confirmam que o JSON carregou corretamente.
const ENDERECOS_LOCAL: Record<NomeContrato, string> = {
  ContratoAcesso:      "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  ContratoInsumos:     "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  ContratoProducao:    "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  ContratoEnvasamento: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
};

const CHAIN_LOCAL   = 31337;
const CHAIN_SEPOLIA = 11155111;
const CHAIN_INVALIDO = 99999;

const CONTRATOS: NomeContrato[] = [
  "ContratoAcesso",
  "ContratoInsumos",
  "ContratoProducao",
  "ContratoEnvasamento",
];

describe("blockchain/redes", () => {
  it("obterProvider retorna JsonRpcProvider para rede local", () => {
    const provider = obterProvider(CHAIN_LOCAL);
    expect(provider).toBeInstanceOf(JsonRpcProvider);
  });

  it("obterProvider retorna JsonRpcProvider para Sepolia quando RPC_URL_SEPOLIA está definido", () => {
    process.env.RPC_URL_SEPOLIA = "https://sepolia.example.com";
    const provider = obterProvider(CHAIN_SEPOLIA);
    expect(provider).toBeInstanceOf(JsonRpcProvider);
    delete process.env.RPC_URL_SEPOLIA;
  });

  it("obterProvider lança ContratosIndisponiveisError para chainId desconhecido", () => {
    expect(() => obterProvider(CHAIN_INVALIDO)).toThrow(ContratosIndisponiveisError);
  });
});

describe("blockchain/contratos", () => {
  it.each(CONTRATOS)("obterContrato('%s') retorna Contract para rede local", (nome) => {
    const contrato = obterContrato(nome, CHAIN_LOCAL);
    expect(contrato).toBeInstanceOf(Contract);
  });

  it.each(CONTRATOS)("obterContrato('%s') tem o endereço correto do localhost.json", (nome) => {
    const contrato = obterContrato(nome, CHAIN_LOCAL);
    // Contract.target em ethers v6 retorna o endereço tal como fornecido
    expect((contrato.target as string).toLowerCase()).toBe(
      ENDERECOS_LOCAL[nome].toLowerCase()
    );
  });

  it("obterContrato lança ContratosIndisponiveisError para chainId desconhecido", () => {
    expect(() => obterContrato("ContratoEnvasamento", CHAIN_INVALIDO)).toThrow(
      ContratosIndisponiveisError
    );
  });

  it("cada Contract tem interface com pelo menos uma função", () => {
    for (const nome of CONTRATOS) {
      const contrato = obterContrato(nome, CHAIN_LOCAL);
      const fragmentos = contrato.interface.fragments;
      expect(fragmentos.length).toBeGreaterThan(0);
    }
  });
});
