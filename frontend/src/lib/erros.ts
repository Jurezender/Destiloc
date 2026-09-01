/**
 * Traduz os custom errors conhecidos dos contratos atuais para mensagens em
 * PT-BR amigáveis. Nenhuma regra nova: só UX sobre o que os contratos recusam.
 */
const MENSAGENS: Array<[string, string]> = [
  ["ContaInvalida", "Informe uma conta válida."],
  ["UltimoAdministrador", "O último administrador não pode perder esse papel."],
  ["ContratoAcessoInvalido", "A configuração do contrato de acesso é inválida."],
  ["ContratoInsumosInvalido", "A configuração do contrato de insumos é inválida."],
  ["ContratoProducaoInvalido", "A configuração do contrato de produção é inválida."],
  ["SemPermissao", "Sua conta não tem permissão para esta ação."],
  ["LoteInsumoInexistente", "Este lote de insumo não existe."],
  ["TipoInsumoInvalido", "Selecione um tipo de insumo válido."],
  ["ResultadoAvaliacaoInvalido", "Selecione um resultado de avaliação válido."],
  ["ReferenciaIPFSInvalida", "A referência IPFS informada é inválida."],
  ["NaoEhFornecedorOriginal", "Somente o fornecedor original pode alterar este lote de insumo."],
  ["LoteInsumoEstaInvalidado", "Este lote de insumo está invalidado."],
  ["LoteInsumoJaInvalidado", "Este lote de insumo já foi invalidado."],
  ["LoteProducaoInexistente", "Este lote de produção não existe."],
  ["TipoBebidaInvalido", "Selecione um tipo de bebida válido."],
  ["NaoEhProdutorResponsavel", "Somente o produtor responsável pode alterar este lote."],
  ["ConfiguracaoInvalida", "A configuração da produção é inválida para este tipo de bebida."],
  ["ConfiguracaoCongelada", "A configuração não pode ser alterada depois do início da produção."],
  ["EstadoProducaoInvalido", "A produção não está no estado necessário para esta ação."],
  ["InsumoInexistente", "Um dos insumos informados não existe."],
  ["InsumoInvalido", "Um dos insumos informados está invalidado."],
  ["InsumoNaoAprovado", "Um dos insumos ainda não foi aprovado por este produtor."],
  ["InsumoJaVinculado", "Este insumo já está vinculado ao lote de produção."],
  ["InsumoNaoVinculado", "Este insumo não está vinculado ao lote de produção."],
  ["InsumoDuplicadoNaEtapa", "O mesmo insumo não pode ser informado duas vezes na etapa."],
  ["EtapaNaoAplicavel", "Esta etapa não se aplica ao tipo de bebida selecionado."],
  ["EtapaJaRegistrada", "Esta etapa já foi registrada."],
  ["PrecedenciaInvalida", "As etapas anteriores necessárias ainda não foram registradas."],
  ["PeriodoInformadoInvalido", "O início informado não pode ser posterior ao fim."],
  ["RequisitoDeEtapaNaoAtendido", "Ainda faltam etapas obrigatórias para concluir a produção."],
  ["RequisitoDeInsumoNaoAtendido", "Ainda faltam insumos obrigatórios para concluir a produção."],
  ["EnvasamentoInexistente", "Este envasamento não existe."],
  ["NaoEhEnvasadorResponsavel", "Somente o envasador responsável pode alterar este envasamento."],
  ["ProducaoInexistente", "O lote de produção informado não existe."],
  ["ProducaoNaoConcluida", "A produção precisa estar concluída antes do envasamento."],
  ["QuantidadeInvalida", "Informe uma quantidade válida."],
  ["QuantidadeExcedeDeclarada", "A quantidade excede o total declarado para o envasamento."],
  ["EnvasamentoJaConcluido", "Este envasamento já foi concluído."],
  ["GarrafaInexistente", "Esta garrafa não existe."],
  ["TokenNaoTransferivel", "Esta garrafa não pode ser transferida."],
  ["AprovacaoNaoPermitida", "Não é permitido aprovar transferências desta garrafa."],
  ["IndiceForaDosLimites", "O item solicitado não existe nesta lista."],
];

interface ErroComRevert {
  reason?: string;
  shortMessage?: string;
  message?: string;
  info?: { error?: { message?: string } };
}

function extrairTexto(erro: unknown): string {
  if (!erro || typeof erro !== "object") return String(erro);
  const e = erro as ErroComRevert;
  return [e.reason, e.shortMessage, e.info?.error?.message, e.message].filter(Boolean).join(" | ");
}

/** Devolve uma mensagem em PT-BR para exibir ao usuário, a partir de um erro de leitura ou de transação. */
export function mapearErroContrato(erro: unknown): string {
  const texto = extrairTexto(erro);

  for (const [trecho, mensagem] of MENSAGENS) {
    if (texto.includes(trecho)) return mensagem;
  }

  if (texto.includes("user rejected") || texto.includes("ACTION_REJECTED")) {
    return "Transação cancelada na MetaMask.";
  }
  if (texto.includes("AccessControlUnauthorizedAccount") || texto.includes("AccessControl:")) {
    return "Sua conta não tem o papel necessário para esta ação.";
  }
  if (texto.includes("insufficient funds")) {
    return "Saldo insuficiente para pagar o gas desta transação.";
  }

  return "Não foi possível concluir a operação. Detalhe técnico: " + (texto || "erro desconhecido");
}
