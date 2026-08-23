// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IContratoAcesso {
    function ehFornecedor(address conta) external view returns (bool);
    function ehProdutor(address conta) external view returns (bool);
}
