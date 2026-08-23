// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./interfaces/IContratoAcessoEnvasamento.sol";
import "./interfaces/IContratoProducao.sol";
import "./bibliotecas/ReferenciaIPFS.sol";

contract ContratoEnvasamento is ERC721 {
    using ReferenciaIPFS for string;

    struct Envasamento {
        uint256 loteProducaoId;
        address envasador;
        uint256 quantidadeDeclarada;
        uint256 quantidadeEmitida;
        uint64 registradoEm;
        uint64 concluidoEm;
        string metadataURI;
    }

    struct Garrafa {
        uint256 envasamentoId;
        uint64 emitidaEm;
    }

    error ContratoAcessoInvalido();
    error ContratoProducaoInvalido();
    error SemPermissao();
    error EnvasamentoInexistente();
    error NaoEhEnvasadorResponsavel();
    error ProducaoInexistente();
    error ProducaoNaoConcluida();
    error QuantidadeInvalida();
    error QuantidadeExcedeDeclarada();
    error EnvasamentoJaConcluido();
    error ReferenciaIPFSInvalida();
    error GarrafaInexistente();
    error TokenNaoTransferivel();
    error AprovacaoNaoPermitida();
    error IndiceForaDosLimites();

    IContratoAcessoEnvasamento public immutable contratoAcesso;
    IContratoProducao public immutable contratoProducao;

    uint256 private _proximoEnvasamentoId = 1;
    uint256 private _proximoTokenId = 1;
    mapping(uint256 => Envasamento) private _envasamentos;
    mapping(uint256 => uint256[]) private _envasamentosPorProducao;
    mapping(uint256 => Garrafa) private _garrafas;
    mapping(uint256 => uint256[]) private _garrafasPorEnvasamento;

    event EnvasamentoRegistrado(
        uint256 indexed envasamentoId,
        uint256 indexed loteProducaoId,
        address indexed envasador,
        uint256 quantidadeDeclarada,
        string metadataURI,
        uint64 registradoEm
    );
    event GarrafaEmitida(
        uint256 indexed tokenId,
        uint256 indexed envasamentoId,
        address indexed envasador,
        uint64 emitidaEm
    );
    event EnvasamentoConcluido(
        uint256 indexed envasamentoId,
        uint256 indexed loteProducaoId,
        address indexed envasador,
        uint64 concluidoEm
    );

    constructor(address enderecoContratoAcesso, address enderecoContratoProducao)
        ERC721("Destiloc Garrafa", "DSG")
    {
        if (enderecoContratoAcesso == address(0) || enderecoContratoAcesso.code.length == 0) {
            revert ContratoAcessoInvalido();
        }
        if (enderecoContratoProducao == address(0) || enderecoContratoProducao.code.length == 0) {
            revert ContratoProducaoInvalido();
        }
        contratoAcesso = IContratoAcessoEnvasamento(enderecoContratoAcesso);
        contratoProducao = IContratoProducao(enderecoContratoProducao);
    }

    function registrarEnvasamento(
        uint256 loteProducaoId,
        uint256 quantidadeDeclarada,
        string calldata metadataURI
    ) external returns (uint256 envasamentoId) {
        if (!contratoAcesso.ehEnvasador(msg.sender)) revert SemPermissao();
        if (!contratoProducao.loteProducaoExiste(loteProducaoId)) revert ProducaoInexistente();
        if (!contratoProducao.loteProducaoConcluido(loteProducaoId)) revert ProducaoNaoConcluida();
        if (quantidadeDeclarada == 0) revert QuantidadeInvalida();
        if (!metadataURI.ehValida()) revert ReferenciaIPFSInvalida();

        envasamentoId = _proximoEnvasamentoId++;
        uint64 agora = uint64(block.timestamp);
        _envasamentos[envasamentoId] = Envasamento({
            loteProducaoId: loteProducaoId,
            envasador: msg.sender,
            quantidadeDeclarada: quantidadeDeclarada,
            quantidadeEmitida: 0,
            registradoEm: agora,
            concluidoEm: 0,
            metadataURI: metadataURI
        });
        _envasamentosPorProducao[loteProducaoId].push(envasamentoId);
        emit EnvasamentoRegistrado(
            envasamentoId,
            loteProducaoId,
            msg.sender,
            quantidadeDeclarada,
            metadataURI,
            agora
        );
    }

    function emitirGarrafas(uint256 envasamentoId, uint256 quantidade) external {
        Envasamento storage envasamento = _exigirEnvasamento(envasamentoId);
        if (quantidade == 0) revert QuantidadeInvalida();
        if (msg.sender != envasamento.envasador) revert NaoEhEnvasadorResponsavel();
        if (!contratoAcesso.ehEnvasador(msg.sender)) revert SemPermissao();
        if (envasamento.concluidoEm != 0) revert EnvasamentoJaConcluido();
        if (quantidade > envasamento.quantidadeDeclarada - envasamento.quantidadeEmitida) {
            revert QuantidadeExcedeDeclarada();
        }

        uint64 agora = uint64(block.timestamp);
        envasamento.quantidadeEmitida += quantidade;
        for (uint256 i = 0; i < quantidade; i++) {
            uint256 tokenId = _proximoTokenId++;
            _mint(envasamento.envasador, tokenId);
            _garrafas[tokenId] = Garrafa(envasamentoId, agora);
            _garrafasPorEnvasamento[envasamentoId].push(tokenId);
            emit GarrafaEmitida(tokenId, envasamentoId, envasamento.envasador, agora);
        }

        if (envasamento.quantidadeEmitida == envasamento.quantidadeDeclarada) {
            envasamento.concluidoEm = agora;
            emit EnvasamentoConcluido(
                envasamentoId,
                envasamento.loteProducaoId,
                envasamento.envasador,
                agora
            );
        }
    }

    function approve(address, uint256) public pure override {
        revert AprovacaoNaoPermitida();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert AprovacaoNaoPermitida();
    }

    function transferFrom(address, address, uint256) public pure override {
        revert TokenNaoTransferivel();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert TokenNaoTransferivel();
    }

    /** @dev Permite somente mint. Transferência e destruição de token existente revertem. */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0) || to == address(0)) revert TokenNaoTransferivel();
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _envasamentos[_garrafas[tokenId].envasamentoId].metadataURI;
    }

    function envasamentoExiste(uint256 envasamentoId) public view returns (bool) {
        return _envasamentos[envasamentoId].envasador != address(0);
    }

    function obterEnvasamento(uint256 envasamentoId) external view returns (Envasamento memory) {
        return _exigirEnvasamento(envasamentoId);
    }

    function envasamentoConcluido(uint256 envasamentoId) external view returns (bool) {
        return _exigirEnvasamento(envasamentoId).concluidoEm != 0;
    }

    function totalEnvasamentos() external view returns (uint256) {
        return _proximoEnvasamentoId - 1;
    }

    function totalEnvasamentosDaProducao(uint256 loteProducaoId) external view returns (uint256) {
        return _envasamentosPorProducao[loteProducaoId].length;
    }

    function envasamentoDaProducaoPorIndice(uint256 loteProducaoId, uint256 indice)
        external
        view
        returns (uint256)
    {
        if (indice >= _envasamentosPorProducao[loteProducaoId].length) revert IndiceForaDosLimites();
        return _envasamentosPorProducao[loteProducaoId][indice];
    }

    function totalGarrafas() external view returns (uint256) {
        return _proximoTokenId - 1;
    }

    function garrafaExiste(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    function obterGarrafa(uint256 tokenId) external view returns (Garrafa memory) {
        _exigirGarrafa(tokenId);
        return _garrafas[tokenId];
    }

    function envasamentoDaGarrafa(uint256 tokenId) external view returns (uint256) {
        _exigirGarrafa(tokenId);
        return _garrafas[tokenId].envasamentoId;
    }

    function totalGarrafasDoEnvasamento(uint256 envasamentoId) external view returns (uint256) {
        _exigirEnvasamento(envasamentoId);
        return _garrafasPorEnvasamento[envasamentoId].length;
    }

    function garrafaDoEnvasamentoPorIndice(uint256 envasamentoId, uint256 indice)
        external
        view
        returns (uint256)
    {
        _exigirEnvasamento(envasamentoId);
        if (indice >= _garrafasPorEnvasamento[envasamentoId].length) revert IndiceForaDosLimites();
        return _garrafasPorEnvasamento[envasamentoId][indice];
    }

    function _exigirEnvasamento(uint256 envasamentoId) private view returns (Envasamento storage envasamento) {
        envasamento = _envasamentos[envasamentoId];
        if (envasamento.envasador == address(0)) revert EnvasamentoInexistente();
    }

    function _exigirGarrafa(uint256 tokenId) private view {
        if (!garrafaExiste(tokenId)) revert GarrafaInexistente();
    }
}
