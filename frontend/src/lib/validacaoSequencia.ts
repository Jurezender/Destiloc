import { EtapaProdutiva } from "./tipos";

/**
 * Espelha, no cliente, a gramática validada por
 * `ContratoLote._validarSequencia`:
 *
 *   RecebimentoMateriaPrima
 *   TransformacaoDestilacao+
 *   ( Envelhecimento | Finalizacao )*
 *   Engarrafamento
 *
 * Serve para dar feedback no construtor de sequência antes de enviar a
 * transação de cadastro do lote. As mensagens espelham as strings dos
 * `require` do contrato, para ficarem consistentes com `mapearErroContrato`.
 */
export const MINIMO_ETAPAS = 3;
export const MAXIMO_ETAPAS = 12;

export function validarSequencia(sequencia: EtapaProdutiva[]): string | null {
  const n = sequencia.length;

  if (n < MINIMO_ETAPAS) return "A sequência precisa ter ao menos três etapas.";
  if (n > MAXIMO_ETAPAS) return "A sequência excede o número máximo de doze etapas.";
  if (sequencia[0] !== EtapaProdutiva.RecebimentoMateriaPrima) {
    return "A sequência precisa começar em recebimento de matéria-prima.";
  }
  if (sequencia[n - 1] !== EtapaProdutiva.Engarrafamento) {
    return "A sequência precisa terminar em engarrafamento.";
  }

  let i = 1;
  let ciclos = 0;
  while (i < n - 1 && sequencia[i] === EtapaProdutiva.TransformacaoDestilacao) {
    ciclos++;
    i++;
  }
  if (ciclos < 1) {
    return "A sequência precisa ter ao menos uma transformação/destilação após o recebimento.";
  }

  for (; i < n - 1; i++) {
    if (
      sequencia[i] !== EtapaProdutiva.Envelhecimento &&
      sequencia[i] !== EtapaProdutiva.Finalizacao
    ) {
      return "Depois da destilação, só envelhecimento ou finalização são permitidos, até o engarrafamento.";
    }
  }

  return null;
}

export function sequenciaValida(sequencia: EtapaProdutiva[]): boolean {
  return validarSequencia(sequencia) === null;
}
