/**
 * Prepara o compilador Solidity a partir do pacote npm "solc".
 *
 * QUANDO USAR. Normalmente não é necessário: o Hardhat baixa o compilador
 * sozinho na primeira compilação. Este script existe para ambientes cuja rede
 * bloqueia o repositório oficial binaries.soliditylang.org, e foi o caminho
 * utilizado durante a implementação deste protótipo.
 *
 * O QUE ELE FAZ. Copia o compilador distribuído pelo pacote npm "solc", na
 * mesma versão declarada em hardhat.config.js, para o cache local do Hardhat,
 * de modo que a compilação ocorra sem acesso à rede.
 *
 * SEGURANÇA. O script não faz nada quando o compilador nativo já está
 * instalado e operante, para não interferir em um ambiente que já funciona.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const VERSAO = "0.8.24";
const VERSAO_LONGA = "0.8.24+commit.e11b9ed9";

const cache = path.join(os.homedir(), ".cache", "hardhat-nodejs", "compilers-v2");
const dirWasm = path.join(cache, "wasm");
const dirNativo = path.join(cache, "linux-amd64");
const arquivoWasm = `soljson-v${VERSAO_LONGA}.js`;
const arquivoNativo = `solc-linux-amd64-v${VERSAO_LONGA}`;

function listaDeCompiladores(arquivo, plataforma) {
  return {
    builds: [
      {
        path: arquivo,
        version: VERSAO,
        build: "commit.e11b9ed9",
        longVersion: VERSAO_LONGA,
        keccak256: "0x0",
        urls: [],
        platform: plataforma,
      },
    ],
    releases: { [VERSAO]: arquivo },
    latestRelease: VERSAO,
  };
}

function nativoJaFunciona() {
  const binario = path.join(dirNativo, arquivoNativo);
  const marcador = `${binario}.does.not.work`;
  return fs.existsSync(binario) && fs.statSync(binario).size > 0 && !fs.existsSync(marcador);
}

function main() {
  if (nativoJaFunciona()) {
    console.log("O compilador nativo ja esta instalado e operante. Nada a fazer.");
    return;
  }

  const origem = require.resolve("solc/soljson.js");

  fs.mkdirSync(dirWasm, { recursive: true });
  fs.copyFileSync(origem, path.join(dirWasm, arquivoWasm));
  fs.writeFileSync(
    path.join(dirWasm, "list.json"),
    JSON.stringify(listaDeCompiladores(arquivoWasm, "wasm"), null, 2)
  );

  // Entrada nativa marcada como inoperante, para o Hardhat usar a versao wasm.
  fs.mkdirSync(dirNativo, { recursive: true });
  fs.writeFileSync(path.join(dirNativo, arquivoNativo), "");
  fs.writeFileSync(path.join(dirNativo, `${arquivoNativo}.does.not.work`), "");
  fs.writeFileSync(
    path.join(dirNativo, "list.json"),
    JSON.stringify(listaDeCompiladores(arquivoNativo, "linux-amd64"), null, 2)
  );

  console.log(`Compilador solc ${VERSAO} preparado a partir do pacote npm.`);
  console.log(`Cache: ${cache}`);
}

main();
