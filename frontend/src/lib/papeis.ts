import { id, ZeroHash } from "ethers";

/**
 * Identificadores de papel (`bytes32`) centralizados no ContratoAcesso.
 * `DEFAULT_ADMIN_ROLE` é sempre `bytes32(0)` no AccessControl da OpenZeppelin;
 * os demais são `keccak256("<NOME>")`, exatamente como declarados nos
 * contratos (`FORNECEDOR_ROLE`, `PRODUTOR_ROLE`, `ENVASADOR_ROLE`).
 * Calculá-los aqui evita uma chamada de leitura ao contrato só para obter
 * uma constante que nunca muda.
 */
export const PAPEL_ADMIN = ZeroHash;
export const PAPEL_FORNECEDOR = id("FORNECEDOR_ROLE");
export const PAPEL_PRODUTOR = id("PRODUTOR_ROLE");
export const PAPEL_ENVASADOR = id("ENVASADOR_ROLE");

export const RETULO_PAPEL: Record<string, string> = {
  [PAPEL_ADMIN]: "Administrador",
  [PAPEL_FORNECEDOR]: "Fornecedor",
  [PAPEL_PRODUTOR]: "Produtor",
  [PAPEL_ENVASADOR]: "Envasador",
};
