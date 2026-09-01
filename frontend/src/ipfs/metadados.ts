import {
  RETULO_ETAPA_PRODUCAO,
  RETULO_RESULTADO_AVALIACAO,
  RETULO_TIPO_BEBIDA,
  RETULO_TIPO_INSUMO,
} from "../lib/formatadores";
import { EtapaProducao, ResultadoAvaliacao, TipoBebida, TipoInsumo } from "../lib/tipos";

interface MetadadosBase {
  versao: 1;
  tipo:
    | "insumo"
    | "avaliacao-insumo"
    | "correcao-documental"
    | "invalidacao-insumo"
    | "lote-producao"
    | "etapa-producao"
    | "conclusao-producao"
    | "envasamento";
  geradoEm: string;
  documentos?: string[];
  observacoes?: string;
}

export interface MetadadosInsumo extends MetadadosBase {
  tipo: "insumo";
  tipoInsumo: string;
  descricao?: string;
  origem?: string;
}

export interface MetadadosAvaliacao extends MetadadosBase {
  tipo: "avaliacao-insumo";
  insumoId: string;
  resultado: string;
}

export interface MetadadosCorrecaoDocumental extends MetadadosBase {
  tipo: "correcao-documental";
  insumoId: string;
}

export interface MetadadosInvalidacao extends MetadadosBase {
  tipo: "invalidacao-insumo";
  insumoId: string;
  motivo?: string;
}

export interface ConfiguracaoProducaoMetadados {
  maturacaoAplicavel: boolean;
  retificacaoAplicavel: boolean;
  blendagemAplicavel: boolean;
  ajusteFinalAplicavel: boolean;
}

export interface MetadadosLoteProducao extends MetadadosBase {
  tipo: "lote-producao";
  tipoBebida: string;
  configuracao: ConfiguracaoProducaoMetadados;
  descricao?: string;
}

export interface MetadadosEtapaProducao extends MetadadosBase {
  tipo: "etapa-producao";
  loteProducaoId: string;
  etapa: string;
  insumosUtilizados: string[];
  inicioInformado: string;
  fimInformado: string;
}

export interface MetadadosConclusaoProducao extends MetadadosBase {
  tipo: "conclusao-producao";
  loteProducaoId: string;
}

export interface MetadadosEnvasamento extends MetadadosBase {
  tipo: "envasamento";
  loteProducaoId: string;
  quantidadeDeclarada: string;
  descricao?: string;
}

type CamposComuns = Pick<MetadadosBase, "documentos" | "observacoes">;

function camposBase<T extends MetadadosBase["tipo"]>(
  tipo: T,
  campos: CamposComuns
): Pick<MetadadosBase, "versao" | "geradoEm" | "documentos" | "observacoes"> & { tipo: T } {
  return {
    versao: 1,
    tipo,
    geradoEm: new Date().toISOString(),
    documentos: campos.documentos,
    observacoes: campos.observacoes,
  };
}

export function montarMetadadosInsumo(params: {
  tipoInsumo: TipoInsumo;
  descricao?: string;
  origem?: string;
  documentos?: string[];
  observacoes?: string;
}): MetadadosInsumo {
  return {
    ...camposBase("insumo", params),
    tipoInsumo: RETULO_TIPO_INSUMO[params.tipoInsumo],
    descricao: params.descricao,
    origem: params.origem,
  };
}

export function montarMetadadosAvaliacao(params: {
  insumoId: string;
  resultado: ResultadoAvaliacao;
  documentos?: string[];
  observacoes?: string;
}): MetadadosAvaliacao {
  return {
    ...camposBase("avaliacao-insumo", params),
    insumoId: params.insumoId,
    resultado: RETULO_RESULTADO_AVALIACAO[params.resultado],
  };
}

export function montarMetadadosCorrecaoDocumental(params: {
  insumoId: string;
  documentos?: string[];
  observacoes?: string;
}): MetadadosCorrecaoDocumental {
  return {
    ...camposBase("correcao-documental", params),
    insumoId: params.insumoId,
  };
}

export function montarMetadadosInvalidacao(params: {
  insumoId: string;
  motivo?: string;
  documentos?: string[];
  observacoes?: string;
}): MetadadosInvalidacao {
  return {
    ...camposBase("invalidacao-insumo", params),
    insumoId: params.insumoId,
    motivo: params.motivo,
  };
}

export function montarMetadadosLoteProducao(params: {
  tipoBebida: TipoBebida;
  configuracao: ConfiguracaoProducaoMetadados;
  descricao?: string;
  documentos?: string[];
  observacoes?: string;
}): MetadadosLoteProducao {
  return {
    ...camposBase("lote-producao", params),
    tipoBebida: RETULO_TIPO_BEBIDA[params.tipoBebida],
    configuracao: params.configuracao,
    descricao: params.descricao,
  };
}

export function montarMetadadosEtapaProducao(params: {
  loteProducaoId: string;
  etapa: EtapaProducao;
  insumosUtilizados: string[];
  inicioInformado: string;
  fimInformado: string;
  documentos?: string[];
  observacoes?: string;
}): MetadadosEtapaProducao {
  return {
    ...camposBase("etapa-producao", params),
    loteProducaoId: params.loteProducaoId,
    etapa: RETULO_ETAPA_PRODUCAO[params.etapa],
    insumosUtilizados: params.insumosUtilizados,
    inicioInformado: params.inicioInformado,
    fimInformado: params.fimInformado,
  };
}

export function montarMetadadosConclusaoProducao(params: {
  loteProducaoId: string;
  documentos?: string[];
  observacoes?: string;
}): MetadadosConclusaoProducao {
  return {
    ...camposBase("conclusao-producao", params),
    loteProducaoId: params.loteProducaoId,
  };
}

export function montarMetadadosEnvasamento(params: {
  loteProducaoId: string;
  quantidadeDeclarada: string;
  descricao?: string;
  documentos?: string[];
  observacoes?: string;
}): MetadadosEnvasamento {
  return {
    ...camposBase("envasamento", params),
    loteProducaoId: params.loteProducaoId,
    quantidadeDeclarada: params.quantidadeDeclarada,
    descricao: params.descricao,
  };
}
