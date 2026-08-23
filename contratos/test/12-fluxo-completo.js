const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const URI = {
  base: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbaaa",
  zimbro: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbaab",
  avaliacao: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbaac",
  producao: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbaad",
  etapa: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbaae",
  conclusao: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbaaf",
  envasamento: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbaag",
  invalidacao: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbaah",
};

const TipoInsumo = { BaseAlcoolica: 2, Zimbro: 5 };
const Resultado = { Aprovado: 1 };
const TipoBebida = { Gin: 4 };
const EstadoProducao = { Concluido: 2 };
const EtapaProducao = { Aromatizacao: 7 };
const configuracaoGin = {
  maturacaoAplicavel: false,
  retificacaoAplicavel: false,
  blendagemAplicavel: false,
  ajusteFinalAplicavel: false,
};

describe("N. Fluxo completo da arquitetura nova", function () {
  async function implantarArquitetura() {
    const [admin, fornecedor, produtor, envasador, consulta, multipapeis] = await ethers.getSigners();

    const acesso = await ethers.deployContract("ContratoAcesso", [admin.address]);
    await acesso.waitForDeployment();
    const insumos = await ethers.deployContract("ContratoInsumos", [await acesso.getAddress()]);
    await insumos.waitForDeployment();
    const producao = await ethers.deployContract("ContratoProducao", [
      await acesso.getAddress(),
      await insumos.getAddress(),
    ]);
    await producao.waitForDeployment();
    const envasamento = await ethers.deployContract("ContratoEnvasamento", [
      await acesso.getAddress(),
      await producao.getAddress(),
    ]);
    await envasamento.waitForDeployment();

    const FORNECEDOR_ROLE = await acesso.FORNECEDOR_ROLE();
    const PRODUTOR_ROLE = await acesso.PRODUTOR_ROLE();
    const ENVASADOR_ROLE = await acesso.ENVASADOR_ROLE();
    await acesso.grantRole(FORNECEDOR_ROLE, fornecedor.address);
    await acesso.grantRole(PRODUTOR_ROLE, produtor.address);
    await acesso.grantRole(ENVASADOR_ROLE, envasador.address);
    await acesso.grantRole(PRODUTOR_ROLE, multipapeis.address);
    await acesso.grantRole(ENVASADOR_ROLE, multipapeis.address);

    return {
      acesso,
      insumos,
      producao,
      envasamento,
      admin,
      fornecedor,
      produtor,
      envasador,
      consulta,
      multipapeis,
    };
  }

  async function fluxoGinCompleto() {
    const ctx = await implantarArquitetura();

    await ctx.insumos.connect(ctx.fornecedor).registrarLoteInsumo(TipoInsumo.BaseAlcoolica, URI.base);
    await ctx.insumos.connect(ctx.fornecedor).registrarLoteInsumo(TipoInsumo.Zimbro, URI.zimbro);
    const baseId = 1n;
    const zimbroId = 2n;

    await ctx.insumos.connect(ctx.produtor).avaliarInsumo(baseId, Resultado.Aprovado, URI.avaliacao);
    await ctx.insumos.connect(ctx.produtor).avaliarInsumo(zimbroId, Resultado.Aprovado, URI.avaliacao);
    await ctx.producao
      .connect(ctx.produtor)
      .criarLoteProducao(TipoBebida.Gin, configuracaoGin, URI.producao);
    const loteId = 1n;

    await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(loteId, baseId);
    await ctx.producao.connect(ctx.produtor).vincularInsumoAoLote(loteId, zimbroId);
    await ctx.producao
      .connect(ctx.produtor)
      .registrarEtapa(loteId, EtapaProducao.Aromatizacao, [baseId, zimbroId], 100, 200, URI.etapa);
    await ctx.producao.connect(ctx.produtor).concluirProducao(loteId, URI.conclusao);

    await ctx.envasamento.connect(ctx.envasador).registrarEnvasamento(loteId, 2, URI.envasamento);
    const envasamentoId = 1n;
    await ctx.envasamento.connect(ctx.envasador).emitirGarrafas(envasamentoId, 2);

    return { ...ctx, baseId, zimbroId, loteId, envasamentoId, tokenIds: [1n, 2n] };
  }

  it("executa o fluxo Gin e permite rastreabilidade direta por uma conta publica", async function () {
    const ctx = await loadFixture(fluxoGinCompleto);
    const leituraEnvasamento = ctx.envasamento.connect(ctx.consulta);
    const leituraProducao = ctx.producao.connect(ctx.consulta);
    const leituraInsumos = ctx.insumos.connect(ctx.consulta);

    expect(await leituraEnvasamento.garrafaExiste(ctx.tokenIds[0])).to.equal(true);
    expect(await leituraEnvasamento.garrafaExiste(ctx.tokenIds[1])).to.equal(true);
    expect(await leituraEnvasamento.ownerOf(ctx.tokenIds[0])).to.equal(ctx.envasador.address);
    expect(await leituraEnvasamento.tokenURI(ctx.tokenIds[0])).to.equal(URI.envasamento);

    const envasamentoId = await leituraEnvasamento.envasamentoDaGarrafa(ctx.tokenIds[0]);
    const dadosEnvasamento = await leituraEnvasamento.obterEnvasamento(envasamentoId);
    expect(dadosEnvasamento.loteProducaoId).to.equal(ctx.loteId);

    const lote = await leituraProducao.obterLoteProducao(dadosEnvasamento.loteProducaoId);
    expect(lote.estado).to.equal(EstadoProducao.Concluido);
    expect(await leituraProducao.totalEtapas(ctx.loteId)).to.equal(1);
    const etapa = await leituraProducao.etapaPorIndice(ctx.loteId, 0);
    expect(etapa.etapa).to.equal(EtapaProducao.Aromatizacao);

    expect(await leituraProducao.totalInsumosDaEtapa(ctx.loteId, 0)).to.equal(2);
    const ids = [
      await leituraProducao.insumoDaEtapaPorIndice(ctx.loteId, 0, 0),
      await leituraProducao.insumoDaEtapaPorIndice(ctx.loteId, 0, 1),
    ];
    expect(ids).to.deep.equal([ctx.baseId, ctx.zimbroId]);

    const base = await leituraInsumos.obterLoteInsumo(ids[0]);
    const zimbro = await leituraInsumos.obterLoteInsumo(ids[1]);
    expect(base.tipo).to.equal(TipoInsumo.BaseAlcoolica);
    expect(zimbro.tipo).to.equal(TipoInsumo.Zimbro);
    expect(base.fornecedor).to.equal(ctx.fornecedor.address);
    expect(zimbro.fornecedor).to.equal(ctx.fornecedor.address);

    await expect(
      ctx.envasamento
        .connect(ctx.envasador)
        .transferFrom(ctx.envasador.address, ctx.consulta.address, ctx.tokenIds[0])
    ).to.be.revertedWithCustomError(ctx.envasamento, "TokenNaoTransferivel");
  });

  it("reconstroi a rastreabilidade reversa do insumo ate as garrafas", async function () {
    const ctx = await loadFixture(fluxoGinCompleto);

    expect(await ctx.producao.totalLotesQueUtilizaramInsumo(ctx.baseId)).to.equal(1);
    const loteId = await ctx.producao.loteQueUtilizouInsumoPorIndice(ctx.baseId, 0);
    expect(loteId).to.equal(ctx.loteId);

    expect(await ctx.envasamento.totalEnvasamentosDaProducao(loteId)).to.equal(1);
    const envasamentoId = await ctx.envasamento.envasamentoDaProducaoPorIndice(loteId, 0);
    expect(envasamentoId).to.equal(ctx.envasamentoId);

    expect(await ctx.envasamento.totalGarrafasDoEnvasamento(envasamentoId)).to.equal(2);
    expect(await ctx.envasamento.garrafaDoEnvasamentoPorIndice(envasamentoId, 0)).to.equal(ctx.tokenIds[0]);
    expect(await ctx.envasamento.garrafaDoEnvasamentoPorIndice(envasamentoId, 1)).to.equal(ctx.tokenIds[1]);
  });

  it("preserva producao, garrafas e rastreabilidade apos invalidacao posterior", async function () {
    const ctx = await loadFixture(fluxoGinCompleto);

    await ctx.insumos.connect(ctx.fornecedor).invalidarLoteInsumo(ctx.baseId, URI.invalidacao);

    expect(await ctx.insumos.loteInsumoValido(ctx.baseId)).to.equal(false);
    expect(await ctx.envasamento.garrafaExiste(ctx.tokenIds[0])).to.equal(true);
    expect(await ctx.envasamento.garrafaExiste(ctx.tokenIds[1])).to.equal(true);
    expect(await ctx.producao.loteProducaoConcluido(ctx.loteId)).to.equal(true);
    expect(await ctx.producao.loteQueUtilizouInsumoPorIndice(ctx.baseId, 0)).to.equal(ctx.loteId);
    expect(await ctx.envasamento.envasamentoDaProducaoPorIndice(ctx.loteId, 0)).to.equal(ctx.envasamentoId);
  });

  it("integra autorizacoes entre contratos e permite produtor-envasador multipapel", async function () {
    const ctx = await loadFixture(fluxoGinCompleto);

    await expect(
      ctx.producao
        .connect(ctx.fornecedor)
        .registrarEtapa(ctx.loteId, EtapaProducao.Aromatizacao, [], 1, 2, URI.etapa)
    ).to.be.revertedWithCustomError(ctx.producao, "SemPermissao");
    await expect(
      ctx.envasamento.connect(ctx.produtor).registrarEnvasamento(ctx.loteId, 1, URI.envasamento)
    ).to.be.revertedWithCustomError(ctx.envasamento, "SemPermissao");
    await expect(
      ctx.producao
        .connect(ctx.envasador)
        .registrarEtapa(ctx.loteId, EtapaProducao.Aromatizacao, [], 1, 2, URI.etapa)
    ).to.be.revertedWithCustomError(ctx.producao, "SemPermissao");

    await ctx.insumos.connect(ctx.multipapeis).avaliarInsumo(ctx.zimbroId, Resultado.Aprovado, URI.avaliacao);
    await ctx.insumos.connect(ctx.multipapeis).avaliarInsumo(ctx.baseId, Resultado.Aprovado, URI.avaliacao);
    await ctx.producao
      .connect(ctx.multipapeis)
      .criarLoteProducao(TipoBebida.Gin, configuracaoGin, URI.producao);
    const loteMultipapeis = 2n;
    await ctx.producao.connect(ctx.multipapeis).vincularInsumoAoLote(loteMultipapeis, ctx.baseId);
    await ctx.producao.connect(ctx.multipapeis).vincularInsumoAoLote(loteMultipapeis, ctx.zimbroId);
    await ctx.producao
      .connect(ctx.multipapeis)
      .registrarEtapa(
        loteMultipapeis,
        EtapaProducao.Aromatizacao,
        [ctx.baseId, ctx.zimbroId],
        300,
        400,
        URI.etapa
      );
    await ctx.producao.connect(ctx.multipapeis).concluirProducao(loteMultipapeis, URI.conclusao);
    await ctx.envasamento
      .connect(ctx.multipapeis)
      .registrarEnvasamento(loteMultipapeis, 1, URI.envasamento);
    const envasamentoMultipapeis = 2n;
    await ctx.envasamento.connect(ctx.multipapeis).emitirGarrafas(envasamentoMultipapeis, 1);

    expect(await ctx.producao.loteProducaoConcluido(loteMultipapeis)).to.equal(true);
    expect(await ctx.envasamento.ownerOf(3)).to.equal(ctx.multipapeis.address);
    expect(await ctx.envasamento.envasamentoDaGarrafa(3)).to.equal(envasamentoMultipapeis);
  });
});
