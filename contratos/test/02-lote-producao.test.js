const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const {
  Etapa,
  SEQ_CACHACA,
  SEQ_CACHACA_ENVELHECIDA,
  SEQ_GIN,
  CID,
  CID_INVALIDO,
  implantar,
  concluirLote,
} = require("./apoio");

// Grupo B — Avanço da produção do lote
// Critério C2 da Seção 5.6.1
describe("B. ContratoLote — avanco da producao", function () {
  it("B01 registra a sequencia declarada, na ordem, ate a conclusao", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.lote.registrarLote("cachaca", "Cana", SEQ_CACHACA_ENVELHECIDA);

    for (const etapa of SEQ_CACHACA_ENVELHECIDA) {
      await ctx.lote.registrarEtapaProdutiva(1, etapa, "Alambique Burarama", "");
    }

    const historico = await ctx.lote.historicoProducao(1);
    expect(historico.length).to.equal(4);
    expect(historico.map((e) => Number(e.etapa))).to.deep.equal(SEQ_CACHACA_ENVELHECIDA);
    expect(await ctx.lote.producaoConcluida(1)).to.equal(true);
  });

  it("B02 proximaEtapa indica corretamente a etapa seguinte", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.lote.registrarLote("gin", "Zimbro", SEQ_GIN);

    let proxima = await ctx.lote.proximaEtapa(1);
    expect(proxima.pendente).to.equal(true);
    expect(Number(proxima.etapa)).to.equal(Etapa.RecebimentoMateriaPrima);

    await ctx.lote.registrarEtapaProdutiva(1, Etapa.RecebimentoMateriaPrima, "Burarama", "");
    proxima = await ctx.lote.proximaEtapa(1);
    expect(Number(proxima.etapa)).to.equal(Etapa.TransformacaoDestilacao);

    await ctx.lote.registrarEtapaProdutiva(1, Etapa.TransformacaoDestilacao, "Burarama", "");
    proxima = await ctx.lote.proximaEtapa(1);
    expect(Number(proxima.etapa)).to.equal(Etapa.Finalizacao);
  });

  it("B03 rejeita etapa diferente da prevista pela sequencia", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.lote.registrarLote("cachaca", "Cana", SEQ_CACHACA);
    await expect(
      ctx.lote.registrarEtapaProdutiva(1, Etapa.Engarrafamento, "Burarama", "")
    ).to.be.revertedWith("Etapa diferente da prevista pela sequencia do lote");
  });

  it("B04 rejeita etapa opcional nao declarada na sequencia do lote", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.lote.registrarLote("cachaca", "Cana", SEQ_CACHACA);
    await ctx.lote.registrarEtapaProdutiva(1, Etapa.RecebimentoMateriaPrima, "Burarama", "");
    await ctx.lote.registrarEtapaProdutiva(1, Etapa.TransformacaoDestilacao, "Burarama", "");
    await expect(
      ctx.lote.registrarEtapaProdutiva(1, Etapa.Envelhecimento, "Burarama", "")
    ).to.be.revertedWith("Etapa diferente da prevista pela sequencia do lote");
  });

  it("B05 rejeita etapa registrada por fabricante de outro lote", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.lote.registrarLote("cachaca", "Cana", SEQ_CACHACA);
    await expect(
      ctx.lote
        .connect(ctx.fabricante2)
        .registrarEtapaProdutiva(1, Etapa.RecebimentoMateriaPrima, "Outro", "")
    ).to.be.revertedWith("Apenas o fabricante do lote");
  });

  it("B06 rejeita etapa registrada por conta sem papel de fabricante", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.lote.registrarLote("cachaca", "Cana", SEQ_CACHACA);
    await expect(
      ctx.lote
        .connect(ctx.semPapel)
        .registrarEtapaProdutiva(1, Etapa.RecebimentoMateriaPrima, "X", "")
    ).to.be.revertedWith("RBAC: apenas fabricante");
  });

  it("B07 rejeita etapa produtiva apos a conclusao da producao", async function () {
    const ctx = await loadFixture(implantar);
    const loteId = await concluirLote(ctx, SEQ_CACHACA);
    await expect(
      ctx.lote.registrarEtapaProdutiva(loteId, Etapa.Engarrafamento, "Burarama", "")
    ).to.be.revertedWith("Producao ja concluida");
  });

  it("B08 rejeita etapa para lote inexistente", async function () {
    const ctx = await loadFixture(implantar);
    await expect(
      ctx.lote.registrarEtapaProdutiva(999, Etapa.RecebimentoMateriaPrima, "X", "")
    ).to.be.revertedWith("Lote inexistente");
  });

  it("B09 producaoConcluida e dataConclusao mudam apenas no engarrafamento", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.lote.registrarLote("cachaca", "Cana", SEQ_CACHACA);

    await ctx.lote.registrarEtapaProdutiva(1, Etapa.RecebimentoMateriaPrima, "Burarama", "");
    await ctx.lote.registrarEtapaProdutiva(1, Etapa.TransformacaoDestilacao, "Burarama", "");
    expect(await ctx.lote.producaoConcluida(1)).to.equal(false);
    expect((await ctx.lote.obterLote(1)).dataConclusao).to.equal(0n);

    await expect(
      ctx.lote.registrarEtapaProdutiva(1, Etapa.Engarrafamento, "Burarama", "")
    ).to.emit(ctx.lote, "ProducaoConcluida");

    expect(await ctx.lote.producaoConcluida(1)).to.equal(true);
    expect((await ctx.lote.obterLote(1)).dataConclusao).to.be.greaterThan(0n);
  });

  it("B10 aceita referencia de metadados da etapa e rejeita formato invalido", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.lote.registrarLote("cachaca", "Cana", SEQ_CACHACA);

    await ctx.lote.registrarEtapaProdutiva(
      1,
      Etapa.RecebimentoMateriaPrima,
      "Fazenda Burarama",
      CID.documento
    );
    const historico = await ctx.lote.historicoProducao(1);
    expect(historico[0].metadadosEtapaURI).to.equal(CID.documento);

    for (const invalido of [
      CID_INVALIDO.semPrefixo,
      CID_INVALIDO.prefixoErrado,
      CID_INVALIDO.curto,
    ]) {
      await expect(
        ctx.lote.registrarEtapaProdutiva(1, Etapa.TransformacaoDestilacao, "Burarama", invalido)
      ).to.be.revertedWith("Referencia de metadados fora do formato ipfs://");
    }
  });

  it("B11 referencia de metadados vazia e aceita, por ser opcional", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.lote.registrarLote("cachaca", "Cana", SEQ_CACHACA);
    await ctx.lote.registrarEtapaProdutiva(1, Etapa.RecebimentoMateriaPrima, "Burarama", "");
    const historico = await ctx.lote.historicoProducao(1);
    expect(historico[0].metadadosEtapaURI).to.equal("");
  });
});
