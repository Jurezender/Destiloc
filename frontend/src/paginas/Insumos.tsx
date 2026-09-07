import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { encurtarEndereco, formatarTimestamp, RETULO_TIPO_INSUMO } from "../lib/formatadores";
import { TipoInsumo } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosInsumo } from "../ipfs/metadados";

interface LinhaInsumo {
  id: bigint;
  tipo: TipoInsumo;
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

function documentosEmLinhas(texto: string): string[] {
  return texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);
}

function NovoLoteInsumo({ onCriado }: { onCriado: () => void }) {
  const { chainId, signer } = useCarteira();
  const [tipo, setTipo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [origem, setOrigem] = useState("");
  const [documentos, setDocumentos] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerarViaIpfs() {
    if (tipo === "") {
      setErroIpfs("Selecione o tipo de insumo antes de gerar os metadados.");
      return;
    }
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosInsumo({
        tipoInsumo: Number(tipo) as TipoInsumo,
        descricao: descricao.trim() || undefined,
        origem: origem.trim() || undefined,
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
    if (!chainId || !signer) return;
    if (tipo === "") {
      setErro("Selecione o tipo de insumo.");
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
      const tx = await insumos.registrarLoteInsumo(Number(tipo) as TipoInsumo, metadataURI.trim());
      await tx.wait();
      setTipo("");
      setDescricao("");
      setOrigem("");
      setDocumentos("");
      setMetadataURI("");
      onCriado();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Novo lote de insumo</legend>
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
        Descrição (opcional — vai para os metadados enviados ao IPFS)
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </label>
      <label>
        Origem (opcional — vai para os metadados enviados ao IPFS)
        <input value={origem} onChange={(e) => setOrigem(e.target.value)} />
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
        {enviando ? "Registrando…" : "Registrar lote"}
      </button>
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

export function Insumos() {
  const { chainId, signer } = useCarteira();
  const papeis = usePapeis();
  const [linhas, setLinhas] = useState<LinhaInsumo[]>([]);
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
      const dados = await Promise.all(
        ids.map(async (id) => {
          const [dado, valido] = await Promise.all([
            insumos.obterLoteInsumo(id),
            insumos.loteInsumoValido(id) as Promise<boolean>,
          ]);
          return {
            id,
            tipo: Number(dado.tipo) as TipoInsumo,
            fornecedor: dado.fornecedor as string,
            registradoEm: dado.registradoEm as bigint,
            valido,
          } satisfies LinhaInsumo;
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
      <h1>Lotes de insumo</h1>
      {papeis.fornecedor && <NovoLoteInsumo onCriado={carregar} />}
      {!papeis.fornecedor && (
        <p className="dica">Sua conta não tem FORNECEDOR_ROLE (concedido no ContratoAcesso); só pode consultar.</p>
      )}

      <h2>Insumos cadastrados</h2>
      {carregando && <p>Carregando…</p>}
      {erro && <p className="erro">{erro}</p>}
      <ul className="lista-lotes">
        {linhas.map((linha) => (
          <li key={linha.id.toString()}>
            <Link to={`/insumos/${linha.id}`}>
              #{linha.id.toString()} — {RETULO_TIPO_INSUMO[linha.tipo]} — fornecedor{" "}
              {encurtarEndereco(linha.fornecedor)} — {linha.valido ? "válido" : "invalidado"} — registrado em{" "}
              {formatarTimestamp(linha.registradoEm)}
            </Link>
          </li>
        ))}
        {!carregando && linhas.length === 0 && <li>Nenhum insumo cadastrado ainda.</li>}
      </ul>
    </section>
  );
}
