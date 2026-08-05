import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { EtapaProdutiva } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosGarrafa } from "../ipfs/metadados";

interface InfoLote {
  tipoBebida: string;
  insumos: string;
  fabricante: string;
  sequencia: EtapaProdutiva[];
}

export function Emitir() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { chainId, signer } = useCarteira();
  const papeis = usePapeis();

  const [statusLote, setStatusLote] = useState<"carregando" | "pronto" | "nao-concluido" | "inexistente">(
    "carregando"
  );
  const [infoLote, setInfoLote] = useState<InfoLote | null>(null);
  const [uris, setUris] = useState<string[]>([""]);
  const [gerandoIndice, setGerandoIndice] = useState<number | null>(null);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emitidas, setEmitidas] = useState<string[] | null>(null);

  useEffect(() => {
    if (!chainId || !signer || !id) return;
    (async () => {
      try {
        const lote = obterContrato("ContratoLote", chainId, signer);
        const existe = (await lote.loteExiste(id)) as boolean;
        if (!existe) {
          setStatusLote("inexistente");
          return;
        }
        const [concluida, dadoLote, sequencia] = await Promise.all([
          lote.producaoConcluida(id) as Promise<boolean>,
          lote.obterLote(id),
          lote.etapasDoLote(id) as Promise<bigint[]>,
        ]);
        setInfoLote({
          tipoBebida: dadoLote.tipoBebida as string,
          insumos: dadoLote.insumos as string,
          fabricante: dadoLote.fabricante as string,
          sequencia: sequencia.map((valor) => Number(valor) as EtapaProdutiva),
        });
        setStatusLote(concluida ? "pronto" : "nao-concluido");
      } catch {
        setStatusLote("inexistente");
      }
    })();
  }, [chainId, signer, id]);

  async function gerarViaIpfs(indice: number) {
    if (!id || !infoLote) return;
    setErroIpfs(null);
    setGerandoIndice(indice);
    try {
      const metadados = montarMetadadosGarrafa({
        loteId: id,
        tipoBebida: infoLote.tipoBebida,
        insumos: infoLote.insumos,
        fabricante: infoLote.fabricante,
        sequenciaProdutiva: infoLote.sequencia,
      });
      const referencia = await adicionarJSON(metadados);
      setUris((atual) => {
        const copia = [...atual];
        copia[indice] = referencia;
        return copia;
      });
    } catch (erroUpload) {
      setErroIpfs(erroUpload instanceof Error ? erroUpload.message : "Não foi possível enviar ao IPFS.");
    } finally {
      setGerandoIndice(null);
    }
  }

  if (!papeis.tokenizacao.fabricante) {
    return <p className="erro">Sua conta não tem FABRICANTE_ROLE em ContratoTokenizacao.</p>;
  }
  if (statusLote === "carregando") return <p>Carregando…</p>;
  if (statusLote === "inexistente") return <p className="erro">Este lote não existe.</p>;
  if (statusLote === "nao-concluido") {
    return (
      <p className="erro">
        A produção deste lote ainda não foi concluída — a emissão só é permitida depois do registro do
        engarrafamento. <Link to={`/lotes/${id}`}>Voltar ao lote</Link>
      </p>
    );
  }

  const errosUris = uris.map((uri) => motivoReferenciaInvalida(uri) ?? (uri.trim() === "" ? "Informe a referência ipfs://." : null));
  const formularioValido = uris.length > 0 && errosUris.every((e) => e === null);

  async function enviar() {
    if (!chainId || !signer || !id) return;
    if (!formularioValido) {
      setErro("Corrija as referências ipfs:// antes de enviar.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const tokenizacao = obterContrato("ContratoTokenizacao", chainId, signer);
      if (uris.length === 1) {
        const tx = await tokenizacao.emitirGarrafa(id, uris[0].trim());
        await tx.wait();
        const total = (await tokenizacao.totalEmitidas()) as bigint;
        setEmitidas([total.toString()]);
      } else {
        const tx = await tokenizacao.emitirGarrafasEmLote(id, uris.map((u) => u.trim()));
        await tx.wait();
        const total = Number((await tokenizacao.totalEmitidas()) as bigint);
        const ids = Array.from({ length: uris.length }, (_, i) => String(total - uris.length + 1 + i));
        setEmitidas(ids);
      }
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  if (emitidas) {
    return (
      <section>
        <h1>Garrafas emitidas</h1>
        <ul>
          {emitidas.map((tokenId) => (
            <li key={tokenId}>
              <Link to={`/garrafas/${tokenId}`}>Garrafa #{tokenId}</Link>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => navigate(`/lotes/${id}`)}>
          Voltar ao lote
        </button>
      </section>
    );
  }

  return (
    <section>
      <p>
        <Link to={`/lotes/${id}`}>← Lote #{id}</Link>
      </p>
      <h1>Emitir garrafas do lote #{id}</h1>
      <fieldset disabled={enviando}>
        {uris.map((uri, indice) => (
          <div key={indice}>
            <label>
              Referência ipfs:// da garrafa {indice + 1}
              <input
                value={uri}
                onChange={(e) => {
                  const copia = [...uris];
                  copia[indice] = e.target.value;
                  setUris(copia);
                }}
              />
            </label>
            <button type="button" onClick={() => void gerarViaIpfs(indice)} disabled={gerandoIndice !== null}>
              {gerandoIndice === indice ? "Enviando ao IPFS…" : "Gerar metadados no IPFS"}
            </button>
            {errosUris[indice] && <p className="erro">{errosUris[indice]}</p>}
          </div>
        ))}
        {erroIpfs && <p className="erro">{erroIpfs}</p>}
        <div className="acoes">
          <button type="button" onClick={() => setUris([...uris, ""])}>
            + Outra garrafa
          </button>
          <button type="button" disabled={uris.length <= 1} onClick={() => setUris(uris.slice(0, -1))}>
            Remover última
          </button>
        </div>
        <button type="button" onClick={() => void enviar()}>
          {enviando ? "Emitindo…" : `Emitir ${uris.length > 1 ? `${uris.length} garrafas` : "garrafa"}`}
        </button>
        {erro && <p className="erro">{erro}</p>}
      </fieldset>
    </section>
  );
}
