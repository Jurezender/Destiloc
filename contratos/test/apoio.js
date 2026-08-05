const { ethers } = require("hardhat");

/** Espelha o enum EtapaProdutiva de TiposCadeia.sol */
const Etapa = {
  RecebimentoMateriaPrima: 0,
  TransformacaoDestilacao: 1,
  Envelhecimento: 2,
  Finalizacao: 3,
  Engarrafamento: 4,
};

/** Espelha o enum TipoEventoCustodia de TiposCadeia.sol */
const TipoEvento = {
  Expedicao: 0,
  Recebimento: 1,
  Cancelamento: 2,
};

/** Sequências produtivas usadas nos testes. */
const SEQ_CACHACA = [
  Etapa.RecebimentoMateriaPrima,
  Etapa.TransformacaoDestilacao,
  Etapa.Engarrafamento,
];

const SEQ_CACHACA_ENVELHECIDA = [
  Etapa.RecebimentoMateriaPrima,
  Etapa.TransformacaoDestilacao,
  Etapa.Envelhecimento,
  Etapa.Engarrafamento,
];

const SEQ_UISQUE_DUPLO_AMADURECIMENTO = [
  Etapa.RecebimentoMateriaPrima,
  Etapa.TransformacaoDestilacao,
  Etapa.Envelhecimento,
  Etapa.Envelhecimento,
  Etapa.Engarrafamento,
];

const SEQ_MULTIPLOS_CICLOS = [
  Etapa.RecebimentoMateriaPrima,
  Etapa.TransformacaoDestilacao,
  Etapa.TransformacaoDestilacao,
  Etapa.Envelhecimento,
  Etapa.Engarrafamento,
];

const SEQ_GIN = [
  Etapa.RecebimentoMateriaPrima,
  Etapa.TransformacaoDestilacao,
  Etapa.Finalizacao,
  Etapa.Engarrafamento,
];

/** Referências ipfs:// sintaticamente válidas (CIDv1 base32, 59 caracteres). */
const CID = {
  a: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzda",
  b: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdb",
  c: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdc",
  documento: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdd",
};

/** Referências inválidas, usadas para exercitar a validação sintática. */
const CID_INVALIDO = {
  vazio: "",
  semPrefixo: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzda",
  prefixoErrado: "http://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbz",
  curto: "ipfs://Qm123",
};

async function implantar() {
  const [
    admin,
    fabricante2,
    distribuidor,
    distribuidor2,
    varejista,
    varejista2,
    semPapel,
    segundoAdmin,
  ] = await ethers.getSigners();

  const FabricaLote = await ethers.getContractFactory("ContratoLote");
  const lote = await FabricaLote.deploy();
  await lote.waitForDeployment();

  const FabricaTokenizacao = await ethers.getContractFactory("ContratoTokenizacao");
  const tokenizacao = await FabricaTokenizacao.deploy(await lote.getAddress());
  await tokenizacao.waitForDeployment();

  const FabricaRastreamento = await ethers.getContractFactory("ContratoRastreamento");
  const rastreamento = await FabricaRastreamento.deploy(await tokenizacao.getAddress());
  await rastreamento.waitForDeployment();

  const PAPEL = {
    admin: await lote.DEFAULT_ADMIN_ROLE(),
    fabricante: await lote.FABRICANTE_ROLE(),
    distribuidor: await rastreamento.DISTRIBUIDOR_ROLE(),
    varejista: await rastreamento.VAREJISTA_ROLE(),
  };

  // O implantador já é administrador e fabricante nos três contratos.
  // Um segundo fabricante, para exercitar a restrição por lote.
  await lote.grantRole(PAPEL.fabricante, fabricante2.address);
  await tokenizacao.grantRole(PAPEL.fabricante, fabricante2.address);
  await rastreamento.grantRole(PAPEL.fabricante, fabricante2.address);

  // Participantes da circulação, apenas no contrato de rastreamento.
  await rastreamento.grantRole(PAPEL.distribuidor, distribuidor.address);
  await rastreamento.grantRole(PAPEL.distribuidor, distribuidor2.address);
  await rastreamento.grantRole(PAPEL.varejista, varejista.address);
  await rastreamento.grantRole(PAPEL.varejista, varejista2.address);

  return {
    lote,
    tokenizacao,
    rastreamento,
    PAPEL,
    admin,
    fabricante: admin,
    fabricante2,
    distribuidor,
    distribuidor2,
    varejista,
    varejista2,
    semPapel,
    segundoAdmin,
  };
}

/** Registra um lote e percorre toda a sequência declarada. */
async function concluirLote(ctx, sequencia = SEQ_CACHACA, assinante = null) {
  const quem = assinante ?? ctx.fabricante;
  const contrato = ctx.lote.connect(quem);
  await contrato.registrarLote("cachaca", "Cana - Fazenda Burarama", sequencia);
  const loteId = await ctx.lote.totalLotes();

  for (const etapa of sequencia) {
    await contrato.registrarEtapaProdutiva(loteId, etapa, "Alambique Burarama", "");
  }
  return loteId;
}

/** Conclui um lote e emite uma garrafa, devolvendo os dois identificadores. */
async function loteComGarrafa(ctx, sequencia = SEQ_CACHACA) {
  const loteId = await concluirLote(ctx, sequencia);
  await ctx.tokenizacao.connect(ctx.fabricante).emitirGarrafa(loteId, CID.a);
  const tokenId = await ctx.tokenizacao.totalEmitidas();
  return { loteId, tokenId };
}

module.exports = {
  Etapa,
  TipoEvento,
  SEQ_CACHACA,
  SEQ_CACHACA_ENVELHECIDA,
  SEQ_UISQUE_DUPLO_AMADURECIMENTO,
  SEQ_MULTIPLOS_CICLOS,
  SEQ_GIN,
  CID,
  CID_INVALIDO,
  implantar,
  concluirLote,
  loteComGarrafa,
};
