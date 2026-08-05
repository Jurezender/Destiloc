const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const {
  SEQ_CACHACA_ENVELHECIDA,
  CID,
  implantar,
  concluirLote,
  loteComGarrafa,
} = require("./apoio");

// Grupo G — Histórico, separação de granularidade e imutabilidade
// Critérios C3 e C5 da Seção 5.6.1

/** Funções que alteram estado, extraídas da ABI do contrato. */
function escritasDaAbi(contrato) {
  return contrato.interface.fragments
    .filter((f) => f.type === "function")
    .filter((f) => f.stateMutability === "nonpayable" || f.stateMutability === "payable")
    .map((f) => f.name)
    .sort();
}

describe("G. Historico, separacao e imutabilidade", function () {
  it("G01 a interface publica nao expoe funcao de edicao ou exclusao de registros", async function () {
    const ctx = await loadFixture(implantar);

    expect(escritasDaAbi(ctx.lote)).to.deep.equal(
      ["grantRole", "registrarEtapaProdutiva", "registrarLote", "renounceRole", "revokeRole"].sort()
    );

    expect(escritasDaAbi(ctx.rastreamento)).to.deep.equal(
      [
        "cancelarExpedicao",
        "confirmarRecebimento",
        "expedir",
        "grantRole",
        "renounceRole",
        "revokeRole",
      ].sort()
    );

    // No contrato de tokenização, as funções de transferência do ERC-721
    // permanecem na interface por conformidade, mas revertem (Grupo D).
    expect(escritasDaAbi(ctx.tokenizacao)).to.deep.equal(
      [
        "approve",
        "emitirGarrafa",
        "emitirGarrafasEmLote",
        "grantRole",
        "renounceRole",
        "revokeRole",
        "safeTransferFrom",
        "safeTransferFrom",
        "setApprovalForAll",
        "transferFrom",
      ].sort()
    );
  });

  it("G02 cada historico devolve os eventos na ordem de insercao", async function () {
    const ctx = await loadFixture(implantar);
    const { loteId, tokenId } = await loteComGarrafa(ctx, SEQ_CACHACA_ENVELHECIDA);

    const producao = await ctx.lote.historicoProducao(loteId);
    for (let i = 1; i < producao.length; i++) {
      expect(producao[i].timestamp).to.be.greaterThanOrEqual(producao[i - 1].timestamp);
    }

    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");
    await ctx.rastreamento.connect(ctx.distribuidor).confirmarRecebimento(tokenId, "CD");
    const custodia = await ctx.rastreamento.getHistorico(tokenId);
    expect(custodia[0].ator).to.equal(ctx.fabricante.address);
    expect(custodia[1].ator).to.equal(ctx.distribuidor.address);
  });

  it("G03 garrafas do mesmo lote compartilham a producao e mantem custodias independentes", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx, SEQ_CACHACA_ENVELHECIDA);
    await ctx.tokenizacao.emitirGarrafasEmLote(loteId, [CID.a, CID.b]);

    // Mesma origem de produção para as duas unidades.
    expect(await ctx.tokenizacao.loteDoToken(1)).to.equal(loteId);
    expect(await ctx.tokenizacao.loteDoToken(2)).to.equal(loteId);
    const producao = await ctx.lote.historicoProducao(loteId);
    expect(producao.length).to.equal(SEQ_CACHACA_ENVELHECIDA.length);

    // Percursos de custódia distintos.
    await ctx.rastreamento.expedir(1, ctx.distribuidor.address, "Burarama");
    await ctx.rastreamento.connect(ctx.distribuidor).confirmarRecebimento(1, "CD");
    await ctx.rastreamento.expedir(2, ctx.varejista.address, "Burarama");

    expect(await ctx.rastreamento.custodianteAtual(1)).to.equal(ctx.distribuidor.address);
    expect(await ctx.rastreamento.custodianteAtual(2)).to.equal(ctx.fabricante.address);
    expect(await ctx.rastreamento.totalEventos(1)).to.equal(2n);
    expect(await ctx.rastreamento.totalEventos(2)).to.equal(1n);
  });

  it("G04 historicos de lotes diferentes sao independentes", async function () {
    const ctx = await loadFixture(implantar);
    const primeiro = await concluirLote(ctx, SEQ_CACHACA_ENVELHECIDA);
    const segundo = await concluirLote(ctx);

    expect((await ctx.lote.historicoProducao(primeiro)).length).to.equal(4);
    expect((await ctx.lote.historicoProducao(segundo)).length).to.equal(3);
  });

  it("G05 a consulta do consumidor e somente de leitura, sem alterar estado", async function () {
    const ctx = await loadFixture(implantar);
    const { loteId, tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");
    await ctx.rastreamento.connect(ctx.distribuidor).confirmarRecebimento(tokenId, "CD");

    const blocoAntes = await ethers.provider.getBlockNumber();

    // As três leituras que compõem a consulta, feitas por uma conta sem papel.
    const leitor = ctx.semPapel;
    const dados = await ctx.tokenizacao.connect(leitor).dadosDaGarrafa(tokenId);
    const lote = await ctx.lote.connect(leitor).obterLote(dados.loteId);
    const producao = await ctx.lote.connect(leitor).historicoProducao(dados.loteId);
    const situacao = await ctx.rastreamento.connect(leitor).situacaoCustodia(tokenId);
    const custodia = await ctx.rastreamento.connect(leitor).getHistorico(tokenId);

    // Nenhum bloco foi produzido: nenhuma transação foi enviada.
    expect(await ethers.provider.getBlockNumber()).to.equal(blocoAntes);

    // E a consulta reúne as três fontes previstas na arquitetura.
    expect(dados.loteId).to.equal(loteId);
    expect(lote.tipoBebida).to.equal("cachaca");
    expect(producao.length).to.equal(3);
    expect(situacao.custodiante).to.equal(ctx.distribuidor.address);
    expect(custodia.length).to.equal(2);
  });
});
