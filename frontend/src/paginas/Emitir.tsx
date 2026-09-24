import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx, mapearErroContrato } from "../lib/erros";
import { encurtarEndereco, formatarTimestamp, RETULO_TIPO_BEBIDA } from "../lib/formatadores";
import { TipoBebida } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosEnvasamento } from "../ipfs/metadados";

type Signer = NonNullable<ReturnType<typeof useCarteira>["signer"]>;

interface LoteInfo {
  produtor: string;
  tipoBebida: TipoBebida;
}

interface EnvasamentoInfo {
  id: bigint;
  envasador: string;
  quantidadeDeclarada: bigint;
  quantidadeEmitida: bigint;
  registradoEm: bigint;
  concluidoEm: bigint;
  metadataURI: string;
}

function documentosEmLinhas(texto: string): string[] {
  return texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);
}

export function Emitir() {
  const { id } = useParams<{ id: string }>();
  const { conta, chainId, signer } = useCarteira();
  const papeis = usePapeis();

  const [statusLote, setStatusLote] = useState<"carregando" | "pronto" | "nao-concluido" | "inexistente">(
    "carregando"
  );
  const [loteInfo, setLoteInfo] = useState<LoteInfo | null>(null);
  const [envasamentos, setEnvasamentos] = useState<EnvasamentoInfo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer || !id) return;
    setCarregando(true);
    setErro(null);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const existe = (await producao.loteProducaoExiste(id)) as boolean;
      if (!existe) {
        setStatusLote("inexistente");
        return;
      }
      const concluida = (await producao.loteProducaoConcluido(id)) as boolean;
      if (!concluida) {
        setStatusLote("nao-concluido");
        return;
      }
      const dadoLote = await producao.obterLoteProducao(id);
      setLoteInfo({
        produtor: dadoLote.produtor as string,
        tipoBebida: Number(dadoLote.tipoBebida) as TipoBebida,
      });

      const envasamento = obterContrato("ContratoEnvasamento", chainId, signer);
      const totalEnvasamentos = Number(await envasamento.totalEnvasamentosDaProducao(id));
      const idsEnvasamentos = await Promise.all(
        Array.from({ length: totalEnvasamentos }, (_, indice) => envasamento.envasamentoDaProducaoPorIndice(id, indice))
      );
      const dadosEnvasamentos = await Promise.all(
        (idsEnvasamentos as bigint[]).map(async (envasamentoId) => {
          const dado = await envasamento.obterEnvasamento(envasamentoId);
          return {
            id: envasamentoId,
            envasador: dado.envasador as string,
            quantidadeDeclarada: dado.quantidadeDeclarada as bigint,
            quantidadeEmitida: dado.quantidadeEmitida as bigint,
            registradoEm: dado.registradoEm as bigint,
            concluidoEm: dado.concluidoEm as bigint,
            metadataURI: dado.metadataURI as string,
          } satisfies EnvasamentoInfo;
        })
      );

      setEnvasamentos(dadosEnvasamentos.reverse());
      setStatusLote("pronto");
    } catch (erroLeitura) {
      setErro(mapearErroContrato(erroLeitura));
    } finally {
      setCarregando(false);
    }
  }, [chainId, signer, id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (statusLote === "carregando") return (
    <div className="carregando">
      <span className="carregando__indicador" aria-hidden="true" />
      <span>Carregando…</span>
    </div>
  );
  if (statusLote === "inexistente") return <p className="erro">Este lote de produção não existe.</p>;
  if (statusLote === "nao-concluido") {
    return (
      <p className="erro">
        A produção deste lote ainda não foi concluída — o envasamento só é permitido depois da conclusão da
        produção. <Link to={`/lotes/${id}`}>Voltar ao lote</Link>
      </p>
    );
  }

  return (
    <section>
      <Link className="link-voltar" to={`/lotes/${id}`}>← Lote #{id}</Link>
      <h1>
        Envasamento do lote #{id}
        {loteInfo ? ` — ${RETULO_TIPO_BEBIDA[loteInfo.tipoBebida]}` : ""}
      </h1>
      {loteInfo && (
        <p>Produtor: <span className="mono">{loteInfo.produtor}</span></p>
      )}
      {erro && <p className="erro">{erro}</p>}

      <h2>Envasamentos deste lote</h2>
      {carregando && (
        <div className="carregando">
          <span className="carregando__indicador" aria-hidden="true" />
          <span>Carregando envasamentos…</span>
        </div>
      )}
      <ul className="lista-envasamentos">
        {envasamentos.map((envasamento) => (
          <LinhaEnvasamento
            key={envasamento.id.toString()}
            envasamento={envasamento}
            conta={conta}
            temPapelEnvasador={papeis.envasador}
            chainId={chainId!}
            signer={signer!}
            aoAtualizar={carregar}
          />
        ))}
        {!carregando && envasamentos.length === 0 && <li className="lista-vazia">Nenhum envasamento registrado ainda.</li>}
      </ul>

      <h2>Registrar novo envasamento</h2>
      {papeis.envasador ? (
        <RegistrarEnvasamento loteProducaoId={id!} chainId={chainId!} signer={signer!} aoRegistrar={carregar} />
      ) : (
        <p className="dica">Sua conta não tem ENVASADOR_ROLE; só pode consultar.</p>
      )}
    </section>
  );
}

