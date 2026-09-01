/** Espelha ContratoInsumos.TipoInsumo — mesma ordem, mesmos valores. */
export enum TipoInsumo {
  NaoDefinido = 0,
  MateriaPrimaAgricola = 1,
  BaseAlcoolica = 2,
  Agua = 3,
  Levedura = 4,
  Zimbro = 5,
  Botanico = 6,
  Outro = 7,
}

/** Espelha ContratoInsumos.ResultadoAvaliacao — mesma ordem, mesmos valores. */
export enum ResultadoAvaliacao {
  NaoAvaliado = 0,
  Aprovado = 1,
  Rejeitado = 2,
}

/** Espelha ContratoProducao.TipoBebida — mesma ordem, mesmos valores. */
export enum TipoBebida {
  NaoDefinido = 0,
  Cachaca = 1,
  Whisky = 2,
  Vodca = 3,
  Gin = 4,
}

/** Espelha ContratoProducao.EstadoProducao — mesma ordem, mesmos valores. */
export enum EstadoProducao {
  Criado = 0,
  EmProducao = 1,
  Concluido = 2,
}

/** Espelha ContratoProducao.EtapaProducao — mesma ordem, mesmos valores. */
export enum EtapaProducao {
  PreparacaoBase = 0,
  Fermentacao = 1,
  Destilacao = 2,
  Retificacao = 3,
  Maturacao = 4,
  Filtragem = 5,
  Blendagem = 6,
  Aromatizacao = 7,
  AjusteFinal = 8,
}
