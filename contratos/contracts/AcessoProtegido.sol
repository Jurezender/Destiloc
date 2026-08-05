// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";

/**
 * @title AcessoProtegido
 * @notice Base de controle de acesso compartilhada pelos três contratos.
 *         Contrato abstrato, não implantável.
 *
 * @dev COMO A QUANTIDADE DE ADMINISTRADORES ATIVOS É IDENTIFICADA
 *
 *      O AccessControl padrão do OpenZeppelin guarda apenas a resposta
 *      booleana de "esta conta possui este papel". Ele não mantém a lista dos
 *      detentores nem a contagem, de modo que não seria possível responder à
 *      pergunta "quantos administradores ainda existem" sem varrer todo o
 *      histórico de eventos fora da blockchain.
 *
 *      Por essa razão os três contratos herdam AccessControlEnumerable, que
 *      mantém um conjunto enumerável por papel, atualizado dentro das próprias
 *      funções internas _grantRole e _revokeRole. A contagem passa a ser uma
 *      leitura direta de estado, por meio de getRoleMemberCount, e permanece
 *      exata em qualquer momento, sem depender de contador próprio nem de
 *      indexação externa.
 *
 *      REGRA DE PROTEÇÃO
 *
 *      Toda saída do papel DEFAULT_ADMIN_ROLE, por revogação ou por renúncia,
 *      é recusada quando a conta que sairia for a última detentora. Havendo
 *      dois ou mais administradores, a saída é permitida normalmente. A regra
 *      é, portanto, restritiva apenas no caso em que o sistema ficaria sem
 *      qualquer conta capaz de administrar papéis.
 *
 *      A mesma regra vale para os demais papéis? Não. Um sistema sem nenhum
 *      distribuidor continua administrável, e o administrador pode conceder o
 *      papel novamente. Um sistema sem administrador é irreversível.
 */
abstract contract AcessoProtegido is AccessControlEnumerable {
    /// @notice Quantidade de contas que detêm o papel de administração.
    function totalAdministradores() public view returns (uint256) {
        return getRoleMemberCount(DEFAULT_ADMIN_ROLE);
    }

    /// @notice Lista as contas que detêm um papel. Usada pela interface para
    ///         apresentar destinatários válidos sem exigir digitação de endereço.
    function detentoresDoPapel(bytes32 papel) public view returns (address[] memory) {
        return getRoleMembers(papel);
    }

    /// @dev Recusa a saída do último administrador. Silencioso nos demais casos.
    function _protegerUltimoAdministrador(bytes32 papel, address conta) private view {
        if (papel != DEFAULT_ADMIN_ROLE) return;
        if (!hasRole(DEFAULT_ADMIN_ROLE, conta)) return;
        require(
            getRoleMemberCount(DEFAULT_ADMIN_ROLE) > 1,
            "Sistema ficaria sem administrador"
        );
    }

    function revokeRole(bytes32 papel, address conta)
        public
        virtual
        override(AccessControl, IAccessControl)
    {
        _protegerUltimoAdministrador(papel, conta);
        super.revokeRole(papel, conta);
    }

    function renounceRole(bytes32 papel, address confirmacao)
        public
        virtual
        override(AccessControl, IAccessControl)
    {
        _protegerUltimoAdministrador(papel, confirmacao);
        super.renounceRole(papel, confirmacao);
    }
}
