const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { TipoEvento, CID, implantar, loteComGarrafa, concluirLote } = require("./apoio");

// Grupo E — Custódia individual
// Critérios C2 e C3 da Seção 5.6.1
describe("E. ContratoRastreamento — custodia individual", function () {
  it("E01 custodiante inicial e o fabricante, derivado do titular do token", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    expect(await ctx.rastreamento.custodianteAtual(tokenId)).to.equal(ctx.fabricante.address);
    expect(await ctx.rastreamento.totalEventos(tokenId)).to.equal(0n);
  });

  it("E02 rejeita operacao sobre garrafa inexistente", async function () {
    const ctx = await loadFixture(implantar);
    await expect(ctx.rastreamento.custodianteAtual(999)).to.be.revertedWith("Garrafa inexistente");
    await expect(
      ctx.rastreamento.expedir(999, ctx.distribuidor.address, "X")
    ).to.be.revertedWith("Garrafa inexistente");
  });

  it("E03 expedicao apenas pelo custodiante atual", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await expect(
      ctx.rastreamento
        .connect(ctx.distribuidor)
        .expedir(tokenId, ctx.varejista.address, "Centro de Distribuicao")
    ).to.be.revertedWith("Apenas o custodiante atual");
  });

  it("E04 fabricante expede para distribuidor", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await expect(
      ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Alambique Burarama")
    ).to.emit(ctx.rastreamento, "GarrafaExpedida");
  });

  it("E05 fabricante expede para varejista", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await expect(
      ctx.rastreamento.expedir(tokenId, ctx.varejista.address, "Alambique Burarama")
    ).to.emit(ctx.rastreamento, "GarrafaExpedida");
  });

  it("E06 distribuidor expede para outro distribuidor", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");
    await ctx.rastreamento.connect(ctx.distribuidor).confirmarRecebimento(tokenId, "CD Cachoeiro");

    await expect(
      ctx.rastreamento
        .connect(ctx.distribuidor)
        .expedir(tokenId, ctx.distribuidor2.address, "CD Cachoeiro")
    ).to.emit(ctx.rastreamento, "GarrafaExpedida");
  });

  it("E07 distribuidor expede para varejista", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");
    await ctx.rastreamento.connect(ctx.distribuidor).confirmarRecebimento(tokenId, "CD");

    await expect(
      ctx.rastreamento.connect(ctx.distribuidor).expedir(tokenId, ctx.varejista.address, "CD")
    ).to.emit(ctx.rastreamento, "GarrafaExpedida");
  });

  it("E08 varejista nao expede, e estado terminal no fluxo normal", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.varejista.address, "Burarama");
    await ctx.rastreamento.connect(ctx.varejista).confirmarRecebimento(tokenId, "Adega Centro");

    await expect(
      ctx.rastreamento.connect(ctx.varejista).expedir(tokenId, ctx.varejista2.address, "Adega")
    ).to.be.revertedWith("Transicao invalida: remetente sem papel que permita expedicao");
  });

  it("E09 rejeita expedicao para destinatario sem papel", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await expect(
      ctx.rastreamento.expedir(tokenId, ctx.semPapel.address, "Burarama")
    ).to.be.revertedWith("Transicao invalida: fabricante expede para distribuidor ou varejista");
  });

  it("E10 rejeita expedicao para o proprio remetente e para endereco nulo", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await expect(
      ctx.rastreamento.expedir(tokenId, ctx.fabricante.address, "Burarama")
    ).to.be.revertedWith("Destinatario igual ao remetente");
    await expect(
      ctx.rastreamento.expedir(tokenId, ethers.ZeroAddress, "Burarama")
    ).to.be.revertedWith("Destinatario invalido");
  });

  it("E11 custodia nao muda enquanto o recebimento nao e confirmado", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");

    expect(await ctx.rastreamento.custodianteAtual(tokenId)).to.equal(ctx.fabricante.address);
    const pendencia = await ctx.rastreamento.expedicaoPendente(tokenId);
    expect(pendencia.pendente).to.equal(true);
    expect(pendencia.destinatario).to.equal(ctx.distribuidor.address);
  });

  it("E12 somente o destinatario indicado confirma o recebimento", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");

    await expect(
      ctx.rastreamento.connect(ctx.distribuidor2).confirmarRecebimento(tokenId, "CD errado")
    ).to.be.revertedWith("Apenas o destinatario indicado");
    await expect(
      ctx.rastreamento.confirmarRecebimento(tokenId, "Burarama")
    ).to.be.revertedWith("Apenas o destinatario indicado");
  });

  it("E13 confirmacao atualiza o custodiante e encerra a pendencia", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");

    await expect(
      ctx.rastreamento.connect(ctx.distribuidor).confirmarRecebimento(tokenId, "CD Cachoeiro")
    ).to.emit(ctx.rastreamento, "RecebimentoConfirmado");

    expect(await ctx.rastreamento.custodianteAtual(tokenId)).to.equal(ctx.distribuidor.address);
    const pendencia = await ctx.rastreamento.expedicaoPendente(tokenId);
    expect(pendencia.pendente).to.equal(false);
    // O titular do token permanece inalterado: identidade nao e custodia.
    expect(await ctx.tokenizacao.ownerOf(tokenId)).to.equal(ctx.fabricante.address);
  });

  it("E14 rejeita segunda expedicao enquanto ha pendencia aberta", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");
    await expect(
      ctx.rastreamento.expedir(tokenId, ctx.varejista.address, "Burarama")
    ).to.be.revertedWith("Ja existe expedicao pendente");
  });

  it("E15 cancelamento encerra a pendencia e permite nova expedicao", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");

    await expect(
      ctx.rastreamento.cancelarExpedicao(tokenId, "Carga recusada na conferencia")
    ).to.emit(ctx.rastreamento, "ExpedicaoCancelada");

    expect((await ctx.rastreamento.expedicaoPendente(tokenId)).pendente).to.equal(false);
    expect(await ctx.rastreamento.custodianteAtual(tokenId)).to.equal(ctx.fabricante.address);

    await expect(
      ctx.rastreamento.expedir(tokenId, ctx.distribuidor2.address, "Burarama")
    ).to.emit(ctx.rastreamento, "GarrafaExpedida");
  });

  it("E16 cancelamento apenas pelo custodiante, e apenas com pendencia aberta", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await expect(ctx.rastreamento.cancelarExpedicao(tokenId, "sem pendencia")).to.be.revertedWith(
      "Nao existe expedicao pendente"
    );

    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");
    await expect(
      ctx.rastreamento.connect(ctx.distribuidor).cancelarExpedicao(tokenId, "tentativa")
    ).to.be.revertedWith("Apenas o custodiante atual");
  });

  it("E17 cadeia com dois intermediarios: fabricante, atacadista, distribuidor e varejo", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);

    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Alambique Burarama");
    await ctx.rastreamento.connect(ctx.distribuidor).confirmarRecebimento(tokenId, "Atacado Sul");

    await ctx.rastreamento
      .connect(ctx.distribuidor)
      .expedir(tokenId, ctx.distribuidor2.address, "Atacado Sul");
    await ctx.rastreamento
      .connect(ctx.distribuidor2)
      .confirmarRecebimento(tokenId, "CD Cachoeiro");

    await ctx.rastreamento
      .connect(ctx.distribuidor2)
      .expedir(tokenId, ctx.varejista.address, "CD Cachoeiro");
    await ctx.rastreamento.connect(ctx.varejista).confirmarRecebimento(tokenId, "Adega Centro");

    expect(await ctx.rastreamento.custodianteAtual(tokenId)).to.equal(ctx.varejista.address);

    const historico = await ctx.rastreamento.getHistorico(tokenId);
    expect(historico.length).to.equal(6);
    expect(historico.map((e) => Number(e.tipo))).to.deep.equal([
      TipoEvento.Expedicao,
      TipoEvento.Recebimento,
      TipoEvento.Expedicao,
      TipoEvento.Recebimento,
      TipoEvento.Expedicao,
      TipoEvento.Recebimento,
    ]);
    expect(historico[5].ator).to.equal(ctx.varejista.address);
    expect(historico[5].contraparte).to.equal(ctx.distribuidor2.address);
  });

  it("E18 situacaoCustodia reune custodiante, pendencia e total em uma leitura", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");

    const situacao = await ctx.rastreamento.situacaoCustodia(tokenId);
    expect(situacao.custodiante).to.equal(ctx.fabricante.address);
    expect(situacao.pendente).to.equal(true);
    expect(situacao.destinatario).to.equal(ctx.distribuidor.address);
    expect(situacao.eventos).to.equal(1n);
  });
});
