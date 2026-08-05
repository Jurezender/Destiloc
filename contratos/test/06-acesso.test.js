const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { Etapa, TipoEvento, SEQ_CACHACA, implantar, loteComGarrafa } = require("./apoio");

// Grupo F — Controle de acesso, revogação e renúncia
// Critério C4 da Seção 5.6.1
describe("F. Controle de acesso, revogacao e renuncia", function () {
  it("F01 administrador concede papel", async function () {
    const ctx = await loadFixture(implantar);
    expect(await ctx.rastreamento.hasRole(ctx.PAPEL.distribuidor, ctx.semPapel.address)).to.equal(
      false
    );
    await ctx.rastreamento.grantRole(ctx.PAPEL.distribuidor, ctx.semPapel.address);
    expect(await ctx.rastreamento.hasRole(ctx.PAPEL.distribuidor, ctx.semPapel.address)).to.equal(
      true
    );
  });

  it("F02 administrador revoga papel e a conta perde a capacidade de registrar", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);

    // Antes da revogação, a expedição para o distribuidor é aceita.
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");
    await ctx.rastreamento.connect(ctx.distribuidor).confirmarRecebimento(tokenId, "CD");

    await ctx.rastreamento.revokeRole(ctx.PAPEL.distribuidor, ctx.distribuidor.address);
    expect(
      await ctx.rastreamento.hasRole(ctx.PAPEL.distribuidor, ctx.distribuidor.address)
    ).to.equal(false);

    // Depois da revogação, a conta não expede mais.
    await expect(
      ctx.rastreamento.connect(ctx.distribuidor).expedir(tokenId, ctx.varejista.address, "CD")
    ).to.be.revertedWith("Transicao invalida: remetente sem papel que permita expedicao");
  });

  it("F03 revogacao do papel de fabricante impede novos lotes e novas etapas", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.lote.connect(ctx.fabricante2).registrarLote("cachaca", "Cana", SEQ_CACHACA);
    const loteId = await ctx.lote.totalLotes();

    await ctx.lote.revokeRole(ctx.PAPEL.fabricante, ctx.fabricante2.address);

    await expect(
      ctx.lote.connect(ctx.fabricante2).registrarLote("gin", "Zimbro", SEQ_CACHACA)
    ).to.be.revertedWithCustomError(ctx.lote, "AccessControlUnauthorizedAccount");

    await expect(
      ctx.lote
        .connect(ctx.fabricante2)
        .registrarEtapaProdutiva(loteId, Etapa.RecebimentoMateriaPrima, "X", "")
    ).to.be.revertedWith("RBAC: apenas fabricante");
  });

  it("F04 conta nao administradora nao concede nem revoga", async function () {
    const ctx = await loadFixture(implantar);
    await expect(
      ctx.rastreamento
        .connect(ctx.semPapel)
        .grantRole(ctx.PAPEL.distribuidor, ctx.semPapel.address)
    ).to.be.revertedWithCustomError(ctx.rastreamento, "AccessControlUnauthorizedAccount");

    await expect(
      ctx.rastreamento
        .connect(ctx.distribuidor)
        .revokeRole(ctx.PAPEL.varejista, ctx.varejista.address)
    ).to.be.revertedWithCustomError(ctx.rastreamento, "AccessControlUnauthorizedAccount");
  });

  it("F05 a contagem de administradores e exata nos tres contratos", async function () {
    const ctx = await loadFixture(implantar);
    for (const contrato of [ctx.lote, ctx.tokenizacao, ctx.rastreamento]) {
      expect(await contrato.totalAdministradores()).to.equal(1n);
      await contrato.grantRole(ctx.PAPEL.admin, ctx.segundoAdmin.address);
      expect(await contrato.totalAdministradores()).to.equal(2n);
      const detentores = await contrato.detentoresDoPapel(ctx.PAPEL.admin);
      expect(detentores).to.include(ctx.admin.address);
      expect(detentores).to.include(ctx.segundoAdmin.address);
    }
  });

  it("F06 revokeRole protegido: o ultimo administrador nao pode ser revogado", async function () {
    const ctx = await loadFixture(implantar);
    for (const contrato of [ctx.lote, ctx.tokenizacao, ctx.rastreamento]) {
      expect(await contrato.totalAdministradores()).to.equal(1n);
      await expect(
        contrato.revokeRole(ctx.PAPEL.admin, ctx.admin.address)
      ).to.be.revertedWith("Sistema ficaria sem administrador");
      expect(await contrato.totalAdministradores()).to.equal(1n);
    }
  });

  it("F07 revokeRole permitido quando existe outro administrador", async function () {
    const ctx = await loadFixture(implantar);
    for (const contrato of [ctx.lote, ctx.tokenizacao, ctx.rastreamento]) {
      await contrato.grantRole(ctx.PAPEL.admin, ctx.segundoAdmin.address);
      await contrato.revokeRole(ctx.PAPEL.admin, ctx.admin.address);
      expect(await contrato.totalAdministradores()).to.equal(1n);
      expect(await contrato.hasRole(ctx.PAPEL.admin, ctx.segundoAdmin.address)).to.equal(true);
      expect(await contrato.hasRole(ctx.PAPEL.admin, ctx.admin.address)).to.equal(false);
    }
  });

  it("F08 renounceRole protegido: o ultimo administrador nao pode renunciar", async function () {
    const ctx = await loadFixture(implantar);
    for (const contrato of [ctx.lote, ctx.tokenizacao, ctx.rastreamento]) {
      await expect(
        contrato.renounceRole(ctx.PAPEL.admin, ctx.admin.address)
      ).to.be.revertedWith("Sistema ficaria sem administrador");
      expect(await contrato.totalAdministradores()).to.equal(1n);
    }
  });

  it("F09 renounceRole permitido quando existe outro administrador", async function () {
    const ctx = await loadFixture(implantar);
    for (const contrato of [ctx.lote, ctx.tokenizacao, ctx.rastreamento]) {
      await contrato.grantRole(ctx.PAPEL.admin, ctx.segundoAdmin.address);
      expect(await contrato.totalAdministradores()).to.equal(2n);
      await contrato.renounceRole(ctx.PAPEL.admin, ctx.admin.address);
      expect(await contrato.totalAdministradores()).to.equal(1n);
      expect(await contrato.hasRole(ctx.PAPEL.admin, ctx.admin.address)).to.equal(false);
    }
  });

  it("F10 a protecao nao alcanca papeis operacionais, que podem ficar sem detentor", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.rastreamento.revokeRole(ctx.PAPEL.varejista, ctx.varejista.address);
    await ctx.rastreamento.revokeRole(ctx.PAPEL.varejista, ctx.varejista2.address);
    expect(await ctx.rastreamento.getRoleMemberCount(ctx.PAPEL.varejista)).to.equal(0n);

    // O sistema continua administrável e o papel pode ser concedido novamente.
    await ctx.rastreamento.grantRole(ctx.PAPEL.varejista, ctx.varejista.address);
    expect(await ctx.rastreamento.getRoleMemberCount(ctx.PAPEL.varejista)).to.equal(1n);
  });

  it("F11 conta comum pode renunciar a papel operacional sem restricao", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.rastreamento
      .connect(ctx.distribuidor)
      .renounceRole(ctx.PAPEL.distribuidor, ctx.distribuidor.address);
    expect(
      await ctx.rastreamento.hasRole(ctx.PAPEL.distribuidor, ctx.distribuidor.address)
    ).to.equal(false);
  });
});

