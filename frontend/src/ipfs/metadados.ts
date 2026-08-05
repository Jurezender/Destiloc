import { RETULO_ETAPA } from "../lib/formatadores";
import { EtapaProdutiva } from "../lib/tipos";

export interface MetadadosGarrafa {
  versao: 1;
  loteId: string;
  tipoBebida: string;
  insumos: string;
  fabricante: string;
  sequenciaProdutiva: string[];
  geradoEm: string;
  observacoes?: string;
}

export interface MetadadosEtapa {
  versao: 1;
  loteId: string;
  etapa: string;
  documentos: string[];
  observacoes?: string;
}

/** Monta o JSON de metadados de uma garrafa, enviado ao IPFS antes da emissão. */
export function montarMetadadosGarrafa(params: {
  loteId: string;
  tipoBebida: string;
  insumos: string;
  fabricante: string;
  sequenciaProdutiva: EtapaProdutiva[];
  observacoes?: string;
}): MetadadosGarrafa {
  return {
    versao: 1,
    loteId: params.loteId,
    tipoBebida: params.tipoBebida,
    insumos: params.insumos,
    fabricante: params.fabricante,
    sequenciaProdutiva: params.sequenciaProdutiva.map((etapa) => RETULO_ETAPA[etapa]),
    geradoEm: new Date().toISOString(),
    observacoes: params.observacoes,
  };
}

/** Monta o JSON opcional de documentos associados a uma etapa produtiva. */
export function montarMetadadosEtapa(params: {
  loteId: string;
  etapa: EtapaProdutiva;
  documentos: string[];
  observacoes?: string;
}): MetadadosEtapa {
  return {
    versao: 1,
    loteId: params.loteId,
    etapa: RETULO_ETAPA[params.etapa],
    documentos: params.documentos,
    observacoes: params.observacoes,
  };
}
