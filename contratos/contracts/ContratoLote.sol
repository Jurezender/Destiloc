// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AcessoProtegido.sol";
import "./TiposCadeia.sol";

/**
 * @title ContratoLote
 * @notice Conduz o fluxo produtivo do lote, do cadastro à conclusão.
 *
 *         O lote declara, no cadastro, a sequência de etapas produtivas que
 *         seu processo executa. O contrato valida a estrutura dessa sequência
 *         e, a partir daí, só aceita o registro da próxima etapa prevista.
 *
 *         As etapas produtivas pertencem ao LOTE, e não à garrafa individual.
 *         A emissão das garrafas, tratada pelo ContratoTokenizacao, é permitida
 *         somente após o registro digital da conclusão da produção e do
 *         engarrafamento.
 */
contract ContratoLote is AcessoProtegido {
    using ReferenciaIPFS for string;

    bytes32 public constant FABRICANTE_ROLE = keccak256("FABRICANTE_ROLE");

    /// @dev Limite de etapas por sequência, para conter o custo em gas.
    uint256 public constant MAXIMO_ETAPAS = 12;

    /// @dev Menor sequência possível: recebimento, destilação e engarrafamento.
    uint256 public constant MINIMO_ETAPAS = 3;

    struct Lote {
        uint256 id;
        address fabricante;
        string tipoBebida;
        string insumos;
        uint256 indiceAtual;   // quantas etapas da sequência já foram registradas
        uint64 dataRegistro;
        uint64 dataConclusao;  // zero enquanto a produção não termina
        bool existe;
    }

    struct EventoProducao {
        EtapaProdutiva etapa;
        address ator;
        uint64 timestamp;
        string localizacao;
        string metadadosEtapaURI; // referência ipfs:// opcional, ver observação abaixo
    }

    uint256 private _proximoLoteId = 1;
    mapping(uint256 => Lote) private _lotes;
    mapping(uint256 => EtapaProdutiva[]) private _sequencias;
    mapping(uint256 => EventoProducao[]) private _historicoProducao;

    event LoteRegistrado(
        uint256 indexed loteId,
        address indexed fabricante,
        string tipoBebida,
        uint256 totalEtapas,
        uint64 dataRegistro
    );

    event EtapaProdutivaRegistrada(
        uint256 indexed loteId,
        address indexed ator,
        EtapaProdutiva indexed etapa,
        uint256 indice,
        string localizacao,
        string metadadosEtapaURI,
        uint64 timestamp
    );

    event ProducaoConcluida(uint256 indexed loteId, uint64 dataConclusao);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(FABRICANTE_ROLE, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Cadastro
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Registra um lote e fixa sua sequência produtiva.
     * @param sequencia Ordem das etapas que este processo executa. Precisa
     *        obedecer à gramática validada por _validarSequencia.
     */
    function registrarLote(
        string calldata tipoBebida,
        string calldata insumos,
        EtapaProdutiva[] calldata sequencia
    ) external onlyRole(FABRICANTE_ROLE) returns (uint256) {
        _validarSequencia(sequencia);

        uint256 loteId = _proximoLoteId++;
        _lotes[loteId] = Lote({
            id: loteId,
            fabricante: msg.sender,
            tipoBebida: tipoBebida,
            insumos: insumos,
            indiceAtual: 0,
            dataRegistro: uint64(block.timestamp),
            dataConclusao: 0,
            existe: true
        });

        for (uint256 i = 0; i < sequencia.length; i++) {
            _sequencias[loteId].push(sequencia[i]);
        }

        emit LoteRegistrado(loteId, msg.sender, tipoBebida, sequencia.length, uint64(block.timestamp));
        return loteId;
    }

    /**
     * @dev Gramática aceita:
     *
     *        RecebimentoMateriaPrima
     *        TransformacaoDestilacao+
     *        ( Envelhecimento | Finalizacao )*
     *        Engarrafamento
     *
     *      A repetição de TransformacaoDestilacao existe porque determinados
     *      processos possuem mais de um ciclo de transformação e destilação.
     *      O modelo não impõe uma quantidade universal: cada lote declara
     *      quantos ciclos seu processo executa.
     */
    function _validarSequencia(EtapaProdutiva[] calldata sequencia) internal pure {
        uint256 n = sequencia.length;
        require(n >= MINIMO_ETAPAS, "Sequencia: minimo de tres etapas");
        require(n <= MAXIMO_ETAPAS, "Sequencia: excede o maximo de etapas");
        require(
            sequencia[0] == EtapaProdutiva.RecebimentoMateriaPrima,
            "Sequencia: deve comecar em recebimento de materia-prima"
        );
        require(
            sequencia[n - 1] == EtapaProdutiva.Engarrafamento,
            "Sequencia: deve terminar em engarrafamento"
        );

        // Um ou mais ciclos consecutivos de transformação e destilação.
        uint256 i = 1;
        uint256 ciclos = 0;
        while (i < n - 1 && sequencia[i] == EtapaProdutiva.TransformacaoDestilacao) {
            ciclos++;
            i++;
        }
        require(ciclos >= 1, "Sequencia: exige transformacao e destilacao apos o recebimento");

        // Depois dos ciclos, apenas etapas opcionais até o engarrafamento.
        for (; i < n - 1; i++) {
            require(
                sequencia[i] == EtapaProdutiva.Envelhecimento ||
                    sequencia[i] == EtapaProdutiva.Finalizacao,
                "Sequencia: apos a destilacao apenas envelhecimento ou finalizacao"
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Avanço da produção
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Registra a próxima etapa prevista na sequência do lote.
     * @param etapaEsperada Redundante para o contrato, que já sabe qual é a
     *        próxima. Existe para tornar a intenção explícita na transação e
     *        impedir registro equivocado por dessincronia da interface.
     * @param metadadosEtapaURI Referência ipfs:// opcional. Pode apontar para
     *        um JSON contendo a lista de documentos associados à etapa. Quando
     *        informada, passa por validação SINTÁTICA, que não comprova a
     *        existência, a resolução nem a permanência do conteúdo.
     */
    function registrarEtapaProdutiva(
        uint256 loteId,
        EtapaProdutiva etapaEsperada,
        string calldata localizacao,
        string calldata metadadosEtapaURI
    ) external {
        Lote storage lote = _lotes[loteId];
        require(lote.existe, "Lote inexistente");
        require(hasRole(FABRICANTE_ROLE, msg.sender), "RBAC: apenas fabricante");
        require(msg.sender == lote.fabricante, "Apenas o fabricante do lote");

        EtapaProdutiva[] storage sequencia = _sequencias[loteId];
        require(lote.indiceAtual < sequencia.length, "Producao ja concluida");
        require(
            sequencia[lote.indiceAtual] == etapaEsperada,
            "Etapa diferente da prevista pela sequencia do lote"
        );

        if (!metadadosEtapaURI.ehVazia()) {
            require(
                metadadosEtapaURI.ehReferenciaValida(),
                "Referencia de metadados fora do formato ipfs://"
            );
        }

        uint256 indice = lote.indiceAtual;
        _historicoProducao[loteId].push(
            EventoProducao({
                etapa: etapaEsperada,
                ator: msg.sender,
                timestamp: uint64(block.timestamp),
                localizacao: localizacao,
                metadadosEtapaURI: metadadosEtapaURI
            })
        );
        lote.indiceAtual = indice + 1;

        emit EtapaProdutivaRegistrada(
            loteId,
            msg.sender,
            etapaEsperada,
            indice,
            localizacao,
            metadadosEtapaURI,
            uint64(block.timestamp)
        );

        if (lote.indiceAtual == sequencia.length) {
            lote.dataConclusao = uint64(block.timestamp);
            emit ProducaoConcluida(loteId, lote.dataConclusao);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Leitura
    // ─────────────────────────────────────────────────────────────────────

    function obterLote(uint256 loteId) external view returns (Lote memory) {
        require(_lotes[loteId].existe, "Lote inexistente");
        return _lotes[loteId];
    }

    function etapasDoLote(uint256 loteId) external view returns (EtapaProdutiva[] memory) {
        require(_lotes[loteId].existe, "Lote inexistente");
        return _sequencias[loteId];
    }

    function totalEtapas(uint256 loteId) external view returns (uint256) {
        return _sequencias[loteId].length;
    }

    function historicoProducao(uint256 loteId) external view returns (EventoProducao[] memory) {
        return _historicoProducao[loteId];
    }

    function proximaEtapa(uint256 loteId) external view returns (bool pendente, EtapaProdutiva etapa) {
        Lote storage lote = _lotes[loteId];
        if (!lote.existe) return (false, EtapaProdutiva.RecebimentoMateriaPrima);
        EtapaProdutiva[] storage sequencia = _sequencias[loteId];
        if (lote.indiceAtual >= sequencia.length) {
            return (false, EtapaProdutiva.Engarrafamento);
        }
        return (true, sequencia[lote.indiceAtual]);
    }

    function producaoConcluida(uint256 loteId) external view returns (bool) {
        Lote storage lote = _lotes[loteId];
        if (!lote.existe) return false;
        return lote.indiceAtual == _sequencias[loteId].length;
    }

    function loteExiste(uint256 loteId) external view returns (bool) {
        return _lotes[loteId].existe;
    }

    function fabricanteDoLote(uint256 loteId) external view returns (address) {
        return _lotes[loteId].fabricante;
    }

    function totalLotes() external view returns (uint256) {
        return _proximoLoteId - 1;
    }
}
