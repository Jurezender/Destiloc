import { describe, expect, it } from "vitest";
import { EtapaProducao, TipoBebida } from "./tipos";
import {
  configuracaoProducaoValida,
  etapaAplicavel,
  obterEtapasAplicaveis,
  podeRegistrarEtapa,
  validarConfiguracaoProducao,
  validarPrecedenciaEtapa,
  validarRegistroEtapa,
  type ConfiguracaoProducao,
  type DadosRegistroEtapa,
} from "./validacaoSequencia";

// Mesmas regras de ContratoProducao.sol (_validarConfiguracao, _validarAplicabilidade,
// _validarPrecedencia) e da matriz de bebidas de Regras_Negocio.md §9, espelhando os
// cenários de contratos/test/10-producao.js ("aplicabilidade e ordem") para que
// cliente e contrato concordem sobre o que é válido.

const CONFIG_MINIMA: ConfiguracaoProducao = {
  maturacaoAplicavel: false,
  retificacaoAplicavel: false,
  blendagemAplicavel: false,
  ajusteFinalAplicavel: false,
};

function config(overrides: Partial<ConfiguracaoProducao>): ConfiguracaoProducao {
  return { ...CONFIG_MINIMA, ...overrides };
}

function dados(
  tipoBebida: TipoBebida,
  etapa: EtapaProducao,
  etapasRegistradas: EtapaProducao[],
  configuracao: ConfiguracaoProducao = CONFIG_MINIMA
): DadosRegistroEtapa {
  return { tipoBebida, configuracao, etapa, etapasRegistradas };
}

const {
  PreparacaoBase,
  Fermentacao,
  Destilacao,
  Retificacao,
  Maturacao,
  Filtragem,
  Blendagem,
  Aromatizacao,
  AjusteFinal,
} = EtapaProducao;

describe("validarConfiguracaoProducao / configuracaoProducaoValida", () => {
  it("rejeita TipoBebida.NaoDefinido mesmo com configuração mínima", () => {
    expect(validarConfiguracaoProducao(TipoBebida.NaoDefinido, CONFIG_MINIMA)).not.toBeNull();
    expect(configuracaoProducaoValida(TipoBebida.NaoDefinido, CONFIG_MINIMA)).toBe(false);
  });

  it.each([
    ["cachaça", TipoBebida.Cachaca, config({ maturacaoAplicavel: true, ajusteFinalAplicavel: true })],
    ["whisky", TipoBebida.Whisky, config({ blendagemAplicavel: true, ajusteFinalAplicavel: true })],
    ["vodca", TipoBebida.Vodca, config({ retificacaoAplicavel: true, ajusteFinalAplicavel: true })],
    ["gin", TipoBebida.Gin, config({ ajusteFinalAplicavel: true })],
  ])("aceita configuração compatível com %s", (_descricao, tipoBebida, cfg) => {
    expect(validarConfiguracaoProducao(tipoBebida, cfg)).toBeNull();
    expect(configuracaoProducaoValida(tipoBebida, cfg)).toBe(true);
  });

  it.each([
    ["cachaça: retificação não é aplicável", TipoBebida.Cachaca, config({ retificacaoAplicavel: true })],
    ["cachaça: blendagem não é aplicável", TipoBebida.Cachaca, config({ blendagemAplicavel: true })],
    ["whisky: maturação não é configurável (é OBR)", TipoBebida.Whisky, config({ maturacaoAplicavel: true })],
    ["whisky: retificação não é aplicável", TipoBebida.Whisky, config({ retificacaoAplicavel: true })],
    ["vodca: maturação não é aplicável", TipoBebida.Vodca, config({ maturacaoAplicavel: true })],
    ["vodca: blendagem não é configurável (é OPC)", TipoBebida.Vodca, config({ blendagemAplicavel: true })],
    ["gin: maturação não é aplicável", TipoBebida.Gin, config({ maturacaoAplicavel: true })],
    ["gin: retificação não é aplicável", TipoBebida.Gin, config({ retificacaoAplicavel: true })],
    ["gin: blendagem não é aplicável", TipoBebida.Gin, config({ blendagemAplicavel: true })],
  ])("rejeita flag incompatível — %s", (_descricao, tipoBebida, cfg) => {
    expect(validarConfiguracaoProducao(tipoBebida, cfg)).not.toBeNull();
    expect(configuracaoProducaoValida(tipoBebida, cfg)).toBe(false);
  });
});

