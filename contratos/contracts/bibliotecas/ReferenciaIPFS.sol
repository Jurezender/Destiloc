// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library ReferenciaIPFS {
    bytes7 private constant PREFIXO = 0x697066733a2f2f; // ipfs://
    uint256 private constant COMPRIMENTO_MINIMO = 53;
    uint256 private constant COMPRIMENTO_MAXIMO = 120;

    function ehValida(string memory uri) internal pure returns (bool) {
        bytes memory dados = bytes(uri);
        if (dados.length < COMPRIMENTO_MINIMO || dados.length > COMPRIMENTO_MAXIMO) return false;
        for (uint256 i = 0; i < 7; i++) {
            if (dados[i] != PREFIXO[i]) return false;
        }
        return true;
    }
}
