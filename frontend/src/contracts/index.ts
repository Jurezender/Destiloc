import { Contract, JsonRpcProvider } from "ethers";
import type { ContractRunner, InterfaceAbi } from "ethers";
import { REDES, obterConfiguracaoRede } from "./redes";
import type { ConfiguracaoRede } from "./redes";

export type NomeContrato =
  | "ContratoAcesso"
  | "ContratoInsumos"
  | "ContratoProducao"
  | "ContratoEnvasamento";

const NOMES_CONTRATOS: NomeContrato[] = [
  "ContratoAcesso",
  "ContratoInsumos",
  "ContratoProducao",
  "ContratoEnvasamento",
];

interface RegistroEnderecos {
  rede: string;
  momento: string;
  enderecos: Record<NomeContrato, string>;
}

/**
 * As ABIs e os endereços são gerados por `contratos/scripts/exportar-frontend.js`
 * (ABIs a cada `npm run compile` + `frontend:abi`, endereços a cada deploy) e
 * podem não existir ainda num clone novo do repositório. `import.meta.glob`
 * inclui só os arquivos que de fato existem no momento do build/dev, então a
 * ausência de um deles não quebra a aplicação inteira — vira um erro claro,
 * tratável em tela, na hora em que a interface tentar usar o contrato.
 */
const modulosAbi = import.meta.glob<{ default: InterfaceAbi }>("./abi/*.json", { eager: true });
const modulosEnderecos = import.meta.glob<{ default: RegistroEnderecos }>("./enderecos.*.json", {
  eager: true,
});

const abiPorNome: Partial<Record<NomeContrato, InterfaceAbi>> = {};
for (const caminho in modulosAbi) {
  const nome = caminho.match(/abi\/(.+)\.json$/)?.[1] as NomeContrato | undefined;
  if (nome) abiPorNome[nome] = modulosAbi[caminho].default;
}

const enderecosPorRede: Record<string, RegistroEnderecos> = {};
for (const caminho in modulosEnderecos) {
  const nomeRede = caminho.match(/enderecos\.(.+)\.json$/)?.[1];
  if (nomeRede) enderecosPorRede[nomeRede] = modulosEnderecos[caminho].default;
}

/**
 * Cobre os dois jeitos de "os contratos ainda não estão prontos nesta
 * máquina/rede": ABI não exportada (não rodou `npm run compile`) ou endereço
 * não exportado (essa rede ainda não foi implantada).
 */
export class ContratosIndisponiveisError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ContratosIndisponiveisError";
  }
}

function obterAbi(nome: NomeContrato): InterfaceAbi {
  const abi = abiPorNome[nome];
  if (!abi) {
    throw new ContratosIndisponiveisError(
      `ABI de ${nome} não encontrada. Rode "npm run compile" e "npm run frontend:abi" em contratos/.`
    );
  }
  return abi;
}

export function obterEnderecos(chainId: number): Record<NomeContrato, string> {
  const config = obterConfiguracaoRede(chainId);
  const registro = config ? enderecosPorRede[config.nome] : undefined;
  if (!registro) {
    throw new ContratosIndisponiveisError(
      config
        ? `Os contratos ainda não foram implantados (ou exportados) na rede "${config.rotulo}". Rode "npm run deploy:local" (ou deploy:sepolia) em contratos/.`
        : `Rede desconhecida (chainId ${chainId}). Conecte a MetaMask à Hardhat Local (31337) ou à Sepolia (11155111).`
    );
  }
  return registro.enderecos;
}

/** Instancia um contrato pronto para uso, com ABI + endereço da rede indicada. */
export function obterContrato(nome: NomeContrato, chainId: number, executor: ContractRunner): Contract {
  const enderecos = obterEnderecos(chainId);
  return new Contract(enderecos[nome], obterAbi(nome), executor);
}

/** Provider somente leitura, sem depender da MetaMask — usado na consulta pública. */
export function obterProviderPublico(chainId: number): JsonRpcProvider {
  const config = obterConfiguracaoRede(chainId);
  if (!config) {
    throw new ContratosIndisponiveisError(
      `Rede desconhecida (chainId ${chainId}). Suportadas: Hardhat Local (31337) e Sepolia (11155111).`
    );
  }
  return new JsonRpcProvider(config.urlRpcPublica);
}

export { NOMES_CONTRATOS, REDES, obterConfiguracaoRede };
export type { ConfiguracaoRede };
