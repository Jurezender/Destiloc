import { useCallback, useState } from "react";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx } from "../lib/erros";
import {
  encurtarEndereco,
  formatarTimestamp,
  ROTULO_ETAPA_PRODUCAO,
  ROTULO_TIPO_INSUMO,
  UNIDADE_INSUMO,
} from "../lib/formatadores";
import { EstadoProducao, EtapaProducao, TipoBebida } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import {
  validarRegistroEtapa,
  type ConfiguracaoProducao,
} from "../lib/validacaoSequencia";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosEtapaProducao } from "../ipfs/metadados";
import { AnexosIpfs } from "../componentes/AnexosIpfs";
import { LinkMetadados } from "../componentes/LinkMetadados";
import { useLoteContexto, type EtapaRegistrada, type InsumoVinculado, type Signer } from "./LoteLayout";
import { useNomesParticipantes } from "../lib/useNomesParticipantes";

function segundosDoDatetimeLocal(valor: string): number {
  return Math.floor(new Date(valor).getTime() / 1000);
}

export function LoteEtapas() {
  const {
    lote,
    configuracao,
    etapas,
    etapasPendentes,
    etapasRegistradas,
    insumosVinculados,
    podeOperar,
    chainId,
    signer,
    carregar,
  } = useLoteContexto();

  return (
    <>
      <h2>Etapas registradas</h2>
      {lote.estado !== EstadoProducao.Concluido && !podeOperar && (
        <p className="dica">Só o produtor responsável, com papel de Produtor, pode registrar etapas.</p>
      )}
      <TabelaEtapas etapas={etapas} />
      {lote.estado !== EstadoProducao.Concluido && podeOperar && (
        etapasPendentes.length > 0 ? (
          <RegistrarEtapa
            loteId={lote.id}
            tipoBebida={lote.tipoBebida}
            configuracao={configuracao}
            etapasPendentes={etapasPendentes}
            etapasRegistradas={etapasRegistradas}
            insumosVinculados={insumosVinculados}
            chainId={chainId}
            signer={signer}
            aoRegistrar={carregar}
          />
        ) : (
          <p className="dica">Nenhuma etapa aplicável está pendente de registro.</p>
        )
      )}
    </>
  );
}

