// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IContratoAcesso.sol";
import "./bibliotecas/ReferenciaIPFS.sol";

contract ContratoInsumos {
    using ReferenciaIPFS for string;

    enum TipoInsumo {
        NaoDefinido,
        MateriaPrimaAgricola,
        BaseAlcoolica,
        Agua,
        Levedura,
        Zimbro,
        Botanico,
        Outro
    }

    enum ResultadoAvaliacao {
        NaoAvaliado,
        Aprovado,
        Rejeitado
    }

    struct LoteInsumo {
        address fornecedor;
        TipoInsumo tipo;
        uint64 registradoEm;
        string metadataURI;
    }

    struct AvaliacaoInsumo {
        ResultadoAvaliacao resultado;
        uint64 registradoEm;
        string metadataURI;
    }

    struct CorrecaoDocumental {
        uint64 registradoEm;
        string metadataURI;
    }

    struct InvalidacaoInsumo {
        bool invalidado;
        uint64 registradoEm;
        string metadataURI;
    }

    error ContratoAcessoInvalido();
    error SemPermissao();
    error LoteInsumoInexistente();
    error TipoInsumoInvalido();
    error ResultadoAvaliacaoInvalido();
    error ReferenciaIPFSInvalida();
    error NaoEhFornecedorOriginal();
    error LoteInsumoEstaInvalidado();
    error LoteInsumoJaInvalidado();
    error IndiceForaDosLimites();

    IContratoAcesso public immutable contratoAcesso;

    uint256 private _proximoInsumoId = 1;
    mapping(uint256 => LoteInsumo) private _lotes;
    mapping(address => uint256[]) private _insumosPorFornecedor;
    mapping(uint256 => mapping(address => AvaliacaoInsumo[])) private _avaliacoes;
    mapping(uint256 => CorrecaoDocumental[]) private _correcoes;
    mapping(uint256 => InvalidacaoInsumo) private _invalidacoes;

    event LoteInsumoRegistrado(
        uint256 indexed insumoId,
        address indexed fornecedor,
        TipoInsumo indexed tipo,
        string metadataURI,
        uint64 registradoEm
    );
    event InsumoAvaliado(
        uint256 indexed insumoId,
        address indexed produtor,
        ResultadoAvaliacao resultado,
        string metadataURI,
        uint64 registradoEm,
        uint256 indice
    );
    event CorrecaoDocumentalRegistrada(
        uint256 indexed insumoId,
        address indexed fornecedor,
        string metadataURI,
        uint64 registradoEm,
        uint256 indice
    );
    event LoteInsumoInvalidado(
        uint256 indexed insumoId,
        address indexed fornecedor,
        string metadataURI,
        uint64 registradoEm
    );

    constructor(address enderecoContratoAcesso) {
        if (enderecoContratoAcesso == address(0) || enderecoContratoAcesso.code.length == 0) {
            revert ContratoAcessoInvalido();
        }
        contratoAcesso = IContratoAcesso(enderecoContratoAcesso);
    }

    function registrarLoteInsumo(TipoInsumo tipo, string calldata metadataURI)
        external
        returns (uint256 insumoId)
    {
        if (!contratoAcesso.ehFornecedor(msg.sender)) revert SemPermissao();
        if (tipo == TipoInsumo.NaoDefinido) revert TipoInsumoInvalido();
        _validarReferencia(metadataURI);

        insumoId = _proximoInsumoId++;
        uint64 agora = uint64(block.timestamp);
        _lotes[insumoId] = LoteInsumo(msg.sender, tipo, agora, metadataURI);
        _insumosPorFornecedor[msg.sender].push(insumoId);

        emit LoteInsumoRegistrado(insumoId, msg.sender, tipo, metadataURI, agora);
    }

    function avaliarInsumo(
        uint256 insumoId,
        ResultadoAvaliacao resultado,
        string calldata metadataURI
    ) external {
        if (!contratoAcesso.ehProdutor(msg.sender)) revert SemPermissao();
        _exigirLote(insumoId);
        if (_invalidacoes[insumoId].invalidado) revert LoteInsumoEstaInvalidado();
        if (resultado == ResultadoAvaliacao.NaoAvaliado) revert ResultadoAvaliacaoInvalido();
        _validarReferencia(metadataURI);

        uint64 agora = uint64(block.timestamp);
        AvaliacaoInsumo[] storage historico = _avaliacoes[insumoId][msg.sender];
        uint256 indice = historico.length;
        historico.push(AvaliacaoInsumo(resultado, agora, metadataURI));
        emit InsumoAvaliado(insumoId, msg.sender, resultado, metadataURI, agora, indice);
    }

    function registrarCorrecaoDocumental(uint256 insumoId, string calldata metadataURI) external {
        LoteInsumo storage lote = _exigirLote(insumoId);
        if (msg.sender != lote.fornecedor) revert NaoEhFornecedorOriginal();
        if (!contratoAcesso.ehFornecedor(msg.sender)) revert SemPermissao();
        if (_invalidacoes[insumoId].invalidado) revert LoteInsumoEstaInvalidado();
        _validarReferencia(metadataURI);

        uint64 agora = uint64(block.timestamp);
        CorrecaoDocumental[] storage correcoes = _correcoes[insumoId];
        uint256 indice = correcoes.length;
        correcoes.push(CorrecaoDocumental(agora, metadataURI));
        emit CorrecaoDocumentalRegistrada(insumoId, msg.sender, metadataURI, agora, indice);
    }

    function invalidarLoteInsumo(uint256 insumoId, string calldata metadataURI) external {
        LoteInsumo storage lote = _exigirLote(insumoId);
        if (msg.sender != lote.fornecedor) revert NaoEhFornecedorOriginal();
        if (!contratoAcesso.ehFornecedor(msg.sender)) revert SemPermissao();
        if (_invalidacoes[insumoId].invalidado) revert LoteInsumoJaInvalidado();
        _validarReferencia(metadataURI);

        uint64 agora = uint64(block.timestamp);
        _invalidacoes[insumoId] = InvalidacaoInsumo(true, agora, metadataURI);
        emit LoteInsumoInvalidado(insumoId, msg.sender, metadataURI, agora);
    }

    function obterLoteInsumo(uint256 insumoId) external view returns (LoteInsumo memory) {
        return _exigirLote(insumoId);
    }

    function loteInsumoExiste(uint256 insumoId) public view returns (bool) {
        return _lotes[insumoId].fornecedor != address(0);
    }

    function loteInsumoValido(uint256 insumoId) external view returns (bool) {
        return loteInsumoExiste(insumoId) && !_invalidacoes[insumoId].invalidado;
    }

    function totalLotesInsumo() external view returns (uint256) {
        return _proximoInsumoId - 1;
    }

    function totalInsumosDoFornecedor(address fornecedor) external view returns (uint256) {
        return _insumosPorFornecedor[fornecedor].length;
    }

    function insumoDoFornecedorPorIndice(address fornecedor, uint256 indice)
        external
        view
        returns (uint256)
    {
        if (indice >= _insumosPorFornecedor[fornecedor].length) revert IndiceForaDosLimites();
        return _insumosPorFornecedor[fornecedor][indice];
    }

    function totalAvaliacoes(uint256 insumoId, address produtor) external view returns (uint256) {
        _exigirLote(insumoId);
        return _avaliacoes[insumoId][produtor].length;
    }

    function avaliacaoPorIndice(uint256 insumoId, address produtor, uint256 indice)
        external
        view
        returns (AvaliacaoInsumo memory)
    {
        _exigirLote(insumoId);
        AvaliacaoInsumo[] storage historico = _avaliacoes[insumoId][produtor];
        if (indice >= historico.length) revert IndiceForaDosLimites();
        return historico[indice];
    }

    function resultadoAtual(uint256 insumoId, address produtor)
        public
        view
        returns (ResultadoAvaliacao)
    {
        _exigirLote(insumoId);
        AvaliacaoInsumo[] storage historico = _avaliacoes[insumoId][produtor];
        if (historico.length == 0) return ResultadoAvaliacao.NaoAvaliado;
        return historico[historico.length - 1].resultado;
    }

    function aprovadoPor(uint256 insumoId, address produtor) external view returns (bool) {
        _exigirLote(insumoId);
        if (_invalidacoes[insumoId].invalidado) return false;
        return resultadoAtual(insumoId, produtor) == ResultadoAvaliacao.Aprovado;
    }

    function totalCorrecoes(uint256 insumoId) external view returns (uint256) {
        _exigirLote(insumoId);
        return _correcoes[insumoId].length;
    }

    function correcaoPorIndice(uint256 insumoId, uint256 indice)
        external
        view
        returns (CorrecaoDocumental memory)
    {
        _exigirLote(insumoId);
        if (indice >= _correcoes[insumoId].length) revert IndiceForaDosLimites();
        return _correcoes[insumoId][indice];
    }

    function obterInvalidacao(uint256 insumoId) external view returns (InvalidacaoInsumo memory) {
        _exigirLote(insumoId);
        return _invalidacoes[insumoId];
    }

    function _exigirLote(uint256 insumoId) private view returns (LoteInsumo storage lote) {
        lote = _lotes[insumoId];
        if (lote.fornecedor == address(0)) revert LoteInsumoInexistente();
    }

    function _validarReferencia(string calldata metadataURI) private pure {
        if (!metadataURI.ehValida()) revert ReferenciaIPFSInvalida();
    }
}