// Grupo H — Exclusividade dos papéis operacionais
// Garante que o varejista seja efetivamente terminal
describe("H. Exclusividade dos papeis operacionais", function () {
  it("H01 rejeita a concessao de um segundo papel operacional", async function () {
    const ctx = await loadFixture(implantar);

    await expect(
      ctx.rastreamento.grantRole(ctx.PAPEL.varejista, ctx.distribuidor.address)
    ).to.be.revertedWith("Conta ja possui outro papel operacional");

    await expect(
      ctx.rastreamento.grantRole(ctx.PAPEL.distribuidor, ctx.varejista.address)
    ).to.be.revertedWith("Conta ja possui outro papel operacional");

    await expect(
      ctx.rastreamento.grantRole(ctx.PAPEL.distribuidor, ctx.fabricante2.address)
    ).to.be.revertedWith("Conta ja possui outro papel operacional");
  });

  it("H02 conceder novamente o mesmo papel operacional e aceito", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.rastreamento.grantRole(ctx.PAPEL.distribuidor, ctx.distribuidor.address);
    expect(await ctx.rastreamento.papelOperacional(ctx.distribuidor.address)).to.equal(
      ctx.PAPEL.distribuidor
    );
  });

  it("H03 administrador e papel operacional coexistem na mesma conta", async function () {
    const ctx = await loadFixture(implantar);

    // O implantador ja acumula administracao e fabricante.
    expect(await ctx.rastreamento.hasRole(ctx.PAPEL.admin, ctx.admin.address)).to.equal(true);
    expect(await ctx.rastreamento.papelOperacional(ctx.admin.address)).to.equal(
      ctx.PAPEL.fabricante
    );

    // E conceder administracao a um distribuidor tambem e permitido.
    await ctx.rastreamento.grantRole(ctx.PAPEL.admin, ctx.distribuidor.address);
    expect(await ctx.rastreamento.hasRole(ctx.PAPEL.admin, ctx.distribuidor.address)).to.equal(
      true
    );
    expect(await ctx.rastreamento.papelOperacional(ctx.distribuidor.address)).to.equal(
      ctx.PAPEL.distribuidor
    );
  });

  it("H04 troca de papel operacional exige revogacao do anterior", async function () {
    const ctx = await loadFixture(implantar);

    await expect(
      ctx.rastreamento.grantRole(ctx.PAPEL.varejista, ctx.distribuidor.address)
    ).to.be.revertedWith("Conta ja possui outro papel operacional");

    await ctx.rastreamento.revokeRole(ctx.PAPEL.distribuidor, ctx.distribuidor.address);
    await ctx.rastreamento.grantRole(ctx.PAPEL.varejista, ctx.distribuidor.address);

    expect(await ctx.rastreamento.papelOperacional(ctx.distribuidor.address)).to.equal(
      ctx.PAPEL.varejista
    );
  });

  it("H05 papelOperacional devolve vazio para conta sem papel", async function () {
    const ctx = await loadFixture(implantar);
    expect(await ctx.rastreamento.papelOperacional(ctx.semPapel.address)).to.equal(
      ethers.ZeroHash
    );
  });

  it("H06 varejista permanece terminal, mesmo apos tentativa de acumulo", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);

    await ctx.rastreamento.expedir(tokenId, ctx.varejista.address, "Burarama");
    await ctx.rastreamento.connect(ctx.varejista).confirmarRecebimento(tokenId, "Adega Centro");

    // A conta do varejista nao consegue acumular o papel de distribuidor,
    // que seria o caminho para contornar o encerramento do fluxo.
    await expect(
      ctx.rastreamento.grantRole(ctx.PAPEL.distribuidor, ctx.varejista.address)
    ).to.be.revertedWith("Conta ja possui outro papel operacional");

    await expect(
      ctx.rastreamento.connect(ctx.varejista).expedir(tokenId, ctx.distribuidor.address, "Adega")
    ).to.be.revertedWith("Transicao invalida: remetente sem papel que permita expedicao");
  });
});

