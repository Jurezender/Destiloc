/**
 * Medição de custo por operação do Destiloc em uma rede de teste.
 *
 * COMO USAR (na pasta contratos):
 *   npx hardhat run scripts/medir-custos.js --network <nome da rede no hardhat.config.js>
 *
 * Variáveis opcionais (podem ser passadas na linha de comando ou no .env):
 *   REPETICOES       quantas vezes cada operação é executada (padrão 5)
 *   GARRAFAS         quantas garrafas são emitidas em emitirGarrafas (padrão 3)
 *   GAS_LIMIT_FIXO   se definido, fixa esse limite de gas em todas as transações.
 *                    Deixe em branco para o limite ser estimado pela rede.
 *
 * O QUE FAZ. Usa os contratos já implantados, lidos de implantacao-<rede>.json
 * (gerado por scripts/deploy.js). Na rede local (hardhat ou localhost), se esse
 * arquivo não existir, implanta contratos novos só para o teste. A carteira
 * usada é a mesma da implantação (PRIVATE_KEY do .env), que precisa ser a
 * administradora do ContratoAcesso. Ela recebe os papéis de fornecedor, produtor
 * e envasador (se ainda não os tiver), e executa o fluxo completo.
 *
 * O QUE MEDE em cada transação:
 *   gasUsado      gas consumido (recibo)
 *   gasLimite     limite de gas enviado na transação
 *   precoGas      preço efetivo do gas, em wei
 *   taxaRecibo    gasUsado x precoGas, em wei
 *   taxaSaldo     saldo antes menos saldo depois, em wei (a taxa realmente debitada)
 *   tempoMs       tempo entre o envio e a confirmação, em milissegundos
 *
 * SEGURANÇA. O script nunca imprime nem grava a chave privada nem a URL do RPC.
 * Recusa-se a rodar em redes principais (mainnets) conhecidas.
 */
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const REPETICOES = Number(process.env.REPETICOES || 5);
const GARRAFAS = BigInt(process.env.GARRAFAS || 3);
const GAS_LIMIT_FIXO = process.env.GAS_LIMIT_FIXO ? BigInt(process.env.GAS_LIMIT_FIXO) : null;

// Redes principais conhecidas. O script não roda nelas.
const MAINNETS = new Set([1n, 10n, 56n, 137n, 143n, 4326n, 8453n, 42161n, 59144n]);

const URI = {
  a: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzda",
  b: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdb",
  c: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdc",
  d: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdd",
};
const Bebida = { Vodca: 3 };
const Etapa = { Filtragem: 5 };
const TipoInsumo = { BaseAlcoolica: 2 };
const Resultado = { Aprovado: 1 };
const configVazia = {
  maturacaoAplicavel: false,
  retificacaoAplicavel: false,
  blendagemAplicavel: false,
  ajusteFinalAplicavel: false,
};

const amostras = {}; // nome da operação -> lista de medições
const falhas = [];

function eth(wei) {
  return ethers.formatEther(wei);
}

async function medir(nome, enviar) {
  const provedor = ethers.provider;
  const [conta] = await ethers.getSigners();
  const antes = await provedor.getBalance(conta.address);
  const t0 = process.hrtime.bigint();
  const tx = await enviar();
  const recibo = await tx.wait();
  const t1 = process.hrtime.bigint();
  const depois = await provedor.getBalance(conta.address);

  const precoGas = recibo.gasPrice ?? tx.gasPrice ?? 0n;
  const medicao = {
    hash: tx.hash,
    bloco: recibo.blockNumber,
    gasUsado: recibo.gasUsed.toString(),
    gasLimite: tx.gasLimit.toString(),
    precoGasWei: precoGas.toString(),
    taxaReciboWei: (recibo.gasUsed * precoGas).toString(),
    taxaSaldoWei: (antes - depois).toString(),
    tempoMs: Number((t1 - t0) / 1000000n),
  };
  (amostras[nome] ||= []).push(medicao);
  console.log(
    `  ${nome.padEnd(22)} gas ${medicao.gasUsado.padStart(9)}  taxa ${eth(medicao.taxaSaldoWei).padStart(22)} ETH  ${String(medicao.tempoMs).padStart(6)} ms`
  );
  return recibo;
}

function estat(valores) {
  const nums = valores.map(Number);
  const soma = nums.reduce((a, b) => a + b, 0);
  return { media: soma / nums.length, min: Math.min(...nums), max: Math.max(...nums) };
}

