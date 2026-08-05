// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title TiposCadeia
 * @notice Declarações compartilhadas pelos contratos do protótipo.
 *         Este arquivo não gera contrato implantável.
 */

/// @notice Etapas do fluxo produtivo, executadas no âmbito do LOTE.
/// @dev A ordem dos valores não define a ordem de execução. A sequência
///      válida é declarada por lote no cadastro e validada pelo ContratoLote.
enum EtapaProdutiva {
    RecebimentoMateriaPrima, // 0  obrigatória, sempre a primeira
    TransformacaoDestilacao, // 1  obrigatória, uma ou mais ocorrências consecutivas
    Envelhecimento,          // 2  opcional, repetível
    Finalizacao,             // 3  opcional, repetível (mistura, diluição, filtração, aromatização)
    Engarrafamento           // 4  obrigatória, sempre a última
}

/// @notice Eventos do fluxo de custódia, executados no âmbito da GARRAFA.
enum TipoEventoCustodia {
    Expedicao,   // 0
    Recebimento, // 1
    Cancelamento // 2
}

/**
 * @title ReferenciaIPFS
 * @notice Validação SINTÁTICA de uma referência no formato "ipfs://<CID>".
 *
 * @dev Esta biblioteca verifica exclusivamente a forma da cadeia de caracteres:
 *      o prefixo "ipfs://" e um comprimento mínimo compatível com um CID.
 *
 *      Ela NÃO comprova que o CID existe, que resolve corretamente em algum nó
 *      ou gateway, nem que o conteúdo permanecerá disponível. Um contrato
 *      inteligente não tem acesso a dados externos à blockchain e, portanto,
 *      não pode verificar nenhuma dessas condições.
 *
 *      A verificação efetiva da integridade do conteúdo off-chain é realizada
 *      nos experimentos, por meio do envio, da recuperação e da alteração
 *      controlada do conteúdo, observando a mudança do CID resultante.
 */
library ReferenciaIPFS {
    /// @dev Bytes de "ipfs://".
    bytes7 private constant PREFIXO = 0x697066733a2f2f;

    /// @dev 7 caracteres de prefixo somados ao menor CID em uso (CIDv0, 46).
    uint256 private constant COMPRIMENTO_MINIMO = 53;

    /// @dev Limite superior, para evitar armazenamento indevido de texto longo.
    uint256 private constant COMPRIMENTO_MAXIMO = 120;

    function ehReferenciaValida(string memory uri) internal pure returns (bool) {
        bytes memory dados = bytes(uri);
        if (dados.length < COMPRIMENTO_MINIMO) return false;
        if (dados.length > COMPRIMENTO_MAXIMO) return false;
        for (uint256 i = 0; i < 7; i++) {
            if (dados[i] != PREFIXO[i]) return false;
        }
        return true;
    }

    function ehVazia(string memory uri) internal pure returns (bool) {
        return bytes(uri).length == 0;
    }
}
