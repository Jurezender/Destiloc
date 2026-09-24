// TODO(shared-package): ABIs e endereços virão de packages/contratos/ quando extraídos.
// Por ora são cópias locais em src/blockchain/abi/ e src/blockchain/enderecos/.

import { Contract, JsonRpcProvider } from "ethers";
import type { InterfaceAbi } from "ethers";
import { createRequire } from "module";
import { obterConfiguracaoRede } from "./redes.js";

// createRequire resolve caminhos relativos a este arquivo, compatível com ESM + NodeNext.
const require = createRequire(import.meta.url);

export type NomeContrato =
  | "ContratoAcesso"
  | "ContratoInsumos"
  | "ContratoProducao"
  | "ContratoEnvasamento";

interface RegistroEnderecos {
  rede: string;
  momento: string;
  enderecos: Record<NomeContrato, string>;
}

const abis: Record<NomeContrato, InterfaceAbi> = {
  ContratoAcesso:      require("./abi/ContratoAcesso.json") as InterfaceAbi,
  ContratoInsumos:     require("./abi/ContratoInsumos.json") as InterfaceAbi,
  ContratoProducao:    require("./abi/ContratoProducao.json") as InterfaceAbi,
  ContratoEnvasamento: require("./abi/ContratoEnvasamento.json") as InterfaceAbi,
};

const registros: Record<string, RegistroEnderecos> = {
  localhost: require("./enderecos/localhost.json") as RegistroEnderecos,
  sepolia:   require("./enderecos/sepolia.json") as RegistroEnderecos,
};

export class ContratosIndisponiveisError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ContratosIndisponiveisError";
  }
}

export function obterProvider(chainId: number): JsonRpcProvider {
  const config = obterConfiguracaoRede(chainId);
  if (!config || !config.urlRpc) {
    throw new ContratosIndisponiveisError(
      `Rede desconhecida ou sem RPC configurado (chainId ${chainId}).`
    );
  }
  return new JsonRpcProvider(config.urlRpc);
}

export function obterContrato(nome: NomeContrato, chainId: number): Contract {
  const config = obterConfiguracaoRede(chainId);
  const registro = config ? registros[config.nome] : undefined;
  if (!registro) {
    throw new ContratosIndisponiveisError(
      config
        ? `Contratos não implantados na rede "${config.rotulo}". Rode o deploy e exporte os endereços.`
        : `Rede desconhecida (chainId ${chainId}).`
    );
  }
  const provider = obterProvider(chainId);
  return new Contract(registro.enderecos[nome], abis[nome], provider);
}