describe("etapaAplicavel / obterEtapasAplicaveis (matriz de bebidas)", () => {
  it("cachaça: com config mínima, só as etapas OBR são aplicáveis", () => {
    expect(obterEtapasAplicaveis(TipoBebida.Cachaca, CONFIG_MINIMA)).toEqual([
      PreparacaoBase,
      Fermentacao,
      Destilacao,
    ]);
    expect(etapaAplicavel(TipoBebida.Cachaca, CONFIG_MINIMA, Filtragem)).toBe(false);
    expect(etapaAplicavel(TipoBebida.Cachaca, CONFIG_MINIMA, Blendagem)).toBe(false);
  });

  it("cachaça: com maturação e ajuste final habilitados, ambas ficam aplicáveis", () => {
    const cfg = config({ maturacaoAplicavel: true, ajusteFinalAplicavel: true });
    expect(obterEtapasAplicaveis(TipoBebida.Cachaca, cfg)).toEqual([
      PreparacaoBase,
      Fermentacao,
      Destilacao,
      Maturacao,
      AjusteFinal,
    ]);
  });

  it("whisky: com config mínima, maturação já é aplicável (OBR) mas blendagem/ajuste final não", () => {
    expect(obterEtapasAplicaveis(TipoBebida.Whisky, CONFIG_MINIMA)).toEqual([
      PreparacaoBase,
      Fermentacao,
      Destilacao,
      Maturacao,
    ]);
    expect(etapaAplicavel(TipoBebida.Whisky, CONFIG_MINIMA, Filtragem)).toBe(false);
  });

  it("whisky: com blendagem e ajuste final habilitados, ambas ficam aplicáveis", () => {
    const cfg = config({ blendagemAplicavel: true, ajusteFinalAplicavel: true });
    expect(obterEtapasAplicaveis(TipoBebida.Whisky, cfg)).toEqual([
      PreparacaoBase,
      Fermentacao,
      Destilacao,
      Maturacao,
      Blendagem,
      AjusteFinal,
    ]);
  });

  it("vodca: com config mínima, apenas as etapas OPC são aplicáveis", () => {
    expect(obterEtapasAplicaveis(TipoBebida.Vodca, CONFIG_MINIMA)).toEqual([
      Filtragem,
      Blendagem,
      Aromatizacao,
    ]);
    expect(etapaAplicavel(TipoBebida.Vodca, CONFIG_MINIMA, PreparacaoBase)).toBe(false);
    expect(etapaAplicavel(TipoBebida.Vodca, CONFIG_MINIMA, Retificacao)).toBe(false);
  });

  it("vodca: com retificação e ajuste final habilitados, ambas ficam aplicáveis", () => {
    const cfg = config({ retificacaoAplicavel: true, ajusteFinalAplicavel: true });
    expect(obterEtapasAplicaveis(TipoBebida.Vodca, cfg)).toEqual([
      Retificacao,
      Filtragem,
      Blendagem,
      Aromatizacao,
      AjusteFinal,
    ]);
  });

  it("gin: com config mínima, só aromatização é aplicável", () => {
    expect(obterEtapasAplicaveis(TipoBebida.Gin, CONFIG_MINIMA)).toEqual([Aromatizacao]);
    expect(etapaAplicavel(TipoBebida.Gin, CONFIG_MINIMA, Destilacao)).toBe(false);
  });

  it("gin: com ajuste final habilitado, também fica aplicável", () => {
    const cfg = config({ ajusteFinalAplicavel: true });
    expect(obterEtapasAplicaveis(TipoBebida.Gin, cfg)).toEqual([Aromatizacao, AjusteFinal]);
  });
});

