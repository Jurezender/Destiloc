// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "./AcessoProtegido.sol";
import "./TiposCadeia.sol";

/// @dev Interface mínima consumida do ContratoLote.
interface IContratoLote {
    function loteExiste(uint256 loteId) external view returns (bool);
    function producaoConcluida(uint256 loteId) external view returns (bool);
    function fabricanteDoLote(uint256 loteId) external view returns (address);
}

/**
 * @title ContratoTokenizacao
 * @notice Emite a identidade digital individual de cada garrafa, no padrão
 *         ERC-721, vinculada ao lote de origem.
 *
 *         A emissão é permitida somente após o registro digital da conclusão
 *         da produção e do engarrafamento no ContratoLote.
 *
 *         O token é emitido para o fabricante do lote e NÃO é transferível.
 *         Ele representa a identidade permanente da garrafa e a chave de
 *         consulta do seu histórico, e não a propriedade nem a custódia. A
 *         custódia é mantida separadamente pelo ContratoRastreamento.
 */
contract ContratoTokenizacao is ERC721URIStorage, AcessoProtegido {
    using ReferenciaIPFS for string;

    bytes32 public constant FABRICANTE_ROLE = keccak256("FABRICANTE_ROLE");

    /// @dev Limite de garrafas por transação, para conter o custo em gas.
    uint256 public constant MAXIMO_POR_TRANSACAO = 50;

    IContratoLote public immutable contratoLote;

    uint256 private _proximoTokenId = 1;

    /// @notice Lote de origem de cada garrafa.
    mapping(uint256 => uint256) public loteDoToken;

    event GarrafaEmitida(
        uint256 indexed tokenId,
        uint256 indexed loteId,
        address indexed fabricante,
        string uri
    );

    constructor(address enderecoContratoLote) ERC721("Garrafa Rastreavel", "GRF") {
        require(enderecoContratoLote != address(0), "Endereco do ContratoLote invalido");
        contratoLote = IContratoLote(enderecoContratoLote);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(FABRICANTE_ROLE, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Emissão
    // ─────────────────────────────────────────────────────────────────────

    function emitirGarrafa(uint256 loteId, string calldata uri)
        external
        onlyRole(FABRICANTE_ROLE)
        returns (uint256)
    {
        _verificarLote(loteId);
        return _emitir(loteId, uri);
    }

    /**
     * @notice Emite várias garrafas do mesmo lote em uma transação.
     * @dev A operação é atômica por construção da EVM. Se qualquer referência
     *      do array for inválida, toda a transação reverte, nenhum token é
     *      criado e o contador de identificadores não avança.
     */
    function emitirGarrafasEmLote(uint256 loteId, string[] calldata uris)
        external
        onlyRole(FABRICANTE_ROLE)
        returns (uint256[] memory)
    {
        require(uris.length > 0, "Lista de referencias vazia");
        require(uris.length <= MAXIMO_POR_TRANSACAO, "Excede o maximo por transacao");
        _verificarLote(loteId);

        uint256[] memory ids = new uint256[](uris.length);
        for (uint256 i = 0; i < uris.length; i++) {
            ids[i] = _emitir(loteId, uris[i]);
        }
        return ids;
    }

    function _verificarLote(uint256 loteId) internal view {
        require(contratoLote.loteExiste(loteId), "Lote inexistente");
        require(contratoLote.producaoConcluida(loteId), "Producao do lote nao concluida");
        require(contratoLote.fabricanteDoLote(loteId) == msg.sender, "Apenas o fabricante do lote");
    }

    function _emitir(uint256 loteId, string calldata uri) internal returns (uint256) {
        require(uri.ehReferenciaValida(), "Referencia de metadados fora do formato ipfs://");
        uint256 tokenId = _proximoTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, uri);
        loteDoToken[tokenId] = loteId;
        emit GarrafaEmitida(tokenId, loteId, msg.sender, uri);
        return tokenId;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Leitura
    // ─────────────────────────────────────────────────────────────────────

    function existeGarrafa(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    /// @notice Reúne, em uma leitura, o que a consulta precisa deste contrato.
    function dadosDaGarrafa(uint256 tokenId)
        external
        view
        returns (uint256 loteId, string memory uri, address fabricante)
    {
        require(existeGarrafa(tokenId), "Garrafa inexistente");
        return (loteDoToken[tokenId], tokenURI(tokenId), ownerOf(tokenId));
    }

    function totalEmitidas() external view returns (uint256) {
        return _proximoTokenId - 1;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Não transferibilidade
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Permite apenas a emissão. Qualquer transferência entre endereços
    ///      é recusada, o que impede que exista uma noção de titularidade em
    ///      conflito com o custodiante mantido pelo ContratoRastreamento.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address de = _ownerOf(tokenId);
        require(de == address(0), "Garrafa nao transferivel");
        return super._update(to, tokenId, auth);
    }

    // As funções approve e setApprovalForAll NÃO são sobrescritas, de modo
    // deliberado. Sobrescrevê-las exigiria declará-las como view ou pure, o
    // que alteraria a mutabilidade anunciada na ABI e afastaria a assinatura
    // do padrão ERC-721 sem necessidade. Uma aprovação concedida aqui é
    // inofensiva: a transferência é bloqueada em _update, que é o único
    // caminho por onde a titularidade poderia mudar. O desvio em relação ao
    // padrão fica restrito ao comportamento, e não à interface.

    // ─────────────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControlEnumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
