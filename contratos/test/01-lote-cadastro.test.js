const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const {
  Etapa,
  SEQ_CACHACA,
  SEQ_CACHACA_ENVELHECIDA,
  SEQ_UISQUE_DUPLO_AMADURECIMENTO,
  SEQ_MULTIPLOS_CICLOS,
  SEQ_GIN,
  implantar,
} = require("./apoio");

// Grupo A — Cadastro do lote e validação estrutural da sequência
// Critério C1 da Seção 5.6.1
describe("A. ContratoLote — cadastro e validacao estrutural da sequencia", function () {
  describe("sequencias aceitas", function () {
    it("A01 registra lote com a sequencia minima valida", async function () {
      const ctx = await loadFixture(implantar);
      await expect(ctx.lote.registrarLote("cachaca", "Cana - Burarama", SEQ_CACHACA)).to.emit(
        ctx.lote,
        "LoteRegistrado"
      );
      expect(await ctx.lote.totalLotes()).to.equal(1n);
      expect(await ctx.lote.totalEtapas(1)).to.equal(3n);
    });

    it("A02 registra lote com envelhecimento", async function () {
      const ctx = await loadFixture(implantar);
      await ctx.lote.registrarLote("cachaca", "Cana", SEQ_CACHACA_ENVELHECIDA);
      expect(await ctx.lote.totalEtapas(1)).to.equal(4n);
    });

    it("A03 registra lote com envelhecimento repetido", async function () {
      const ctx = await loadFixture(implantar);
      await ctx.lote.registrarLote("whisky", "Cevada", SEQ_UISQUE_DUPLO_AMADURECIMENTO);
      const sequencia = await ctx.lote.etapasDoLote(1);
      expect(sequencia.length).to.equal(5);
      expect(Number(sequencia[2])).to.equal(Etapa.Envelhecimento);
      expect(Number(sequencia[3])).to.equal(Etapa.Envelhecimento);
    });

    it("A04 registra lote com mais de um ciclo de transformacao e destilacao", async function () {
      const ctx = await loadFixture(implantar);
      await ctx.lote.registrarLote("whisky", "Cevada", SEQ_MULTIPLOS_CICLOS);
      const sequencia = await ctx.lote.etapasDoLote(1);
      expect(Number(sequencia[1])).to.equal(Etapa.TransformacaoDestilacao);
      expect(Number(sequencia[2])).to.equal(Etapa.TransformacaoDestilacao);
    });

    it("A05 registra lote com finalizacao", async function () {
      const ctx = await loadFixture(implantar);
      await ctx.lote.registrarLote("gin", "Zimbro e botanicos", SEQ_GIN);
      expect(await ctx.lote.totalEtapas(1)).to.equal(4n);
    });
  });

  describe("sequencias rejeitadas", function () {
    it("A06 rejeita sequencia vazia", async function () {
      const ctx = await loadFixture(implantar);
      await expect(ctx.lote.registrarLote("cachaca", "Cana", [])).to.be.revertedWith(
        "Sequencia: minimo de tres etapas"
      );
    });

    it("A07 rejeita sequencia que nao comeca em recebimento de materia-prima", async function () {
      const ctx = await loadFixture(implantar);
      const invalida = [
        Etapa.TransformacaoDestilacao,
        Etapa.Envelhecimento,
        Etapa.Engarrafamento,
      ];
      await expect(ctx.lote.registrarLote("cachaca", "Cana", invalida)).to.be.revertedWith(
        "Sequencia: deve comecar em recebimento de materia-prima"
      );
    });

    it("A08 rejeita sequencia sem transformacao e destilacao", async function () {
      const ctx = await loadFixture(implantar);
      const invalida = [
        Etapa.RecebimentoMateriaPrima,
        Etapa.Envelhecimento,
        Etapa.Engarrafamento,
      ];
      await expect(ctx.lote.registrarLote("cachaca", "Cana", invalida)).to.be.revertedWith(
        "Sequencia: exige transformacao e destilacao apos o recebimento"
      );
    });

    it("A09 rejeita sequencia que nao termina em engarrafamento", async function () {
      const ctx = await loadFixture(implantar);
      const invalida = [
        Etapa.RecebimentoMateriaPrima,
        Etapa.TransformacaoDestilacao,
        Etapa.Envelhecimento,
      ];
      await expect(ctx.lote.registrarLote("cachaca", "Cana", invalida)).to.be.revertedWith(
        "Sequencia: deve terminar em engarrafamento"
      );
    });

    it("A10 rejeita etapa opcional antes da destilacao", async function () {
      const ctx = await loadFixture(implantar);
      const invalida = [
        Etapa.RecebimentoMateriaPrima,
        Etapa.Envelhecimento,
        Etapa.TransformacaoDestilacao,
        Etapa.Engarrafamento,
      ];
      await expect(ctx.lote.registrarLote("cachaca", "Cana", invalida)).to.be.revertedWith(
        "Sequencia: exige transformacao e destilacao apos o recebimento"
      );
    });

    it("A11 rejeita recebimento repetido", async function () {
      const ctx = await loadFixture(implantar);
      const invalida = [
        Etapa.RecebimentoMateriaPrima,
        Etapa.TransformacaoDestilacao,
        Etapa.RecebimentoMateriaPrima,
        Etapa.Engarrafamento,
      ];
      await expect(ctx.lote.registrarLote("cachaca", "Cana", invalida)).to.be.revertedWith(
        "Sequencia: apos a destilacao apenas envelhecimento ou finalizacao"
      );
    });

    it("A12 rejeita engarrafamento em posicao intermediaria", async function () {
      const ctx = await loadFixture(implantar);
      const invalida = [
        Etapa.RecebimentoMateriaPrima,
        Etapa.TransformacaoDestilacao,
        Etapa.Engarrafamento,
        Etapa.Envelhecimento,
        Etapa.Engarrafamento,
      ];
      await expect(ctx.lote.registrarLote("cachaca", "Cana", invalida)).to.be.revertedWith(
        "Sequencia: apos a destilacao apenas envelhecimento ou finalizacao"
      );
    });

    it("A13 rejeita sequencia acima do maximo de etapas", async function () {
      const ctx = await loadFixture(implantar);
      const longa = [Etapa.RecebimentoMateriaPrima, Etapa.TransformacaoDestilacao];
      for (let i = 0; i < 11; i++) longa.push(Etapa.Envelhecimento);
      longa.push(Etapa.Engarrafamento);
      await expect(ctx.lote.registrarLote("cachaca", "Cana", longa)).to.be.revertedWith(
        "Sequencia: excede o maximo de etapas"
      );
    });

    it("A14 conta sem papel de fabricante nao registra lote", async function () {
      const ctx = await loadFixture(implantar);
      await expect(
        ctx.lote.connect(ctx.semPapel).registrarLote("cachaca", "Cana", SEQ_CACHACA)
      ).to.be.revertedWithCustomError(ctx.lote, "AccessControlUnauthorizedAccount");
    });
  });

  it("A15 obterLote devolve a sequencia exatamente como declarada", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.lote.registrarLote("gin", "Zimbro", SEQ_GIN);
    const dados = await ctx.lote.obterLote(1);
    const sequencia = await ctx.lote.etapasDoLote(1);

    expect(dados.tipoBebida).to.equal("gin");
    expect(dados.insumos).to.equal("Zimbro");
    expect(dados.fabricante).to.equal(ctx.fabricante.address);
    expect(dados.indiceAtual).to.equal(0n);
    expect(dados.dataConclusao).to.equal(0n);
    expect(sequencia.map(Number)).to.deep.equal(SEQ_GIN);
  });

  it("A16 obterLote rejeita lote inexistente", async function () {
    const ctx = await loadFixture(implantar);
    await expect(ctx.lote.obterLote(999)).to.be.revertedWith("Lote inexistente");
    expect(await ctx.lote.loteExiste(999)).to.equal(false);
  });
});
