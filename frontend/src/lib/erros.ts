/**
 * Traduz os `revert` conhecidos dos três contratos (as strings exatas dos
 * `require`) para mensagens em PT-BR amigáveis. Nenhuma regra nova: só UX em
 * cima do que os contratos já recusam.
 */
const MENSAGENS: Array<[string, string]> = [
  ["Lote inexistente", "Este lote não existe."],
  ["Garrafa inexistente", "Esta garrafa não existe."],
  ["Producao do lote nao concluida", "A produção deste lote ainda não foi concluída — a emissão só é permitida depois do engarrafamento."],
  ["Producao ja concluida", "A produção deste lote já foi concluída; não há mais etapas para registrar."],
  ["RBAC: apenas fabricante", "Sua conta não tem o papel de fabricante necessário para esta ação."],
  ["Apenas o fabricante do lote", "Só o fabricante que registrou este lote pode fazer isso."],
  ["Etapa diferente da prevista pela sequencia do lote", "Esta não é a próxima etapa prevista na sequência declarada para o lote."],
  ["Referencia de metadados fora do formato ipfs://", "A referência dos metadados não está no formato ipfs:// válido."],
  ["Lista de referencias vazia", "Informe ao menos uma referência de metadados para emitir garrafas."],
  ["Excede o maximo por transacao", "Excede o número máximo de garrafas permitido em uma única transação."],
  ["Ja existe expedicao pendente", "Já existe uma expedição pendente para esta garrafa; cancele-a ou aguarde a confirmação antes de expedir de novo."],
  ["Nao existe expedicao pendente", "Não há nenhuma expedição pendente para esta garrafa."],
  ["Destinatario invalido", "Informe um endereço de destinatário válido."],
  ["Destinatario igual ao remetente", "O destinatário não pode ser o mesmo que está expedindo."],
  ["Apenas o custodiante atual", "Só quem está com a custódia atual da garrafa pode fazer isso."],
  ["Apenas o destinatario indicado", "Só a conta indicada como destinatária pode confirmar este recebimento."],
  ["Destinatario nao possui mais papel autorizado", "O papel do destinatário foi revogado desde a expedição; ele não pode mais confirmar o recebimento. Cancele a expedição."],
  ["Transicao invalida", "Esta transição de custódia não é permitida pelo fluxo (fabricante/distribuidor só expedem para distribuidor ou varejista)."],
  ["Sistema ficaria sem administrador", "Esta ação deixaria o contrato sem nenhum administrador; conceda o papel a outra conta antes."],
  ["Conta ja possui outro papel operacional", "Esta conta já tem outro papel operacional (fabricante, distribuidor ou varejista); os três são mutuamente exclusivos."],
  ["Sequencia: minimo de tres etapas", "A sequência precisa ter ao menos três etapas."],
  ["Sequencia: excede o maximo de etapas", "A sequência excede o número máximo de etapas permitido."],
  ["Sequencia: deve comecar em recebimento de materia-prima", "A sequência precisa começar em recebimento de matéria-prima."],
  ["Sequencia: deve terminar em engarrafamento", "A sequência precisa terminar em engarrafamento."],
  ["Sequencia: exige transformacao e destilacao apos o recebimento", "A sequência precisa ter ao menos uma transformação/destilação após o recebimento."],
  ["Sequencia: apos a destilacao apenas envelhecimento ou finalizacao", "Depois da destilação, só envelhecimento ou finalização são permitidos, até o engarrafamento."],
  ["Endereco do ContratoLote invalido", "Endereço do ContratoLote inválido."],
  ["Endereco do ContratoTokenizacao invalido", "Endereço do ContratoTokenizacao inválido."],
  ["Garrafa nao transferivel", "Esta garrafa não é transferível diretamente; use expedição e confirmação de recebimento."],
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
