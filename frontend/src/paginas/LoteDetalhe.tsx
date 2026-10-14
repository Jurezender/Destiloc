import { useState } from "react";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx } from "../lib/erros";
import { EstadoProducao, TipoBebida } from "../lib/tipos";
import {
  validarConfiguracaoProducao,
  type ConfiguracaoProducao,
} from "../lib/validacaoSequencia";
import { useLoteContexto, type Signer } from "./LoteLayout";

export function LoteDetalhe() {
  const {
    lote,
    configuracao,
    podeOperar,
    chainId,
    signer,
    carregar,
  } = useLoteContexto();

  return (
    <>
      <h2>Configuração de produção</h2>
      {lote.estado !== EstadoProducao.Criado && (
        <p className="dica">Configuração congelada, só pode ser alterada enquanto o lote está em "Criado".</p>
      )}
      {lote.estado === EstadoProducao.Criado && !podeOperar && (
        <p className="dica">Só o produtor responsável, com papel de Produtor, pode alterar a configuração.</p>
      )}
      <ul>
        <li>Maturação aplicável: {configuracao.maturacaoAplicavel ? "sim" : "não"}</li>
        <li>Retificação aplicável: {configuracao.retificacaoAplicavel ? "sim" : "não"}</li>
        <li>Blendagem aplicável: {configuracao.blendagemAplicavel ? "sim" : "não"}</li>
        <li>Ajuste final aplicável: {configuracao.ajusteFinalAplicavel ? "sim" : "não"}</li>
      </ul>
      {lote.estado === EstadoProducao.Criado && podeOperar && (
        <AtualizarConfiguracao
          loteId={lote.id}
          tipoBebida={lote.tipoBebida}
          configuracaoAtual={configuracao}
          chainId={chainId}
          signer={signer}
          aoAtualizar={carregar}
        />
      )}
    </>
  );
}

function AtualizarConfiguracao({
  loteId,
  tipoBebida,
  configuracaoAtual,
  chainId,
  signer,
  aoAtualizar,
}: {
  loteId: bigint;
  tipoBebida: TipoBebida;
  configuracaoAtual: ConfiguracaoProducao;
  chainId: number;
  signer: Signer;
  aoAtualizar: () => void;
}) {
  const [configuracao, setConfiguracao] = useState<ConfiguracaoProducao>(configuracaoAtual);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTx | null>(null);

  function alternar(campo: keyof ConfiguracaoProducao) {
    setConfiguracao((atual) => ({ ...atual, [campo]: !atual[campo] }));
  }

  const erroValidacao = validarConfiguracaoProducao(tipoBebida, configuracao);

  async function enviar() {
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }
    setErro(null);
    setFeedback(null);
    setEnviando(true);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const tx = await producao.atualizarConfiguracao(loteId, configuracao);
      await tx.wait();
      setFeedback({ tipo: "ok", texto: "Configuração atualizada com sucesso." });
      aoAtualizar();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
      <label>
        <input
          type="checkbox"
          checked={configuracao.maturacaoAplicavel}
          onChange={() => alternar("maturacaoAplicavel")}
        />
        Maturação aplicável
      </label>
      <label>
        <input
          type="checkbox"
          checked={configuracao.retificacaoAplicavel}
          onChange={() => alternar("retificacaoAplicavel")}
        />
        Retificação aplicável
      </label>
      <label>
        <input
          type="checkbox"
          checked={configuracao.blendagemAplicavel}
          onChange={() => alternar("blendagemAplicavel")}
        />
        Blendagem aplicável
      </label>
      <label>
        <input
          type="checkbox"
          checked={configuracao.ajusteFinalAplicavel}
          onChange={() => alternar("ajusteFinalAplicavel")}
        />
        Ajuste final aplicável
      </label>
      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Salvando…" : "Salvar configuração"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}
