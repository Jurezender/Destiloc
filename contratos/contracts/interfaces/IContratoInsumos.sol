// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IContratoInsumos {
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

    struct LoteInsumo {
        address fornecedor;
        TipoInsumo tipo;
        uint64 registradoEm;
        string metadataURI;
    }

    function loteInsumoExiste(uint256 insumoId) external view returns (bool);
    function loteInsumoValido(uint256 insumoId) external view returns (bool);
    function aprovadoPor(uint256 insumoId, address produtor) external view returns (bool);
    function obterLoteInsumo(uint256 insumoId) external view returns (LoteInsumo memory);
}
