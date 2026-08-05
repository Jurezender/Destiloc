const fs = require("fs");
const path = require("path");

/**
 * Ponte entre os artefatos do Hardhat e a aplicação React em `frontend/`.
 *
 * Os três contratos implantáveis. `TiposCadeia` e `AcessoProtegido` não geram
 * contrato próprio (o segundo é abstrato, herdado pelos três), então não têm
 * ABI a exportar.
 */
const CONTRATOS_IMPLANTAVEIS = ["ContratoLote", "ContratoTokenizacao", "ContratoRastreamento"];

const RAIZ_CONTRATOS = path.join(__dirname, "..");
const DESTINO_FRONTEND = path.join(RAIZ_CONTRATOS, "..", "frontend", "src", "contracts");

function garantirDestino() {
  fs.mkdirSync(path.join(DESTINO_FRONTEND, "abi"), { recursive: true });
}

/**
 * Copia o array `abi` de cada contrato implantável dos artefatos de
 * compilação para `frontend/src/contracts/abi/<Nome>.json`. Não depende de
 * rede nem de implantação: só precisa de `npm run compile` ter rodado antes.
 */
function exportarABIs() {
  garantirDestino();
  const exportadas = [];

  for (const nome of CONTRATOS_IMPLANTAVEIS) {
    const artefato = path.join(RAIZ_CONTRATOS, "artifacts", "contracts", `${nome}.sol`, `${nome}.json`);
    if (!fs.existsSync(artefato)) {
      throw new Error(
        `Artefato de ${nome} não encontrado em ${artefato}. Rode "npm run compile" antes de exportar as ABIs.`
      );
    }
    const { abi } = JSON.parse(fs.readFileSync(artefato, "utf8"));
    const destino = path.join(DESTINO_FRONTEND, "abi", `${nome}.json`);
    fs.writeFileSync(destino, JSON.stringify(abi, null, 2));
    exportadas.push(destino);
  }

  return exportadas;
}

/**
 * Grava `frontend/src/contracts/enderecos.<rede>.json` com os endereços dos
 * três contratos implantados. `registro` é o mesmo objeto que `deploy.js` já
 * monta e salva em `implantacao-<rede>.json`; esta função só espelha os
 * endereços num formato mais simples de consumir pela interface.
 */
function exportarEnderecos(rede, registro) {
  garantirDestino();

  const enderecos = {};
  for (const nome of CONTRATOS_IMPLANTAVEIS) {
    const dados = registro.contratos[nome];
    if (!dados) {
      throw new Error(`Registro de implantação não contém o contrato ${nome}.`);
    }
    enderecos[nome] = dados.endereco;
  }

  const saida = {
    rede,
    momento: registro.momento,
    enderecos,
  };

  const destino = path.join(DESTINO_FRONTEND, `enderecos.${rede}.json`);
  fs.writeFileSync(destino, JSON.stringify(saida, null, 2));
  return destino;
}

module.exports = { CONTRATOS_IMPLANTAVEIS, exportarABIs, exportarEnderecos };

// Permite rodar como script direto: `npm run frontend:abi`.
if (require.main === module) {
  const arquivos = exportarABIs();
  console.log("ABIs exportadas para a interface React:");
  for (const arquivo of arquivos) console.log(`  ${arquivo}`);
}
