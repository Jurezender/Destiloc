const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Percorre programaticamente o fluxo completo pedido para a integração,
 * contra um `hardhat node` já rodando (e já implantado com
 * `npm run deploy:local`). Serve como checagem automatizada da lógica de
 * ponta a ponta, independente da interface React — a interface percorre a
 * mesma sequência, mas por meio da MetaMask.
 *
 * Ordem: participantes e papéis -> lote e sequência -> etapas de produção ->
 * conclusão no engarrafamento -> emissão da garrafa -> expedição ->
 * confirmação de recebimento -> consulta do histórico.
 */

const Etapa = {
  RecebimentoMateriaPrima: 0,
  TransformacaoDestilacao: 1,
  Envelhecimento: 2,
  Finalizacao: 3,
  Engarrafamento: 4,
};

const SEQUENCIA = [Etapa.RecebimentoMateriaPrima, Etapa.TransformacaoDestilacao, Etapa.Envelhecimento, Etapa.Engarrafamento];

// Referência sintaticamente válida (CIDv1 base32, 59 caracteres), no mesmo
// formato usado pelos testes de contrato. Não depende de um daemon Kubo.
const CID_GARRAFA = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzda";

function passo(titulo) {
  console.log(`\n— ${titulo} —`);
}

async function main() {
  const registroPath = path.join(__dirname, "..", `implantacao-${network.name}.json`);
  if (!fs.existsSync(registroPath)) {
    throw new Error(
      `Não encontrei ${registroPath}. Rode "npm run deploy:local" (com o hardhat node de pé) antes deste script.`
    );
  }
  const registro = JSON.parse(fs.readFileSync(registroPath, "utf8"));

  const [implantador, distribuidor, varejista] = await ethers.getSigners();

  const lote = await ethers.getContractAt("ContratoLote", registro.contratos.ContratoLote.endereco);
  const tokenizacao = await ethers.getContractAt(
    "ContratoTokenizacao",
    registro.contratos.ContratoTokenizacao.endereco
  );
  const rastreamento = await ethers.getContractAt(
    "ContratoRastreamento",
    registro.contratos.ContratoRastreamento.endereco
  );

  passo("Participantes e papéis");
  const DISTRIBUIDOR_ROLE = await rastreamento.DISTRIBUIDOR_ROLE();
  const VAREJISTA_ROLE = await rastreamento.VAREJISTA_ROLE();
  await (await rastreamento.grantRole(DISTRIBUIDOR_ROLE, distribuidor.address)).wait();
  await (await rastreamento.grantRole(VAREJISTA_ROLE, varejista.address)).wait();
  console.log(`Distribuidor: ${distribuidor.address}`);
  console.log(`Varejista:    ${varejista.address}`);

  passo("Cadastro do lote e sequência produtiva");
  const txLote = await lote.registrarLote("cachaça", "Cana — Fazenda Burarama", SEQUENCIA);
  await txLote.wait();
  const loteId = await lote.totalLotes();
  console.log(`Lote #${loteId} registrado, com ${SEQUENCIA.length} etapas declaradas.`);

  passo("Registro das etapas de produção, na ordem declarada");
  for (const etapa of SEQUENCIA) {
    const tx = await lote.registrarEtapaProdutiva(loteId, etapa, "Alambique Burarama", "");
    await tx.wait();
  }
  const concluida = await lote.producaoConcluida(loteId);
  console.log(`Produção concluída: ${concluida}`);
  if (!concluida) throw new Error("A produção deveria estar concluída após percorrer toda a sequência.");

  passo("Emissão da garrafa");
  const txEmissao = await tokenizacao.emitirGarrafa(loteId, CID_GARRAFA);
  await txEmissao.wait();
  const tokenId = await tokenizacao.totalEmitidas();
  console.log(`Garrafa #${tokenId} emitida, referência: ${CID_GARRAFA}`);

  passo("Expedição (fabricante -> distribuidor)");
  const txExpedicao = await rastreamento.expedir(tokenId, distribuidor.address, "CD Cachoeiro de Itapemirim");
  await txExpedicao.wait();
  console.log(`Expedida para ${distribuidor.address}.`);

  passo("Confirmação de recebimento");
  const txConfirmacao = await rastreamento
    .connect(distribuidor)
    .confirmarRecebimento(tokenId, "CD Cachoeiro de Itapemirim");
  await txConfirmacao.wait();
  const custodianteAtual = await rastreamento.custodianteAtual(tokenId);
  console.log(`Custodiante atual: ${custodianteAtual}`);
  if (custodianteAtual.toLowerCase() !== distribuidor.address.toLowerCase()) {
    throw new Error("O custodiante deveria ser o distribuidor após a confirmação.");
  }

  passo("Consulta do histórico (produção + custódia), como a página pública faz");
  const historicoProducao = await lote.historicoProducao(loteId);
  const historicoCustodia = await rastreamento.getHistorico(tokenId);
  console.log(`Eventos de produção: ${historicoProducao.length}`);
  console.log(`Eventos de custódia: ${historicoCustodia.length}`);

  const { chainId } = await ethers.provider.getNetwork();

  console.log(`\nFluxo completo executado com sucesso na rede "${network.name}".`);
  console.log(`Lote #${loteId}, garrafa #${tokenId}.`);
  console.log(`Consulta pública equivalente: /consulta/${chainId}/${tokenId}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
