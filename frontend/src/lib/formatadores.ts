import { EtapaProdutiva, TipoEventoCustodia } from "./tipos";

export const RETULO_ETAPA: Record<EtapaProdutiva, string> = {
  [EtapaProdutiva.RecebimentoMateriaPrima]: "Recebimento de matéria-prima",
  [EtapaProdutiva.TransformacaoDestilacao]: "Transformação e destilação",
  [EtapaProdutiva.Envelhecimento]: "Envelhecimento",
  [EtapaProdutiva.Finalizacao]: "Finalização",
  [EtapaProdutiva.Engarrafamento]: "Engarrafamento",
};

export const RETULO_EVENTO_CUSTODIA: Record<TipoEventoCustodia, string> = {
  [TipoEventoCustodia.Expedicao]: "Expedição",
  [TipoEventoCustodia.Recebimento]: "Recebimento confirmado",
  [TipoEventoCustodia.Cancelamento]: "Expedição cancelada",
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