function TabelaEtapas({ etapas }: { etapas: EtapaRegistrada[] }) {
  const nomes = useNomesParticipantes();
  return (
    <div className="tabela-wrapper">
      <table>
        <thead>
          <tr>
            <th>Etapa</th>
            <th>Executado por</th>
            <th>Início informado</th>
            <th>Fim informado</th>
            <th>Registrado em</th>
            <th>Metadados</th>
            <th>Insumos usados</th>
          </tr>
        </thead>
        <tbody>
          {etapas.map((evento) => (
            <tr key={evento.indice}>
              <td>{ROTULO_ETAPA_PRODUCAO[evento.etapa]}</td>
              <td>{nomes.get(evento.executadoPor.toLowerCase()) ?? encurtarEndereco(evento.executadoPor)}</td>
              <td>{formatarTimestamp(evento.inicioInformado)}</td>
              <td>{formatarTimestamp(evento.fimInformado)}</td>
              <td>{formatarTimestamp(evento.registradoEm)}</td>
              <td><LinkMetadados uri={evento.metadataURI} /></td>
              <td>
                {evento.insumosUtilizados.length === 0
                  ? "-"
                  : evento.insumosUtilizados.map((insumoId) => `#${insumoId.toString()}`).join(", ")}
              </td>
            </tr>
          ))}
          {etapas.length === 0 && (
            <tr>
              <td colSpan={7} className="celula-vazia">Nenhuma etapa registrada ainda.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RegistrarEtapa({
  loteId,
  tipoBebida,
  configuracao,
  etapasPendentes,
  etapasRegistradas,
  insumosVinculados,
  chainId,
  signer,
  aoRegistrar,
}: {
  loteId: bigint;
  tipoBebida: TipoBebida;
  configuracao: ConfiguracaoProducao;
  etapasPendentes: EtapaProducao[];
  etapasRegistradas: EtapaProducao[];
  insumosVinculados: InsumoVinculado[];
  chainId: number;
  signer: Signer;
  aoRegistrar: () => void;
}) {
  const [etapaSelecionada, setEtapaSelecionada] = useState("");
  const [insumosSelecionados, setInsumosSelecionados] = useState<Set<string>>(new Set());
  const [quantidadesConsumidas, setQuantidadesConsumidas] = useState<Map<string, string>>(new Map());
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [documentosCids, setDocumentosCids] = useState<string[]>([]);
  const [arquivosSubindo, setArquivosSubindo] = useState(false);
  const [chaveAnexos, setChaveAnexos] = useState(0);
  const [metadataURI, setMetadataURI] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTx | null>(null);

  const atualizarAnexos = useCallback((cids: string[], subindo: boolean) => {
    setDocumentosCids(cids);
    setArquivosSubindo(subindo);
  }, []);

  function alternarInsumo(id: string) {
    setInsumosSelecionados((atual) => {
      const copia = new Set(atual);
      if (copia.has(id)) {
        copia.delete(id);
        setQuantidadesConsumidas((q) => { const m = new Map(q); m.delete(id); return m; });
      } else {
        copia.add(id);
        setQuantidadesConsumidas((q) => new Map(q).set(id, ""));
      }
      return copia;
    });
  }

  function atualizarQuantidade(id: string, valor: string) {
    setQuantidadesConsumidas((q) => new Map(q).set(id, valor));
  }

  const insumosArray = Array.from(insumosSelecionados);
  const todasQuantidadesValidas = insumosArray.every((id) => {
    const v = quantidadesConsumidas.get(id) ?? "";
    return /^\d+$/.test(v.trim()) && BigInt(v.trim()) > 0n;
  });

  const erroValidacao =
    etapaSelecionada === ""
      ? "Selecione a etapa."
      : validarRegistroEtapa({
          tipoBebida,
          configuracao,
          etapa: Number(etapaSelecionada) as EtapaProducao,
          etapasRegistradas,
        });

  async function gerarViaIpfs() {
    if (etapaSelecionada === "") {
      setErroIpfs("Selecione a etapa antes de gerar os metadados.");
      return;
    }
    if (!inicio || !fim) {
      setErroIpfs("Informe o início e o fim informados antes de gerar os metadados.");
      return;
    }
    if (insumosArray.length > 0 && !todasQuantidadesValidas) {
      setErroIpfs("Informe a quantidade consumida de cada insumo selecionado antes de gerar os metadados.");
      return;
    }
    if (arquivosSubindo) {
      setErroIpfs("Aguarde o envio dos arquivos antes de gerar a referência.");
      return;
    }
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const insumosConsumidos = insumosArray.map((id) => {
        const insumo = insumosVinculados.find((i) => i.id.toString() === id)!;
        return { id, quantidade: (quantidadesConsumidas.get(id) ?? "0").trim(), unidade: UNIDADE_INSUMO[insumo.tipo] };
      });
      const metadados = montarMetadadosEtapaProducao({
        loteProducaoId: loteId.toString(),
        etapa: Number(etapaSelecionada) as EtapaProducao,
        insumosConsumidos,
        inicioInformado: String(segundosDoDatetimeLocal(inicio)),
        fimInformado: String(segundosDoDatetimeLocal(fim)),
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
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }
    if (!inicio || !fim) {
      setErro("Informe o início e o fim informados.");
      return;
    }
    const inicioSegundos = segundosDoDatetimeLocal(inicio);
    const fimSegundos = segundosDoDatetimeLocal(fim);
    if (inicioSegundos > fimSegundos) {
      setErro("O início informado não pode ser posterior ao fim informado.");
      return;
    }
    if (insumosArray.length > 0 && !todasQuantidadesValidas) {
      setErro("Informe a quantidade consumida (número inteiro maior que zero) de cada insumo selecionado.");
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
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const qtds = insumosArray.map((id) => BigInt((quantidadesConsumidas.get(id) ?? "0").trim()));
      const tx = await producao.registrarEtapa(
        loteId,
        Number(etapaSelecionada) as EtapaProducao,
        insumosArray,
        qtds,
        inicioSegundos,
        fimSegundos,
        metadataURI.trim()
      );
      await tx.wait();
      setEtapaSelecionada("");
      setInsumosSelecionados(new Set());
      setQuantidadesConsumidas(new Map());
      setInicio("");
      setFim("");
      setDocumentosCids([]);
      setArquivosSubindo(false);
      setChaveAnexos((k) => k + 1);
      setMetadataURI("");
      setFeedback({ tipo: "ok", texto: "Etapa registrada com sucesso." });
      aoRegistrar();
    } catch (erroEnvio) {
      setFeedback(feedbackDaTransacao(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando} style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
      <label>
        Etapa
        <select value={etapaSelecionada} onChange={(e) => setEtapaSelecionada(e.target.value)}>
          <option value="">Selecione…</option>
          {etapasPendentes.map((etapa) => (
            <option key={etapa} value={etapa}>
              {ROTULO_ETAPA_PRODUCAO[etapa]}
            </option>
          ))}
        </select>
      </label>
      {etapaSelecionada !== "" &&
        (erroValidacao ? <p className="erro">{erroValidacao}</p> : <p className="ok">Etapa válida para registro.</p>)}

      <fieldset style={{ border: "none", boxShadow: "none", padding: 0, background: "none", marginBlock: 0 }}>
        <p style={{ fontWeight: 500, marginTop: "0.75rem", marginBottom: "0.25rem" }}>Insumos utilizados nesta etapa (dentre os vinculados ao lote)</p>
        {insumosVinculados.length === 0 && <p className="dica">Nenhum insumo vinculado ao lote ainda.</p>}
        {insumosVinculados.map((insumo) => {
          const idStr = insumo.id.toString();
          const selecionado = insumosSelecionados.has(idStr);
          return (
            <div key={idStr} style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="checkbox"
                  checked={selecionado}
                  onChange={() => alternarInsumo(idStr)}
                />
                #{idStr} - {ROTULO_TIPO_INSUMO[insumo.tipo]}
              </label>
              {selecionado && (
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  Qtd:
                  <input
                    type="number"
                    min="1"
                    step="1"
                    style={{ width: "90px" }}
                    value={quantidadesConsumidas.get(idStr) ?? ""}
                    onChange={(e) => atualizarQuantidade(idStr, e.target.value)}
                    placeholder="0"
                  />
                  <span>{UNIDADE_INSUMO[insumo.tipo]}</span>
                </label>
              )}
            </div>
          );
        })}
      </fieldset>

      <label>
        Início informado
        <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
      </label>
      <label>
        Fim informado
        <input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
      </label>

      <AnexosIpfs
        key={chaveAnexos}
        rotulo="Documentos desta etapa (PDF, JPG, PNG - opcional)"
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
        {enviando ? "Registrando…" : "Registrar etapa"}
      </button>
      {feedback && <p className={feedback.tipo}>{feedback.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}