function lerIdDoEvento(recibo, contrato, nomeEvento) {
  for (const log of recibo.logs) {
    try {
      const parsed = contrato.interface.parseLog(log);
      if (parsed?.name === nomeEvento) return parsed.args[0];
    } catch {}
  }
  return null;
}

function resumir() {
  const resumo = {};
  for (const [nome, lista] of Object.entries(amostras)) {
    resumo[nome] = {
      execucoes: lista.length,
      gasUsado: estat(lista.map((m) => m.gasUsado)),
      taxaSaldoWei: estat(lista.map((m) => m.taxaSaldoWei)),
      taxaReciboWei: estat(lista.map((m) => m.taxaReciboWei)),
      tempoMs: estat(lista.map((m) => m.tempoMs)),
    };
  }
  return resumo;
}

async function obterContratos(conta) {
  const arquivo = path.join(__dirname, "..", `implantacao-${network.name}.json`);
  const local = network.name === "hardhat" || network.name === "localhost";
  if (fs.existsSync(arquivo)) {
    const reg = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    const c = reg.contratos;
    console.log(`Usando os contratos de ${path.basename(arquivo)}`);
    return {
      acesso: await ethers.getContractAt("ContratoAcesso", c.ContratoAcesso.endereco, conta),
      insumos: await ethers.getContractAt("ContratoInsumos", c.ContratoInsumos.endereco, conta),
      producao: await ethers.getContractAt("ContratoProducao", c.ContratoProducao.endereco, conta),
      envasamento: await ethers.getContractAt("ContratoEnvasamento", c.ContratoEnvasamento.endereco, conta),
      enderecos: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.endereco])),
    };
  }
  if (!local) {
    throw new Error(`Arquivo ${path.basename(arquivo)} não encontrado. Implante primeiro com scripts/deploy.js nesta rede.`);
  }
  console.log("Rede local sem arquivo de implantação: implantando contratos novos só para o teste.");
  const acesso = await ethers.deployContract("ContratoAcesso", [conta.address]);
  await acesso.waitForDeployment();
  const insumos = await ethers.deployContract("ContratoInsumos", [await acesso.getAddress()]);
  await insumos.waitForDeployment();
  const producao = await ethers.deployContract("ContratoProducao", [await acesso.getAddress(), await insumos.getAddress()]);
  await producao.waitForDeployment();
  const envasamento = await ethers.deployContract("ContratoEnvasamento", [await acesso.getAddress(), await producao.getAddress()]);
  await envasamento.waitForDeployment();
  return {
    acesso, insumos, producao, envasamento,
    enderecos: {
      ContratoAcesso: await acesso.getAddress(),
      ContratoInsumos: await insumos.getAddress(),
      ContratoProducao: await producao.getAddress(),
      ContratoEnvasamento: await envasamento.getAddress(),
    },
  };
}

