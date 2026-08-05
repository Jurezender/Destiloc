const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { implantar, loteComGarrafa } = require("./apoio");

// Grupo D — Não transferibilidade do token
// Critério C5 da Seção 5.6.1 e regra RN06 (identidade não é propriedade)
describe("D. ContratoTokenizacao — nao transferibilidade", function () {
  it("D01 transferFrom reverte", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await expect(
      ctx.tokenizacao.transferFrom(ctx.fabricante.address, ctx.distribuidor.address, tokenId)
    ).to.be.revertedWith("Garrafa nao transferivel");
  });

  it("D02 safeTransferFrom reverte", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await expect(
      ctx.tokenizacao["safeTransferFrom(address,address,uint256)"](
        ctx.fabricante.address,
        ctx.distribuidor.address,
        tokenId
      )
    ).to.be.revertedWith("Garrafa nao transferivel");
  });

  it("D03 aprovacao e aceita, mas o aprovado nao consegue transferir", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);

    // A aprovacao em si nao e bloqueada, para manter a ABI do ERC-721 intacta.
    await ctx.tokenizacao.approve(ctx.distribuidor.address, tokenId);
    expect(await ctx.tokenizacao.getApproved(tokenId)).to.equal(ctx.distribuidor.address);

    // O bloqueio esta na transferencia, que e o unico caminho de mudanca de titular.
    await expect(
      ctx.tokenizacao
        .connect(ctx.distribuidor)
        .transferFrom(ctx.fabricante.address, ctx.distribuidor.address, tokenId)
    ).to.be.revertedWith("Garrafa nao transferivel");
  });

  it("D04 operador aprovado para todos os tokens tambem nao consegue transferir", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);

    await ctx.tokenizacao.setApprovalForAll(ctx.distribuidor.address, true);
    expect(
      await ctx.tokenizacao.isApprovedForAll(ctx.fabricante.address, ctx.distribuidor.address)
    ).to.equal(true);

    await expect(
      ctx.tokenizacao
        .connect(ctx.distribuidor)
        .transferFrom(ctx.fabricante.address, ctx.distribuidor.address, tokenId)
    ).to.be.revertedWith("Garrafa nao transferivel");
  });

  it("D05 o titular permanece o fabricante apos tentativa de transferencia", async function () {
    const ctx = await loadFixture(implantar);
    const { tokenId } = await loteComGarrafa(ctx);
    await expect(
      ctx.tokenizacao.transferFrom(ctx.fabricante.address, ctx.distribuidor.address, tokenId)
    ).to.be.reverted;
    expect(await ctx.tokenizacao.ownerOf(tokenId)).to.equal(ctx.fabricante.address);
  });

  it("D06 supportsInterface declara ERC-721 e AccessControl", async function () {
    const ctx = await loadFixture(implantar);
    expect(await ctx.tokenizacao.supportsInterface("0x80ac58cd")).to.equal(true); // ERC721
    expect(await ctx.tokenizacao.supportsInterface("0x5b5e139f")).to.equal(true); // ERC721Metadata
    expect(await ctx.tokenizacao.supportsInterface("0x7965db0b")).to.equal(true); // AccessControl
  });
});
