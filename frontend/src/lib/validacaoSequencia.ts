import { EtapaProducao, TipoBebida } from "./tipos";

/**
 * Espelha ConfiguracaoProducao de ContratoProducao. Estes helpers antecipam
 * feedback na interface; o contrato inteligente continua sendo a fonte de verdade.
 */
export interface ConfiguracaoProducao {
  maturacaoAplicavel: boolean;
  retificacaoAplicavel: boolean;
  blendagemAplicavel: boolean;
  ajusteFinalAplicavel: boolean;
}

const TODAS_ETAPAS: readonly EtapaProducao[] = [
  EtapaProducao.PreparacaoBase,
  EtapaProducao.Fermentacao,
  EtapaProducao.Destilacao,
  EtapaProducao.Retificacao,
  EtapaProducao.Maturacao,
  EtapaProducao.Filtragem,
  EtapaProducao.Blendagem,
  EtapaProducao.Aromatizacao,
  EtapaProducao.AjusteFinal,
];

export function validarConfiguracaoProducao(
  tipoBebida: TipoBebida,
  configuracao: ConfiguracaoProducao
): string | null {
  if (tipoBebida === TipoBebida.NaoDefinido) {
    return "Selecione um tipo de bebida válido.";
  }

  if (tipoBebida === TipoBebida.Cachaca) {
    if (configuracao.retificacaoAplicavel || configuracao.blendagemAplicavel) {
      return "A configuração da produção é inválida para cachaça.";
    }
    return null;
  }

  if (tipoBebida === TipoBebida.Whisky) {
    if (configuracao.maturacaoAplicavel || configuracao.retificacaoAplicavel) {
      return "A configuração da produção é inválida para whisky.";
    }
    return null;
  }

  if (tipoBebida === TipoBebida.Vodca) {
    if (configuracao.maturacaoAplicavel || configuracao.blendagemAplicavel) {
      return "A configuração da produção é inválida para vodca.";
    }
    return null;
  }

  if (tipoBebida === TipoBebida.Gin) {
    if (
      configuracao.maturacaoAplicavel ||
      configuracao.retificacaoAplicavel ||
      configuracao.blendagemAplicavel
    ) {
      return "A configuração da produção é inválida para gin.";
    }
    return null;
  }

  return "Selecione um tipo de bebida válido.";
}

export function configuracaoProducaoValida(
  tipoBebida: TipoBebida,
  configuracao: ConfiguracaoProducao
): boolean {
  return validarConfiguracaoProducao(tipoBebida, configuracao) === null;
}

export function etapaAplicavel(
  tipoBebida: TipoBebida,
  configuracao: ConfiguracaoProducao,
  etapa: EtapaProducao
): boolean {
  if (tipoBebida === TipoBebida.Cachaca) {
    return (
      etapa === EtapaProducao.PreparacaoBase ||
      etapa === EtapaProducao.Fermentacao ||
      etapa === EtapaProducao.Destilacao ||
      (etapa === EtapaProducao.Maturacao && configuracao.maturacaoAplicavel) ||
      (etapa === EtapaProducao.AjusteFinal && configuracao.ajusteFinalAplicavel)
    );
  }

  if (tipoBebida === TipoBebida.Whisky) {
    return (
      etapa === EtapaProducao.PreparacaoBase ||
      etapa === EtapaProducao.Fermentacao ||
      etapa === EtapaProducao.Destilacao ||
      etapa === EtapaProducao.Maturacao ||
      (etapa === EtapaProducao.Blendagem && configuracao.blendagemAplicavel) ||
      (etapa === EtapaProducao.AjusteFinal && configuracao.ajusteFinalAplicavel)
    );
  }

  if (tipoBebida === TipoBebida.Vodca) {
    return (
      (etapa === EtapaProducao.Retificacao && configuracao.retificacaoAplicavel) ||
      etapa === EtapaProducao.Filtragem ||
      etapa === EtapaProducao.Blendagem ||
      etapa === EtapaProducao.Aromatizacao ||
      (etapa === EtapaProducao.AjusteFinal && configuracao.ajusteFinalAplicavel)
    );
  }

  if (tipoBebida === TipoBebida.Gin) {
    return (
      etapa === EtapaProducao.Aromatizacao ||
      (etapa === EtapaProducao.AjusteFinal && configuracao.ajusteFinalAplicavel)
    );
  }

  return false;
}

