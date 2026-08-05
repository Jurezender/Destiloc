import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { RETULO_ETAPA } from "../lib/formatadores";
import { mapearErroContrato } from "../lib/erros";
import { EtapaProdutiva } from "../lib/tipos";
import { validarSequencia } from "../lib/validacaoSequencia";

interface LinhaLote {
  id: bigint;
  tipoBebida: string;
  fabricante: string;
  indiceAtual: bigint;
  totalEtapas: bigint;
  concluido: boolean;
}

function ConstrutorSequencia({ sequencia, setSequencia }: { sequencia: EtapaProdutiva[]; setSequencia: (s: EtapaProdutiva[]) => void }) {
  const completa = [EtapaProdutiva.RecebimentoMateriaPrima, ...sequencia, EtapaProdutiva.Engarrafamento];
  const erroSequencia = validarSequencia(completa);

  return (
    <div className="construtor-sequencia">
      <ol>
        <li>{RETULO_ETAPA[EtapaProdutiva.RecebimentoMateriaPrima]} (fixa, primeira)</li>
        {sequencia.map((etapa, indice) => (
          <li key={indice}>{RETULO_ETAPA[etapa]}</li>
        ))}
        <li>{RETULO_ETAPA[EtapaProdutiva.Engarrafamento]} (fixa, última)</li>
      </ol>
      <div className="acoes">
        <button type="button" onClick={() => setSequencia([...sequencia, EtapaProdutiva.TransformacaoDestilacao])}>
          + Transformação/destilação
        </button>
        <button type="button" onClick={() => setSequencia([...sequencia, EtapaProdutiva.Envelhecimento])}>
          + Envelhecimento
        </button>
        <button type="button" onClick={() => setSequencia([...sequencia, EtapaProdutiva.Finalizacao])}>
          + Finalização
        </button>
        <button type="button" disabled={sequencia.length === 0} onClick={() => setSequencia(sequencia.slice(0, -1))}>
          Remover última
        </button>
      </div>
      {erroSequencia ? <p className="erro">{erroSequencia}</p> : <p className="ok">Sequência válida.</p>}
    </div>
  );
}

function NovoLote({ onCriado }: { onCriado: () => void }) {
  const { chainId, signer } = useCarteira();
  const [tipoBebida, setTipoBebida] = useState("");
  const [insumos, setInsumos] = useState("");
  const [sequencia, setSequencia] = useState<EtapaProdutiva[]>([EtapaProdutiva.TransformacaoDestilacao]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    if (!chainId || !signer) return;
    const completa = [EtapaProdutiva.RecebimentoMateriaPrima, ...sequencia, EtapaProdutiva.Engarrafamento];
    const erroSequencia = validarSequencia(completa);
    if (erroSequencia) {
      setErro(erroSequencia);
      return;
    }
    if (!tipoBebida.trim() || !insumos.trim()) {
      setErro("Preencha o tipo de bebida e os insumos.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const lote = obterContrato("ContratoLote", chainId, signer);
      const tx = await lote.registrarLote(tipoBebida.trim(), insumos.trim(), completa);
      await tx.wait();
      setTipoBebida("");
      setInsumos("");
      setSequencia([EtapaProdutiva.TransformacaoDestilacao]);
      onCriado();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Novo lote</legend>
      <label>
        Tipo de bebida
        <input value={tipoBebida} onChange={(e) => setTipoBebida(e.target.value)} />
      </label>
      <label>
        Insumos
        <input value={insumos} onChange={(e) => setInsumos(e.target.value)} />
      </label>
      <ConstrutorSequencia sequencia={sequencia} setSequencia={setSequencia} />
      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Registrando…" : "Registrar lote"}
      </button>
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

export function Lotes() {
  const { chainId, signer } = useCarteira();
  const papeis = usePapeis();
  const [linhas, setLinhas] = useState<LinhaLote[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer) return;
    setCarregando(true);
    setErro(null);
    try {
      const lote = obterContrato("ContratoLote", chainId, signer);
      const total = (await lote.totalLotes()) as bigint;
      const ids = Array.from({ length: Number(total) }, (_, i) => BigInt(i + 1));
      const dados = await Promise.all(
        ids.map(async (id) => {
          const dado = await lote.obterLote(id);
          return {
            id,
            tipoBebida: dado.tipoBebida as string,
            fabricante: dado.fabricante as string,
            indiceAtual: dado.indiceAtual as bigint,
            totalEtapas: (await lote.totalEtapas(id)) as bigint,
            concluido: ((dado.dataConclusao as bigint) ?? 0n) > 0n,
          } satisfies LinhaLote;
        })
      );
      setLinhas(dados.reverse());
    } catch (erroLeitura) {
      setErro(mapearErroContrato(erroLeitura));
    } finally {
      setCarregando(false);
    }
  }, [chainId, signer]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <section>
      <h1>Lotes</h1>
      {papeis.lote.fabricante && <NovoLote onCriado={carregar} />}
      {!papeis.lote.fabricante && (
        <p className="dica">Sua conta não tem FABRICANTE_ROLE em ContratoLote; só pode consultar.</p>
      )}

      <h2>Lotes cadastrados</h2>
      {carregando && <p>Carregando…</p>}
      {erro && <p className="erro">{erro}</p>}
      <ul className="lista-lotes">
        {linhas.map((linha) => (
          <li key={linha.id.toString()}>
            <Link to={`/lotes/${linha.id}`}>
              #{linha.id.toString()} — {linha.tipoBebida} ({linha.indiceAtual.toString()}/{linha.totalEtapas.toString()}
              {linha.concluido ? ", concluído" : ""})
            </Link>
          </li>
        ))}
        {!carregando && linhas.length === 0 && <li>Nenhum lote cadastrado ainda.</li>}
      </ul>
    </section>
  );
}
