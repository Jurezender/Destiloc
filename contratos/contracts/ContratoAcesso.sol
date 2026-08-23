// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";

/**
 * @title ContratoAcesso
 * @notice Fonte central de papéis para os contratos do protótipo.
 */
contract ContratoAcesso is AccessControlEnumerable {
    bytes32 public constant FORNECEDOR_ROLE = keccak256("FORNECEDOR_ROLE");
    bytes32 public constant PRODUTOR_ROLE = keccak256("PRODUTOR_ROLE");
    bytes32 public constant ENVASADOR_ROLE = keccak256("ENVASADOR_ROLE");

    error ContaInvalida();
    error UltimoAdministrador();

    constructor(address administradorInicial) {
        _grantRole(DEFAULT_ADMIN_ROLE, administradorInicial);
    }

    function ehAdministrador(address conta) external view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, conta);
    }

    function ehFornecedor(address conta) external view returns (bool) {
        return hasRole(FORNECEDOR_ROLE, conta);
    }

    function ehProdutor(address conta) external view returns (bool) {
        return hasRole(PRODUTOR_ROLE, conta);
    }

    function ehEnvasador(address conta) external view returns (bool) {
        return hasRole(ENVASADOR_ROLE, conta);
    }

    function totalAdministradores() external view returns (uint256) {
        return getRoleMemberCount(DEFAULT_ADMIN_ROLE);
    }

    /** @dev Impede que membros inoperáveis alterem contagens e invariantes do RBAC. */
    function _grantRole(bytes32 papel, address conta) internal virtual override returns (bool) {
        if (conta == address(0)) revert ContaInvalida();
        return super._grantRole(papel, conta);
    }

    /**
     * @dev Preserva ao menos um administrador em todos os caminhos de remoção,
     *      incluindo revokeRole e renounceRole.
     */
    function _revokeRole(bytes32 papel, address conta) internal virtual override returns (bool) {
        if (
            papel == DEFAULT_ADMIN_ROLE &&
            hasRole(DEFAULT_ADMIN_ROLE, conta) &&
            getRoleMemberCount(DEFAULT_ADMIN_ROLE) == 1
        ) {
            revert UltimoAdministrador();
        }
        return super._revokeRole(papel, conta);
    }
}