// Grupo I — Revogação durante uma expedição pendente
describe("I. Revogacao durante expedicao pendente", function () {
  it("I01 expedicao a destinatario autorizado e aceita", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await expect(
      ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Alambique Burarama")
    ).to.emit(ctx.rastreamento, "GarrafaExpedida");

    const pendencia = await ctx.rastreamento.expedicaoPendente(tokenId);
    expect(pendencia.pendente).to.equal(true);
    expect(pendencia.destinatario).to.equal(ctx.distribuidor.address);
  });

  it("I02 revogacao do destinatario antes da confirmacao", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");

    await ctx.rastreamento.revokeRole(ctx.PAPEL.distribuidor, ctx.distribuidor.address);
    expect(
      await ctx.rastreamento.hasRole(ctx.PAPEL.distribuidor, ctx.distribuidor.address)
    ).to.equal(false);

    // A pendencia continua registrada, apenas o papel deixou de existir.
    expect((await ctx.rastreamento.expedicaoPendente(tokenId)).pendente).to.equal(true);
  });

  it("I03 confirmacao e rejeitada quando o papel foi revogado", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");
    await ctx.rastreamento.revokeRole(ctx.PAPEL.distribuidor, ctx.distribuidor.address);

    await expect(
      ctx.rastreamento.connect(ctx.distribuidor).confirmarRecebimento(tokenId, "CD Cachoeiro")
    ).to.be.revertedWith("Destinatario nao possui mais papel autorizado");
  });

  it("I04 a custodia permanece com o remetente apos a rejeicao", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");
    await ctx.rastreamento.revokeRole(ctx.PAPEL.distribuidor, ctx.distribuidor.address);

    await expect(
      ctx.rastreamento.connect(ctx.distribuidor).confirmarRecebimento(tokenId, "CD")
    ).to.be.reverted;

    expect(await ctx.rastreamento.custodianteAtual(tokenId)).to.equal(ctx.fabricante.address);
    expect(await ctx.rastreamento.totalEventos(tokenId)).to.equal(1n);
  });

  it("I05 o remetente cancela a pendencia travada", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");
    await ctx.rastreamento.revokeRole(ctx.PAPEL.distribuidor, ctx.distribuidor.address);

    await expect(
      ctx.rastreamento.cancelarExpedicao(tokenId, "Destinatario descredenciado")
    ).to.emit(ctx.rastreamento, "ExpedicaoCancelada");

    expect((await ctx.rastreamento.expedicaoPendente(tokenId)).pendente).to.equal(false);
    expect(await ctx.rastreamento.custodianteAtual(tokenId)).to.equal(ctx.fabricante.address);
  });

  it("I06 nova expedicao a destinatario habilitado conclui o fluxo", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor.address, "Burarama");
    await ctx.rastreamento.revokeRole(ctx.PAPEL.distribuidor, ctx.distribuidor.address);
    await ctx.rastreamento.cancelarExpedicao(tokenId, "Destinatario descredenciado");

    await ctx.rastreamento.expedir(tokenId, ctx.distribuidor2.address, "Burarama");
    await ctx.rastreamento.connect(ctx.distribuidor2).confirmarRecebimento(tokenId, "CD Sul");

    expect(await ctx.rastreamento.custodianteAtual(tokenId)).to.equal(ctx.distribuidor2.address);

    const historico = await ctx.rastreamento.getHistorico(tokenId);
    expect(historico.length).to.equal(4);
    expect(historico.map((e) => Number(e.tipo))).to.deep.equal([
      TipoEvento.Expedicao,
      TipoEvento.Cancelamento,
      TipoEvento.Expedicao,
      TipoEvento.Recebimento,
    ]);
  });
});