describe("validarPrecedenciaEtapa / validarRegistroEtapa — cachaça", () => {
  it("exige PreparacaoBase, Fermentacao e Destilacao em ordem", () => {
    expect(validarPrecedenciaEtapa(TipoBebida.Cachaca, CONFIG_MINIMA, PreparacaoBase, [])).toBeNull();
    expect(validarPrecedenciaEtapa(TipoBebida.Cachaca, CONFIG_MINIMA, Fermentacao, [])).not.toBeNull();
    expect(
      validarPrecedenciaEtapa(TipoBebida.Cachaca, CONFIG_MINIMA, Fermentacao, [PreparacaoBase])
    ).toBeNull();
    expect(
      validarPrecedenciaEtapa(TipoBebida.Cachaca, CONFIG_MINIMA, Destilacao, [PreparacaoBase])
    ).not.toBeNull();
    expect(
      validarPrecedenciaEtapa(TipoBebida.Cachaca, CONFIG_MINIMA, Destilacao, [
        PreparacaoBase,
        Fermentacao,
      ])
    ).toBeNull();
  });

  it("Maturacao registrável só quando aplicável (COND), mesmo que a precedência sozinha permita", () => {
    const registradas = [PreparacaoBase, Fermentacao, Destilacao];
    expect(validarPrecedenciaEtapa(TipoBebida.Cachaca, CONFIG_MINIMA, Maturacao, registradas)).toBeNull();
    expect(
      validarRegistroEtapa(dados(TipoBebida.Cachaca, Maturacao, registradas, CONFIG_MINIMA))
    ).not.toBeNull();
    expect(
      validarRegistroEtapa(
        dados(TipoBebida.Cachaca, Maturacao, registradas, config({ maturacaoAplicavel: true }))
      )
    ).toBeNull();
  });

  it("AjusteFinal exige Destilacao e, se maturação aplicável, exige Maturacao também", () => {
    const cfgComMaturacao = config({ maturacaoAplicavel: true, ajusteFinalAplicavel: true });
    expect(
      validarRegistroEtapa(
        dados(TipoBebida.Cachaca, AjusteFinal, [PreparacaoBase, Fermentacao, Destilacao], cfgComMaturacao)
      )
    ).not.toBeNull();
    expect(
      validarRegistroEtapa(
        dados(
          TipoBebida.Cachaca,
          AjusteFinal,
          [PreparacaoBase, Fermentacao, Destilacao, Maturacao],
          cfgComMaturacao
        )
      )
    ).toBeNull();

    const cfgSemMaturacao = config({ ajusteFinalAplicavel: true });
    expect(
      validarRegistroEtapa(
        dados(TipoBebida.Cachaca, AjusteFinal, [PreparacaoBase, Fermentacao, Destilacao], cfgSemMaturacao)
      )
    ).toBeNull();
  });

  it("rejeita etapa não aplicável (N/A) independentemente das etapas já registradas", () => {
    expect(
      validarRegistroEtapa(dados(TipoBebida.Cachaca, Filtragem, [PreparacaoBase, Fermentacao, Destilacao]))
    ).not.toBeNull();
  });

  it("rejeita etapa já registrada", () => {
    expect(
      validarRegistroEtapa(dados(TipoBebida.Cachaca, PreparacaoBase, [PreparacaoBase]))
    ).not.toBeNull();
  });
});

describe("validarPrecedenciaEtapa / validarRegistroEtapa — whisky", () => {
  it("exige o fluxo até Maturacao em ordem, sem depender de configuração (OBR)", () => {
    expect(validarPrecedenciaEtapa(TipoBebida.Whisky, CONFIG_MINIMA, PreparacaoBase, [])).toBeNull();
    expect(
      validarPrecedenciaEtapa(TipoBebida.Whisky, CONFIG_MINIMA, Destilacao, [PreparacaoBase])
    ).not.toBeNull();
    expect(
      validarPrecedenciaEtapa(TipoBebida.Whisky, CONFIG_MINIMA, Maturacao, [
        PreparacaoBase,
        Fermentacao,
        Destilacao,
      ])
    ).toBeNull();
  });

  it("Blendagem só é registrável quando aplicável e depois de Maturacao", () => {
    const registradasAteDestilacao = [PreparacaoBase, Fermentacao, Destilacao];
    const registradasComMaturacao = [...registradasAteDestilacao, Maturacao];
    const cfgComBlendagem = config({ blendagemAplicavel: true });

    expect(
      validarRegistroEtapa(dados(TipoBebida.Whisky, Blendagem, registradasComMaturacao, CONFIG_MINIMA))
    ).not.toBeNull();
    expect(
      validarRegistroEtapa(dados(TipoBebida.Whisky, Blendagem, registradasAteDestilacao, cfgComBlendagem))
    ).not.toBeNull();
    expect(
      validarRegistroEtapa(dados(TipoBebida.Whisky, Blendagem, registradasComMaturacao, cfgComBlendagem))
    ).toBeNull();
  });

  it("AjusteFinal exige Maturacao e, se blendagem aplicável, exige Blendagem também", () => {
    const cfgComBlendagem = config({ blendagemAplicavel: true, ajusteFinalAplicavel: true });
    const registradasComMaturacao = [PreparacaoBase, Fermentacao, Destilacao, Maturacao];

    expect(
      validarRegistroEtapa(dados(TipoBebida.Whisky, AjusteFinal, registradasComMaturacao, cfgComBlendagem))
    ).not.toBeNull();
    expect(
      validarRegistroEtapa(
        dados(TipoBebida.Whisky, AjusteFinal, [...registradasComMaturacao, Blendagem], cfgComBlendagem)
      )
    ).toBeNull();

    const cfgSemBlendagem = config({ ajusteFinalAplicavel: true });
    expect(
      validarRegistroEtapa(dados(TipoBebida.Whisky, AjusteFinal, registradasComMaturacao, cfgSemBlendagem))
    ).toBeNull();
  });

  it("rejeita etapa não aplicável (N/A)", () => {
    expect(
      validarRegistroEtapa(dados(TipoBebida.Whisky, Filtragem, [PreparacaoBase, Fermentacao, Destilacao]))
    ).not.toBeNull();
  });
});

