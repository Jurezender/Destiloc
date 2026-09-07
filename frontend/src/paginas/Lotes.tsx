import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { encurtarEndereco, formatarTimestamp, RETULO_ESTADO_PRODUCAO, RETULO_TIPO_BEBIDA } from "../lib/formatadores";
import { EstadoProducao, TipoBebida } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosLoteProducao, type ConfiguracaoProducaoMetadados } from "../ipfs/metadados";

interface LinhaLote {
  id: bigint;
  tipoBebida: TipoBebida;
  produtor: string;
  estado: EstadoProducao;
  criadoEm: bigint;
  totalEtapas: bigint;
}

const OPCOES_TIPO_BEBIDA = [TipoBebida.Cachaca, TipoBebida.Whisky, TipoBebida.Vodca, TipoBebida.Gin];

const CONFIGURACAO_PADRAO: ConfiguracaoProducaoMetadados = {
  maturacaoAplicavel: false,
  retificacaoAplicavel: false,
  blendagemAplicavel: false,
  ajusteFinalAplicavel: false,
};

function NovoLoteProducao({ onCriado }: { onCriado: () => void }) {
  const { chainId, signer } = useCarteira();
  const [tipoBebida, setTipoBebida] = useState("");
  const [configuracao, setConfiguracao] = useState<ConfiguracaoProducaoMetadados>(CONFIGURACAO_PADRAO);
  const [descricao, setDescricao] = useState("");
  const [documentos, setDocumentos] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function alternarConfiguracao(campo: keyof ConfiguracaoProducaoMetadados) {
    setConfiguracao((atual) => ({ ...atual, [campo]: !atual[campo] }));
  }

  async function gerarViaIpfs() {
    if (tipoBebida === "") {
      setErroIpfs("Selecione o tipo de bebida antes de gerar os metadados.");
      return;
    }
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosLoteProducao({
        tipoBebida: Number(tipoBebida) as TipoBebida,
        configuracao,
        descricao: descricao.trim() || undefined,
        documentos: documentos
          .split("\n")
          .map((linha) => linha.trim())
          .filter(Boolean),
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
    if (tipoBebida === "") {
      setErro("Selecione o tipo de bebida.");
      return;
    }
    if (erroReferencia) {
      setErro(erroReferencia);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const tx = await producao.criarLoteProducao(Number(tipoBebida) as TipoBebida, configuracao, metadataURI.trim());
      await tx.wait();
      setTipoBebida("");
      setConfiguracao(CONFIGURACAO_PADRAO);
      setDescricao("");
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
      <legend>Novo lote de produção</legend>
      <label>
        Tipo de bebida
        <select value={tipoBebida} onChange={(e) => setTipoBebida(e.target.value)}>
          <option value="">Selecione…</option>
          {OPCOES_TIPO_BEBIDA.map((opcao) => (
            <option key={opcao} value={opcao}>
              {RETULO_TIPO_BEBIDA[opcao]}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Configuração de produção</legend>
        <label>
          <input
            type="checkbox"
            checked={configuracao.maturacaoAplicavel}
            onChange={() => alternarConfiguracao("maturacaoAplicavel")}
          />
          Maturação aplicável
        </label>
        <label>
          <input
            type="checkbox"
            checked={configuracao.retificacaoAplicavel}
            onChange={() => alternarConfiguracao("retificacaoAplicavel")}
          />
          Retificação aplicável
        </label>
        <label>
          <input
            type="checkbox"
            checked={configuracao.blendagemAplicavel}
            onChange={() => alternarConfiguracao("blendagemAplicavel")}
          />
          Blendagem aplicável
        </label>
        <label>
          <input
            type="checkbox"
            checked={configuracao.ajusteFinalAplicavel}
            onChange={() => alternarConfiguracao("ajusteFinalAplicavel")}
          />
          Ajuste final aplicável
        </label>
      </fieldset>

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
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const total = (await producao.totalLotesProducao()) as bigint;
      const ids = Array.from({ length: Number(total) }, (_, i) => BigInt(i + 1));
      const dados = await Promise.all(
        ids.map(async (id) => {
          const [dado, totalEtapas] = await Promise.all([
            producao.obterLoteProducao(id),
            producao.totalEtapas(id) as Promise<bigint>,
          ]);
          return {
            id,
            tipoBebida: Number(dado.tipoBebida) as TipoBebida,
            produtor: dado.produtor as string,
            estado: Number(dado.estado) as EstadoProducao,
            criadoEm: dado.criadoEm as bigint,
            totalEtapas,
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
      <h1>Lotes de produção</h1>
      {papeis.produtor && <NovoLoteProducao onCriado={carregar} />}
      {!papeis.produtor && (
        <p className="dica">Sua conta não tem PRODUTOR_ROLE (concedido no ContratoAcesso); só pode consultar.</p>
      )}

      <h2>Lotes cadastrados</h2>
      {carregando && <p>Carregando…</p>}
      {erro && <p className="erro">{erro}</p>}
      <ul className="lista-lotes">
        {linhas.map((linha) => (
          <li key={linha.id.toString()}>
            <Link to={`/lotes/${linha.id}`}>
              #{linha.id.toString()} — {RETULO_TIPO_BEBIDA[linha.tipoBebida]} — produtor{" "}
              {encurtarEndereco(linha.produtor)} — {RETULO_ESTADO_PRODUCAO[linha.estado]} — criado em{" "}
              {formatarTimestamp(linha.criadoEm)} — {linha.totalEtapas.toString()} etapa(s)
            </Link>
          </li>
        ))}
        {!carregando && linhas.length === 0 && <li>Nenhum lote cadastrado ainda.</li>}
      </ul>
    </section>
  );
}
