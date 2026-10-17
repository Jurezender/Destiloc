import { useEffect, useState } from "react";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx } from "../lib/erros";
import { encurtarEndereco, ROTULO_TIPO_INSUMO, UNIDADE_INSUMO } from "../lib/formatadores";
import { nomeResumido, useNomesParticipantes } from "../lib/useNomesParticipantes";
import { EstadoProducao, TipoInsumo } from "../lib/tipos";
import { useLoteContexto, type Signer } from "./LoteLayout";

interface OpcaoInsumo {
  id: bigint;
  tipo: TipoInsumo;
  quantidade: bigint;
}

export function LoteInsumos() {
  const {
    lote,
    insumosVinculados,
    podeOperar,
    chainId,
    signer,
    carregar,
  } = useLoteContexto();
  const nomes = useNomesParticipantes();

  return (
    <>
      <h2>Insumos vinculados</h2>
      {lote.estado === EstadoProducao.Concluido && (
        <p className="dica">Produção concluída, não aceita novos vínculos de insumo.</p>
      )}
      {lote.estado !== EstadoProducao.Concluido && !podeOperar && (
        <p className="dica">Só o produtor responsável, com papel de Produtor, pode vincular insumos.</p>
      )}
      <ul>
        {insumosVinculados.map((insumo) => (
          <li key={insumo.id.toString()}>
            #{insumo.id.toString()} - {ROTULO_TIPO_INSUMO[insumo.tipo]} - fornecedor {nomeResumido(nomes.get(insumo.fornecedor.toLowerCase()), encurtarEndereco(insumo.fornecedor))}
          </li>
        ))}
        {insumosVinculados.length === 0 && <li className="lista-vazia">Nenhum insumo vinculado ainda.</li>}
      </ul>
      {lote.estado !== EstadoProducao.Concluido && podeOperar && (
        <VincularInsumo loteId={lote.id} chainId={chainId} signer={signer} aoVincular={carregar} />
      )}
    </>
  );
}

function VincularInsumo({
  loteId,
  chainId,
  signer,
  aoVincular,
}: {
  loteId: bigint;
  chainId: number;
  signer: Signer;
  aoVincular: () => void;
}) {
  const { conta } = useCarteira();
  const [opcoes, setOpcoes] = useState<OpcaoInsumo[]>([]);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(true);
  const [insumoId, setInsumoId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTx | null>(null);

  useEffect(() => {
    if (!conta) return;
    let cancelado = false;
    setCarregandoOpcoes(true);
    void (async () => {
      try {
        const insumosContrato = obterContrato("ContratoInsumos", chainId, signer);
        const producaoContrato = obterContrato("ContratoProducao", chainId, signer);
        const total = Number(await insumosContrato.totalInsumosDoProdutor(conta));
        const ids = await Promise.all(
          Array.from({ length: total }, (_, i) =>
            insumosContrato.insumoDoProdutor(conta, i) as Promise<bigint>
          )
        );
        const detalhes = await Promise.all(
          ids.map(async (id) => {
            const [dado, valido, aprovado, jaVinculado] = await Promise.all([
              insumosContrato.obterLoteInsumo(id),
              insumosContrato.loteInsumoValido(id) as Promise<boolean>,
              insumosContrato.aprovadoPor(id, conta) as Promise<boolean>,
              producaoContrato.insumoEstaVinculado(loteId, id) as Promise<boolean>,
            ]);
            return { id, dado, valido, aprovado, jaVinculado };
          })
        );
        if (cancelado) return;
        const disponiveis = detalhes
          .filter((d) => d.valido && d.aprovado && !d.jaVinculado)
          .map((d) => ({
            id: d.id,
            tipo: Number(d.dado.tipo) as TipoInsumo,
            quantidade: d.dado.quantidade as bigint,
          }));
        setOpcoes(disponiveis);
      } catch {
        // carregamento de opções é melhor-esforço
      } finally {
        if (!cancelado) setCarregandoOpcoes(false);
      }
    })();
    return () => { cancelado = true; };
  }, [chainId, signer, conta, loteId]);

  async function enviar() {
    if (!insumoId) {
      setErro("Selecione um insumo.");
      return;
    }
    setErro(null);
    setFeedback(null);
    setEnviando(true);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const tx = await producao.vincularInsumoAoLote(loteId, insumoId);
      await tx.wait();
      setInsumoId("");
      setFeedback({ tipo: "ok", texto: "Insumo vinculado com sucesso." });
      aoVincular();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
      {carregandoOpcoes ? (
        <p className="dica">Carregando insumos disponíveis…</p>
      ) : opcoes.length === 0 ? (
        <>
          <p className="dica">
            <strong>Nenhum insumo disponível para vincular a este lote.</strong>
          </p>
          <p className="dica">
            Aqui aparecem apenas os insumos enviados a você que já foram aprovados
            e ainda não foram vinculados a outro lote.
          </p>
        </>
      ) : (
        <label>
          Insumo
          <select value={insumoId} onChange={(e) => setInsumoId(e.target.value)}>
            <option value="">Selecione…</option>
            {opcoes.map((op) => (
              <option key={op.id.toString()} value={op.id.toString()}>
                #{op.id.toString()} — {ROTULO_TIPO_INSUMO[op.tipo]} · {op.quantidade.toString()} {UNIDADE_INSUMO[op.tipo]}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="button" onClick={() => void enviar()} disabled={opcoes.length === 0 || carregandoOpcoes}>
        {enviando ? "Vinculando…" : "Vincular insumo"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}
