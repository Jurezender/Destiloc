const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { exportarABIs, exportarEnderecos } = require("./exportar-frontend");

/**
 * Implantação dos quatro contratos, na ordem de dependência.
 *
 * ATENÇÃO. Este script AINDA NÃO FOI EXECUTADO em rede pública. A implantação
 * definitiva na Sepolia depende da aprovação integral da suíte local de testes
 * e de autorização expressa.
 *
 * O script registra, em arquivo, os dados exigidos pelo protocolo de
 * evidências: endereços dos contratos, hashes das transações, números dos
 * blocos e conta utilizada.
 */
async function main() {
  const [implantador] = await ethers.getSigners();
  const saldo = await ethers.provider.getBalance(implantador.address);

  console.log(`Rede:  ${network.name}`);
  console.log(`Conta: ${implantador.address}`);
  console.log(`Saldo: ${ethers.formatEther(saldo)} ETH\n`);

  const registro = {
    rede: network.name,
    implantador: implantador.address,
    momento: new Date().toISOString(),
    contratos: {},
  };

  async function implantar(nome, argumentos = []) {
    const contrato = await ethers.deployContract(nome, argumentos);
    await contrato.waitForDeployment();
    const transacao = contrato.deploymentTransaction();
    const recibo = await transacao.wait();

    registro.contratos[nome] = {
      endereco: await contrato.getAddress(),
      hashDaTransacao: transacao.hash,
      bloco: recibo.blockNumber,
      gasUtilizado: recibo.gasUsed.toString(),
      argumentos,
    };

    console.log(`${nome}`);
    console.log(`  endereco:  ${registro.contratos[nome].endereco}`);
    console.log(`  transacao: ${transacao.hash}`);
    console.log(`  bloco:     ${recibo.blockNumber}`);
    console.log(`  gas:       ${recibo.gasUsed.toString()}\n`);

    return contrato;
  }

  // A ordem é obrigatória: cada contrato só conhece os implantados antes dele.
  const acesso = await implantar("ContratoAcesso", [implantador.address]);
  const enderecoAcesso = await acesso.getAddress();

  const insumos = await implantar("ContratoInsumos", [enderecoAcesso]);
  const enderecoInsumos = await insumos.getAddress();

  const producao = await implantar("ContratoProducao", [enderecoAcesso, enderecoInsumos]);
  const enderecoProducao = await producao.getAddress();

  await implantar("ContratoEnvasamento", [enderecoAcesso, enderecoProducao]);

  const destino = path.join(__dirname, "..", `implantacao-${network.name}.json`);
  fs.writeFileSync(destino, JSON.stringify(registro, null, 2));

  console.log(`Registro salvo em ${destino}`);

  const arquivosABI = exportarABIs();
  const arquivoEnderecos = exportarEnderecos(network.name, registro);
  console.log("\nABIs e endereços exportados para a interface React:");
  for (const arquivo of arquivosABI) console.log(`  ${arquivo}`);
  console.log(`  ${arquivoEnderecos}`);

  console.log("\nNenhum papel operacional foi concedido automaticamente.");
  console.log("O administrador inicial do ContratoAcesso e a conta implantadora.");
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
