const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Implantação dos três contratos, na ordem de dependência.
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
  const lote = await implantar("ContratoLote");
  const tokenizacao = await implantar("ContratoTokenizacao", [await lote.getAddress()]);
  await implantar("ContratoRastreamento", [await tokenizacao.getAddress()]);

  const destino = path.join(__dirname, "..", `implantacao-${network.name}.json`);
  fs.writeFileSync(destino, JSON.stringify(registro, null, 2));

  console.log(`Registro salvo em ${destino}`);
  console.log("\nProximo passo: conceder os papeis as contas de teste.");
  console.log("O numero do bloco do ContratoLote serve de ancora para as");
  console.log("consultas por eventos feitas pela interface.");
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
