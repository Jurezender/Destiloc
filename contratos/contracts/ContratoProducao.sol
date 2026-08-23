// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IContratoAcesso.sol";
import "./interfaces/IContratoInsumos.sol";
import "./bibliotecas/ReferenciaIPFS.sol";

contract ContratoProducao {
    using ReferenciaIPFS for string;

    enum TipoBebida { NaoDefinido, Cachaca, Whisky, Vodca, Gin }
    enum EstadoProducao { Criado, EmProducao, Concluido }
    enum EtapaProducao {
        PreparacaoBase,
        Fermentacao,
        Destilacao,
        Retificacao,
        Maturacao,
        Filtragem,
        Blendagem,
        Aromatizacao,
        AjusteFinal
    }

    struct ConfiguracaoProducao {
        bool maturacaoAplicavel;
        bool retificacaoAplicavel;
        bool blendagemAplicavel;
        bool ajusteFinalAplicavel;
    }

    struct LoteProducao {
        address produtor;
        TipoBebida tipoBebida;
        EstadoProducao estado;
        uint64 criadoEm;
        uint64 concluidoEm;
        string metadataURI;
        string metadataURIConclusao;
    }

    struct RegistroEtapa {
        EtapaProducao etapa;
        address executadoPor;
        uint256 inicioInformado;
        uint256 fimInformado;
        uint64 registradoEm;
        string metadataURI;
    }

    error ContratoAcessoInvalido();
    error ContratoInsumosInvalido();
    error SemPermissao();
    error LoteProducaoInexistente();
    error TipoBebidaInvalido();
    error NaoEhProdutorResponsavel();
    error ReferenciaIPFSInvalida();
    error ConfiguracaoInvalida();
    error ConfiguracaoCongelada();
    error EstadoProducaoInvalido();
    error InsumoInexistente();
    error InsumoInvalido();
    error InsumoNaoAprovado();
    error InsumoJaVinculado();
    error InsumoNaoVinculado();
    error InsumoDuplicadoNaEtapa();
    error EtapaNaoAplicavel();
    error EtapaJaRegistrada();
    error PrecedenciaInvalida();
    error PeriodoInformadoInvalido();
    error RequisitoDeEtapaNaoAtendido();
    error RequisitoDeInsumoNaoAtendido();
    error IndiceForaDosLimites();

    IContratoAcesso public immutable contratoAcesso;
    IContratoInsumos public immutable contratoInsumos;

    uint256 private _proximoLoteId = 1;
    mapping(uint256 => LoteProducao) private _lotes;
    mapping(uint256 => ConfiguracaoProducao) private _configuracoes;
    mapping(address => uint256[]) private _lotesPorProdutor;
    mapping(uint256 => uint256[]) private _insumosVinculados;
    mapping(uint256 => mapping(uint256 => bool)) private _insumoVinculado;
    mapping(uint256 => RegistroEtapa[]) private _etapas;
    mapping(uint256 => mapping(EtapaProducao => bool)) private _etapaRegistrada;
    mapping(uint256 => mapping(uint256 => uint256[])) private _insumosPorIndiceEtapa;
    mapping(uint256 => uint256[]) private _insumosUtilizados;
    mapping(uint256 => mapping(uint256 => bool)) private _insumoUtilizado;
    mapping(uint256 => uint256[]) private _lotesPorInsumoUtilizado;

    event LoteProducaoCriado(
        uint256 indexed loteId,
        address indexed produtor,
        TipoBebida indexed tipoBebida,
        string metadataURI,
        uint64 criadoEm
    );
    event ConfiguracaoProducaoAtualizada(uint256 indexed loteId, address indexed produtor);
    event InsumoVinculadoAoLote(uint256 indexed loteId, uint256 indexed insumoId, address indexed produtor);
    event EtapaProducaoRegistrada(
        uint256 indexed loteId,
        EtapaProducao indexed etapa,
        address indexed executadoPor,
        uint256 indice,
        uint64 registradoEm
    );
    event ProducaoConcluida(
        uint256 indexed loteId,
        address indexed produtor,
        string metadataURI,
        uint64 concluidoEm
    );

    constructor(address enderecoContratoAcesso, address enderecoContratoInsumos) {
        if (enderecoContratoAcesso == address(0) || enderecoContratoAcesso.code.length == 0) {
            revert ContratoAcessoInvalido();
        }
        if (enderecoContratoInsumos == address(0) || enderecoContratoInsumos.code.length == 0) {
            revert ContratoInsumosInvalido();
        }
        contratoAcesso = IContratoAcesso(enderecoContratoAcesso);
        contratoInsumos = IContratoInsumos(enderecoContratoInsumos);
    }

    function criarLoteProducao(
        TipoBebida tipoBebida,
        ConfiguracaoProducao calldata configuracao,
        string calldata metadataURI
    ) external returns (uint256 loteId) {
        _exigirProdutor();
        if (tipoBebida == TipoBebida.NaoDefinido) revert TipoBebidaInvalido();
        _validarConfiguracao(tipoBebida, configuracao);
        _validarReferencia(metadataURI);

        loteId = _proximoLoteId++;
        uint64 agora = uint64(block.timestamp);
        _lotes[loteId] = LoteProducao({
            produtor: msg.sender,
            tipoBebida: tipoBebida,
            estado: EstadoProducao.Criado,
            criadoEm: agora,
            concluidoEm: 0,
            metadataURI: metadataURI,
            metadataURIConclusao: ""
        });
        _configuracoes[loteId] = configuracao;
        _lotesPorProdutor[msg.sender].push(loteId);
        emit LoteProducaoCriado(loteId, msg.sender, tipoBebida, metadataURI, agora);
    }

    function atualizarConfiguracao(uint256 loteId, ConfiguracaoProducao calldata configuracao) external {
        LoteProducao storage lote = _exigirLote(loteId);
        _exigirProdutorResponsavel(lote);
        if (lote.estado != EstadoProducao.Criado) revert ConfiguracaoCongelada();
        _validarConfiguracao(lote.tipoBebida, configuracao);
        _configuracoes[loteId] = configuracao;
        emit ConfiguracaoProducaoAtualizada(loteId, msg.sender);
    }

    function vincularInsumoAoLote(uint256 loteId, uint256 insumoId) external {
        LoteProducao storage lote = _exigirLote(loteId);
        _exigirProdutorResponsavel(lote);
        if (lote.estado == EstadoProducao.Concluido) revert EstadoProducaoInvalido();
        if (_insumoVinculado[loteId][insumoId]) revert InsumoJaVinculado();
        _exigirInsumoAprovado(insumoId, lote.produtor);
        _insumoVinculado[loteId][insumoId] = true;
        _insumosVinculados[loteId].push(insumoId);
        emit InsumoVinculadoAoLote(loteId, insumoId, msg.sender);
    }

    function registrarEtapa(
        uint256 loteId,
        EtapaProducao etapa,
        uint256[] calldata insumosUtilizados,
        uint256 inicioInformado,
        uint256 fimInformado,
        string calldata metadataURI
    ) external {
        LoteProducao storage lote = _exigirLote(loteId);
        _exigirProdutorResponsavel(lote);
        if (lote.estado == EstadoProducao.Concluido) revert EstadoProducaoInvalido();
        if (_etapaRegistrada[loteId][etapa]) revert EtapaJaRegistrada();
        _validarAplicabilidade(lote.tipoBebida, _configuracoes[loteId], etapa);
        _validarPrecedencia(loteId, lote.tipoBebida, _configuracoes[loteId], etapa);
        if (inicioInformado > fimInformado) revert PeriodoInformadoInvalido();
        _validarReferencia(metadataURI);
        _validarInsumosDaEtapa(loteId, lote.produtor, insumosUtilizados);

        uint64 agora = uint64(block.timestamp);
        uint256 indiceEtapa = _etapas[loteId].length;
        _etapas[loteId].push(RegistroEtapa(etapa, msg.sender, inicioInformado, fimInformado, agora, metadataURI));
        _etapaRegistrada[loteId][etapa] = true;

        for (uint256 i = 0; i < insumosUtilizados.length; i++) {
            uint256 insumoId = insumosUtilizados[i];
            _insumosPorIndiceEtapa[loteId][indiceEtapa].push(insumoId);
            if (!_insumoUtilizado[loteId][insumoId]) {
                _insumoUtilizado[loteId][insumoId] = true;
                _insumosUtilizados[loteId].push(insumoId);
                _lotesPorInsumoUtilizado[insumoId].push(loteId);
            }
        }

        if (lote.estado == EstadoProducao.Criado) lote.estado = EstadoProducao.EmProducao;
        emit EtapaProducaoRegistrada(loteId, etapa, msg.sender, indiceEtapa, agora);
    }

    function concluirProducao(uint256 loteId, string calldata metadataURI) external {
        LoteProducao storage lote = _exigirLote(loteId);
        _exigirProdutorResponsavel(lote);
        if (lote.estado != EstadoProducao.EmProducao) revert EstadoProducaoInvalido();
        _validarReferencia(metadataURI);
        _validarEtapasParaConclusao(loteId, lote.tipoBebida, _configuracoes[loteId]);
        _validarInsumosParaConclusao(loteId, lote.produtor, lote.tipoBebida);

        lote.estado = EstadoProducao.Concluido;
        lote.concluidoEm = uint64(block.timestamp);
        lote.metadataURIConclusao = metadataURI;
        emit ProducaoConcluida(loteId, msg.sender, metadataURI, lote.concluidoEm);
    }

    function loteProducaoExiste(uint256 loteId) public view returns (bool) {
        return _lotes[loteId].produtor != address(0);
    }

    function obterLoteProducao(uint256 loteId) external view returns (LoteProducao memory) {
        return _exigirLote(loteId);
    }

    function obterConfiguracao(uint256 loteId) external view returns (ConfiguracaoProducao memory) {
        _exigirLote(loteId);
        return _configuracoes[loteId];
    }

    function totalLotesProducao() external view returns (uint256) { return _proximoLoteId - 1; }
    function totalLotesDoProdutor(address produtor) external view returns (uint256) {
        return _lotesPorProdutor[produtor].length;
    }
    function loteDoProdutorPorIndice(address produtor, uint256 indice) external view returns (uint256) {
        if (indice >= _lotesPorProdutor[produtor].length) revert IndiceForaDosLimites();
        return _lotesPorProdutor[produtor][indice];
    }
    function totalInsumosVinculados(uint256 loteId) external view returns (uint256) {
        _exigirLote(loteId); return _insumosVinculados[loteId].length;
    }
    function insumoVinculadoPorIndice(uint256 loteId, uint256 indice) external view returns (uint256) {
        _exigirLote(loteId);
        if (indice >= _insumosVinculados[loteId].length) revert IndiceForaDosLimites();
        return _insumosVinculados[loteId][indice];
    }
    function insumoEstaVinculado(uint256 loteId, uint256 insumoId) external view returns (bool) {
        _exigirLote(loteId); return _insumoVinculado[loteId][insumoId];
    }
    function totalEtapas(uint256 loteId) external view returns (uint256) {
        _exigirLote(loteId); return _etapas[loteId].length;
    }
    function etapaPorIndice(uint256 loteId, uint256 indice) external view returns (RegistroEtapa memory) {
        _exigirLote(loteId);
        if (indice >= _etapas[loteId].length) revert IndiceForaDosLimites();
        return _etapas[loteId][indice];
    }
    function etapaFoiRegistrada(uint256 loteId, EtapaProducao etapa) external view returns (bool) {
        _exigirLote(loteId); return _etapaRegistrada[loteId][etapa];
    }
    function totalInsumosDaEtapa(uint256 loteId, uint256 indiceEtapa) external view returns (uint256) {
        _exigirIndiceEtapa(loteId, indiceEtapa); return _insumosPorIndiceEtapa[loteId][indiceEtapa].length;
    }
    function insumoDaEtapaPorIndice(uint256 loteId, uint256 indiceEtapa, uint256 indiceInsumo)
        external view returns (uint256)
    {
        _exigirIndiceEtapa(loteId, indiceEtapa);
        if (indiceInsumo >= _insumosPorIndiceEtapa[loteId][indiceEtapa].length) revert IndiceForaDosLimites();
        return _insumosPorIndiceEtapa[loteId][indiceEtapa][indiceInsumo];
    }
    function totalInsumosUtilizados(uint256 loteId) external view returns (uint256) {
        _exigirLote(loteId); return _insumosUtilizados[loteId].length;
    }
    function insumoUtilizadoPorIndice(uint256 loteId, uint256 indice) external view returns (uint256) {
        _exigirLote(loteId);
        if (indice >= _insumosUtilizados[loteId].length) revert IndiceForaDosLimites();
        return _insumosUtilizados[loteId][indice];
    }
    function totalLotesQueUtilizaramInsumo(uint256 insumoId) external view returns (uint256) {
        return _lotesPorInsumoUtilizado[insumoId].length;
    }
    function loteQueUtilizouInsumoPorIndice(uint256 insumoId, uint256 indice) external view returns (uint256) {
        if (indice >= _lotesPorInsumoUtilizado[insumoId].length) revert IndiceForaDosLimites();
        return _lotesPorInsumoUtilizado[insumoId][indice];
    }
    function loteProducaoConcluido(uint256 loteId) external view returns (bool) {
        LoteProducao storage lote = _exigirLote(loteId); return lote.estado == EstadoProducao.Concluido;
    }

    function _exigirProdutor() private view {
        if (!contratoAcesso.ehProdutor(msg.sender)) revert SemPermissao();
    }
    function _exigirProdutorResponsavel(LoteProducao storage lote) private view {
        _exigirProdutor();
        if (msg.sender != lote.produtor) revert NaoEhProdutorResponsavel();
    }
    function _exigirLote(uint256 loteId) private view returns (LoteProducao storage lote) {
        lote = _lotes[loteId];
        if (lote.produtor == address(0)) revert LoteProducaoInexistente();
    }
    function _exigirIndiceEtapa(uint256 loteId, uint256 indiceEtapa) private view {
        _exigirLote(loteId);
        if (indiceEtapa >= _etapas[loteId].length) revert IndiceForaDosLimites();
    }
    function _validarReferencia(string calldata metadataURI) private pure {
        if (!metadataURI.ehValida()) revert ReferenciaIPFSInvalida();
    }
    function _validarConfiguracao(TipoBebida tipo, ConfiguracaoProducao calldata c) private pure {
        bool invalida;
        if (tipo == TipoBebida.Cachaca) invalida = c.retificacaoAplicavel || c.blendagemAplicavel;
        else if (tipo == TipoBebida.Whisky) invalida = c.maturacaoAplicavel || c.retificacaoAplicavel;
        else if (tipo == TipoBebida.Vodca) invalida = c.maturacaoAplicavel || c.blendagemAplicavel;
        else if (tipo == TipoBebida.Gin) invalida = c.maturacaoAplicavel || c.retificacaoAplicavel || c.blendagemAplicavel;
        else invalida = true;
        if (invalida) revert ConfiguracaoInvalida();
    }
    function _exigirInsumoAprovado(uint256 insumoId, address produtor) private view {
        if (!contratoInsumos.loteInsumoExiste(insumoId)) revert InsumoInexistente();
        if (!contratoInsumos.loteInsumoValido(insumoId)) revert InsumoInvalido();
        if (!contratoInsumos.aprovadoPor(insumoId, produtor)) revert InsumoNaoAprovado();
    }
    function _validarInsumosDaEtapa(uint256 loteId, address produtor, uint256[] calldata insumos) private view {
        for (uint256 i = 0; i < insumos.length; i++) {
            uint256 insumoId = insumos[i];
            if (!_insumoVinculado[loteId][insumoId]) revert InsumoNaoVinculado();
            _exigirInsumoAprovado(insumoId, produtor);
            for (uint256 j = 0; j < i; j++) if (insumos[j] == insumoId) revert InsumoDuplicadoNaEtapa();
        }
    }

    function _validarAplicabilidade(
        TipoBebida tipo, ConfiguracaoProducao storage c, EtapaProducao etapa
    ) private view {
        bool aplicavel;
        if (tipo == TipoBebida.Cachaca) {
            aplicavel = etapa == EtapaProducao.PreparacaoBase || etapa == EtapaProducao.Fermentacao ||
                etapa == EtapaProducao.Destilacao || (etapa == EtapaProducao.Maturacao && c.maturacaoAplicavel) ||
                (etapa == EtapaProducao.AjusteFinal && c.ajusteFinalAplicavel);
        } else if (tipo == TipoBebida.Whisky) {
            aplicavel = etapa == EtapaProducao.PreparacaoBase || etapa == EtapaProducao.Fermentacao ||
                etapa == EtapaProducao.Destilacao || etapa == EtapaProducao.Maturacao ||
                (etapa == EtapaProducao.Blendagem && c.blendagemAplicavel) ||
                (etapa == EtapaProducao.AjusteFinal && c.ajusteFinalAplicavel);
        } else if (tipo == TipoBebida.Vodca) {
            aplicavel = (etapa == EtapaProducao.Retificacao && c.retificacaoAplicavel) ||
                etapa == EtapaProducao.Filtragem || etapa == EtapaProducao.Blendagem ||
                etapa == EtapaProducao.Aromatizacao ||
                (etapa == EtapaProducao.AjusteFinal && c.ajusteFinalAplicavel);
        } else if (tipo == TipoBebida.Gin) {
            aplicavel = etapa == EtapaProducao.Aromatizacao ||
                (etapa == EtapaProducao.AjusteFinal && c.ajusteFinalAplicavel);
        }
        if (!aplicavel) revert EtapaNaoAplicavel();
    }

    function _validarPrecedencia(
        uint256 loteId, TipoBebida tipo, ConfiguracaoProducao storage c, EtapaProducao etapa
    ) private view {
        if (tipo == TipoBebida.Cachaca) {
            if (etapa == EtapaProducao.PreparacaoBase) return;
            if (etapa == EtapaProducao.Fermentacao && _etapaRegistrada[loteId][EtapaProducao.PreparacaoBase]) return;
            if (etapa == EtapaProducao.Destilacao && _etapaRegistrada[loteId][EtapaProducao.Fermentacao]) return;
            if (etapa == EtapaProducao.Maturacao && _etapaRegistrada[loteId][EtapaProducao.Destilacao]) return;
            if (etapa == EtapaProducao.AjusteFinal && _etapaRegistrada[loteId][EtapaProducao.Destilacao] &&
                (!c.maturacaoAplicavel || _etapaRegistrada[loteId][EtapaProducao.Maturacao])) return;
        } else if (tipo == TipoBebida.Whisky) {
            if (etapa == EtapaProducao.PreparacaoBase) return;
            if (etapa == EtapaProducao.Fermentacao && _etapaRegistrada[loteId][EtapaProducao.PreparacaoBase]) return;
            if (etapa == EtapaProducao.Destilacao && _etapaRegistrada[loteId][EtapaProducao.Fermentacao]) return;
            if (etapa == EtapaProducao.Maturacao && _etapaRegistrada[loteId][EtapaProducao.Destilacao]) return;
            if (etapa == EtapaProducao.Blendagem && _etapaRegistrada[loteId][EtapaProducao.Maturacao]) return;
            if (etapa == EtapaProducao.AjusteFinal && _etapaRegistrada[loteId][EtapaProducao.Maturacao] &&
                (!c.blendagemAplicavel || _etapaRegistrada[loteId][EtapaProducao.Blendagem])) return;
        } else if (tipo == TipoBebida.Vodca) {
            if (_etapaRegistrada[loteId][EtapaProducao.AjusteFinal]) revert PrecedenciaInvalida();
            if (etapa != EtapaProducao.AjusteFinal || !c.retificacaoAplicavel ||
                _etapaRegistrada[loteId][EtapaProducao.Retificacao]) return;
        } else if (tipo == TipoBebida.Gin) {
            if (etapa == EtapaProducao.Aromatizacao) return;
            if (etapa == EtapaProducao.AjusteFinal && _etapaRegistrada[loteId][EtapaProducao.Aromatizacao]) return;
        }
        revert PrecedenciaInvalida();
    }

    function _validarEtapasParaConclusao(
        uint256 loteId, TipoBebida tipo, ConfiguracaoProducao storage c
    ) private view {
        if (_etapas[loteId].length == 0) revert RequisitoDeEtapaNaoAtendido();
        bool ok;
        if (tipo == TipoBebida.Cachaca) {
            ok = _tem(loteId, EtapaProducao.PreparacaoBase) && _tem(loteId, EtapaProducao.Fermentacao) &&
                _tem(loteId, EtapaProducao.Destilacao) && (!c.maturacaoAplicavel || _tem(loteId, EtapaProducao.Maturacao)) &&
                (!c.ajusteFinalAplicavel || _tem(loteId, EtapaProducao.AjusteFinal));
        } else if (tipo == TipoBebida.Whisky) {
            ok = _tem(loteId, EtapaProducao.PreparacaoBase) && _tem(loteId, EtapaProducao.Fermentacao) &&
                _tem(loteId, EtapaProducao.Destilacao) && _tem(loteId, EtapaProducao.Maturacao) &&
                (!c.blendagemAplicavel || _tem(loteId, EtapaProducao.Blendagem)) &&
                (!c.ajusteFinalAplicavel || _tem(loteId, EtapaProducao.AjusteFinal));
        } else if (tipo == TipoBebida.Vodca) {
            ok = !c.retificacaoAplicavel || _tem(loteId, EtapaProducao.Retificacao);
            ok = ok && (!c.ajusteFinalAplicavel || _tem(loteId, EtapaProducao.AjusteFinal));
        } else if (tipo == TipoBebida.Gin) {
            ok = _tem(loteId, EtapaProducao.Aromatizacao) &&
                (!c.ajusteFinalAplicavel || _tem(loteId, EtapaProducao.AjusteFinal));
        }
        if (!ok) revert RequisitoDeEtapaNaoAtendido();
    }
    function _tem(uint256 loteId, EtapaProducao etapa) private view returns (bool) {
        return _etapaRegistrada[loteId][etapa];
    }
    function _validarInsumosParaConclusao(uint256 loteId, address produtor, TipoBebida tipo) private view {
        bool temAgricola;
        bool temBase;
        bool temZimbro;
        uint256[] storage usados = _insumosUtilizados[loteId];
        for (uint256 i = 0; i < usados.length; i++) {
            uint256 insumoId = usados[i];
            _exigirInsumoAprovado(insumoId, produtor);
            IContratoInsumos.TipoInsumo categoria = contratoInsumos.obterLoteInsumo(insumoId).tipo;
            if (categoria == IContratoInsumos.TipoInsumo.MateriaPrimaAgricola) temAgricola = true;
            else if (categoria == IContratoInsumos.TipoInsumo.BaseAlcoolica) temBase = true;
            else if (categoria == IContratoInsumos.TipoInsumo.Zimbro) temZimbro = true;
        }
        bool ok = (tipo == TipoBebida.Cachaca || tipo == TipoBebida.Whisky) ? temAgricola :
            tipo == TipoBebida.Vodca ? temBase : temBase && temZimbro;
        if (!ok) revert RequisitoDeInsumoNaoAtendido();
    }
}