async function main() {
  const [conta] = await ethers.getSigners();
  const rede = await ethers.provider.getNetwork();
  if (MAINNETS.has(rede.chainId)) {
    throw new Error(`Chain ID ${rede.chainId} é de uma rede principal. Este script só roda em redes de teste.`);
  }
  const saldoInicial = await ethers.provider.getBalance(conta.address);
  const inicio = new Date();

  console.log(`Rede:        ${network.name} (chain ID ${rede.chainId})`);
  console.log(`Carteira:    ${conta.address}`);
  console.log(`Saldo:       ${eth(saldoInicial)} ETH`);
  console.log(`Repetições:  ${REPETICOES}  |  Garrafas: ${GARRAFAS}  |  Gas limite fixo: ${GAS_LIMIT_FIXO ?? "estimado pela rede"}\n`);
  if (saldoInicial === 0n) throw new Error("Saldo zero. Peça moeda de teste na faucet da rede.");

  const ov = GAS_LIMIT_FIXO ? [{ gasLimit: GAS_LIMIT_FIXO }] : [];
  const { acesso, insumos, producao, envasamento, enderecos } = await obterContratos(conta);

  // Preparação (não medida): a carteira precisa ter os três papéis operacionais.
  const FORNECEDOR = await acesso.FORNECEDOR_ROLE();
  const PRODUTOR = await acesso.PRODUTOR_ROLE();
  const ENVASADOR = await acesso.ENVASADOR_ROLE();
  const ADMIN = await acesso.DEFAULT_ADMIN_ROLE();
  if (!(await acesso.hasRole(ADMIN, conta.address))) {
    throw new Error("A carteira não é administradora do ContratoAcesso. Use a mesma carteira da implantação.");
  }
  for (const papel of [FORNECEDOR, PRODUTOR, ENVASADOR]) {
    if (!(await acesso.hasRole(papel, conta.address))) {
      await (await acesso.grantRole(papel, conta.address, ...ov)).wait();
    }
  }

  console.log("Medições:");
  try {
    for (let i = 1; i <= REPETICOES; i++) {
      console.log(` Repetição ${i} de ${REPETICOES}`);

      // Concessão de papel a uma conta nova a cada repetição (mede o caso de primeira concessão).
      const novaConta = ethers.Wallet.createRandom().address;
      await medir("grantRole", () => acesso.grantRole(FORNECEDOR, novaConta, ...ov));

      const reciboInsumo = await medir("registrarLoteInsumo", () =>
        insumos.registrarLoteInsumo(TipoInsumo.BaseAlcoolica, 100n, conta.address, URI.a, ...ov));
      const insumoId = lerIdDoEvento(reciboInsumo, insumos, "LoteInsumoRegistrado");
      await medir("avaliarInsumo", () => insumos.avaliarInsumo(insumoId, Resultado.Aprovado, URI.b, ...ov));

      const reciboLote = await medir("criarLoteProducao", () => producao.criarLoteProducao(Bebida.Vodca, configVazia, URI.a, ...ov));
      const loteId = lerIdDoEvento(reciboLote, producao, "LoteProducaoCriado");
      await medir("vincularInsumoAoLote", () => producao.vincularInsumoAoLote(loteId, insumoId, ...ov));
      await medir("registrarEtapa", () =>
        producao.registrarEtapa(loteId, Etapa.Filtragem, [insumoId], [1n], 1, 2, URI.b, ...ov));
      await medir("concluirProducao", () => producao.concluirProducao(loteId, conta.address, URI.c, ...ov));

      const reciboEnv = await medir("registrarEnvasamento", () => envasamento.registrarEnvasamento(loteId, GARRAFAS, URI.a, ...ov));
      const envId = lerIdDoEvento(reciboEnv, envasamento, "EnvasamentoRegistrado");
      await medir("emitirGarrafas", () => envasamento.emitirGarrafas(envId, GARRAFAS, ...ov));

      // Cancelamento: usa um lote próprio (a criação desse lote não entra nas medições).
      const txCancelar = await (await producao.criarLoteProducao(Bebida.Vodca, configVazia, URI.a, ...ov)).wait();
      const loteCancelar = lerIdDoEvento(txCancelar, producao, "LoteProducaoCriado");
      await medir("cancelarLote", () => producao.cancelarLote(loteCancelar, URI.d, ...ov));
    }
  } catch (erro) {
    falhas.push(String(erro.shortMessage || erro.message));
    console.error(`\nERRO durante as medições: ${erro.shortMessage || erro.message}`);
    console.error("Os resultados parciais foram salvos.");
  }

  const saldoFinal = await ethers.provider.getBalance(conta.address);
  const saida = {
    rede: network.name,
    chainId: rede.chainId.toString(),
    carteira: conta.address,
    contratos: enderecos,
    inicio: inicio.toISOString(),
    fim: new Date().toISOString(),
    parametros: {
      repeticoes: REPETICOES,
      garrafas: GARRAFAS.toString(),
      gasLimiteFixo: GAS_LIMIT_FIXO ? GAS_LIMIT_FIXO.toString() : null,
    },
    saldoInicialWei: saldoInicial.toString(),
    saldoFinalWei: saldoFinal.toString(),
    falhas,
    resumo: resumir(),
    amostras,
  };
  const pasta = path.join(__dirname, "..", "medicoes");
  fs.mkdirSync(pasta, { recursive: true });
  const nome = `medicoes-${network.name}-${inicio.toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(path.join(pasta, nome), JSON.stringify(saida, null, 2));

  console.log("\nResumo (média por operação):");
  for (const [op, r] of Object.entries(saida.resumo)) {
    console.log(
      `  ${op.padEnd(22)} gas ${String(Math.round(r.gasUsado.media)).padStart(9)}  taxa ${eth(BigInt(Math.round(r.taxaSaldoWei.media))).padStart(22)} ETH  ${String(Math.round(r.tempoMs.media)).padStart(6)} ms`
    );
  }
  console.log(`\nGasto total de taxas na rede: ${eth(saldoInicial - saldoFinal)} ETH`);
  console.log(`Arquivo salvo em medicoes/${nome}`);
}

main().catch((e) => {
  console.error(e.shortMessage || e.message);
  process.exitCode = 1;
});
