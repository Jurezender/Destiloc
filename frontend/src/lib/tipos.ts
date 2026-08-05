/** Espelha o enum EtapaProdutiva de TiposCadeia.sol — mesma ordem, mesmos valores. */
export enum EtapaProdutiva {
  RecebimentoMateriaPrima = 0,
  TransformacaoDestilacao = 1,
  Envelhecimento = 2,
  Finalizacao = 3,
  Engarrafamento = 4,
}

/** Espelha o enum TipoEventoCustodia de TiposCadeia.sol. */
export enum TipoEventoCustodia {
  Expedicao = 0,
  Recebimento = 1,
  Cancelamento = 2,
}