export function obterEtapasAplicaveis(
  tipoBebida: TipoBebida,
  configuracao: ConfiguracaoProducao
): EtapaProducao[] {
  return TODAS_ETAPAS.filter((etapa) => etapaAplicavel(tipoBebida, configuracao, etapa));
}

export function validarPrecedenciaEtapa(
  tipoBebida: TipoBebida,
  configuracao: ConfiguracaoProducao,
  etapa: EtapaProducao,
  etapasRegistradas: readonly EtapaProducao[]
): string | null {
  const registrada = new Set(etapasRegistradas);
  const tem = (etapaAnterior: EtapaProducao) => registrada.has(etapaAnterior);

  if (tipoBebida === TipoBebida.Cachaca) {
    if (etapa === EtapaProducao.PreparacaoBase) return null;
    if (etapa === EtapaProducao.Fermentacao && tem(EtapaProducao.PreparacaoBase)) return null;
    if (etapa === EtapaProducao.Destilacao && tem(EtapaProducao.Fermentacao)) return null;
    if (etapa === EtapaProducao.Maturacao && tem(EtapaProducao.Destilacao)) return null;
    if (
      etapa === EtapaProducao.AjusteFinal &&
      tem(EtapaProducao.Destilacao) &&
      (!configuracao.maturacaoAplicavel || tem(EtapaProducao.Maturacao))
    ) {
      return null;
    }
  } else if (tipoBebida === TipoBebida.Whisky) {
    if (etapa === EtapaProducao.PreparacaoBase) return null;
    if (etapa === EtapaProducao.Fermentacao && tem(EtapaProducao.PreparacaoBase)) return null;
    if (etapa === EtapaProducao.Destilacao && tem(EtapaProducao.Fermentacao)) return null;
    if (etapa === EtapaProducao.Maturacao && tem(EtapaProducao.Destilacao)) return null;
    if (etapa === EtapaProducao.Blendagem && tem(EtapaProducao.Maturacao)) return null;
    if (
      etapa === EtapaProducao.AjusteFinal &&
      tem(EtapaProducao.Maturacao) &&
      (!configuracao.blendagemAplicavel || tem(EtapaProducao.Blendagem))
    ) {
      return null;
    }
  } else if (tipoBebida === TipoBebida.Vodca) {
    if (tem(EtapaProducao.AjusteFinal)) {
      return "Nenhuma etapa pode ser registrada depois do ajuste final.";
    }
    if (
      etapa !== EtapaProducao.AjusteFinal ||
      !configuracao.retificacaoAplicavel ||
      tem(EtapaProducao.Retificacao)
    ) {
      return null;
    }
  } else if (tipoBebida === TipoBebida.Gin) {
    if (etapa === EtapaProducao.Aromatizacao) return null;
    if (etapa === EtapaProducao.AjusteFinal && tem(EtapaProducao.Aromatizacao)) return null;
  }

  return "As etapas anteriores necessárias ainda não foram registradas.";
}

export interface DadosRegistroEtapa {
  tipoBebida: TipoBebida;
  configuracao: ConfiguracaoProducao;
  etapa: EtapaProducao;
  etapasRegistradas: readonly EtapaProducao[];
}

export function validarRegistroEtapa(dados: DadosRegistroEtapa): string | null {
  if (dados.etapasRegistradas.includes(dados.etapa)) {
    return "Esta etapa já foi registrada.";
  }
  if (!etapaAplicavel(dados.tipoBebida, dados.configuracao, dados.etapa)) {
    return "Esta etapa não se aplica ao tipo de bebida selecionado.";
  }
  return validarPrecedenciaEtapa(
    dados.tipoBebida,
    dados.configuracao,
    dados.etapa,
    dados.etapasRegistradas
  );
}

export function podeRegistrarEtapa(dados: DadosRegistroEtapa): boolean {
  return validarRegistroEtapa(dados) === null;
}
