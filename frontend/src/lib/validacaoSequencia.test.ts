import { describe, expect, it } from "vitest";
import { EtapaProdutiva } from "./tipos";
import { sequenciaValida, validarSequencia } from "./validacaoSequencia";

const { RecebimentoMateriaPrima, TransformacaoDestilacao, Envelhecimento, Finalizacao, Engarrafamento } =
  EtapaProdutiva;

// Mesmas sequências de contratos/test/apoio.js.
const SEQ_CACHACA = [RecebimentoMateriaPrima, TransformacaoDestilacao, Engarrafamento];
const SEQ_CACHACA_ENVELHECIDA = [
  RecebimentoMateriaPrima,
  TransformacaoDestilacao,
  Envelhecimento,
  Engarrafamento,
];
const SEQ_UISQUE_DUPLO_AMADURECIMENTO = [
  RecebimentoMateriaPrima,
  TransformacaoDestilacao,
  Envelhecimento,
  Envelhecimento,
  Engarrafamento,
];
const SEQ_MULTIPLOS_CICLOS = [
  RecebimentoMateriaPrima,
  TransformacaoDestilacao,
  TransformacaoDestilacao,
  Envelhecimento,
  Engarrafamento,
];
const SEQ_GIN = [RecebimentoMateriaPrima, TransformacaoDestilacao, Finalizacao, Engarrafamento];

describe("sequências aceitas (espelha o grupo A dos testes de contrato)", () => {
  it.each([
    ["mínima válida", SEQ_CACHACA],
    ["com envelhecimento", SEQ_CACHACA_ENVELHECIDA],
    ["com envelhecimento repetido", SEQ_UISQUE_DUPLO_AMADURECIMENTO],
    ["com mais de um ciclo de transformação/destilação", SEQ_MULTIPLOS_CICLOS],
    ["com finalização", SEQ_GIN],
  ])("%s", (_descricao, sequencia) => {
    expect(validarSequencia(sequencia)).toBeNull();
    expect(sequenciaValida(sequencia)).toBe(true);
  });
});

describe("sequências rejeitadas (espelha o grupo A dos testes de contrato)", () => {
  it("rejeita sequência vazia", () => {
    expect(validarSequencia([])).not.toBeNull();
  });

  it("rejeita sequência que não começa em recebimento de matéria-prima", () => {
    expect(
      validarSequencia([TransformacaoDestilacao, TransformacaoDestilacao, Engarrafamento])
    ).not.toBeNull();
  });

  it("rejeita sequência sem transformação e destilação", () => {
    expect(validarSequencia([RecebimentoMateriaPrima, Envelhecimento, Engarrafamento])).not.toBeNull();
  });

  it("rejeita sequência que não termina em engarrafamento", () => {
    expect(
      validarSequencia([RecebimentoMateriaPrima, TransformacaoDestilacao, Envelhecimento])
    ).not.toBeNull();
  });

  it("rejeita etapa opcional antes da destilação", () => {
    expect(
      validarSequencia([RecebimentoMateriaPrima, Envelhecimento, TransformacaoDestilacao, Engarrafamento])
    ).not.toBeNull();
  });

  it("rejeita recebimento repetido", () => {
    expect(
      validarSequencia([
        RecebimentoMateriaPrima,
        RecebimentoMateriaPrima,
        TransformacaoDestilacao,
        Engarrafamento,
      ])
    ).not.toBeNull();
  });

  it("rejeita engarrafamento em posição intermediária", () => {
    expect(
      validarSequencia([RecebimentoMateriaPrima, TransformacaoDestilacao, Engarrafamento, Envelhecimento])
    ).not.toBeNull();
  });

  it("rejeita sequência acima do máximo de doze etapas", () => {
    const longa = [
      RecebimentoMateriaPrima,
      TransformacaoDestilacao,
      ...Array(10).fill(Envelhecimento),
      Engarrafamento,
    ];
    expect(longa.length).toBe(13);
    expect(validarSequencia(longa)).not.toBeNull();
  });

  it("rejeita sequência abaixo do mínimo de três etapas", () => {
    expect(validarSequencia([RecebimentoMateriaPrima, Engarrafamento])).not.toBeNull();
  });
});
