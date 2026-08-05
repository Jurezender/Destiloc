// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AcessoProtegido.sol";
import "./TiposCadeia.sol";

/// @dev Interface mínima consumida do ContratoTokenizacao.
interface IContratoTokenizacao {
    function existeGarrafa(uint256 tokenId) external view returns (bool);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @title ContratoRastreamento
 * @notice Trata exclusivamente a custódia individual posterior à emissão:
 *         expedição, confirmação de recebimento, cancelamento de expedição e
 *         transferências sucessivas.
 *
 *         Não conhece etapas produtivas. O histórico de produção pertence ao
 *         lote e é mantido pelo ContratoLote.
 *
 *         A custódia muda apenas quando o destinatário indicado confirma o
 *         recebimento. Ninguém declara sozinho ter recebido, e ninguém
 *         transfere a custódia para quem não a aceitou.
 */
contract ContratoRastreamento is AcessoProtegido {
    bytes32 public constant FABRICANTE_ROLE = keccak256("FABRICANTE_ROLE");
    bytes32 public constant DISTRIBUIDOR_ROLE = keccak256("DISTRIBUIDOR_ROLE");
    bytes32 public constant VAREJISTA_ROLE = keccak256("VAREJISTA_ROLE");

    IContratoTokenizacao public immutable tokenizacao;

    struct EventoCustodia {
        TipoEventoCustodia tipo;
        address ator;
        address contraparte;
        uint64 timestamp;
        string localizacao;
    }

    /// @dev Zero enquanto nenhum recebimento tiver sido confirmado. Nesse
    ///      estado, o custodiante é derivado do titular do token.
    mapping(uint256 => address) private _custodiante;

    /// @dev Zero quando não há expedição pendente.
    mapping(uint256 => address) private _destinatarioPendente;

    mapping(uint256 => EventoCustodia[]) private _historico;

    event GarrafaExpedida(
        uint256 indexed tokenId,
        address indexed remetente,
        address indexed destinatario,
        string localizacao,
        uint64 timestamp
    );

    event RecebimentoConfirmado(
        uint256 indexed tokenId,
        address indexed destinatario,
        address indexed remetente,
        string localizacao,
        uint64 timestamp
    );

    event ExpedicaoCancelada(
        uint256 indexed tokenId,
        address indexed remetente,
        address indexed destinatario,
        string motivo,
        uint64 timestamp
    );

    constructor(address enderecoContratoTokenizacao) {
        require(enderecoContratoTokenizacao != address(0), "Endereco do ContratoTokenizacao invalido");
        tokenizacao = IContratoTokenizacao(enderecoContratoTokenizacao);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(FABRICANTE_ROLE, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Custódia
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Detentor atual da garrafa.
     * @dev Enquanto nenhum recebimento foi confirmado, o custodiante é o
     *      titular do token, que é sempre o fabricante do lote, já que o token
     *      não circula. Depois da primeira confirmação, prevalece o valor
     *      armazenado. Essa derivação dispensa uma transação de inicialização
     *      e evita que o ContratoTokenizacao precise conhecer este contrato.
     */
    function custodianteAtual(uint256 tokenId) public view returns (address) {
        require(tokenizacao.existeGarrafa(tokenId), "Garrafa inexistente");
        address armazenado = _custodiante[tokenId];
        return armazenado == address(0) ? tokenizacao.ownerOf(tokenId) : armazenado;
    }

    /**
     * @notice Registra a saída da garrafa rumo a um destinatário identificado.
     *         A custódia NÃO muda aqui. Ela muda apenas na confirmação.
     */
    function expedir(uint256 tokenId, address destinatario, string calldata localizacao) external {
        address remetente = custodianteAtual(tokenId);
        require(msg.sender == remetente, "Apenas o custodiante atual");
        require(_destinatarioPendente[tokenId] == address(0), "Ja existe expedicao pendente");
        require(destinatario != address(0), "Destinatario invalido");
        require(destinatario != remetente, "Destinatario igual ao remetente");
        _verificarTransicao(remetente, destinatario);

        _destinatarioPendente[tokenId] = destinatario;
        _historico[tokenId].push(
            EventoCustodia({
                tipo: TipoEventoCustodia.Expedicao,
                ator: msg.sender,
                contraparte: destinatario,
                timestamp: uint64(block.timestamp),
                localizacao: localizacao
            })
        );

        emit GarrafaExpedida(tokenId, msg.sender, destinatario, localizacao, uint64(block.timestamp));
    }

    /// @notice Somente o destinatário indicado confirma, e é a confirmação
    ///         que efetivamente transfere a custódia.
    /// @dev O papel do destinatário é verificado NOVAMENTE aqui, e não apenas
    ///      na expedição. Se ele tiver sido revogado no intervalo entre uma
    ///      coisa e outra, a confirmação é recusada, a custódia permanece com
    ///      o remetente e este pode cancelar a pendência.
    function confirmarRecebimento(uint256 tokenId, string calldata localizacao) external {
        address destinatario = _destinatarioPendente[tokenId];
        require(destinatario != address(0), "Nao existe expedicao pendente");
        require(msg.sender == destinatario, "Apenas o destinatario indicado");
        require(
            hasRole(DISTRIBUIDOR_ROLE, msg.sender) || hasRole(VAREJISTA_ROLE, msg.sender),
            "Destinatario nao possui mais papel autorizado"
        );

        address remetente = custodianteAtual(tokenId);
        _custodiante[tokenId] = destinatario;
        _destinatarioPendente[tokenId] = address(0);

        _historico[tokenId].push(
            EventoCustodia({
                tipo: TipoEventoCustodia.Recebimento,
                ator: msg.sender,
                contraparte: remetente,
                timestamp: uint64(block.timestamp),
                localizacao: localizacao
            })
        );

        emit RecebimentoConfirmado(tokenId, msg.sender, remetente, localizacao, uint64(block.timestamp));
    }

    /// @notice Encerra uma expedição ainda não confirmada. A custódia
    ///         permanece com quem expediu.
    function cancelarExpedicao(uint256 tokenId, string calldata motivo) external {
        address destinatario = _destinatarioPendente[tokenId];
        require(destinatario != address(0), "Nao existe expedicao pendente");
        require(msg.sender == custodianteAtual(tokenId), "Apenas o custodiante atual");

        _destinatarioPendente[tokenId] = address(0);
        _historico[tokenId].push(
            EventoCustodia({
                tipo: TipoEventoCustodia.Cancelamento,
                ator: msg.sender,
                contraparte: destinatario,
                timestamp: uint64(block.timestamp),
                localizacao: motivo
            })
        );

        emit ExpedicaoCancelada(tokenId, msg.sender, destinatario, motivo, uint64(block.timestamp));
    }

    /**
     * @dev Transições permitidas no fluxo normal do protótipo:
     *        fabricante   -> distribuidor ou varejista
     *        distribuidor -> outro distribuidor ou varejista
     *        varejista    -> nenhuma, é estado terminal
     *
     *      Devoluções, recolhimentos e movimentações reversas não integram
     *      esta etapa e constam entre as limitações do trabalho.
     */
    function _verificarTransicao(address remetente, address destinatario) internal view {
        if (hasRole(FABRICANTE_ROLE, remetente)) {
            require(
                hasRole(DISTRIBUIDOR_ROLE, destinatario) || hasRole(VAREJISTA_ROLE, destinatario),
                "Transicao invalida: fabricante expede para distribuidor ou varejista"
            );
        } else if (hasRole(DISTRIBUIDOR_ROLE, remetente)) {
            require(
                hasRole(DISTRIBUIDOR_ROLE, destinatario) || hasRole(VAREJISTA_ROLE, destinatario),
                "Transicao invalida: distribuidor expede para distribuidor ou varejista"
            );
        } else {
            revert("Transicao invalida: remetente sem papel que permita expedicao");
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Exclusividade dos papéis operacionais
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Papel operacional detido por uma conta, ou bytes32(0) se nenhum.
     * @dev Consumida pela interface para apresentar o participante sem
     *      precisar consultar os três papéis separadamente.
     */
    function papelOperacional(address conta) public view returns (bytes32) {
        if (hasRole(FABRICANTE_ROLE, conta)) return FABRICANTE_ROLE;
        if (hasRole(DISTRIBUIDOR_ROLE, conta)) return DISTRIBUIDOR_ROLE;
        if (hasRole(VAREJISTA_ROLE, conta)) return VAREJISTA_ROLE;
        return bytes32(0);
    }

    function _ehPapelOperacional(bytes32 papel) private pure returns (bool) {
        return papel == FABRICANTE_ROLE || papel == DISTRIBUIDOR_ROLE || papel == VAREJISTA_ROLE;
    }

    /**
     * @dev Os três papéis operacionais são mutuamente exclusivos.
     *
     *      Sem essa regra, o varejista não seria efetivamente terminal: uma
     *      conta que detivesse ao mesmo tempo os papéis de varejista e de
     *      distribuidor poderia receber como varejista e, em seguida, expedir
     *      como distribuidor, contornando o encerramento do fluxo.
     *
     *      A administração não é papel operacional. Uma conta pode acumular
     *      DEFAULT_ADMIN_ROLE com um papel operacional, o que preserva o
     *      arranjo em que o fabricante também administra os papéis.
     */
    function _grantRole(bytes32 papel, address conta)
        internal
        virtual
        override
        returns (bool)
    {
        if (_ehPapelOperacional(papel)) {
            bytes32 atual = papelOperacional(conta);
            require(
                atual == bytes32(0) || atual == papel,
                "Conta ja possui outro papel operacional"
            );
        }
        return super._grantRole(papel, conta);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Leitura
    // ─────────────────────────────────────────────────────────────────────

    function expedicaoPendente(uint256 tokenId)
        external
        view
        returns (bool pendente, address destinatario)
    {
        address alvo = _destinatarioPendente[tokenId];
        return (alvo != address(0), alvo);
    }

    function getHistorico(uint256 tokenId) external view returns (EventoCustodia[] memory) {
        return _historico[tokenId];
    }

    function totalEventos(uint256 tokenId) external view returns (uint256) {
        return _historico[tokenId].length;
    }

    /// @notice Reúne, em uma leitura, o que a consulta precisa deste contrato.
    function situacaoCustodia(uint256 tokenId)
        external
        view
        returns (address custodiante, bool pendente, address destinatario, uint256 eventos)
    {
        custodiante = custodianteAtual(tokenId);
        destinatario = _destinatarioPendente[tokenId];
        pendente = destinatario != address(0);
        eventos = _historico[tokenId].length;
    }
}
