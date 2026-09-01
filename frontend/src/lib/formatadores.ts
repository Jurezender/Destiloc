import {
  EstadoProducao,
  EtapaProducao,
  ResultadoAvaliacao,
  TipoBebida,
  TipoInsumo,
} from "./tipos";

export const RETULO_TIPO_INSUMO: Record<TipoInsumo, string> = {
  [TipoInsumo.NaoDefinido]: "Não definido",
  [TipoInsumo.MateriaPrimaAgricola]: "Matéria-prima agrícola",
  [TipoInsumo.BaseAlcoolica]: "Base alcoólica",
  [TipoInsumo.Agua]: "Água",
  [TipoInsumo.Levedura]: "Levedura",
  [TipoInsumo.Zimbro]: "Zimbro",
  [TipoInsumo.Botanico]: "Botânico",
  [TipoInsumo.Outro]: "Outro",
};

export const RETULO_RESULTADO_AVALIACAO: Record<ResultadoAvaliacao, string> = {
  [ResultadoAvaliacao.NaoAvaliado]: "Não avaliado",
  [ResultadoAvaliacao.Aprovado]: "Aprovado",
  [ResultadoAvaliacao.Rejeitado]: "Rejeitado",
};

export const RETULO_TIPO_BEBIDA: Record<TipoBebida, string> = {
  [TipoBebida.NaoDefinido]: "Não definido",
  [TipoBebida.Cachaca]: "Cachaça",
  [TipoBebida.Whisky]: "Whisky",
  [TipoBebida.Vodca]: "Vodca",
  [TipoBebida.Gin]: "Gin",
};

export const RETULO_ESTADO_PRODUCAO: Record<EstadoProducao, string> = {
  [EstadoProducao.Criado]: "Criado",
  [EstadoProducao.EmProducao]: "Em produção",
  [EstadoProducao.Concluido]: "Concluído",
};

export const RETULO_ETAPA_PRODUCAO: Record<EtapaProducao, string> = {
  [EtapaProducao.PreparacaoBase]: "Preparação da base",
  [EtapaProducao.Fermentacao]: "Fermentação",
  [EtapaProducao.Destilacao]: "Destilação",
  [EtapaProducao.Retificacao]: "Retificação",
  [EtapaProducao.Maturacao]: "Maturação",
  [EtapaProducao.Filtragem]: "Filtragem",
  [EtapaProducao.Blendagem]: "Blendagem",
  [EtapaProducao.Aromatizacao]: "Aromatização",
  [EtapaProducao.AjusteFinal]: "Ajuste final",
};

/** `timestamp` em segundos, como armazenado nos contratos (uint64). */
export function formatarTimestamp(timestamp: bigint | number): string {
  const segundos = typeof timestamp === "bigint" ? Number(timestamp) : timestamp;
  if (!segundos) return "—";
  return new Date(segundos * 1000).toLocaleString("pt-BR");
}

export function encurtarEndereco(endereco: string): string {
  if (endereco.length <= 12) return endereco;
  return `${endereco.slice(0, 6)}…${endereco.slice(-4)}`;
}
