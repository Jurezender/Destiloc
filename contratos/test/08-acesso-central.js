const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("J. ContratoAcesso central", function () {
  async function implantar() {
    const [admin, segundoAdmin, participante, outraConta, semPapel] = await ethers.getSigners();
    const acesso = await ethers.deployContract("ContratoAcesso", [admin.address]);
    await acesso.waitForDeployment();

    return {
      acesso,
      admin,
      segundoAdmin,
      participante,
      outraConta,
      semPapel,
      ADMIN: await acesso.DEFAULT_ADMIN_ROLE(),
      FORNECEDOR: await acesso.FORNECEDOR_ROLE(),
      PRODUTOR: await acesso.PRODUTOR_ROLE(),
      ENVASADOR: await acesso.ENVASADOR_ROLE(),
    };
  }

  it("implanta com administrador valido", async function () {
    const { acesso } = await loadFixture(implantar);
    expect(await acesso.getAddress()).not.to.equal(ethers.ZeroAddress);
  });

  it("rejeita administrador inicial igual ao endereco zero", async function () {
    const fabrica = await ethers.getContractFactory("ContratoAcesso");
    await expect(fabrica.deploy(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(fabrica, "ContaInvalida");
  });

  it("concede somente administracao ao administrador inicial", async function () {
    const ctx = await loadFixture(implantar);
    expect(await ctx.acesso.hasRole(ctx.ADMIN, ctx.admin.address)).to.equal(true);
    expect(await ctx.acesso.hasRole(ctx.FORNECEDOR, ctx.admin.address)).to.equal(false);
    expect(await ctx.acesso.hasRole(ctx.PRODUTOR, ctx.admin.address)).to.equal(false);
    expect(await ctx.acesso.hasRole(ctx.ENVASADOR, ctx.admin.address)).to.equal(false);
  });

  it("declara as constantes dos tres papeis", async function () {
    const ctx = await loadFixture(implantar);
    expect(ctx.FORNECEDOR).to.equal(ethers.keccak256(ethers.toUtf8Bytes("FORNECEDOR_ROLE")));
    expect(ctx.PRODUTOR).to.equal(ethers.keccak256(ethers.toUtf8Bytes("PRODUTOR_ROLE")));
    expect(ctx.ENVASADOR).to.equal(ethers.keccak256(ethers.toUtf8Bytes("ENVASADOR_ROLE")));
  });

  it("somente administrador concede papeis", async function () {
    const ctx = await loadFixture(implantar);
    await expect(
      ctx.acesso.connect(ctx.semPapel).grantRole(ctx.FORNECEDOR, ctx.participante.address)
    ).to.be.revertedWithCustomError(ctx.acesso, "AccessControlUnauthorizedAccount");

    await ctx.acesso.grantRole(ctx.FORNECEDOR, ctx.participante.address);
    expect(await ctx.acesso.hasRole(ctx.FORNECEDOR, ctx.participante.address)).to.equal(true);
  });

  it("somente administrador revoga papeis", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.acesso.grantRole(ctx.FORNECEDOR, ctx.participante.address);
    await expect(
      ctx.acesso.connect(ctx.semPapel).revokeRole(ctx.FORNECEDOR, ctx.participante.address)
    ).to.be.revertedWithCustomError(ctx.acesso, "AccessControlUnauthorizedAccount");

    await ctx.acesso.revokeRole(ctx.FORNECEDOR, ctx.participante.address);
    expect(await ctx.acesso.hasRole(ctx.FORNECEDOR, ctx.participante.address)).to.equal(false);
  });

  it("rejeita concessao de administracao ao endereco zero", async function () {
    const ctx = await loadFixture(implantar);
    await expect(ctx.acesso.grantRole(ctx.ADMIN, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(ctx.acesso, "ContaInvalida");
    expect(await ctx.acesso.totalAdministradores()).to.equal(1n);
  });

  for (const [nome, chave] of [
    ["fornecedor", "FORNECEDOR"],
    ["produtor", "PRODUTOR"],
    ["envasador", "ENVASADOR"],
  ]) {
    it(`rejeita concessao de ${nome} ao endereco zero`, async function () {
      const ctx = await loadFixture(implantar);
      await expect(ctx.acesso.grantRole(ctx[chave], ethers.ZeroAddress))
        .to.be.revertedWithCustomError(ctx.acesso, "ContaInvalida");
      expect(await ctx.acesso.getRoleMemberCount(ctx[chave])).to.equal(0n);
    });
  }

  it("endereco zero nao contorna a protecao do ultimo administrador", async function () {
    const ctx = await loadFixture(implantar);
    await expect(ctx.acesso.grantRole(ctx.ADMIN, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(ctx.acesso, "ContaInvalida");
    expect(await ctx.acesso.totalAdministradores()).to.equal(1n);
    await expect(ctx.acesso.revokeRole(ctx.ADMIN, ctx.admin.address))
      .to.be.revertedWithCustomError(ctx.acesso, "UltimoAdministrador");
    expect(await ctx.acesso.ehAdministrador(ctx.admin.address)).to.equal(true);
  });

  for (const [nome, chave] of [
    ["fornecedor", "FORNECEDOR"],
    ["produtor", "PRODUTOR"],
    ["envasador", "ENVASADOR"],
  ]) {
    it(`concede o papel de ${nome}`, async function () {
      const ctx = await loadFixture(implantar);
      await ctx.acesso.grantRole(ctx[chave], ctx.participante.address);
      expect(await ctx.acesso.hasRole(ctx[chave], ctx.participante.address)).to.equal(true);
    });
  }

  it("uma conta acumula dois papeis", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.acesso.grantRole(ctx.FORNECEDOR, ctx.participante.address);
    await ctx.acesso.grantRole(ctx.PRODUTOR, ctx.participante.address);
    expect(await ctx.acesso.hasRole(ctx.FORNECEDOR, ctx.participante.address)).to.equal(true);
    expect(await ctx.acesso.hasRole(ctx.PRODUTOR, ctx.participante.address)).to.equal(true);
  });

  it("uma conta acumula os tres papeis operacionais", async function () {
    const ctx = await loadFixture(implantar);
    for (const papel of [ctx.FORNECEDOR, ctx.PRODUTOR, ctx.ENVASADOR]) {
      await ctx.acesso.grantRole(papel, ctx.participante.address);
    }
    expect(await ctx.acesso.ehFornecedor(ctx.participante.address)).to.equal(true);
    expect(await ctx.acesso.ehProdutor(ctx.participante.address)).to.equal(true);
    expect(await ctx.acesso.ehEnvasador(ctx.participante.address)).to.equal(true);
  });

  it("administrador recebe papel operacional apenas por concessao explicita", async function () {
    const ctx = await loadFixture(implantar);
    expect(await ctx.acesso.ehFornecedor(ctx.admin.address)).to.equal(false);
    await ctx.acesso.grantRole(ctx.FORNECEDOR, ctx.admin.address);
    expect(await ctx.acesso.ehAdministrador(ctx.admin.address)).to.equal(true);
    expect(await ctx.acesso.ehFornecedor(ctx.admin.address)).to.equal(true);
  });

  it("revogar um papel preserva os demais", async function () {
    const ctx = await loadFixture(implantar);
    for (const papel of [ctx.FORNECEDOR, ctx.PRODUTOR, ctx.ENVASADOR]) {
      await ctx.acesso.grantRole(papel, ctx.participante.address);
    }
    await ctx.acesso.revokeRole(ctx.PRODUTOR, ctx.participante.address);
    expect(await ctx.acesso.ehFornecedor(ctx.participante.address)).to.equal(true);
    expect(await ctx.acesso.ehProdutor(ctx.participante.address)).to.equal(false);
    expect(await ctx.acesso.ehEnvasador(ctx.participante.address)).to.equal(true);
  });

  it("conta renuncia a papel operacional", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.acesso.grantRole(ctx.PRODUTOR, ctx.participante.address);
    await ctx.acesso.connect(ctx.participante).renounceRole(ctx.PRODUTOR, ctx.participante.address);
    expect(await ctx.acesso.ehProdutor(ctx.participante.address)).to.equal(false);
  });

  it("nao permite revogar o ultimo administrador", async function () {
    const ctx = await loadFixture(implantar);
    await expect(ctx.acesso.revokeRole(ctx.ADMIN, ctx.admin.address))
      .to.be.revertedWithCustomError(ctx.acesso, "UltimoAdministrador");
  });

  it("nao permite ao ultimo administrador renunciar", async function () {
    const ctx = await loadFixture(implantar);
    await expect(ctx.acesso.renounceRole(ctx.ADMIN, ctx.admin.address))
      .to.be.revertedWithCustomError(ctx.acesso, "UltimoAdministrador");
  });

  it("com dois administradores, um pode ser revogado", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.acesso.grantRole(ctx.ADMIN, ctx.segundoAdmin.address);
    await ctx.acesso.revokeRole(ctx.ADMIN, ctx.segundoAdmin.address);
    expect(await ctx.acesso.ehAdministrador(ctx.segundoAdmin.address)).to.equal(false);
    expect(await ctx.acesso.totalAdministradores()).to.equal(1n);
  });

  it("com dois administradores, um pode renunciar", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.acesso.grantRole(ctx.ADMIN, ctx.segundoAdmin.address);
    await ctx.acesso.connect(ctx.segundoAdmin).renounceRole(ctx.ADMIN, ctx.segundoAdmin.address);
    expect(await ctx.acesso.ehAdministrador(ctx.segundoAdmin.address)).to.equal(false);
    expect(await ctx.acesso.totalAdministradores()).to.equal(1n);
  });

  it("administrador restante volta a ficar protegido", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.acesso.grantRole(ctx.ADMIN, ctx.segundoAdmin.address);
    await ctx.acesso.revokeRole(ctx.ADMIN, ctx.segundoAdmin.address);
    await expect(ctx.acesso.revokeRole(ctx.ADMIN, ctx.admin.address))
      .to.be.revertedWithCustomError(ctx.acesso, "UltimoAdministrador");
    await expect(ctx.acesso.renounceRole(ctx.ADMIN, ctx.admin.address))
      .to.be.revertedWithCustomError(ctx.acesso, "UltimoAdministrador");
  });

  for (const [nome, chave] of [
    ["fornecedor", "FORNECEDOR"],
    ["produtor", "PRODUTOR"],
    ["envasador", "ENVASADOR"],
  ]) {
    it(`permite remover o ultimo ${nome}`, async function () {
      const ctx = await loadFixture(implantar);
      await ctx.acesso.grantRole(ctx[chave], ctx.participante.address);
      expect(await ctx.acesso.getRoleMemberCount(ctx[chave])).to.equal(1n);
      await ctx.acesso.revokeRole(ctx[chave], ctx.participante.address);
      expect(await ctx.acesso.getRoleMemberCount(ctx[chave])).to.equal(0n);
    });
  }

  it("funcoes de consulta retornam os papeis corretamente", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.acesso.grantRole(ctx.FORNECEDOR, ctx.participante.address);
    await ctx.acesso.grantRole(ctx.PRODUTOR, ctx.outraConta.address);
    await ctx.acesso.grantRole(ctx.ENVASADOR, ctx.participante.address);

    expect(await ctx.acesso.ehAdministrador(ctx.admin.address)).to.equal(true);
    expect(await ctx.acesso.ehAdministrador(ctx.participante.address)).to.equal(false);
    expect(await ctx.acesso.ehFornecedor(ctx.participante.address)).to.equal(true);
    expect(await ctx.acesso.ehFornecedor(ctx.outraConta.address)).to.equal(false);
    expect(await ctx.acesso.ehProdutor(ctx.outraConta.address)).to.equal(true);
    expect(await ctx.acesso.ehProdutor(ctx.participante.address)).to.equal(false);
    expect(await ctx.acesso.ehEnvasador(ctx.participante.address)).to.equal(true);
    expect(await ctx.acesso.ehEnvasador(ctx.outraConta.address)).to.equal(false);
  });

  it("totalAdministradores acompanha concessao, revogacao e renuncia", async function () {
    const ctx = await loadFixture(implantar);
    expect(await ctx.acesso.totalAdministradores()).to.equal(1n);
    await ctx.acesso.grantRole(ctx.ADMIN, ctx.segundoAdmin.address);
    await ctx.acesso.grantRole(ctx.ADMIN, ctx.outraConta.address);
    expect(await ctx.acesso.totalAdministradores()).to.equal(3n);
    await ctx.acesso.revokeRole(ctx.ADMIN, ctx.outraConta.address);
    expect(await ctx.acesso.totalAdministradores()).to.equal(2n);
    await ctx.acesso.connect(ctx.segundoAdmin).renounceRole(ctx.ADMIN, ctx.segundoAdmin.address);
    expect(await ctx.acesso.totalAdministradores()).to.equal(1n);
  });

  it("renounceRole preserva a validacao de confirmacao do OpenZeppelin", async function () {
    const ctx = await loadFixture(implantar);
    await ctx.acesso.grantRole(ctx.FORNECEDOR, ctx.participante.address);
    await expect(
      ctx.acesso.connect(ctx.participante).renounceRole(ctx.FORNECEDOR, ctx.outraConta.address)
    ).to.be.revertedWithCustomError(ctx.acesso, "AccessControlBadConfirmation");
    expect(await ctx.acesso.ehFornecedor(ctx.participante.address)).to.equal(true);
  });
});
