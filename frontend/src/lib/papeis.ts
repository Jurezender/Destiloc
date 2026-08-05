import { id, ZeroHash } from "ethers";

/**
 * Identificadores de papel (`bytes32`) usados pelos três contratos.
 * `DEFAULT_ADMIN_ROLE` é sempre `bytes32(0)` no AccessControl da OpenZeppelin;
 * os demais são `keccak256("<NOME>")`, exatamente como declarados nos
 * contratos (`FABRICANTE_ROLE`, `DISTRIBUIDOR_ROLE`, `VAREJISTA_ROLE`).
 * Calculá-los aqui evita uma chamada de leitura por contrato só para obter
 * uma constante que nunca muda.
 */
export const PAPEL_ADMIN = ZeroHash;
export const PAPEL_FABRICANTE = id("FABRICANTE_ROLE");
export const PAPEL_DISTRIBUIDOR = id("DISTRIBUIDOR_ROLE");
export const PAPEL_VAREJISTA = id("VAREJISTA_ROLE");

export const RETULO_PAPEL: Record<string, string> = {
  [PAPEL_ADMIN]: "Administrador",
  [PAPEL_FABRICANTE]: "Fabricante",
  [PAPEL_DISTRIBUIDOR]: "Distribuidor",
  [PAPEL_VAREJISTA]: "Varejista",
};
