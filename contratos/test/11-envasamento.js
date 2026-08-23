const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const URI = {
  a: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzda",
  b: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdb",
  c: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdc",
  d: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdd",
};

const TipoInsumo = { BaseAlcoolica: 2 };
const Resultado = { Aprovado: 1 };
const Bebida = { Vodca: 3 };
const Etapa = { Filtragem: 5 };
const configVazia = {
  maturacaoAplicavel: false,
  retificacaoAplicavel: false,
  blendagemAplicavel: false,
  ajusteFinalAplicavel: false,
};

describe("M. ContratoEnvasamento", function () {
  async function implantar() {
    const [admin, produtor, fornecedor, envasador, envasador2, multipapeis, semPapel] = await ethers.getSigners();
    const acesso = await ethers.deployContract("ContratoAcesso", [admin.address]);
    await acesso.waitForDeployment();
    const insumos = await ethers.deployContract("ContratoInsumos", [await acesso.getAddress()]);
    await insumos.waitForDeployment();
    const producao = await ethers.deployContract("ContratoProducao", [await acesso.getAddress(), await insumos.getAddress()]);
    await producao.waitForDeployment();
    const envasamento = await ethers.deployContract("ContratoEnvasamento", [await acesso.getAddress(), await producao.getAddress()]);
    await envasamento.waitForDeployment();

    const FORNECEDOR = await acesso.FORNECEDOR_ROLE();
    const PRODUTOR = await acesso.PRODUTOR_ROLE();
    const ENVASADOR = await acesso.ENVASADOR_ROLE();
    await acesso.grantRole(FORNECEDOR, fornecedor.address);
    await acesso.grantRole(PRODUTOR, produtor.address);
    await acesso.grantRole(ENVASADOR, envasador.address);
    await acesso.grantRole(ENVASADOR, envasador2.address);
    await acesso.grantRole(PRODUTOR, multipapeis.address);
    await acesso.grantRole(ENVASADOR, multipapeis.address);

    return {
      acesso, insumos, producao, envasamento, admin, produtor, fornecedor,
      envasador, envasador2, multipapeis, semPapel, FORNECEDOR, PRODUTOR, ENVASADOR,
    };
  }

  async function criarProducaoConcluida(ctx) {
    await ctx.insumos.connect(ctx.fornecedor).registrarLoteInsumo(TipoInsumo.BaseAlcoolica, URI.a);
    const insumoId = await ctx.insumos.totalLotesInsumo();
    await ctx.insumos.connect(ctx.produtor).avaliarInsumo(insumoId, Resultado.Aprovado, URI.b);
    await ctx.producao.connect(ctx.produtor).criarLoteProducao(Bebida.Vodca, configVazia, URI.a);
    const loteId = await ctx.producao.totalLotesProducao();
    await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(loteId, insumoId);
    await ctx.producao.connect(ctx.produtor).registrarEtapa(loteId, Etapa.Filtragem, [insumoId], 1, 2, URI.b);
    await ctx.producao.connect(ctx.produtor).concluirProducao(loteId, URI.c);
    return loteId;
  }

  async function registrar(ctx, loteId, quantidade = 3, uri = URI.a, quem = ctx.envasador) {
    await ctx.envasamento.connect(quem).registrarEnvasamento(loteId, quantidade, uri);
    return await ctx.envasamento.totalEnvasamentos();
  }

  describe("construtor e ERC-721", function () {
    it("aceita e guarda dependencias validas, nome e simbolo", async function () {
      const ctx = await loadFixture(implantar);
      expect(await ctx.envasamento.contratoAcesso()).to.equal(await ctx.acesso.getAddress());
      expect(await ctx.envasamento.contratoProducao()).to.equal(await ctx.producao.getAddress());
      expect(await ctx.envasamento.name()).to.equal("Destiloc Garrafa");
      expect(await ctx.envasamento.symbol()).to.equal("DSG");
    });
    it("rejeita address(0) para cada dependencia", async function () {
      const ctx = await loadFixture(implantar);
      const f = await ethers.getContractFactory("ContratoEnvasamento");
      await expect(f.deploy(ethers.ZeroAddress, await ctx.producao.getAddress())).to.be.revertedWithCustomError(f, "ContratoAcessoInvalido");
      await expect(f.deploy(await ctx.acesso.getAddress(), ethers.ZeroAddress)).to.be.revertedWithCustomError(f, "ContratoProducaoInvalido");
    });
    it("rejeita EOA para cada dependencia", async function () {
      const ctx = await loadFixture(implantar);
      const f = await ethers.getContractFactory("ContratoEnvasamento");
      await expect(f.deploy(ctx.semPapel.address, await ctx.producao.getAddress())).to.be.revertedWithCustomError(f, "ContratoAcessoInvalido");
      await expect(f.deploy(await ctx.acesso.getAddress(), ctx.semPapel.address)).to.be.revertedWithCustomError(f, "ContratoProducaoInvalido");
    });
  });

  describe("registro", function () {
    it("envasador registra com dados, timestamp e evento corretos", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx);
      const tx = await ctx.envasamento.connect(ctx.envasador).registrarEnvasamento(loteId, 4, URI.a);
      await expect(tx).to.emit(ctx.envasamento, "EnvasamentoRegistrado")
        .withArgs(1n, loteId, ctx.envasador.address, 4n, URI.a, anyValue);
      const recibo = await tx.wait(); const bloco = await ethers.provider.getBlock(recibo.blockNumber);
      const env = await ctx.envasamento.obterEnvasamento(1);
      expect(env.loteProducaoId).to.equal(loteId); expect(env.envasador).to.equal(ctx.envasador.address);
      expect(env.quantidadeDeclarada).to.equal(4n); expect(env.quantidadeEmitida).to.equal(0n);
      expect(env.registradoEm).to.equal(BigInt(bloco.timestamp)); expect(env.concluidoEm).to.equal(0n);
    });
    it("nao envasador, admin e produtor sem ENVASADOR_ROLE nao registram", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx);
      for (const conta of [ctx.semPapel, ctx.admin, ctx.produtor]) {
        await expect(registrar(ctx, loteId, 1, URI.a, conta)).to.be.revertedWithCustomError(ctx.envasamento, "SemPermissao");
      }
    });
    it("conta multi-role com ENVASADOR_ROLE registra", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx);
      await registrar(ctx, loteId, 1, URI.a, ctx.multipapeis);
      expect((await ctx.envasamento.obterEnvasamento(1)).envasador).to.equal(ctx.multipapeis.address);
    });
    it("rejeita producao inexistente e nao concluida", async function () {
      const ctx = await loadFixture(implantar);
      await expect(registrar(ctx, 99)).to.be.revertedWithCustomError(ctx.envasamento, "ProducaoInexistente");
      await ctx.producao.connect(ctx.produtor).criarLoteProducao(Bebida.Vodca, configVazia, URI.a);
      await expect(registrar(ctx, 1)).to.be.revertedWithCustomError(ctx.envasamento, "ProducaoNaoConcluida");
    });
    it("rejeita quantidade zero e metadataURI invalida", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx);
      await expect(registrar(ctx, loteId, 0)).to.be.revertedWithCustomError(ctx.envasamento, "QuantidadeInvalida");
      await expect(registrar(ctx, loteId, 1, "")).to.be.revertedWithCustomError(ctx.envasamento, "ReferenciaIPFSInvalida");
    });
    it("IDs sao sequenciais e uma producao aceita varios envasamentos indexados", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx);
      expect(await registrar(ctx, loteId, 2)).to.equal(1n); expect(await registrar(ctx, loteId, 3, URI.b, ctx.envasador2)).to.equal(2n);
      expect(await ctx.envasamento.totalEnvasamentosDaProducao(loteId)).to.equal(2n);
      expect(await ctx.envasamento.envasamentoDaProducaoPorIndice(loteId, 0)).to.equal(1n);
      expect(await ctx.envasamento.envasamentoDaProducaoPorIndice(loteId, 1)).to.equal(2n);
    });
  });

  describe("emissao e conclusao automatica", function () {
    it("envasador original emite lote de garrafas globais e sequenciais", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx);
      await registrar(ctx, loteId, 3);
      const tx = await ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 2);
      await expect(tx).to.emit(ctx.envasamento, "GarrafaEmitida").withArgs(1n, 1n, ctx.envasador.address, anyValue);
      expect(await ctx.envasamento.totalGarrafas()).to.equal(2n);
      expect(await ctx.envasamento.ownerOf(1)).to.equal(ctx.envasador.address);
      expect((await ctx.envasamento.obterGarrafa(1)).envasamentoId).to.equal(1n);
      expect((await ctx.envasamento.obterGarrafa(1)).emitidaEm).to.be.greaterThan(0n);
      expect(await ctx.envasamento.garrafaDoEnvasamentoPorIndice(1, 0)).to.equal(1n);
      expect(await ctx.envasamento.garrafaDoEnvasamentoPorIndice(1, 1)).to.equal(2n);
    });
    it("outro envasador, conta sem papel e quantidade zero nao emitem", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx); await registrar(ctx, loteId, 3);
      await expect(ctx.envasamento.connect(ctx.envasador2).emitirGarrafas(1, 1)).to.be.revertedWithCustomError(ctx.envasamento, "NaoEhEnvasadorResponsavel");
      await expect(ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 0)).to.be.revertedWithCustomError(ctx.envasamento, "QuantidadeInvalida");
      await ctx.acesso.revokeRole(ctx.ENVASADOR, ctx.envasador.address);
      await expect(ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 1)).to.be.revertedWithCustomError(ctx.envasamento, "SemPermissao");
    });
    it("emissoes parciais acumulam sem ultrapassar a quantidade declarada", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx); await registrar(ctx, loteId, 3);
      await ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 1);
      expect((await ctx.envasamento.obterEnvasamento(1)).quantidadeEmitida).to.equal(1n);
      expect(await ctx.envasamento.envasamentoConcluido(1)).to.equal(false);
      await expect(ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 3)).to.be.revertedWithCustomError(ctx.envasamento, "QuantidadeExcedeDeclarada");
      await ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 2);
      expect((await ctx.envasamento.obterEnvasamento(1)).quantidadeEmitida).to.equal(3n);
    });
    it("ultima emissao conclui automaticamente, grava timestamp e emite evento", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx); await registrar(ctx, loteId, 2);
      await ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 1);
      const tx = await ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 1);
      await expect(tx).to.emit(ctx.envasamento, "EnvasamentoConcluido").withArgs(1n, loteId, ctx.envasador.address, anyValue);
      expect(await ctx.envasamento.envasamentoConcluido(1)).to.equal(true);
      expect((await ctx.envasamento.obterEnvasamento(1)).concluidoEm).to.be.greaterThan(0n);
      await expect(ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 1)).to.be.revertedWithCustomError(ctx.envasamento, "EnvasamentoJaConcluido");
    });
    it("envasamentos diferentes mantem garrafas independentes e token IDs globais", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx);
      await registrar(ctx, loteId, 1, URI.a); await registrar(ctx, loteId, 2, URI.b, ctx.envasador2);
      await ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 1); await ctx.envasamento.connect(ctx.envasador2).emitirGarrafas(2, 2);
      expect(await ctx.envasamento.totalGarrafasDoEnvasamento(1)).to.equal(1n);
      expect(await ctx.envasamento.totalGarrafasDoEnvasamento(2)).to.equal(2n);
      expect(await ctx.envasamento.envasamentoDaGarrafa(1)).to.equal(1n);
      expect(await ctx.envasamento.envasamentoDaGarrafa(2)).to.equal(2n);
      expect(await ctx.envasamento.envasamentoDaGarrafa(3)).to.equal(2n);
    });
  });

  describe("revogacao e permanencia", function () {
    it("revogacao bloqueia novo registro e emissao, preservando garrafas e historico", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx); await registrar(ctx, loteId, 2);
      await ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 1);
      await ctx.acesso.revokeRole(ctx.ENVASADOR, ctx.envasador.address);
      await expect(registrar(ctx, loteId, 1)).to.be.revertedWithCustomError(ctx.envasamento, "SemPermissao");
      await expect(ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 1)).to.be.revertedWithCustomError(ctx.envasamento, "SemPermissao");
      expect(await ctx.envasamento.garrafaExiste(1)).to.equal(true);
      expect((await ctx.envasamento.obterEnvasamento(1)).envasador).to.equal(ctx.envasador.address);
      expect(await ctx.envasamento.ownerOf(1)).to.equal(ctx.envasador.address);
    });
  });

  describe("ERC-721 nao transferivel", function () {
    async function comGarrafa() {
      const ctx = await implantar(); const loteId = await criarProducaoConcluida(ctx); await registrar(ctx, loteId, 1);
      await ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 1); return ctx;
    }
    it("transferFrom e tentativa de envio ao zero revertem", async function () {
      const ctx = await loadFixture(comGarrafa);
      await expect(ctx.envasamento.connect(ctx.envasador).transferFrom(ctx.envasador.address, ctx.envasador2.address, 1)).to.be.revertedWithCustomError(ctx.envasamento, "TokenNaoTransferivel");
      await expect(ctx.envasamento.connect(ctx.envasador).transferFrom(ctx.envasador.address, ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(ctx.envasamento, "TokenNaoTransferivel");
    });
    it("ambos overloads de safeTransferFrom revertem", async function () {
      const ctx = await loadFixture(comGarrafa);
      await expect(ctx.envasamento.connect(ctx.envasador)["safeTransferFrom(address,address,uint256)"](ctx.envasador.address, ctx.envasador2.address, 1)).to.be.revertedWithCustomError(ctx.envasamento, "TokenNaoTransferivel");
      await expect(ctx.envasamento.connect(ctx.envasador)["safeTransferFrom(address,address,uint256,bytes)"](ctx.envasador.address, ctx.envasador2.address, 1, "0x1234")).to.be.revertedWithCustomError(ctx.envasamento, "TokenNaoTransferivel");
    });
    it("approve e setApprovalForAll revertem", async function () {
      const ctx = await loadFixture(comGarrafa);
      await expect(ctx.envasamento.connect(ctx.envasador).approve(ctx.envasador2.address, 1)).to.be.revertedWithCustomError(ctx.envasamento, "AprovacaoNaoPermitida");
      await expect(ctx.envasamento.connect(ctx.envasador).setApprovalForAll(ctx.envasador2.address, true)).to.be.revertedWithCustomError(ctx.envasamento, "AprovacaoNaoPermitida");
    });
    it("nao expoe burn e tentativas rejeitadas preservam token e total", async function () {
      const ctx = await loadFixture(comGarrafa);
      expect(ctx.envasamento.interface.fragments.filter((f) => f.type === "function").map((f) => f.name)).not.to.include("burn");
      await expect(ctx.envasamento.connect(ctx.envasador).transferFrom(ctx.envasador.address, ethers.ZeroAddress, 1)).to.be.reverted;
      expect(await ctx.envasamento.ownerOf(1)).to.equal(ctx.envasador.address);
      expect(await ctx.envasamento.totalGarrafas()).to.equal(1n);
    });
  });

  describe("token URI, rastreabilidade e consultas", function () {
    it("garrafas compartilham URI do envasamento e envasamentos podem ter URIs diferentes", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx);
      await registrar(ctx, loteId, 2, URI.a); await registrar(ctx, loteId, 1, URI.d, ctx.envasador2);
      await ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 2); await ctx.envasamento.connect(ctx.envasador2).emitirGarrafas(2, 1);
      expect(await ctx.envasamento.tokenURI(1)).to.equal(URI.a); expect(await ctx.envasamento.tokenURI(2)).to.equal(URI.a); expect(await ctx.envasamento.tokenURI(3)).to.equal(URI.d);
      await expect(ctx.envasamento.tokenURI(99)).to.be.revertedWithCustomError(ctx.envasamento, "ERC721NonexistentToken");
    });
    it("percorre token, envasamento, producao e relacoes reversas", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx);
      await registrar(ctx, loteId, 2); await ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 2);
      const envId = await ctx.envasamento.envasamentoDaGarrafa(1);
      expect(envId).to.equal(1n); expect((await ctx.envasamento.obterEnvasamento(envId)).loteProducaoId).to.equal(loteId);
      expect(await ctx.envasamento.envasamentoDaProducaoPorIndice(loteId, 0)).to.equal(envId);
      expect(await ctx.envasamento.garrafaDoEnvasamentoPorIndice(envId, 0)).to.equal(1n);
      expect(await ctx.envasamento.garrafaDoEnvasamentoPorIndice(envId, 1)).to.equal(2n);
    });
    it("totais, existencia e conclusao respondem corretamente", async function () {
      const ctx = await loadFixture(implantar); const loteId = await criarProducaoConcluida(ctx); await registrar(ctx, loteId, 1);
      expect(await ctx.envasamento.totalEnvasamentos()).to.equal(1n); expect(await ctx.envasamento.envasamentoExiste(1)).to.equal(true); expect(await ctx.envasamento.envasamentoExiste(99)).to.equal(false);
      expect(await ctx.envasamento.totalGarrafas()).to.equal(0n); expect(await ctx.envasamento.garrafaExiste(1)).to.equal(false); expect(await ctx.envasamento.envasamentoConcluido(1)).to.equal(false);
      await ctx.envasamento.connect(ctx.envasador).emitirGarrafas(1, 1);
      expect(await ctx.envasamento.totalGarrafas()).to.equal(1n); expect(await ctx.envasamento.garrafaExiste(1)).to.equal(true); expect(await ctx.envasamento.envasamentoConcluido(1)).to.equal(true);
    });
    it("IDs inexistentes e indices invalidos revertem explicitamente", async function () {
      const ctx = await loadFixture(implantar);
      for (const chamada of [
        () => ctx.envasamento.obterEnvasamento(99), () => ctx.envasamento.envasamentoConcluido(99),
        () => ctx.envasamento.totalGarrafasDoEnvasamento(99), () => ctx.envasamento.obterGarrafa(99),
        () => ctx.envasamento.envasamentoDaGarrafa(99),
      ]) await expect(chamada()).to.be.reverted;
      const loteId = await criarProducaoConcluida(ctx); await registrar(ctx, loteId, 1);
      await expect(ctx.envasamento.envasamentoDaProducaoPorIndice(loteId, 1)).to.be.revertedWithCustomError(ctx.envasamento, "IndiceForaDosLimites");
      await expect(ctx.envasamento.garrafaDoEnvasamentoPorIndice(1, 0)).to.be.revertedWithCustomError(ctx.envasamento, "IndiceForaDosLimites");
    });
  });
});
