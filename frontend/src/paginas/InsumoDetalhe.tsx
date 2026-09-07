import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { formatarTimestamp, RETULO_RESULTADO_AVALIACAO, RETULO_TIPO_INSUMO } from "../lib/formatadores";
import { ResultadoAvaliacao, TipoInsumo } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import {
  montarMetadadosAvaliacao,
  montarMetadadosCorrecaoDocumental,
  montarMetadadosInvalidacao,
} from "../ipfs/metadados";

type Signer = NonNullable<ReturnType<typeof useCarteira>["signer"]>;

interface LoteInsumoInfo {
  id: bigint;
  fornecedor: string;
  tipo: TipoInsumo;
  registradoEm: bigint;
  metadataURI: string;
}

interface InvalidacaoInfo {
  invalidado: boolean;
  registradoEm: bigint;
  metadataURI: string;
}

interface CorrecaoInfo {
  indice: number;
  registradoEm: bigint;
  metadataURI: string;
}

interface AvaliacaoInfo {
  indice: number;
  resultado: ResultadoAvaliacao;
  registradoEm: bigint;
  metadataURI: string;
}

const OPCOES_RESULTADO_AVALIACAO = [ResultadoAvaliacao.Aprovado, ResultadoAvaliacao.Rejeitado];

function documentosEmLinhas(texto: string): string[] {
  return texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);
}

