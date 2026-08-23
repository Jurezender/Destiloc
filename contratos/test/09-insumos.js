const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const Tipo = {
  NaoDefinido: 0,
  MateriaPrimaAgricola: 1,
  BaseAlcoolica: 2,
  Agua: 3,
  Levedura: 4,
  Zimbro: 5,
  Botanico: 6,
  Outro: 7,
};

const Resultado = { NaoAvaliado: 0, Aprovado: 1, Rejeitado: 2 };

const URI = {
  a: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzda",
  b: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdb",
  c: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdc",
  d: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdd",
};

describe("K. ContratoInsumos", function () {
  async function implantar() {
    const [admin, fornecedor, fornecedor2, produtor, produtor2, multipapeis, semPapel] =
      await ethers.getSigners();

    const acesso = await ethers.deployContract("ContratoAcesso", [admin.address]);
    await acesso.waitForDeployment();
    const insumos = await ethers.deployContract("ContratoInsumos", [await acesso.getAddress()]);
    await insumos.waitForDeployment();

    const FORNECEDOR = await acesso.FORNECEDOR_ROLE();
    const PRODUTOR = await acesso.PRODUTOR_ROLE();
    await acesso.grantRole(FORNECEDOR, fornecedor.address);
    await acesso.grantRole(FORNECEDOR, fornecedor2.address);
    await acesso.grantRole(PRODUTOR, produtor.address);
    await acesso.grantRole(PRODUTOR, produtor2.address);
    await acesso.grantRole(FORNECEDOR, multipapeis.address);
    await acesso.grantRole(PRODUTOR, multipapeis.address);

    return {
      acesso,
      insumos,
      admin,
      fornecedor,
      fornecedor2,
      produtor,
      produtor2,
      multipapeis,
      semPapel,
      FORNECEDOR,
      PRODUTOR,
    };
  }

  async function cadastrar(ctx, assinante = ctx.fornecedor, tipo = Tipo.Agua, uri = URI.a) {
    await ctx.insumos.connect(assinante).registrarLoteInsumo(tipo, uri);
    return await ctx.insumos.totalLotesInsumo();
  }

  describe("implantacao", function () {
    it("aceita e armazena um ContratoAcesso valido", async function () {
      const ctx = await loadFixture(implantar);
      expect(await ctx.insumos.contratoAcesso()).to.equal(await ctx.acesso.getAddress());
    });

    it("rejeita address(0)", async function () {
      const fabrica = await ethers.getContractFactory("ContratoInsumos");
      await expect(fabrica.deploy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(fabrica, "ContratoAcessoInvalido");
    });

    it("rejeita EOA ou endereco sem codigo", async function () {
      const [conta] = await ethers.getSigners();
      const fabrica = await ethers.getContractFactory("ContratoInsumos");
      await expect(fabrica.deploy(conta.address))
        .to.be.revertedWithCustomError(fabrica, "ContratoAcessoInvalido");
    });
  });

  describe("cadastro", function () {
    it("fornecedor registra lote com autoria, timestamp e evento corretos", async function () {
      const ctx = await loadFixture(implantar);
      const tx = await ctx.insumos.connect(ctx.fornecedor).registrarLoteInsumo(Tipo.Agua, URI.a);
      await expect(tx).to.emit(ctx.insumos, "LoteInsumoRegistrado")
        .withArgs(1n, ctx.fornecedor.address, Tipo.Agua, URI.a, anyValue);
      const recibo = await tx.wait();
      const bloco = await ethers.provider.getBlock(recibo.blockNumber);
      const lote = await ctx.insumos.obterLoteInsumo(1);
      expect(lote.fornecedor).to.equal(ctx.fornecedor.address);
      expect(lote.tipo).to.equal(Tipo.Agua);
      expect(lote.metadataURI).to.equal(URI.a);
      expect(lote.registradoEm).to.equal(BigInt(bloco.timestamp));
    });

    it("nao fornecedor, admin e produtor sem FORNECEDOR_ROLE nao registram", async function () {
      const ctx = await loadFixture(implantar);
      for (const conta of [ctx.semPapel, ctx.admin, ctx.produtor]) {
        await expect(ctx.insumos.connect(conta).registrarLoteInsumo(Tipo.Agua, URI.a))
          .to.be.revertedWithCustomError(ctx.insumos, "SemPermissao");
      }
    });

    it("conta com multiplos papeis e FORNECEDOR_ROLE registra", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx, ctx.multipapeis);
      expect((await ctx.insumos.obterLoteInsumo(1)).fornecedor).to.equal(ctx.multipapeis.address);
    });

    it("IDs iniciam em 1 e sao sequenciais", async function () {
      const ctx = await loadFixture(implantar);
      expect(await cadastrar(ctx)).to.equal(1n);
      expect(await cadastrar(ctx, ctx.fornecedor, Tipo.Zimbro, URI.b)).to.equal(2n);
      expect(await ctx.insumos.totalLotesInsumo()).to.equal(2n);
    });

    it("rejeita NaoDefinido", async function () {
      const ctx = await loadFixture(implantar);
      await expect(cadastrar(ctx, ctx.fornecedor, Tipo.NaoDefinido))
        .to.be.revertedWithCustomError(ctx.insumos, "TipoInsumoInvalido");
    });

    for (const [nome, tipo] of Object.entries(Tipo).filter(([nome]) => nome !== "NaoDefinido")) {
      it(`aceita o tipo ${nome}`, async function () {
        const ctx = await loadFixture(implantar);
        await cadastrar(ctx, ctx.fornecedor, tipo);
        expect((await ctx.insumos.obterLoteInsumo(1)).tipo).to.equal(tipo);
      });
    }

    for (const [nome, uri] of [
      ["vazia", ""],
      ["sem prefixo", URI.a.slice(7)],
      ["curta", "ipfs://Qm123"],
      ["acima do limite", `ipfs://${"a".repeat(114)}`],
    ]) {
      it(`rejeita URI ${nome}`, async function () {
        const ctx = await loadFixture(implantar);
        await expect(cadastrar(ctx, ctx.fornecedor, Tipo.Agua, uri))
          .to.be.revertedWithCustomError(ctx.insumos, "ReferenciaIPFSInvalida");
      });
    }

    it("mantem indices independentes por fornecedor", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx, ctx.fornecedor, Tipo.Agua, URI.a);
      await cadastrar(ctx, ctx.fornecedor2, Tipo.Zimbro, URI.b);
      await cadastrar(ctx, ctx.fornecedor, Tipo.Levedura, URI.c);
      expect(await ctx.insumos.totalInsumosDoFornecedor(ctx.fornecedor.address)).to.equal(2n);
      expect(await ctx.insumos.insumoDoFornecedorPorIndice(ctx.fornecedor.address, 0)).to.equal(1n);
      expect(await ctx.insumos.insumoDoFornecedorPorIndice(ctx.fornecedor.address, 1)).to.equal(3n);
      expect(await ctx.insumos.totalInsumosDoFornecedor(ctx.fornecedor2.address)).to.equal(1n);
      expect(await ctx.insumos.insumoDoFornecedorPorIndice(ctx.fornecedor2.address, 0)).to.equal(2n);
    });

    it("revogacao impede novo cadastro, mas preserva lote anterior", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      await ctx.acesso.revokeRole(ctx.FORNECEDOR, ctx.fornecedor.address);
      await expect(cadastrar(ctx)).to.be.revertedWithCustomError(ctx.insumos, "SemPermissao");
      expect(await ctx.insumos.loteInsumoExiste(1)).to.equal(true);
      expect((await ctx.insumos.obterLoteInsumo(1)).fornecedor).to.equal(ctx.fornecedor.address);
    });
  });

  describe("avaliacao", function () {
    it("produtor aprova e emite evento com ator e ID", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      await expect(ctx.insumos.connect(ctx.produtor).avaliarInsumo(1, Resultado.Aprovado, URI.b))
        .to.emit(ctx.insumos, "InsumoAvaliado")
        .withArgs(1n, ctx.produtor.address, Resultado.Aprovado, URI.b, anyValue, 0n);
      expect(await ctx.insumos.resultadoAtual(1, ctx.produtor.address)).to.equal(Resultado.Aprovado);
      expect(await ctx.insumos.aprovadoPor(1, ctx.produtor.address)).to.equal(true);
    });

    it("nao produtor e admin sem PRODUTOR_ROLE nao avaliam", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      for (const conta of [ctx.semPapel, ctx.admin, ctx.fornecedor]) {
        await expect(ctx.insumos.connect(conta).avaliarInsumo(1, Resultado.Aprovado, URI.b))
          .to.be.revertedWithCustomError(ctx.insumos, "SemPermissao");
      }
    });

    it("conta com multiplos papeis e PRODUTOR_ROLE avalia", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      await ctx.insumos.connect(ctx.multipapeis).avaliarInsumo(1, Resultado.Aprovado, URI.b);
      expect(await ctx.insumos.aprovadoPor(1, ctx.multipapeis.address)).to.equal(true);
    });

    it("rejeita lote inexistente, NaoAvaliado e metadataURI invalida", async function () {
      const ctx = await loadFixture(implantar);
      await expect(ctx.insumos.connect(ctx.produtor).avaliarInsumo(99, Resultado.Aprovado, URI.b))
        .to.be.revertedWithCustomError(ctx.insumos, "LoteInsumoInexistente");
      await cadastrar(ctx);
      await expect(ctx.insumos.connect(ctx.produtor).avaliarInsumo(1, Resultado.NaoAvaliado, URI.b))
        .to.be.revertedWithCustomError(ctx.insumos, "ResultadoAvaliacaoInvalido");
      await expect(ctx.insumos.connect(ctx.produtor).avaliarInsumo(1, Resultado.Aprovado, ""))
        .to.be.revertedWithCustomError(ctx.insumos, "ReferenciaIPFSInvalida");
    });

    it("aceita Rejeitado e mantem avaliacoes de produtores independentes", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      await ctx.insumos.connect(ctx.produtor).avaliarInsumo(1, Resultado.Aprovado, URI.b);
      await ctx.insumos.connect(ctx.produtor2).avaliarInsumo(1, Resultado.Rejeitado, URI.c);
      expect(await ctx.insumos.resultadoAtual(1, ctx.produtor.address)).to.equal(Resultado.Aprovado);
      expect(await ctx.insumos.resultadoAtual(1, ctx.produtor2.address)).to.equal(Resultado.Rejeitado);
      expect(await ctx.insumos.aprovadoPor(1, ctx.produtor2.address)).to.equal(false);
    });

    it("reanexa avaliacao, preserva historico e usa a ultima como vigente", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      await ctx.insumos.connect(ctx.produtor).avaliarInsumo(1, Resultado.Aprovado, URI.b);
      await ctx.insumos.connect(ctx.produtor).avaliarInsumo(1, Resultado.Rejeitado, URI.c);
      expect(await ctx.insumos.totalAvaliacoes(1, ctx.produtor.address)).to.equal(2n);
      expect((await ctx.insumos.avaliacaoPorIndice(1, ctx.produtor.address, 0)).resultado).to.equal(Resultado.Aprovado);
      expect((await ctx.insumos.avaliacaoPorIndice(1, ctx.produtor.address, 1)).resultado).to.equal(Resultado.Rejeitado);
      expect(await ctx.insumos.resultadoAtual(1, ctx.produtor.address)).to.equal(Resultado.Rejeitado);
      expect(await ctx.insumos.aprovadoPor(1, ctx.produtor.address)).to.equal(false);
    });

    it("sem avaliacao retorna NaoAvaliado e false", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      expect(await ctx.insumos.resultadoAtual(1, ctx.produtor.address)).to.equal(Resultado.NaoAvaliado);
      expect(await ctx.insumos.aprovadoPor(1, ctx.produtor.address)).to.equal(false);
    });

    it("revogacao preserva historico e impede nova avaliacao", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      await ctx.insumos.connect(ctx.produtor).avaliarInsumo(1, Resultado.Aprovado, URI.b);
      await ctx.acesso.revokeRole(ctx.PRODUTOR, ctx.produtor.address);
      expect(await ctx.insumos.resultadoAtual(1, ctx.produtor.address)).to.equal(Resultado.Aprovado);
      expect(await ctx.insumos.aprovadoPor(1, ctx.produtor.address)).to.equal(true);
      await expect(ctx.insumos.connect(ctx.produtor).avaliarInsumo(1, Resultado.Rejeitado, URI.c))
        .to.be.revertedWithCustomError(ctx.insumos, "SemPermissao");
    });
  });

  describe("correcao documental", function () {
    it("fornecedor original registra correcoes append-only sem mudar URI original", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      await expect(ctx.insumos.connect(ctx.fornecedor).registrarCorrecaoDocumental(1, URI.b))
        .to.emit(ctx.insumos, "CorrecaoDocumentalRegistrada")
        .withArgs(1n, ctx.fornecedor.address, URI.b, anyValue, 0n);
      await ctx.insumos.connect(ctx.fornecedor).registrarCorrecaoDocumental(1, URI.c);
      expect(await ctx.insumos.totalCorrecoes(1)).to.equal(2n);
      expect((await ctx.insumos.correcaoPorIndice(1, 0)).metadataURI).to.equal(URI.b);
      expect((await ctx.insumos.correcaoPorIndice(1, 1)).metadataURI).to.equal(URI.c);
      expect((await ctx.insumos.obterLoteInsumo(1)).metadataURI).to.equal(URI.a);
    });

    it("outro fornecedor e admin nao corrigem", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      await expect(ctx.insumos.connect(ctx.fornecedor2).registrarCorrecaoDocumental(1, URI.b))
        .to.be.revertedWithCustomError(ctx.insumos, "NaoEhFornecedorOriginal");
      await expect(ctx.insumos.connect(ctx.admin).registrarCorrecaoDocumental(1, URI.b))
        .to.be.revertedWithCustomError(ctx.insumos, "NaoEhFornecedorOriginal");
    });

    it("fornecedor original sem papel vigente nao corrige", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      await ctx.acesso.revokeRole(ctx.FORNECEDOR, ctx.fornecedor.address);
      await expect(ctx.insumos.connect(ctx.fornecedor).registrarCorrecaoDocumental(1, URI.b))
        .to.be.revertedWithCustomError(ctx.insumos, "SemPermissao");
    });

    it("rejeita lote inexistente e metadataURI invalida", async function () {
      const ctx = await loadFixture(implantar);
      await expect(ctx.insumos.connect(ctx.fornecedor).registrarCorrecaoDocumental(99, URI.b))
        .to.be.revertedWithCustomError(ctx.insumos, "LoteInsumoInexistente");
      await cadastrar(ctx);
      await expect(ctx.insumos.connect(ctx.fornecedor).registrarCorrecaoDocumental(1, ""))
        .to.be.revertedWithCustomError(ctx.insumos, "ReferenciaIPFSInvalida");
    });
  });

  describe("invalidacao e seus efeitos", function () {
    async function estadoComHistorico() {
      const ctx = await implantar();
      await cadastrar(ctx);
      await ctx.insumos.connect(ctx.produtor).avaliarInsumo(1, Resultado.Aprovado, URI.b);
      await ctx.insumos.connect(ctx.fornecedor).registrarCorrecaoDocumental(1, URI.c);
      return ctx;
    }

    it("fornecedor original invalida definitivamente com metadata e evento", async function () {
      const ctx = await loadFixture(estadoComHistorico);
      await expect(ctx.insumos.connect(ctx.fornecedor).invalidarLoteInsumo(1, URI.d))
        .to.emit(ctx.insumos, "LoteInsumoInvalidado")
        .withArgs(1n, ctx.fornecedor.address, URI.d, anyValue);
      const invalidacao = await ctx.insumos.obterInvalidacao(1);
      expect(invalidacao.invalidado).to.equal(true);
      expect(invalidacao.metadataURI).to.equal(URI.d);
      expect(invalidacao.registradoEm).to.be.greaterThan(0n);
      expect(await ctx.insumos.loteInsumoValido(1)).to.equal(false);
    });

    it("outro fornecedor e admin nao invalidam", async function () {
      const ctx = await loadFixture(estadoComHistorico);
      await expect(ctx.insumos.connect(ctx.fornecedor2).invalidarLoteInsumo(1, URI.d))
        .to.be.revertedWithCustomError(ctx.insumos, "NaoEhFornecedorOriginal");
      await expect(ctx.insumos.connect(ctx.admin).invalidarLoteInsumo(1, URI.d))
        .to.be.revertedWithCustomError(ctx.insumos, "NaoEhFornecedorOriginal");
    });

    it("fornecedor original sem papel vigente nao invalida", async function () {
      const ctx = await loadFixture(estadoComHistorico);
      await ctx.acesso.revokeRole(ctx.FORNECEDOR, ctx.fornecedor.address);
      await expect(ctx.insumos.connect(ctx.fornecedor).invalidarLoteInsumo(1, URI.d))
        .to.be.revertedWithCustomError(ctx.insumos, "SemPermissao");
    });

    it("rejeita lote inexistente e metadataURI invalida", async function () {
      const ctx = await loadFixture(implantar);
      await expect(ctx.insumos.connect(ctx.fornecedor).invalidarLoteInsumo(99, URI.d))
        .to.be.revertedWithCustomError(ctx.insumos, "LoteInsumoInexistente");
      await cadastrar(ctx);
      await expect(ctx.insumos.connect(ctx.fornecedor).invalidarLoteInsumo(1, ""))
        .to.be.revertedWithCustomError(ctx.insumos, "ReferenciaIPFSInvalida");
    });

    it("nao permite segunda invalidacao", async function () {
      const ctx = await loadFixture(estadoComHistorico);
      await ctx.insumos.connect(ctx.fornecedor).invalidarLoteInsumo(1, URI.d);
      await expect(ctx.insumos.connect(ctx.fornecedor).invalidarLoteInsumo(1, URI.d))
        .to.be.revertedWithCustomError(ctx.insumos, "LoteInsumoJaInvalidado");
    });

    it("preserva dados e historicos, mas aprovadoPor passa a false", async function () {
      const ctx = await loadFixture(estadoComHistorico);
      await ctx.insumos.connect(ctx.fornecedor).invalidarLoteInsumo(1, URI.d);
      expect((await ctx.insumos.obterLoteInsumo(1)).metadataURI).to.equal(URI.a);
      expect(await ctx.insumos.totalAvaliacoes(1, ctx.produtor.address)).to.equal(1n);
      expect((await ctx.insumos.avaliacaoPorIndice(1, ctx.produtor.address, 0)).resultado).to.equal(Resultado.Aprovado);
      expect(await ctx.insumos.resultadoAtual(1, ctx.produtor.address)).to.equal(Resultado.Aprovado);
      expect(await ctx.insumos.aprovadoPor(1, ctx.produtor.address)).to.equal(false);
      expect(await ctx.insumos.totalCorrecoes(1)).to.equal(1n);
      expect((await ctx.insumos.correcaoPorIndice(1, 0)).metadataURI).to.equal(URI.c);
    });

    it("lote invalidado nao aceita avaliacao nem correcao", async function () {
      const ctx = await loadFixture(estadoComHistorico);
      await ctx.insumos.connect(ctx.fornecedor).invalidarLoteInsumo(1, URI.d);
      await expect(ctx.insumos.connect(ctx.produtor).avaliarInsumo(1, Resultado.Rejeitado, URI.c))
        .to.be.revertedWithCustomError(ctx.insumos, "LoteInsumoEstaInvalidado");
      await expect(ctx.insumos.connect(ctx.fornecedor).registrarCorrecaoDocumental(1, URI.c))
        .to.be.revertedWithCustomError(ctx.insumos, "LoteInsumoEstaInvalidado");
    });
  });

  describe("consultas", function () {
    it("totais e indices refletem cadastros, avaliacoes e correcoes", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      await cadastrar(ctx, ctx.fornecedor, Tipo.Zimbro, URI.b);
      await ctx.insumos.connect(ctx.produtor).avaliarInsumo(1, Resultado.Aprovado, URI.b);
      await ctx.insumos.connect(ctx.produtor).avaliarInsumo(1, Resultado.Rejeitado, URI.c);
      await ctx.insumos.connect(ctx.fornecedor).registrarCorrecaoDocumental(1, URI.d);
      expect(await ctx.insumos.totalLotesInsumo()).to.equal(2n);
      expect(await ctx.insumos.totalInsumosDoFornecedor(ctx.fornecedor.address)).to.equal(2n);
      expect(await ctx.insumos.insumoDoFornecedorPorIndice(ctx.fornecedor.address, 1)).to.equal(2n);
      expect(await ctx.insumos.totalAvaliacoes(1, ctx.produtor.address)).to.equal(2n);
      expect((await ctx.insumos.avaliacaoPorIndice(1, ctx.produtor.address, 1)).resultado).to.equal(Resultado.Rejeitado);
      expect(await ctx.insumos.totalCorrecoes(1)).to.equal(1n);
      expect((await ctx.insumos.correcaoPorIndice(1, 0)).metadataURI).to.equal(URI.d);
    });

    it("consultas de lote inexistente tem comportamento explicito", async function () {
      const ctx = await loadFixture(implantar);
      expect(await ctx.insumos.loteInsumoExiste(0)).to.equal(false);
      expect(await ctx.insumos.loteInsumoValido(99)).to.equal(false);
      for (const chamada of [
        () => ctx.insumos.obterLoteInsumo(99),
        () => ctx.insumos.totalAvaliacoes(99, ctx.produtor.address),
        () => ctx.insumos.resultadoAtual(99, ctx.produtor.address),
        () => ctx.insumos.aprovadoPor(99, ctx.produtor.address),
        () => ctx.insumos.totalCorrecoes(99),
        () => ctx.insumos.obterInvalidacao(99),
      ]) {
        await expect(chamada()).to.be.revertedWithCustomError(ctx.insumos, "LoteInsumoInexistente");
      }
    });

    it("indices fora do limite revertem explicitamente", async function () {
      const ctx = await loadFixture(implantar);
      await cadastrar(ctx);
      await expect(ctx.insumos.insumoDoFornecedorPorIndice(ctx.fornecedor.address, 1))
        .to.be.revertedWithCustomError(ctx.insumos, "IndiceForaDosLimites");
      await expect(ctx.insumos.avaliacaoPorIndice(1, ctx.produtor.address, 0))
        .to.be.revertedWithCustomError(ctx.insumos, "IndiceForaDosLimites");
      await expect(ctx.insumos.correcaoPorIndice(1, 0))
        .to.be.revertedWithCustomError(ctx.insumos, "IndiceForaDosLimites");
    });
  });
});
