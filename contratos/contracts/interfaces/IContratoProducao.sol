// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IContratoProducao {
    function loteProducaoExiste(uint256 loteId) external view returns (bool);
    function loteProducaoConcluido(uint256 loteId) external view returns (bool);
    function envasadorDesignadoDaProducao(uint256 loteId) external view returns (address);
    function loteAdulterado(uint256 loteId) external view returns (bool);
    function marcarComoAdulterado(uint256 loteId, string calldata motivo) external;
}