export function InsumoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { conta, chainId, signer } = useCarteira();
  const papeis = usePapeis();

  const [lote, setLote] = useState<LoteInsumoInfo | null>(null);
  const [invalidacao, setInvalidacao] = useState<InvalidacaoInfo | null>(null);
  const [correcoes, setCorrecoes] = useState<CorrecaoInfo[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoInfo[]>([]);
  const [resultadoAtual, setResultadoAtual] = useState<ResultadoAvaliacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer || !id) return;
    setCarregando(true);
    setErro(null);
    try {
      const insumos = obterContrato("ContratoInsumos", chainId, signer);
      const existe = (await insumos.loteInsumoExiste(id)) as boolean;
      if (!existe) {
        setErro("Este lote de insumo não existe.");
        setLote(null);
        return;
      }

      const [dadoLote, dadoInvalidacao] = await Promise.all([
        insumos.obterLoteInsumo(id),
        insumos.obterInvalidacao(id),
      ]);

      const totalCorrecoesRegistradas = Number(await insumos.totalCorrecoes(id));
      const dadosCorrecoes = await Promise.all(
        Array.from({ length: totalCorrecoesRegistradas }, async (_, indice) => {
          const registro = await insumos.correcaoPorIndice(id, indice);
          return {
            indice,
            registradoEm: registro.registradoEm as bigint,
            metadataURI: registro.metadataURI as string,
          } satisfies CorrecaoInfo;
        })
      );

      let avaliacoesProprias: AvaliacaoInfo[] = [];
      let resultadoProprio: ResultadoAvaliacao | null = null;
      if (papeis.produtor && conta) {
        const totalAvaliacoesProprias = Number(await insumos.totalAvaliacoes(id, conta));
        avaliacoesProprias = await Promise.all(
          Array.from({ length: totalAvaliacoesProprias }, async (_, indice) => {
            const registro = await insumos.avaliacaoPorIndice(id, conta, indice);
            return {
              indice,
              resultado: Number(registro.resultado) as ResultadoAvaliacao,
              registradoEm: registro.registradoEm as bigint,
              metadataURI: registro.metadataURI as string,
            } satisfies AvaliacaoInfo;
          })
        );
        resultadoProprio = Number(await insumos.resultadoAtual(id, conta)) as ResultadoAvaliacao;
      }

      setLote({
        id: BigInt(id),
        fornecedor: dadoLote.fornecedor as string,
        tipo: Number(dadoLote.tipo) as TipoInsumo,
        registradoEm: dadoLote.registradoEm as bigint,
        metadataURI: dadoLote.metadataURI as string,
      });
      setInvalidacao({
        invalidado: dadoInvalidacao.invalidado as boolean,
        registradoEm: dadoInvalidacao.registradoEm as bigint,
        metadataURI: dadoInvalidacao.metadataURI as string,
      });
      setCorrecoes(dadosCorrecoes);
      setAvaliacoes(avaliacoesProprias);
      setResultadoAtual(resultadoProprio);
    } catch (erroLeitura) {
      setErro(mapearErroContrato(erroLeitura));
    } finally {
      setCarregando(false);
    }
  }, [chainId, signer, id, papeis.produtor, conta]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) return <p>Carregando…</p>;
  if (erro && !lote) return <p className="erro">{erro}</p>;
  if (!lote || !invalidacao) return null;

  const souFornecedorOriginal = conta?.toLowerCase() === lote.fornecedor.toLowerCase();
  const podeCorrigirOuInvalidar = papeis.fornecedor && souFornecedorOriginal;

  return (
    <section>
      <p>
        <Link to="/insumos">← Lotes de insumo</Link>
      </p>
      <h1>
        Insumo #{lote.id.toString()} — {RETULO_TIPO_INSUMO[lote.tipo]}
      </h1>
      <p>
        Fornecedor: {lote.fornecedor}
        <br />
        Registrado em: {formatarTimestamp(lote.registradoEm)}
        <br />
        Metadados: {lote.metadataURI}
        <br />
        Situação: {invalidacao.invalidado ? "invalidado" : "válido"}
      </p>
      {erro && <p className="erro">{erro}</p>}

      <h2>Invalidação</h2>
      {invalidacao.invalidado ? (
        <p className="dica">
          Este lote foi invalidado em {formatarTimestamp(invalidacao.registradoEm)} e está definitivamente
          encerrado — não aceita novas avaliações nem correções documentais.
          <br />
          Metadados da invalidação: {invalidacao.metadataURI}
        </p>
      ) : podeCorrigirOuInvalidar ? (
        <InvalidarLote loteId={lote.id} chainId={chainId!} signer={signer!} aoInvalidar={carregar} />
      ) : (
        <p className="dica">Só o fornecedor original, com FORNECEDOR_ROLE, pode invalidar este lote.</p>
      )}

      <h2>Correções documentais</h2>
      <ul>
        {correcoes.map((correcao) => (
          <li key={correcao.indice}>
            {formatarTimestamp(correcao.registradoEm)} — {correcao.metadataURI}
          </li>
        ))}
        {correcoes.length === 0 && <li>Nenhuma correção registrada ainda.</li>}
      </ul>
      {invalidacao.invalidado ? (
        <p className="dica">Lote invalidado — não aceita novas correções documentais.</p>
      ) : podeCorrigirOuInvalidar ? (
        <RegistrarCorrecao loteId={lote.id} chainId={chainId!} signer={signer!} aoRegistrar={carregar} />
      ) : (
        <p className="dica">Só o fornecedor original, com FORNECEDOR_ROLE, pode registrar correções documentais.</p>
      )}

      <h2>Avaliação</h2>
      {!papeis.produtor ? (
        <p className="dica">
          Sua conta não tem PRODUTOR_ROLE (concedido no ContratoAcesso) — não pode avaliar insumos.
        </p>
      ) : (
        <>
          <p>
            Avaliação atual da sua conta:{" "}
            {resultadoAtual !== null ? RETULO_RESULTADO_AVALIACAO[resultadoAtual] : "carregando…"}
          </p>
          <h3>Histórico das suas avaliações</h3>
          <ul>
            {avaliacoes.map((avaliacao) => (
              <li key={avaliacao.indice}>
                {formatarTimestamp(avaliacao.registradoEm)} — {RETULO_RESULTADO_AVALIACAO[avaliacao.resultado]} —{" "}
                {avaliacao.metadataURI}
              </li>
            ))}
            {avaliacoes.length === 0 && <li>Você ainda não avaliou este insumo.</li>}
          </ul>
          {invalidacao.invalidado ? (
            <p className="dica">Lote invalidado — não aceita novas avaliações.</p>
          ) : (
            <AvaliarInsumo loteId={lote.id} chainId={chainId!} signer={signer!} aoAvaliar={carregar} />
          )}
        </>
      )}
    </section>
  );
}

