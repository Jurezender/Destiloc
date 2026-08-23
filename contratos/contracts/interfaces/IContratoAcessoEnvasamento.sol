// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IContratoAcessoEnvasamento {
    function ehEnvasador(address conta) external view returns (bool);
}
