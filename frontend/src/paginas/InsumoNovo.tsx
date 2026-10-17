import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexto/AuthContexto";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx } from "../lib/erros";
import { encurtarEndereco, ROTULO_TIPO_INSUMO, UNIDADE_INSUMO } from "../lib/formatadores";
import { PAPEL_PRODUTOR } from "../lib/papeis";
import { TipoInsumo } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosInsumo } from "../ipfs/metadados";
import { AnexosIpfs } from "../componentes/AnexosIpfs";
import { API_URL, fetchApi } from "../lib/api";

interface ProducaoDestinatario {
  address: string;
  nome: string;
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
              {ROTULO_TIPO_INSUMO[opcao]}
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
        Metadados
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

export function InsumoNovo() {
  const navigate = useNavigate();
  return (
    <>
      <h2>Novo lote de insumo</h2>
      <NovoLoteInsumo onCriado={() => navigate("/insumos")} />
    </>
  );
}