function InvalidarLote({
  loteId,
  chainId,
  signer,
  aoInvalidar,
}: {
  loteId: bigint;
  chainId: number;
  signer: Signer;
  aoInvalidar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [documentos, setDocumentos] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerarViaIpfs() {
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosInvalidacao({
        insumoId: loteId.toString(),
        motivo: motivo.trim() || undefined,
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
    if (!confirmado) {
      setErro("Confirme que está ciente de que a invalidação é definitiva.");
      return;
    }
    if (erroReferencia) {
      setErro(erroReferencia);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const insumos = obterContrato("ContratoInsumos", chainId, signer);
      const tx = await insumos.invalidarLoteInsumo(loteId, metadataURI.trim());
      await tx.wait();
      aoInvalidar();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Invalidar lote</legend>
      <p className="dica">Esta ação é definitiva: o lote não poderá ser reativado, avaliado ou corrigido depois.</p>
      <label>
        Motivo (opcional — vai para os metadados enviados ao IPFS)
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
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
      <label>
        <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
        Confirmo que esta invalidação é definitiva e não pode ser desfeita.
      </label>
      <button type="button" onClick={() => void enviar()} disabled={!confirmado}>
        {enviando ? "Invalidando…" : "Invalidar lote"}
      </button>
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

function RegistrarCorrecao({
  loteId,
  chainId,
  signer,
  aoRegistrar,
}: {
  loteId: bigint;
  chainId: number;
  signer: Signer;
  aoRegistrar: () => void;
}) {
  const [documentos, setDocumentos] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerarViaIpfs() {
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosCorrecaoDocumental({
        insumoId: loteId.toString(),
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
    if (erroReferencia) {
      setErro(erroReferencia);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const insumos = obterContrato("ContratoInsumos", chainId, signer);
      const tx = await insumos.registrarCorrecaoDocumental(loteId, metadataURI.trim());
      await tx.wait();
      setDocumentos("");
      setMetadataURI("");
      aoRegistrar();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Registrar correção documental</legend>
      <label>
        Documentos da correção (um por linha, opcional — vira um JSON enviado ao IPFS)
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
        {enviando ? "Registrando…" : "Registrar correção"}
      </button>
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

function AvaliarInsumo({
  loteId,
  chainId,
  signer,
  aoAvaliar,
}: {
  loteId: bigint;
  chainId: number;
  signer: Signer;
  aoAvaliar: () => void;
}) {
  const [resultado, setResultado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [documentos, setDocumentos] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerarViaIpfs() {
    if (resultado === "") {
      setErroIpfs("Selecione o resultado antes de gerar os metadados.");
      return;
    }
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosAvaliacao({
        insumoId: loteId.toString(),
        resultado: Number(resultado) as ResultadoAvaliacao,
        documentos: documentosEmLinhas(documentos),
        observacoes: observacoes.trim() || undefined,
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
    if (resultado === "") {
      setErro("Selecione o resultado da avaliação.");
      return;
    }
    if (erroReferencia) {
      setErro(erroReferencia);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const insumos = obterContrato("ContratoInsumos", chainId, signer);
      const tx = await insumos.avaliarInsumo(loteId, Number(resultado) as ResultadoAvaliacao, metadataURI.trim());
      await tx.wait();
      setResultado("");
      setObservacoes("");
      setDocumentos("");
      setMetadataURI("");
      aoAvaliar();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Avaliar insumo</legend>
      <label>
        Resultado
        <select value={resultado} onChange={(e) => setResultado(e.target.value)}>
          <option value="">Selecione…</option>
          {OPCOES_RESULTADO_AVALIACAO.map((opcao) => (
            <option key={opcao} value={opcao}>
              {RETULO_RESULTADO_AVALIACAO[opcao]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Observações (opcional — vai para os metadados enviados ao IPFS)
        <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
      </label>
      <label>
        Documentos/evidências (um por linha, opcional — vira um JSON enviado ao IPFS)
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
        {enviando ? "Avaliando…" : "Registrar avaliação"}
      </button>
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}