function LinhaEnvasamento({
  envasamento,
  conta,
  temPapelEnvasador,
  chainId,
  signer,
  aoAtualizar,
}: {
  envasamento: EnvasamentoInfo;
  conta: string | null;
  temPapelEnvasador: boolean;
  chainId: number;
  signer: Signer;
  aoAtualizar: () => void;
}) {
  const restante = envasamento.quantidadeDeclarada - envasamento.quantidadeEmitida;
  const concluido = envasamento.concluidoEm !== 0n;
  const souEnvasadorOriginal = conta?.toLowerCase() === envasamento.envasador.toLowerCase();

  const [quantidade, setQuantidade] = useState(restante.toString());
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTx | null>(null);
  const [tokenIdsEmitidos, setTokenIdsEmitidos] = useState<bigint[] | null>(null);

  useEffect(() => {
    setQuantidade(restante.toString());
  }, [restante]);

  async function enviar() {
    let quantidadeDesejada: bigint;
    try {
      quantidadeDesejada = BigInt(quantidade.trim() || "0");
    } catch {
      setErro("Informe uma quantidade inteira válida.");
      return;
    }
    if (quantidadeDesejada <= 0n) {
      setErro("Informe uma quantidade maior que zero.");
      return;
    }
    if (quantidadeDesejada > restante) {
      setErro(`A quantidade não pode exceder o restante (${restante.toString()}).`);
      return;
    }
    setErro(null);
    setFeedback(null);
    setEnviando(true);
    setTokenIdsEmitidos(null);
    try {
      const contrato = obterContrato("ContratoEnvasamento", chainId, signer);
      const tx = await contrato.emitirGarrafas(envasamento.id, quantidadeDesejada);
      const recibo = await tx.wait();
      const tokenIds: bigint[] = [];
      for (const log of recibo?.logs ?? []) {
        const evento = contrato.interface.parseLog(log);
        if (evento?.name === "GarrafaEmitida") {
          tokenIds.push(evento.args.tokenId as bigint);
        }
      }
      setTokenIdsEmitidos(tokenIds);
      aoAtualizar();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <li>
      <div className="item-lista__cabecalho">
        <span className="item-lista__titulo">Envasamento #{envasamento.id.toString()}</span>
        <span className={`badge ${concluido ? "badge--ok" : "badge--neutro"}`}>
          {concluido ? "Concluído" : "Em andamento"}
        </span>
      </div>
      <dl className="info-grade">
        <div className="info-campo">
          <dt className="info-campo__rotulo">Envasador</dt>
          <dd className="info-campo__valor mono">{encurtarEndereco(envasamento.envasador)}</dd>
        </div>
        <div className="info-campo">
          <dt className="info-campo__rotulo">Declarada / emitida / restante</dt>
          <dd className="info-campo__valor">
            {envasamento.quantidadeDeclarada.toString()} / {envasamento.quantidadeEmitida.toString()} / {restante.toString()}
          </dd>
        </div>
        <div className="info-campo">
          <dt className="info-campo__rotulo">Registrado em</dt>
          <dd className="info-campo__valor">{formatarTimestamp(envasamento.registradoEm)}</dd>
        </div>
        {concluido && (
          <div className="info-campo">
            <dt className="info-campo__rotulo">Concluído em</dt>
            <dd className="info-campo__valor">{formatarTimestamp(envasamento.concluidoEm)}</dd>
          </div>
        )}
        <div className="info-campo info-campo--largo">
          <dt className="info-campo__rotulo">Metadados</dt>
          <dd className="info-campo__valor mono">{envasamento.metadataURI}</dd>
        </div>
      </dl>

      {!concluido &&
        (temPapelEnvasador ? (
          souEnvasadorOriginal ? (
            <fieldset disabled={enviando}>
              <legend>Emitir garrafas</legend>
              <label>
                Quantidade (máx. {restante.toString()})
                <input value={quantidade} onChange={(e) => setQuantidade(e.target.value.trim())} />
              </label>
              <button type="button" onClick={() => void enviar()}>
                {enviando ? "Emitindo…" : "Emitir garrafas"}
              </button>
              {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
              {erro && <p className="erro">{erro}</p>}
            </fieldset>
          ) : (
            <p className="dica">
              Só o envasador original ({encurtarEndereco(envasamento.envasador)}) pode emitir garrafas deste
              envasamento.
            </p>
          )
        ) : (
          <p className="dica">Sua conta não tem ENVASADOR_ROLE; só pode consultar.</p>
        ))}

      {tokenIdsEmitidos && tokenIdsEmitidos.length > 0 && (
        <div>
          <p>Garrafas emitidas nesta transação:</p>
          <ul>
            {tokenIdsEmitidos.map((tokenId) => (
              <li key={tokenId.toString()}>
                <Link to={`/garrafas/${tokenId}`}>Garrafa #{tokenId.toString()}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function RegistrarEnvasamento({
  loteProducaoId,
  chainId,
  signer,
  aoRegistrar,
}: {
  loteProducaoId: string;
  chainId: number;
  signer: Signer;
  aoRegistrar: () => void;
}) {
  const [quantidadeDeclarada, setQuantidadeDeclarada] = useState("");
  const [descricao, setDescricao] = useState("");
  const [documentos, setDocumentos] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTx | null>(null);

  const quantidadeValida = /^\d+$/.test(quantidadeDeclarada.trim()) && quantidadeDeclarada.trim() !== "0";

  async function gerarViaIpfs() {
    if (!quantidadeValida) {
      setErroIpfs("Informe a quantidade declarada (número inteiro maior que zero) antes de gerar os metadados.");
      return;
    }
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosEnvasamento({
        loteProducaoId,
        quantidadeDeclarada: quantidadeDeclarada.trim(),
        descricao: descricao.trim() || undefined,
        documentos: documentosEmLinhas(documentos),
      });
      const referencia = await adicionarJSON(metadados);
      setMetadataURI(referencia);
    } catch (erroUpload) {
      setErroIpfs(erroUpload instanceof Error ? erroUpload.message : "Não foi possível enviar ao IPFS.");
    } finally {
      setEnviandoIpfs(false);
    }
  }

  const erroReferencia =
    motivoReferenciaInvalida(metadataURI) ?? (metadataURI.trim() === "" ? "Informe a referência ipfs://." : null);

  async function enviar() {
    if (!quantidadeValida) {
      setErro("Informe a quantidade declarada (número inteiro maior que zero).");
      return;
    }
    if (erroReferencia) {
      setErro(erroReferencia);
      return;
    }
    setErro(null);
    setFeedback(null);
    setEnviando(true);
    try {
      const contrato = obterContrato("ContratoEnvasamento", chainId, signer);
      const tx = await contrato.registrarEnvasamento(loteProducaoId, quantidadeDeclarada.trim(), metadataURI.trim());
      await tx.wait();
      setQuantidadeDeclarada("");
      setDescricao("");
      setDocumentos("");
      setMetadataURI("");
      setFeedback({ tipo: "ok", texto: "Envasamento registrado com sucesso." });
      aoRegistrar();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Registrar envasamento</legend>
      <label>
        Quantidade declarada
        <input
          value={quantidadeDeclarada}
          onChange={(e) => setQuantidadeDeclarada(e.target.value.trim())}
          placeholder="Ex.: 100"
        />
      </label>
      <label>
        Descrição (opcional — vai para os metadados enviados ao IPFS)
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </label>
      <label>
        Documentos (um por linha, opcional — vira um JSON enviado ao IPFS)
        <textarea rows={3} value={documentos} onChange={(e) => setDocumentos(e.target.value)} />
      </label>
      <button type="button" onClick={() => void gerarViaIpfs()} disabled={enviandoIpfs}>
        {enviandoIpfs ? "Enviando ao IPFS…" : "Gerar referência no IPFS"}
      </button>
      {erroIpfs && <p className="erro">{erroIpfs}</p>}
      <label>
        Metadados (ipfs://…, preenchido automaticamente pelo botão acima, ou cole uma referência já existente)
        <input value={metadataURI} onChange={(e) => setMetadataURI(e.target.value.trim())} />
      </label>
      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Registrando…" : "Registrar envasamento"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}
