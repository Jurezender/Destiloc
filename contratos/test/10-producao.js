const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const Bebida = { NaoDefinido: 0, Cachaca: 1, Whisky: 2, Vodca: 3, Gin: 4 };
const Estado = { Criado: 0, EmProducao: 1, Concluido: 2 };
const Etapa = {
  PreparacaoBase: 0, Fermentacao: 1, Destilacao: 2, Retificacao: 3, Maturacao: 4,
  Filtragem: 5, Blendagem: 6, Aromatizacao: 7, AjusteFinal: 8,
};
const TipoInsumo = {
  MateriaPrimaAgricola: 1, BaseAlcoolica: 2, Agua: 3, Levedura: 4, Zimbro: 5, Botanico: 6, Outro: 7,
};
const Resultado = { Aprovado: 1, Rejeitado: 2 };
const URI = {
  a: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzda",
  b: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdb",
  c: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdc",
  d: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdd",
};

const config = (maturacao = false, retificacao = false, blendagem = false, ajuste = false) => ({
  maturacaoAplicavel: maturacao,
  retificacaoAplicavel: retificacao,
  blendagemAplicavel: blendagem,
  ajusteFinalAplicavel: ajuste,
});

describe("L. ContratoProducao", function () {
  async function implantar() {
    const [admin, produtor, produtor2, fornecedor, multipapeis, semPapel] = await ethers.getSigners();
    const acesso = await ethers.deployContract("ContratoAcesso", [admin.address]);
    await acesso.waitForDeployment();
    const insumos = await ethers.deployContract("ContratoInsumos", [await acesso.getAddress()]);
    await insumos.waitForDeployment();
    const producao = await ethers.deployContract("ContratoProducao", [await acesso.getAddress(), await insumos.getAddress()]);
    await producao.waitForDeployment();
    const FORNECEDOR = await acesso.FORNECEDOR_ROLE();
    const PRODUTOR = await acesso.PRODUTOR_ROLE();
    await acesso.grantRole(PRODUTOR, produtor.address);
    await acesso.grantRole(PRODUTOR, produtor2.address);
    await acesso.grantRole(FORNECEDOR, fornecedor.address);
    await acesso.grantRole(FORNECEDOR, multipapeis.address);
    await acesso.grantRole(PRODUTOR, multipapeis.address);
    return { acesso, insumos, producao, admin, produtor, produtor2, fornecedor, multipapeis, semPapel, FORNECEDOR, PRODUTOR };
  }

  async function criarLote(ctx, tipo = Bebida.Cachaca, cfg = config(), quem = ctx.produtor, uri = URI.a) {
    await ctx.producao.connect(quem).criarLoteProducao(tipo, cfg, uri);
    return await ctx.producao.totalLotesProducao();
  }

  async function criarInsumo(ctx, tipo, produtor = ctx.produtor) {
    await ctx.insumos.connect(ctx.fornecedor).registrarLoteInsumo(tipo, URI.a);
    const id = await ctx.insumos.totalLotesInsumo();
    await ctx.insumos.connect(produtor).avaliarInsumo(id, Resultado.Aprovado, URI.b);
    return id;
  }

  async function etapa(ctx, loteId, qual, usados = [], quem = ctx.produtor, uri = URI.c) {
    return ctx.producao.connect(quem).registrarEtapa(loteId, qual, usados, 10, 20, uri);
  }

  async function prepararCachaca(ctx, cfg = config(), concluir = false) {
    const loteId = await criarLote(ctx, Bebida.Cachaca, cfg);
    const agricola = await criarInsumo(ctx, TipoInsumo.MateriaPrimaAgricola);
    await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(loteId, agricola);
    await etapa(ctx, loteId, Etapa.PreparacaoBase, [agricola]);
    await etapa(ctx, loteId, Etapa.Fermentacao);
    await etapa(ctx, loteId, Etapa.Destilacao);
    if (cfg.maturacaoAplicavel) await etapa(ctx, loteId, Etapa.Maturacao);
    if (cfg.ajusteFinalAplicavel) await etapa(ctx, loteId, Etapa.AjusteFinal);
    if (concluir) await ctx.producao.connect(ctx.produtor).concluirProducao(loteId, URI.d);
    return { loteId, agricola };
  }

  describe("construtor", function () {
    it("aceita dependencias validas e guarda as referencias", async function () {
      const ctx = await loadFixture(implantar);
      expect(await ctx.producao.contratoAcesso()).to.equal(await ctx.acesso.getAddress());
      expect(await ctx.producao.contratoInsumos()).to.equal(await ctx.insumos.getAddress());
    });
    it("rejeita address(0) para cada dependencia", async function () {
      const ctx = await loadFixture(implantar);
      const f = await ethers.getContractFactory("ContratoProducao");
      await expect(f.deploy(ethers.ZeroAddress, await ctx.insumos.getAddress())).to.be.revertedWithCustomError(f, "ContratoAcessoInvalido");
      await expect(f.deploy(await ctx.acesso.getAddress(), ethers.ZeroAddress)).to.be.revertedWithCustomError(f, "ContratoInsumosInvalido");
    });
    it("rejeita endereco sem codigo para cada dependencia", async function () {
      const ctx = await loadFixture(implantar);
      const f = await ethers.getContractFactory("ContratoProducao");
      await expect(f.deploy(ctx.semPapel.address, await ctx.insumos.getAddress())).to.be.revertedWithCustomError(f, "ContratoAcessoInvalido");
      await expect(f.deploy(await ctx.acesso.getAddress(), ctx.semPapel.address)).to.be.revertedWithCustomError(f, "ContratoInsumosInvalido");
    });
  });

  describe("cadastro e configuracao", function () {
    it("produtor cria lote sequencial com autoria, estado, timestamp e evento", async function () {
      const ctx = await loadFixture(implantar);
      const tx = await ctx.producao.connect(ctx.produtor).criarLoteProducao(Bebida.Cachaca, config(), URI.a);
      await expect(tx).to.emit(ctx.producao, "LoteProducaoCriado").withArgs(1n, ctx.produtor.address, Bebida.Cachaca, URI.a, anyValue);
      const recibo = await tx.wait();
      const bloco = await ethers.provider.getBlock(recibo.blockNumber);
      const lote = await ctx.producao.obterLoteProducao(1);
      expect(lote.produtor).to.equal(ctx.produtor.address);
      expect(lote.estado).to.equal(Estado.Criado);
      expect(lote.criadoEm).to.equal(BigInt(bloco.timestamp));
      expect(lote.concluidoEm).to.equal(0n);
      expect(await criarLote(ctx)).to.equal(2n);
    });
    it("nao produtor e admin sem papel nao criam; conta multi-role cria", async function () {
      const ctx = await loadFixture(implantar);
      for (const conta of [ctx.semPapel, ctx.admin]) {
        await expect(criarLote(ctx, Bebida.Cachaca, config(), conta)).to.be.revertedWithCustomError(ctx.producao, "SemPermissao");
      }
      await criarLote(ctx, Bebida.Cachaca, config(), ctx.multipapeis);
      expect((await ctx.producao.obterLoteProducao(1)).produtor).to.equal(ctx.multipapeis.address);
    });
    it("rejeita NaoDefinido e metadataURI invalida", async function () {
      const ctx = await loadFixture(implantar);
      await expect(criarLote(ctx, Bebida.NaoDefinido)).to.be.revertedWithCustomError(ctx.producao, "TipoBebidaInvalido");
      await expect(criarLote(ctx, Bebida.Cachaca, config(), ctx.produtor, "")).to.be.revertedWithCustomError(ctx.producao, "ReferenciaIPFSInvalida");
    });
    it("cada bebida aceita suas flags e rejeita flags incompatíveis", async function () {
      const ctx = await loadFixture(implantar);
      await criarLote(ctx, Bebida.Cachaca, config(true, false, false, true));
      await criarLote(ctx, Bebida.Whisky, config(false, false, true, true));
      await criarLote(ctx, Bebida.Vodca, config(false, true, false, true));
      await criarLote(ctx, Bebida.Gin, config(false, false, false, true));
      const invalidas = [
        [Bebida.Cachaca, config(false, true)], [Bebida.Whisky, config(true)],
        [Bebida.Vodca, config(true)], [Bebida.Gin, config(false, true)],
      ];
      for (const [tipo, cfg] of invalidas) await expect(criarLote(ctx, tipo, cfg)).to.be.revertedWithCustomError(ctx.producao, "ConfiguracaoInvalida");
    });
    it("responsavel atualiza configuracao em Criado; terceiro e conta revogada nao", async function () {
      const ctx = await loadFixture(implantar);
      await criarLote(ctx);
      await expect(ctx.producao.connect(ctx.produtor).atualizarConfiguracao(1, config(true))).to.emit(ctx.producao, "ConfiguracaoProducaoAtualizada");
      expect((await ctx.producao.obterConfiguracao(1)).maturacaoAplicavel).to.equal(true);
      await expect(ctx.producao.connect(ctx.produtor2).atualizarConfiguracao(1, config())).to.be.revertedWithCustomError(ctx.producao, "NaoEhProdutorResponsavel");
      await ctx.acesso.revokeRole(ctx.PRODUTOR, ctx.produtor.address);
      await expect(ctx.producao.connect(ctx.produtor).atualizarConfiguracao(1, config())).to.be.revertedWithCustomError(ctx.producao, "SemPermissao");
    });
    it("configuracao congela apos primeira etapa e continua congelada apos conclusao", async function () {
      const ctx = await loadFixture(implantar);
      const { loteId } = await prepararCachaca(ctx, config(), true);
      await expect(ctx.producao.connect(ctx.produtor).atualizarConfiguracao(loteId, config(true))).to.be.revertedWithCustomError(ctx.producao, "ConfiguracaoCongelada");
    });
  });

  describe("vinculo e registro de etapa", function () {
    it("vincula insumo aprovado em Criado e EmProducao sem marcar uso", async function () {
      const ctx = await loadFixture(implantar);
      const lote = await criarLote(ctx);
      const a = await criarInsumo(ctx, TipoInsumo.MateriaPrimaAgricola);
      const b = await criarInsumo(ctx, TipoInsumo.Agua);
      await expect(ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, a)).to.emit(ctx.producao, "InsumoVinculadoAoLote");
      expect(await ctx.producao.totalInsumosUtilizados(lote)).to.equal(0n);
      await etapa(ctx, lote, Etapa.PreparacaoBase);
      await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, b);
      expect(await ctx.producao.totalInsumosVinculados(lote)).to.equal(2n);
      expect(await ctx.producao.insumoEstaVinculado(lote, b)).to.equal(true);
    });
    it("rejeita insumo inexistente, invalido, nao aprovado e duplicado", async function () {
      const ctx = await loadFixture(implantar);
      const lote = await criarLote(ctx);
      await expect(ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, 99)).to.be.revertedWithCustomError(ctx.producao, "InsumoInexistente");
      await ctx.insumos.connect(ctx.fornecedor).registrarLoteInsumo(TipoInsumo.Agua, URI.a);
      const id = await ctx.insumos.totalLotesInsumo();
      await expect(ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, id)).to.be.revertedWithCustomError(ctx.producao, "InsumoNaoAprovado");
      await ctx.insumos.connect(ctx.produtor).avaliarInsumo(id, Resultado.Aprovado, URI.b);
      await ctx.insumos.connect(ctx.fornecedor).invalidarLoteInsumo(id, URI.c);
      await expect(ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, id)).to.be.revertedWithCustomError(ctx.producao, "InsumoInvalido");
      const valido = await criarInsumo(ctx, TipoInsumo.Agua);
      await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, valido);
      await expect(ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, valido)).to.be.revertedWithCustomError(ctx.producao, "InsumoJaVinculado");
    });
    it("rejeita vinculo por produtor diferente, sem papel e apos conclusao", async function () {
      const ctx = await loadFixture(implantar);
      const { loteId } = await prepararCachaca(ctx, config(), true);
      const agua = await criarInsumo(ctx, TipoInsumo.Agua);
      await expect(ctx.producao.connect(ctx.produtor2).vincularInsumoAoLote(loteId, agua)).to.be.revertedWithCustomError(ctx.producao, "NaoEhProdutorResponsavel");
      await ctx.acesso.revokeRole(ctx.PRODUTOR, ctx.produtor.address);
      await expect(ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(loteId, agua)).to.be.revertedWithCustomError(ctx.producao, "SemPermissao");
      await ctx.acesso.grantRole(ctx.PRODUTOR, ctx.produtor.address);
      await expect(ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(loteId, agua)).to.be.revertedWithCustomError(ctx.producao, "EstadoProducaoInvalido");
    });
    it("primeira etapa muda estado, registra periodo, metadata, ator e permite etapa sem insumo", async function () {
      const ctx = await loadFixture(implantar);
      const lote = await criarLote(ctx);
      await expect(etapa(ctx, lote, Etapa.PreparacaoBase)).to.emit(ctx.producao, "EtapaProducaoRegistrada");
      expect((await ctx.producao.obterLoteProducao(lote)).estado).to.equal(Estado.EmProducao);
      const reg = await ctx.producao.etapaPorIndice(lote, 0);
      expect(reg.executadoPor).to.equal(ctx.produtor.address);
      expect(reg.inicioInformado).to.equal(10n);
      expect(reg.fimInformado).to.equal(20n);
      expect(reg.metadataURI).to.equal(URI.c);
      expect(await ctx.producao.totalInsumosDaEtapa(lote, 0)).to.equal(0n);
    });
    it("rejeita metadata, periodo, repeticao, produtor diferente e papel revogado", async function () {
      const ctx = await loadFixture(implantar);
      const lote = await criarLote(ctx);
      await expect(ctx.producao.connect(ctx.produtor).registrarEtapa(lote, Etapa.PreparacaoBase, [], 2, 1, URI.c)).to.be.revertedWithCustomError(ctx.producao, "PeriodoInformadoInvalido");
      await expect(etapa(ctx, lote, Etapa.PreparacaoBase, [], ctx.produtor, "")).to.be.revertedWithCustomError(ctx.producao, "ReferenciaIPFSInvalida");
      await etapa(ctx, lote, Etapa.PreparacaoBase);
      await expect(etapa(ctx, lote, Etapa.PreparacaoBase)).to.be.revertedWithCustomError(ctx.producao, "EtapaJaRegistrada");
      await expect(etapa(ctx, lote, Etapa.Fermentacao, [], ctx.produtor2)).to.be.revertedWithCustomError(ctx.producao, "NaoEhProdutorResponsavel");
      await ctx.acesso.revokeRole(ctx.PRODUTOR, ctx.produtor.address);
      await expect(etapa(ctx, lote, Etapa.Fermentacao)).to.be.revertedWithCustomError(ctx.producao, "SemPermissao");
    });
    it("exige vinculo, validade, aprovacao e unicidade do insumo na etapa", async function () {
      const ctx = await loadFixture(implantar);
      const lote = await criarLote(ctx);
      const insumo = await criarInsumo(ctx, TipoInsumo.MateriaPrimaAgricola);
      await expect(etapa(ctx, lote, Etapa.PreparacaoBase, [insumo])).to.be.revertedWithCustomError(ctx.producao, "InsumoNaoVinculado");
      await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, insumo);
      await expect(etapa(ctx, lote, Etapa.PreparacaoBase, [insumo, insumo])).to.be.revertedWithCustomError(ctx.producao, "InsumoDuplicadoNaEtapa");
      await ctx.insumos.connect(ctx.produtor).avaliarInsumo(insumo, Resultado.Rejeitado, URI.d);
      await expect(etapa(ctx, lote, Etapa.PreparacaoBase, [insumo])).to.be.revertedWithCustomError(ctx.producao, "InsumoNaoAprovado");
    });
    it("rejeita na etapa insumo vinculado que foi invalidado posteriormente", async function () {
      const ctx = await loadFixture(implantar);
      const lote = await criarLote(ctx);
      const insumo = await criarInsumo(ctx, TipoInsumo.MateriaPrimaAgricola);
      await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, insumo);
      await ctx.insumos.connect(ctx.fornecedor).invalidarLoteInsumo(insumo, URI.d);
      await expect(etapa(ctx, lote, Etapa.PreparacaoBase, [insumo]))
        .to.be.revertedWithCustomError(ctx.producao, "InsumoInvalido");
    });
    it("mesmo insumo pode ser usado em etapas diferentes, mas e unico na colecao do lote e indice reverso", async function () {
      const ctx = await loadFixture(implantar);
      const lote = await criarLote(ctx);
      const insumo = await criarInsumo(ctx, TipoInsumo.MateriaPrimaAgricola);
      await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, insumo);
      await etapa(ctx, lote, Etapa.PreparacaoBase, [insumo]);
      await etapa(ctx, lote, Etapa.Fermentacao, [insumo]);
      expect(await ctx.producao.totalInsumosDaEtapa(lote, 0)).to.equal(1n);
      expect(await ctx.producao.totalInsumosDaEtapa(lote, 1)).to.equal(1n);
      expect(await ctx.producao.totalInsumosUtilizados(lote)).to.equal(1n);
      expect(await ctx.producao.totalLotesQueUtilizaramInsumo(insumo)).to.equal(1n);
    });
  });

  describe("aplicabilidade e ordem", function () {
    it("cachaca exige PreparacaoBase, Fermentacao e Destilacao em ordem", async function () {
      const ctx = await loadFixture(implantar); const lote = await criarLote(ctx);
      await expect(etapa(ctx, lote, Etapa.Fermentacao)).to.be.revertedWithCustomError(ctx.producao, "PrecedenciaInvalida");
      await etapa(ctx, lote, Etapa.PreparacaoBase);
      await expect(etapa(ctx, lote, Etapa.Destilacao)).to.be.revertedWithCustomError(ctx.producao, "PrecedenciaInvalida");
      await etapa(ctx, lote, Etapa.Fermentacao); await etapa(ctx, lote, Etapa.Destilacao);
    });
    it("cachaca aceita COND true, rejeita false e etapas N/A", async function () {
      const ctx = await loadFixture(implantar); const lote = await criarLote(ctx);
      await etapa(ctx, lote, Etapa.PreparacaoBase); await etapa(ctx, lote, Etapa.Fermentacao); await etapa(ctx, lote, Etapa.Destilacao);
      await expect(etapa(ctx, lote, Etapa.Maturacao)).to.be.revertedWithCustomError(ctx.producao, "EtapaNaoAplicavel");
      await expect(etapa(ctx, lote, Etapa.Filtragem)).to.be.revertedWithCustomError(ctx.producao, "EtapaNaoAplicavel");
      const lote2 = await criarLote(ctx, Bebida.Cachaca, config(true, false, false, true));
      await etapa(ctx, lote2, Etapa.PreparacaoBase); await etapa(ctx, lote2, Etapa.Fermentacao); await etapa(ctx, lote2, Etapa.Destilacao);
      await etapa(ctx, lote2, Etapa.Maturacao); await etapa(ctx, lote2, Etapa.AjusteFinal);
    });
    it("whisky exige fluxo ate Maturacao e respeita condicionais e N/A", async function () {
      const ctx = await loadFixture(implantar); const lote = await criarLote(ctx, Bebida.Whisky, config(false, false, true, true));
      await etapa(ctx, lote, Etapa.PreparacaoBase); await etapa(ctx, lote, Etapa.Fermentacao); await etapa(ctx, lote, Etapa.Destilacao);
      await expect(etapa(ctx, lote, Etapa.Blendagem)).to.be.revertedWithCustomError(ctx.producao, "PrecedenciaInvalida");
      await etapa(ctx, lote, Etapa.Maturacao); await etapa(ctx, lote, Etapa.Blendagem); await etapa(ctx, lote, Etapa.AjusteFinal);
      await expect(etapa(ctx, lote, Etapa.Filtragem)).to.be.revertedWithCustomError(ctx.producao, "EtapaNaoAplicavel");
    });
    it("vodca aceita ordem variavel, condicionais e opcionais", async function () {
      const ctx = await loadFixture(implantar);
      const lote = await criarLote(ctx, Bebida.Vodca, config(false, true, false, true));
      await etapa(ctx, lote, Etapa.Aromatizacao); await etapa(ctx, lote, Etapa.Blendagem);
      await etapa(ctx, lote, Etapa.Filtragem); await etapa(ctx, lote, Etapa.Retificacao); await etapa(ctx, lote, Etapa.AjusteFinal);
      await expect(etapa(ctx, lote, Etapa.PreparacaoBase)).to.be.revertedWithCustomError(ctx.producao, "EtapaNaoAplicavel");
      const lote2 = await criarLote(ctx, Bebida.Vodca, config());
      await expect(etapa(ctx, lote2, Etapa.Retificacao)).to.be.revertedWithCustomError(ctx.producao, "EtapaNaoAplicavel");
      await expect(etapa(ctx, lote2, Etapa.AjusteFinal)).to.be.revertedWithCustomError(ctx.producao, "EtapaNaoAplicavel");
    });
    it("vodca nao aceita etapa depois de AjusteFinal", async function () {
      const ctx = await loadFixture(implantar); const lote = await criarLote(ctx, Bebida.Vodca, config(false, false, false, true));
      await etapa(ctx, lote, Etapa.AjusteFinal);
      await expect(etapa(ctx, lote, Etapa.Filtragem)).to.be.revertedWithCustomError(ctx.producao, "PrecedenciaInvalida");
    });
    it("gin exige Aromatizacao antes do AjusteFinal e rejeita demais", async function () {
      const ctx = await loadFixture(implantar); const lote = await criarLote(ctx, Bebida.Gin, config(false, false, false, true));
      await expect(etapa(ctx, lote, Etapa.AjusteFinal)).to.be.revertedWithCustomError(ctx.producao, "PrecedenciaInvalida");
      await expect(etapa(ctx, lote, Etapa.Destilacao)).to.be.revertedWithCustomError(ctx.producao, "EtapaNaoAplicavel");
      await etapa(ctx, lote, Etapa.Aromatizacao); await etapa(ctx, lote, Etapa.AjusteFinal);
    });
  });

  describe("conclusao e insumos minimos", function () {
    it("cachaca e whisky exigem MateriaPrimaAgricola efetivamente utilizada", async function () {
      for (const tipo of [Bebida.Cachaca, Bebida.Whisky]) {
        const ctx = await loadFixture(implantar); const lote = await criarLote(ctx, tipo);
        const ag = await criarInsumo(ctx, TipoInsumo.MateriaPrimaAgricola); await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, ag);
        await etapa(ctx, lote, Etapa.PreparacaoBase); await etapa(ctx, lote, Etapa.Fermentacao); await etapa(ctx, lote, Etapa.Destilacao);
        if (tipo === Bebida.Whisky) await etapa(ctx, lote, Etapa.Maturacao);
        await expect(ctx.producao.connect(ctx.produtor).concluirProducao(lote, URI.d)).to.be.revertedWithCustomError(ctx.producao, "RequisitoDeInsumoNaoAtendido");
      }
    });
    it("vodca exige BaseAlcoolica usada e ao menos uma etapa", async function () {
      const ctx = await loadFixture(implantar); const lote = await criarLote(ctx, Bebida.Vodca);
      await expect(ctx.producao.connect(ctx.produtor).concluirProducao(lote, URI.d)).to.be.revertedWithCustomError(ctx.producao, "EstadoProducaoInvalido");
      const base = await criarInsumo(ctx, TipoInsumo.BaseAlcoolica); await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, base);
      await etapa(ctx, lote, Etapa.Filtragem, [base]);
      await ctx.producao.connect(ctx.produtor).concluirProducao(lote, URI.d);
      expect(await ctx.producao.loteProducaoConcluido(lote)).to.equal(true);
    });
    it("gin exige BaseAlcoolica e Zimbro usados", async function () {
      const ctx = await loadFixture(implantar); const lote = await criarLote(ctx, Bebida.Gin);
      const base = await criarInsumo(ctx, TipoInsumo.BaseAlcoolica); const zimbro = await criarInsumo(ctx, TipoInsumo.Zimbro);
      await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, base); await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, zimbro);
      await etapa(ctx, lote, Etapa.Aromatizacao, [base]);
      await expect(ctx.producao.connect(ctx.produtor).concluirProducao(lote, URI.d)).to.be.revertedWithCustomError(ctx.producao, "RequisitoDeInsumoNaoAtendido");
      const lote2 = await criarLote(ctx, Bebida.Gin); await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote2, base); await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote2, zimbro);
      await etapa(ctx, lote2, Etapa.Aromatizacao, [base, zimbro]); await ctx.producao.connect(ctx.produtor).concluirProducao(lote2, URI.d);
    });
    it("exige etapas OBR e COND aplicaveis", async function () {
      const ctx = await loadFixture(implantar); const lote = await criarLote(ctx, Bebida.Cachaca, config(true));
      const ag = await criarInsumo(ctx, TipoInsumo.MateriaPrimaAgricola); await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, ag);
      await etapa(ctx, lote, Etapa.PreparacaoBase, [ag]);
      await expect(ctx.producao.connect(ctx.produtor).concluirProducao(lote, URI.d)).to.be.revertedWithCustomError(ctx.producao, "RequisitoDeEtapaNaoAtendido");
      await etapa(ctx, lote, Etapa.Fermentacao); await etapa(ctx, lote, Etapa.Destilacao);
      await expect(ctx.producao.connect(ctx.produtor).concluirProducao(lote, URI.d)).to.be.revertedWithCustomError(ctx.producao, "RequisitoDeEtapaNaoAtendido");
      await etapa(ctx, lote, Etapa.Maturacao); await ctx.producao.connect(ctx.produtor).concluirProducao(lote, URI.d);
    });
    it("exige Maturacao do whisky e condicionais configuradas de vodca e gin", async function () {
      const ctx = await loadFixture(implantar);

      const whisky = await criarLote(ctx, Bebida.Whisky);
      const agricola = await criarInsumo(ctx, TipoInsumo.MateriaPrimaAgricola);
      await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(whisky, agricola);
      await etapa(ctx, whisky, Etapa.PreparacaoBase, [agricola]);
      await etapa(ctx, whisky, Etapa.Fermentacao);
      await etapa(ctx, whisky, Etapa.Destilacao);
      await expect(ctx.producao.connect(ctx.produtor).concluirProducao(whisky, URI.d))
        .to.be.revertedWithCustomError(ctx.producao, "RequisitoDeEtapaNaoAtendido");

      const vodca = await criarLote(ctx, Bebida.Vodca, config(false, true, false, true));
      const base = await criarInsumo(ctx, TipoInsumo.BaseAlcoolica);
      await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(vodca, base);
      await etapa(ctx, vodca, Etapa.Filtragem, [base]);
      await expect(ctx.producao.connect(ctx.produtor).concluirProducao(vodca, URI.d))
        .to.be.revertedWithCustomError(ctx.producao, "RequisitoDeEtapaNaoAtendido");

      const gin = await criarLote(ctx, Bebida.Gin, config(false, false, false, true));
      const zimbro = await criarInsumo(ctx, TipoInsumo.Zimbro);
      await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(gin, base);
      await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(gin, zimbro);
      await etapa(ctx, gin, Etapa.Aromatizacao, [base, zimbro]);
      await expect(ctx.producao.connect(ctx.produtor).concluirProducao(gin, URI.d))
        .to.be.revertedWithCustomError(ctx.producao, "RequisitoDeEtapaNaoAtendido");
    });
    it("somente responsavel com papel conclui e metadata e obrigatoria", async function () {
      const ctx = await loadFixture(implantar); const { loteId } = await prepararCachaca(ctx);
      await expect(ctx.producao.connect(ctx.produtor2).concluirProducao(loteId, URI.d)).to.be.revertedWithCustomError(ctx.producao, "NaoEhProdutorResponsavel");
      await expect(ctx.producao.connect(ctx.produtor).concluirProducao(loteId, "")).to.be.revertedWithCustomError(ctx.producao, "ReferenciaIPFSInvalida");
      await ctx.acesso.revokeRole(ctx.PRODUTOR, ctx.produtor.address);
      await expect(ctx.producao.connect(ctx.produtor).concluirProducao(loteId, URI.d)).to.be.revertedWithCustomError(ctx.producao, "SemPermissao");
    });
    it("revalida insumo invalidado ou rejeitado antes da conclusao", async function () {
      const ctx = await loadFixture(implantar); const a = await prepararCachaca(ctx);
      await ctx.insumos.connect(ctx.fornecedor).invalidarLoteInsumo(a.agricola, URI.d);
      await expect(ctx.producao.connect(ctx.produtor).concluirProducao(a.loteId, URI.d)).to.be.revertedWithCustomError(ctx.producao, "InsumoInvalido");
      const b = await prepararCachaca(ctx); await ctx.insumos.connect(ctx.produtor).avaliarInsumo(b.agricola, Resultado.Rejeitado, URI.d);
      await expect(ctx.producao.connect(ctx.produtor).concluirProducao(b.loteId, URI.d)).to.be.revertedWithCustomError(ctx.producao, "InsumoNaoAprovado");
    });
    it("conclusao grava estado, timestamp e URI; alteracao posterior nao reabre lote", async function () {
      const ctx = await loadFixture(implantar); const { loteId, agricola } = await prepararCachaca(ctx);
      const tx = await ctx.producao.connect(ctx.produtor).concluirProducao(loteId, URI.d);
      await expect(tx).to.emit(ctx.producao, "ProducaoConcluida").withArgs(loteId, ctx.produtor.address, URI.d, anyValue);
      const lote = await ctx.producao.obterLoteProducao(loteId);
      expect(lote.estado).to.equal(Estado.Concluido); expect(lote.concluidoEm).to.be.greaterThan(0n); expect(lote.metadataURIConclusao).to.equal(URI.d);
      await ctx.insumos.connect(ctx.produtor).avaliarInsumo(agricola, Resultado.Rejeitado, URI.c);
      expect(await ctx.producao.loteProducaoConcluido(loteId)).to.equal(true);
      await expect(ctx.producao.connect(ctx.produtor).concluirProducao(loteId, URI.d)).to.be.revertedWithCustomError(ctx.producao, "EstadoProducaoInvalido");
      await expect(etapa(ctx, loteId, Etapa.Maturacao)).to.be.revertedWithCustomError(ctx.producao, "EstadoProducaoInvalido");
    });
  });

  describe("rastreabilidade e consultas", function () {
    it("mero vinculo nao entra no indice reverso; uso em lotes distintos entra uma vez por lote", async function () {
      const ctx = await loadFixture(implantar); const insumo = await criarInsumo(ctx, TipoInsumo.MateriaPrimaAgricola);
      const l1 = await criarLote(ctx); await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(l1, insumo);
      expect(await ctx.producao.totalLotesQueUtilizaramInsumo(insumo)).to.equal(0n);
      await etapa(ctx, l1, Etapa.PreparacaoBase, [insumo]); await etapa(ctx, l1, Etapa.Fermentacao, [insumo]);
      const l2 = await criarLote(ctx); await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(l2, insumo); await etapa(ctx, l2, Etapa.PreparacaoBase, [insumo]);
      expect(await ctx.producao.totalLotesQueUtilizaramInsumo(insumo)).to.equal(2n);
      expect(await ctx.producao.loteQueUtilizouInsumoPorIndice(insumo, 0)).to.equal(l1);
      expect(await ctx.producao.loteQueUtilizouInsumoPorIndice(insumo, 1)).to.equal(l2);
    });
    it("consulta lotes por produtor, vinculos, etapas e insumos por indice", async function () {
      const ctx = await loadFixture(implantar); const lote = await criarLote(ctx); const insumo = await criarInsumo(ctx, TipoInsumo.MateriaPrimaAgricola);
      await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(lote, insumo); await etapa(ctx, lote, Etapa.PreparacaoBase, [insumo]);
      expect(await ctx.producao.totalLotesDoProdutor(ctx.produtor.address)).to.equal(1n);
      expect(await ctx.producao.loteDoProdutorPorIndice(ctx.produtor.address, 0)).to.equal(lote);
      expect(await ctx.producao.insumoVinculadoPorIndice(lote, 0)).to.equal(insumo);
      expect(await ctx.producao.totalEtapas(lote)).to.equal(1n);
      expect(await ctx.producao.etapaFoiRegistrada(lote, Etapa.PreparacaoBase)).to.equal(true);
      expect(await ctx.producao.insumoDaEtapaPorIndice(lote, 0, 0)).to.equal(insumo);
      expect(await ctx.producao.insumoUtilizadoPorIndice(lote, 0)).to.equal(insumo);
    });
    it("lote inexistente e indices invalidos tem comportamento explicito", async function () {
      const ctx = await loadFixture(implantar);
      expect(await ctx.producao.loteProducaoExiste(0)).to.equal(false);
      for (const chamada of [
        () => ctx.producao.obterLoteProducao(99), () => ctx.producao.obterConfiguracao(99),
        () => ctx.producao.totalEtapas(99), () => ctx.producao.loteProducaoConcluido(99),
      ]) await expect(chamada()).to.be.revertedWithCustomError(ctx.producao, "LoteProducaoInexistente");
      await criarLote(ctx);
      for (const chamada of [
        () => ctx.producao.loteDoProdutorPorIndice(ctx.produtor.address, 1),
        () => ctx.producao.insumoVinculadoPorIndice(1, 0), () => ctx.producao.etapaPorIndice(1, 0),
        () => ctx.producao.insumoUtilizadoPorIndice(1, 0), () => ctx.producao.loteQueUtilizouInsumoPorIndice(99, 0),
      ]) await expect(chamada()).to.be.revertedWithCustomError(ctx.producao, "IndiceForaDosLimites");
    });
  });
});
