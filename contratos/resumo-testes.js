const { execSync } = require("child_process");

const grupos = [
  {
    letra: "A",
    nome: "ContratoLote — cadastro e validação estrutural",
    filtro: "ContratoLote — cadastro"
  },
  {
    letra: "B",
    nome: "ContratoLote — avanço da produção",
    filtro: "avanco da producao"
  },
  {
    letra: "C",
    nome: "ContratoTokenizacao — emissão",
    filtro: "ContratoTokenizacao — emissao"
  },
  {
    letra: "D",
    nome: "ContratoTokenizacao — não transferibilidade",
    filtro: "nao transferibilidade"
  },
  {
    letra: "E",
    nome: "ContratoRastreamento — custódia individual",
    filtro: "custodia individual"
  },
  {
    letra: "F",
    nome: "Controle de acesso, revogação e renúncia",
    filtro: "Controle de acesso"
  },
  {
    letra: "G",
    nome: "Histórico e separação dos registros",
    filtro: "Historico"
  },
  {
    letra: "H",
    nome: "Exclusividade dos papéis operacionais",
    filtro: "Exclusividade"
  },
  {
    letra: "I",
    nome: "Revogação durante expedição pendente",
    filtro: "Revogacao durante expedicao"
  }
];

let total = 0;
let falhou = false;

console.log("\nRESUMO DA SUÍTE DE TESTES\n");

for (const grupo of grupos) {
  try {
    const comando =
      `npx.cmd hardhat test --grep "${grupo.filtro}"`;

    const saida = execSync(comando, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    const resultado = saida.match(/(\d+)\s+passing/);

    const quantidade = resultado
      ? Number(resultado[1])
      : 0;

    total += quantidade;

    const titulo =
      `${grupo.letra}. ${grupo.nome}`;

    console.log(
      `${titulo.padEnd(65, ".")} ${quantidade}/${quantidade}`
    );

  } catch (erro) {
    falhou = true;

    const titulo =
      `${grupo.letra}. ${grupo.nome}`;

    console.log(
      `${titulo.padEnd(65, ".")} FALHOU`
    );
  }
}

console.log("".padEnd(72, "-"));

if (!falhou) {
  console.log(
    `${"TOTAL".padEnd(65, ".")} ${total}/${total}`
  );
} else {
  console.log("Há grupos com falha. Verifique a suíte.");
}

console.log("");