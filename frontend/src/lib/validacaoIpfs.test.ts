import { describe, expect, it } from "vitest";
import { ehReferenciaIpfsValida, ehVazia, motivoReferenciaInvalida } from "./validacaoIpfs";

// Mesmas referências usadas em contratos/test/apoio.js, para que cliente e
// contrato concordem sobre o que é válido.
const CID_VALIDA = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzda";
const CID_SEM_PREFIXO = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzda";
const CID_PREFIXO_ERRADO = "http://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbz";
const CID_CURTA = "ipfs://Qm123";

describe("ehReferenciaIpfsValida", () => {
  it("aceita uma referência ipfs:// bem formada", () => {
    expect(ehReferenciaIpfsValida(CID_VALIDA)).toBe(true);
  });

  it("rejeita referência sem o prefixo ipfs://", () => {
    expect(ehReferenciaIpfsValida(CID_SEM_PREFIXO)).toBe(false);
  });

  it("rejeita prefixo errado", () => {
    expect(ehReferenciaIpfsValida(CID_PREFIXO_ERRADO)).toBe(false);
  });

  it("rejeita referência mais curta que o mínimo", () => {
    expect(ehReferenciaIpfsValida(CID_CURTA)).toBe(false);
  });

  it("rejeita referência vazia", () => {
    expect(ehReferenciaIpfsValida("")).toBe(false);
  });

  it("rejeita referência acima do máximo (120 bytes)", () => {
    const longa = "ipfs://" + "a".repeat(120);
    expect(ehReferenciaIpfsValida(longa)).toBe(false);
  });
});

describe("ehVazia", () => {
  it("identifica string vazia", () => {
    expect(ehVazia("")).toBe(true);
  });

  it("não considera uma referência preenchida como vazia", () => {
    expect(ehVazia(CID_VALIDA)).toBe(false);
  });
});

describe("motivoReferenciaInvalida", () => {
  it("devolve null para referência válida", () => {
    expect(motivoReferenciaInvalida(CID_VALIDA)).toBeNull();
  });

  it("devolve null para vazia (aceita onde é opcional)", () => {
    expect(motivoReferenciaInvalida("")).toBeNull();
  });

  it("explica prefixo ausente", () => {
    expect(motivoReferenciaInvalida(CID_SEM_PREFIXO)).toMatch(/ipfs:\/\//);
  });

  it("explica comprimento insuficiente", () => {
    expect(motivoReferenciaInvalida(CID_CURTA)).toMatch(/curta/);
  });
});