describe("validarPrecedenciaEtapa / validarRegistroEtapa — vodca", () => {
  it("aceita ordem variável entre as etapas produtivas permitidas", () => {
    expect(validarPrecedenciaEtapa(TipoBebida.Vodca, CONFIG_MINIMA, Aromatizacao, [])).toBeNull();
    expect(validarPrecedenciaEtapa(TipoBebida.Vodca, CONFIG_MINIMA, Filtragem, [Aromatizacao])).toBeNull();
    expect(
      validarPrecedenciaEtapa(TipoBebida.Vodca, CONFIG_MINIMA, Blendagem, [Aromatizacao, Filtragem])
    ).toBeNull();
  });

  it("rejeita Retificacao quando não está configurada como aplicável", () => {
    expect(validarRegistroEtapa(dados(TipoBebida.Vodca, Retificacao, []))).not.toBeNull();
  });

  it("AjusteFinal só exige Retificacao quando ela é aplicável", () => {
    const cfgComRetificacao = config({ retificacaoAplicavel: true, ajusteFinalAplicavel: true });
    expect(validarRegistroEtapa(dados(TipoBebida.Vodca, AjusteFinal, [], cfgComRetificacao))).not.toBeNull();
    expect(
      validarRegistroEtapa(dados(TipoBebida.Vodca, AjusteFinal, [Retificacao], cfgComRetificacao))
    ).toBeNull();

    const cfgSemRetificacao = config({ ajusteFinalAplicavel: true });
    expect(validarRegistroEtapa(dados(TipoBebida.Vodca, AjusteFinal, [], cfgSemRetificacao))).toBeNull();
  });

  it("nenhuma etapa pode ser registrada depois de AjusteFinal", () => {
    expect(
      validarPrecedenciaEtapa(TipoBebida.Vodca, CONFIG_MINIMA, Filtragem, [Aromatizacao, AjusteFinal])
    ).not.toBeNull();
  });

  it("rejeita etapa não aplicável (N/A)", () => {
    expect(validarRegistroEtapa(dados(TipoBebida.Vodca, PreparacaoBase, []))).not.toBeNull();
  });
});

describe("validarPrecedenciaEtapa / validarRegistroEtapa — gin", () => {
  it("Aromatizacao não exige etapa anterior", () => {
    expect(validarPrecedenciaEtapa(TipoBebida.Gin, CONFIG_MINIMA, Aromatizacao, [])).toBeNull();
  });

  it("AjusteFinal exige Aromatizacao registrada e configuração aplicável", () => {
    expect(
      validarRegistroEtapa(dados(TipoBebida.Gin, AjusteFinal, [], config({ ajusteFinalAplicavel: true })))
    ).not.toBeNull();
    expect(
      validarRegistroEtapa(
        dados(TipoBebida.Gin, AjusteFinal, [Aromatizacao], config({ ajusteFinalAplicavel: true }))
      )
    ).toBeNull();
  });

  it("rejeita demais etapas por não aplicabilidade (N/A)", () => {
    expect(validarRegistroEtapa(dados(TipoBebida.Gin, Destilacao, []))).not.toBeNull();
    expect(validarRegistroEtapa(dados(TipoBebida.Gin, Maturacao, []))).not.toBeNull();
  });
});

describe("podeRegistrarEtapa", () => {
  it("reflete validarRegistroEtapa como booleano", () => {
    expect(podeRegistrarEtapa(dados(TipoBebida.Gin, Aromatizacao, []))).toBe(true);
    expect(podeRegistrarEtapa(dados(TipoBebida.Gin, AjusteFinal, []))).toBe(false);
    expect(podeRegistrarEtapa(dados(TipoBebida.Cachaca, PreparacaoBase, [PreparacaoBase]))).toBe(false);
  });
});
