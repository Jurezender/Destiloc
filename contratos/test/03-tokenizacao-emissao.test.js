const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const {
  Etapa,
  SEQ_CACHACA,
  CID,
  CID_INVALIDO,
  implantar,
  concluirLote,
} = require("./apoio");

// Grupo C — Emissão das garrafas
// Critérios C1 e C6 da Seção 5.6.1
describe("C. ContratoTokenizacao — emissao", function () {
  it("C01 emite garrafa de lote com producao concluida", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx);

    await expect(ctx.tokenizacao.emitirGarrafa(loteId, CID.a)).to.emit(
      ctx.tokenizacao,
      "GarrafaEmitida"
    );
    expect(await ctx.tokenizacao.loteDoToken(1)).to.equal(loteId);
    expect(await ctx.tokenizacao.tokenURI(1)).to.equal(CID.a);
  });

  it("C02 rejeita emissao antes da conclusao do lote", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.lote.registrarLote("cachaca", "Cana", SEQ_CACHACA);
    await ctx.lote.registrarEtapaProdutiva(1, Etapa.RecebimentoMateriaPrima, "Burarama", "");
    await ctx.lote.registrarEtapaProdutiva(1, Etapa.TransformacaoDestilacao, "Burarama", "");

    await expect(ctx.tokenizacao.emitirGarrafa(1, CID.a)).to.be.revertedWith(
      "Producao do lote nao concluida"
    );
    expect(await ctx.tokenizacao.totalEmitidas()).to.equal(0n);
  });

  it("C03 rejeita emissao para lote inexistente", async function () {
    const ctx = await loadFixture(implantar);
    await expect(ctx.tokenizacao.emitirGarrafa(999, CID.a)).to.be.revertedWith("Lote inexistente");
  });

  it("C04 rejeita emissao por conta que nao e o fabricante do lote", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx);
    await expect(
      ctx.tokenizacao.connect(ctx.fabricante2).emitirGarrafa(loteId, CID.a)
    ).to.be.revertedWith("Apenas o fabricante do lote");
  });

  it("C05 rejeita emissao por conta sem papel de fabricante", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx);
    await expect(
      ctx.tokenizacao.connect(ctx.semPapel).emitirGarrafa(loteId, CID.a)
    ).to.be.revertedWithCustomError(ctx.tokenizacao, "AccessControlUnauthorizedAccount");
  });

  it("C06 token e emitido para o fabricante do lote", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx, SEQ_CACHACA, ctx.fabricante2);
    await ctx.tokenizacao.connect(ctx.fabricante2).emitirGarrafa(loteId, CID.a);
    expect(await ctx.tokenizacao.ownerOf(1)).to.equal(ctx.fabricante2.address);
  });

  it("C07 emitirGarrafasEmLote cria identificadores sequenciais", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx);
    await ctx.tokenizacao.emitirGarrafasEmLote(loteId, [CID.a, CID.b, CID.c]);

    expect(await ctx.tokenizacao.totalEmitidas()).to.equal(3n);
    for (let i = 1; i <= 3; i++) {
      expect(await ctx.tokenizacao.loteDoToken(i)).to.equal(loteId);
      expect(await ctx.tokenizacao.ownerOf(i)).to.equal(ctx.fabricante.address);
    }
    expect(await ctx.tokenizacao.tokenURI(2)).to.equal(CID.b);
  });

  it("C08 atomicidade: referencia invalida em qualquer posicao impede toda a emissao", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx);

    await expect(
      ctx.tokenizacao.emitirGarrafasEmLote(loteId, [CID.a, CID_INVALIDO.semPrefixo, CID.c])
    ).to.be.revertedWith("Referencia de metadados fora do formato ipfs://");

    expect(await ctx.tokenizacao.totalEmitidas()).to.equal(0n);
    expect(await ctx.tokenizacao.existeGarrafa(1)).to.equal(false);
  });

  it("C09 atomicidade: o contador de identificadores nao avanca apos reversao", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx);

    await ctx.tokenizacao.emitirGarrafasEmLote(loteId, [CID.a, CID.b]);
    expect(await ctx.tokenizacao.totalEmitidas()).to.equal(2n);

    await expect(
      ctx.tokenizacao.emitirGarrafasEmLote(loteId, [CID.c, CID_INVALIDO.curto])
    ).to.be.reverted;
    expect(await ctx.tokenizacao.totalEmitidas()).to.equal(2n);

    // O próximo identificador continua sendo o 3, sem lacuna nem repetição.
    await ctx.tokenizacao.emitirGarrafa(loteId, CID.c);
    expect(await ctx.tokenizacao.totalEmitidas()).to.equal(3n);
    expect(await ctx.tokenizacao.existeGarrafa(3)).to.equal(true);
  });

  it("C10 rejeita lista de referencias vazia e acima do maximo", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx);

    await expect(ctx.tokenizacao.emitirGarrafasEmLote(loteId, [])).to.be.revertedWith(
      "Lista de referencias vazia"
    );

    const excesso = new Array(51).fill(CID.a);
    await expect(ctx.tokenizacao.emitirGarrafasEmLote(loteId, excesso)).to.be.revertedWith(
      "Excede o maximo por transacao"
    );
  });

  it("C11 rejeita tokenURI fora do formato ipfs://", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx);

    for (const invalido of [
      CID_INVALIDO.vazio,
      CID_INVALIDO.semPrefixo,
      CID_INVALIDO.prefixoErrado,
      CID_INVALIDO.curto,
    ]) {
      await expect(ctx.tokenizacao.emitirGarrafa(loteId, invalido)).to.be.revertedWith(
        "Referencia de metadados fora do formato ipfs://"
      );
    }
  });

  it("C12 existeGarrafa responde corretamente para emitida e nao emitida", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx);

    expect(await ctx.tokenizacao.existeGarrafa(1)).to.equal(false);
    await ctx.tokenizacao.emitirGarrafa(loteId, CID.a);
    expect(await ctx.tokenizacao.existeGarrafa(1)).to.equal(true);
    expect(await ctx.tokenizacao.existeGarrafa(2)).to.equal(false);
  });

  it("C13 dadosDaGarrafa reune lote, referencia e fabricante em uma leitura", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx);
    await ctx.tokenizacao.emitirGarrafa(loteId, CID.a);

    const dados = await ctx.tokenizacao.dadosDaGarrafa(1);
    expect(dados.loteId).to.equal(loteId);
    expect(dados.uri).to.equal(CID.a);
    expect(dados.fabricante).to.equal(ctx.fabricante.address);

    await expect(ctx.tokenizacao.dadosDaGarrafa(99)).to.be.revertedWith("Garrafa inexistente");
  });
});
