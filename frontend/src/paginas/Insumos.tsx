import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexto/AuthContexto";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx, mapearErroContrato } from "../lib/erros";
import { encurtarEndereco, formatarTimestamp, RETULO_TIPO_INSUMO, UNIDADE_INSUMO } from "../lib/formatadores";
import { PAPEL_PRODUTOR } from "../lib/papeis";
import { TipoInsumo } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosInsumo } from "../ipfs/metadados";
import { AnexosIpfs } from "../componentes/AnexosIpfs";
import { API_URL, fetchApi } from "../lib/api";

interface LinhaInsumo {
  id: bigint;
  tipo: TipoInsumo;
  quantidade: bigint;
  produtorDestinatario: string;
  fornecedor: string;
  registradoEm: bigint;
  valido: boolean;
}

const OPCOES_TIPO_INSUMO = [
  TipoInsumo.MateriaPrimaAgricola,
  TipoInsumo.BaseAlcoolica,
  TipoInsumo.Agua,
  TipoInsumo.Levedura,
  TipoInsumo.Zimbro,
  TipoInsumo.Botanico,
  TipoInsumo.Outro,
];

interface ProducaoDestinatario {
  address: string;
  nome: string;
}

function NovoLoteInsumo({ onCriado }: { onCriado: () => void }) {
  const { token } = useAuth();
  const { chainId, signer } = useCarteira();

  const [produtores, setProdutores] = useState<ProducaoDestinatario[]>([]);
  const [carregandoProdutores, setCarregandoProdutores] = useState(true);

  const [tipo, setTipo] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [produtorDestinatario, setProdutorDestinatario] = useState("");
  const [descricao, setDescricao] = useState("");
  const [origem, setOrigem] = useState("");
  const [documentosCids, setDocumentosCids] = useState<string[]>([]);
  const [arquivosSubindo, setArquivosSubindo] = useState(false);
  const [chaveAnexos, setChaveAnexos] = useState(0);
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTx | null>(null);

  useEffect(() => {
    if (!token || !chainId || !signer) return;
    setCarregandoProdutores(true);
    void (async () => {
      try {
        const acesso = obterContrato("ContratoAcesso", chainId, signer);
        const [resDB, totalBc] = await Promise.all([
          fetchApi(`${API_URL}/participantes`, { headers: { Authorization: `Bearer ${token}` } }),
          acesso.getRoleMemberCount(PAPEL_PRODUTOR) as Promise<bigint>,
        ]);
        const { participantes } = (await resDB.json()) as {
          participantes: { address: string; nome_responsavel: string; nome_empresa: string }[];
        };
        const mapaDB = new Map(participantes.map((p) => [p.address.toLowerCase(), p]));
        const enderecosBc = await Promise.all(
          Array.from({ length: Number(totalBc) }, (_, i) =>
            acesso.getRoleMember(PAPEL_PRODUTOR, i) as Promise<string>
          )
        );
        const lista = enderecosBc.map((address) => {
          const db = mapaDB.get(address.toLowerCase());
          const nome = db
            ? [db.nome_responsavel, db.nome_empresa].filter(Boolean).join(" — ")
            : encurtarEndereco(address);
          return { address, nome };
        });
        setProdutores(lista);
      } catch {
        setProdutores([]);
      } finally {
        setCarregandoProdutores(false);
      }
    })();
  }, [token, chainId, signer]);

  const atualizarAnexos = useCallback((cids: string[], subindo: boolean) => {
    setDocumentosCids(cids);
    setArquivosSubindo(subindo);
  }, []);

  const tipoSelecionado = tipo !== "" ? (Number(tipo) as TipoInsumo) : null;
  const unidade = tipoSelecionado !== null ? UNIDADE_INSUMO[tipoSelecionado] : "";
  const quantidadeValida = /^\d+(\.\d+)?$/.test(quantidade.trim()) && Number(quantidade.trim()) > 0;

  async function gerarViaIpfs() {
    if (tipo === "") { setErroIpfs("Selecione o tipo de insumo antes de gerar os metadados."); return; }
    if (!quantidadeValida) { setErroIpfs("Informe a quantidade antes de gerar os metadados."); return; }
    if (!produtorDestinatario) { setErroIpfs("Selecione o produtor destinatário."); return; }
    if (arquivosSubindo) { setErroIpfs("Aguarde o envio dos arquivos antes de gerar a referência."); return; }
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosInsumo({
        tipoInsumo: Number(tipo) as TipoInsumo,
        quantidade: quantidade.trim(),
        descricao: descricao.trim() || undefined,
        origem: origem.trim() || undefined,
        documentos: documentosCids.length > 0 ? documentosCids : undefined,
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
    if (!chainId || !signer) return;
    if (tipo === "") { setErro("Selecione o tipo de insumo."); return; }
    if (!quantidadeValida) { setErro("Informe uma quantidade válida (número maior que zero)."); return; }
    if (!produtorDestinatario) { setErro("Selecione o produtor destinatário."); return; }
    if (erroReferencia) { setErro(erroReferencia); return; }
    setErro(null);
    setFeedback(null);
    setEnviando(true);
    try {
      const insumos = obterContrato("ContratoInsumos", chainId, signer);
      const qtdInteira = BigInt(Math.round(Number(quantidade.trim())));
      const tx = await insumos.registrarLoteInsumo(
        Number(tipo) as TipoInsumo,
        qtdInteira,
        produtorDestinatario,
        metadataURI.trim()
      );
      await tx.wait();
      setTipo("");
      setQuantidade("");
      setProdutorDestinatario("");
      setDescricao("");
      setOrigem("");
      setDocumentosCids([]);
      setArquivosSubindo(false);
      setChaveAnexos((k) => k + 1);
      setMetadataURI("");
      setFeedback({ tipo: "ok", texto: "Lote de insumo registrado com sucesso." });
      onCriado();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
      <label>
        Tipo de insumo
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Selecione…</option>
          {OPCOES_TIPO_INSUMO.map((opcao) => (
            <option key={opcao} value={opcao}>
              {RETULO_TIPO_INSUMO[opcao]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quantidade{unidade ? ` (${unidade})` : ""}
        <input
          type="number"
          min="1"
          step="1"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          placeholder="Ex.: 500"
        />
      </label>
      <label>
        Produtor destinatário
        <select
          value={produtorDestinatario}
          onChange={(e) => setProdutorDestinatario(e.target.value)}
          disabled={carregandoProdutores}
        >
          <option value="">
            {carregandoProdutores ? "Carregando produtores…" : produtores.length === 0 ? "Nenhum produtor cadastrado" : "Selecione…"}
          </option>
          {produtores.map((p) => (
            <option key={p.address} value={p.address}>
              {p.nome}
            </option>
          ))}
        </select>
        {produtorDestinatario && (
          <span className="mono" style={{ fontSize: "0.75rem", color: "var(--cor-texto-secundario)", marginTop: "0.25rem", display: "block" }}>
            {produtorDestinatario}
          </span>
        )}
      </label>
      <label>
        Descrição (opcional)
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </label>
      <label>
        Origem (opcional)
        <input value={origem} onChange={(e) => setOrigem(e.target.value)} />
      </label>
      <AnexosIpfs
        key={chaveAnexos}
        onChange={atualizarAnexos}
        desabilitado={enviandoIpfs || enviando}
      />
      <button type="button" onClick={() => void gerarViaIpfs()} disabled={enviandoIpfs || arquivosSubindo}>
        {enviandoIpfs ? "Enviando ao IPFS…" : "Gerar referência no IPFS"}
      </button>
      {erroIpfs && <p className="erro">{erroIpfs}</p>}
      <label>
        Metadados (ipfs://…, preenchido automaticamente pelo botão acima, ou cole uma referência já existente)
        <input value={metadataURI} onChange={(e) => setMetadataURI(e.target.value.trim())} />
      </label>
      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Registrando…" : "Registrar lote"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

async function carregarLote(
  insumos: ReturnType<typeof obterContrato>,
  id: bigint
): Promise<LinhaInsumo> {
  const [dado, valido] = await Promise.all([
    insumos.obterLoteInsumo(id),
    insumos.loteInsumoValido(id) as Promise<boolean>,
  ]);
  return {
    id,
    tipo: Number(dado.tipo) as TipoInsumo,
    quantidade: dado.quantidade as bigint,
    produtorDestinatario: dado.produtorDestinatario as string,
    fornecedor: dado.fornecedor as string,
    registradoEm: dado.registradoEm as bigint,
    valido,
  };
}

// Página de lotes de insumo: fornecedor registra novos lotes; produtor vê os lotes destinados a ele.
export function Insumos() {
  const { conta, chainId, signer } = useCarteira();
  const papeis = usePapeis();
  const [linhasTodas, setLinhasTodas] = useState<LinhaInsumo[]>([]);
  const [linhasProdutor, setLinhasProdutor] = useState<LinhaInsumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer) return;
    setCarregando(true);
    setErro(null);
    try {
      const insumos = obterContrato("ContratoInsumos", chainId, signer);

      const total = (await insumos.totalLotesInsumo()) as bigint;
      const ids = Array.from({ length: Number(total) }, (_, i) => BigInt(i + 1));
      const todas = await Promise.all(ids.map((id) => carregarLote(insumos, id)));
      setLinhasTodas(todas.reverse());

      if (papeis.produtor && conta) {
        const totalProdutor = (await insumos.totalInsumosDoProdutor(conta)) as bigint;
        const idsProdutor = await Promise.all(
          Array.from({ length: Number(totalProdutor) }, (_, i) =>
            insumos.insumoDoProdutor(conta, i) as Promise<bigint>
          )
        );
        const doProdutor = await Promise.all(idsProdutor.map((id) => carregarLote(insumos, id)));
        setLinhasProdutor(doProdutor.reverse());
      }
    } catch (erroLeitura) {
      setErro(mapearErroContrato(erroLeitura));
    } finally {
      setCarregando(false);
    }
  }, [chainId, signer, papeis.produtor, conta]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <section>
      <h1>Lotes de insumo</h1>
      {papeis.fornecedor && (
        <>
          <h2>Novo lote de insumo</h2>
          <NovoLoteInsumo onCriado={carregar} />
        </>
      )}
      {!papeis.fornecedor && (
        <p className="dica">Sua conta não tem o papel de Fornecedor, mas você ainda pode consultar os insumos cadastrados.</p>
      )}

      {papeis.produtor && (
        <>
          <h2>Insumos destinados a mim</h2>
          {carregando && (
            <div className="carregando">
              <span className="carregando__indicador" aria-hidden="true" />
              <span>Carregando…</span>
            </div>
          )}
          {!carregando && linhasProdutor.length === 0 && (
            <p className="dica">Nenhum insumo foi direcionado para sua conta ainda.</p>
          )}
          <ul className="lista-lotes">
            {linhasProdutor.map((linha) => (
              <InsumoItem key={linha.id.toString()} linha={linha} destacar />
            ))}
          </ul>
        </>
      )}

      <h2>Todos os lotes cadastrados</h2>
      {carregando && (
        <div className="carregando">
          <span className="carregando__indicador" aria-hidden="true" />
          <span>Carregando insumos…</span>
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
      <ul className="lista-lotes">
        {linhasTodas.map((linha) => (
          <InsumoItem
            key={linha.id.toString()}
            linha={linha}
            destacar={conta?.toLowerCase() === linha.produtorDestinatario.toLowerCase()}
          />
        ))}
        {!carregando && linhasTodas.length === 0 && (
          <li className="lista-vazia">Nenhum insumo cadastrado ainda.</li>
        )}
      </ul>
    </section>
  );
}

function InsumoItem({ linha, destacar }: { linha: LinhaInsumo; destacar?: boolean }) {
  return (
    <li key={linha.id.toString()}>
      <div className="item-lista__cabecalho">
        <Link className="item-lista__titulo" to={`/insumos/${linha.id}`}>
          #{linha.id.toString()} - {RETULO_TIPO_INSUMO[linha.tipo]}
        </Link>
        <span className={`badge ${linha.valido ? "badge--ok" : "badge--erro"}`}>
          {linha.valido ? "Válido" : "Invalidado"}
        </span>
        {destacar && <span className="badge badge--neutro">Para você</span>}
      </div>
      <p className="item-lista__meta">
        {linha.quantidade.toString()} {UNIDADE_INSUMO[linha.tipo]}
        {" · "}Fornecedor: <span className="mono">{encurtarEndereco(linha.fornecedor)}</span>
        {" · "}Produtor: <span className="mono">{encurtarEndereco(linha.produtorDestinatario)}</span>
        {" · "}Registrado em {formatarTimestamp(linha.registradoEm)}
      </p>
    </li>
  );
}
