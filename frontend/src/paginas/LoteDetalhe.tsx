import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { formatarTimestamp, RETULO_ETAPA } from "../lib/formatadores";
import { EtapaProdutiva } from "../lib/tipos";
import { motivoReferenciaInvalida } from "../lib/validacaoIpfs";
import { adicionarJSON } from "../ipfs/kubo";
import { montarMetadadosEtapa } from "../ipfs/metadados";

interface Lote {
  id: bigint;
  fabricante: string;
  tipoBebida: string;
  insumos: string;
  indiceAtual: bigint;
  dataRegistro: bigint;
  dataConclusao: bigint;
}

interface EventoProducao {
  etapa: EtapaProdutiva;
  ator: string;
  timestamp: bigint;
  localizacao: string;
  metadadosEtapaURI: string;
}

export function LoteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { conta, chainId, signer } = useCarteira();
  const papeis = usePapeis();

  const [lote, setLote] = useState<Lote | null>(null);
  const [sequencia, setSequencia] = useState<EtapaProdutiva[]>([]);
  const [historico, setHistorico] = useState<EventoProducao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!chainId || !signer || !id) return;
    setCarregando(true);
    setErro(null);
    try {
      const contrato = obterContrato("ContratoLote", chainId, signer);
      const existe = (await contrato.loteExiste(id)) as boolean;
      if (!existe) {
        setErro("Este lote não existe.");
        setLote(null);
        return;
      }
      const [dadoLote, seq, hist] = await Promise.all([
        contrato.obterLote(id),
        contrato.etapasDoLote(id) as Promise<bigint[]>,
        contrato.historicoProducao(id),
      ]);
      setLote({
        id: dadoLote.id,
        fabricante: dadoLote.fabricante,
        tipoBebida: dadoLote.tipoBebida,
        insumos: dadoLote.insumos,
        indiceAtual: dadoLote.indiceAtual,
        dataRegistro: dadoLote.dataRegistro,
        dataConclusao: dadoLote.dataConclusao,
      });
      setSequencia(seq.map((valor) => Number(valor) as EtapaProdutiva));
      setHistorico(
        (hist as Array<{ etapa: bigint; ator: string; timestamp: bigint; localizacao: string; metadadosEtapaURI: string }>).map(
          (evento) => ({
            etapa: Number(evento.etapa) as EtapaProdutiva,
            ator: evento.ator,
            timestamp: evento.timestamp,
            localizacao: evento.localizacao,
            metadadosEtapaURI: evento.metadadosEtapaURI,
          })
        )
      );
    } catch (erroLeitura) {
      setErro(mapearErroContrato(erroLeitura));
    } finally {
      setCarregando(false);
    }
  }, [chainId, signer, id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) return <p>Carregando…</p>;
  if (erro && !lote) return <p className="erro">{erro}</p>;
  if (!lote) return null;

  const producaoConcluida = lote.dataConclusao > 0n;
  const proximaEtapa = sequencia[Number(lote.indiceAtual)];
  const souFabricanteDoLote = conta?.toLowerCase() === lote.fabricante.toLowerCase();

  return (
    <section>
      <p>
        <Link to="/lotes">← Lotes</Link>
      </p>
      <h1>
        Lote #{lote.id.toString()} — {lote.tipoBebida}
      </h1>
      <p>
        Fabricante: {lote.fabricante}
        <br />
        Insumos: {lote.insumos}
        <br />
        Registrado em: {formatarTimestamp(lote.dataRegistro)}
        <br />
        {producaoConcluida ? (
          <>Produção concluída em: {formatarTimestamp(lote.dataConclusao)}</>
        ) : (
          <>Produção em andamento ({lote.indiceAtual.toString()}/{sequencia.length})</>
        )}
      </p>

      <h2>Sequência declarada</h2>
      <ol>
        {sequencia.map((etapa, indice) => (
          <li key={indice} style={{ fontWeight: indice === Number(lote.indiceAtual) ? "bold" : undefined }}>
            {RETULO_ETAPA[etapa]}
            {indice < Number(lote.indiceAtual) && " — registrada"}
          </li>
        ))}
      </ol>

      {!producaoConcluida && souFabricanteDoLote && papeis.lote.fabricante && (
        <RegistrarEtapa
          loteId={lote.id}
          etapaEsperada={proximaEtapa}
          chainId={chainId!}
          signer={signer!}
          aoRegistrar={carregar}
        />
      )}
      {!producaoConcluida && !souFabricanteDoLote && (
        <p className="dica">Só o fabricante deste lote ({lote.fabricante}) pode registrar as próximas etapas.</p>
      )}

      {producaoConcluida && (
        <p className="ok">
          Produção concluída — a emissão das garrafas já está disponível.{" "}
          {souFabricanteDoLote && papeis.tokenizacao.fabricante ? (
            <button type="button" onClick={() => navigate(`/lotes/${lote.id}/emitir`)}>
              Emitir garrafas
            </button>
          ) : (
            "Só o fabricante do lote, com FABRICANTE_ROLE em ContratoTokenizacao, pode emitir."
          )}
        </p>
      )}

      <h2>Histórico de produção</h2>
      <table>
        <thead>
          <tr>
            <th>Etapa</th>
            <th>Ator</th>
            <th>Local</th>
            <th>Data</th>
            <th>Metadados</th>
          </tr>
        </thead>
        <tbody>
          {historico.map((evento, indice) => (
            <tr key={indice}>
              <td>{RETULO_ETAPA[evento.etapa]}</td>
              <td>{evento.ator}</td>
              <td>{evento.localizacao}</td>
              <td>{formatarTimestamp(evento.timestamp)}</td>
              <td>{evento.metadadosEtapaURI || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RegistrarEtapa({
  loteId,
  etapaEsperada,
  chainId,
  signer,
  aoRegistrar,
}: {
  loteId: bigint;
  etapaEsperada: EtapaProdutiva;
  chainId: number;
  signer: NonNullable<ReturnType<typeof useCarteira>["signer"]>;
  aoRegistrar: () => void;
}) {
  const [localizacao, setLocalizacao] = useState("");
  const [metadadosEtapaURI, setMetadadosEtapaURI] = useState("");
  const [documentos, setDocumentos] = useState("");
  const [enviandoIpfs, setEnviandoIpfs] = useState(false);
  const [erroIpfs, setErroIpfs] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviarParaIpfs() {
    setErroIpfs(null);
    setEnviandoIpfs(true);
    try {
      const metadados = montarMetadadosEtapa({
        loteId: loteId.toString(),
        etapa: etapaEsperada,
        documentos: documentos
          .split("\n")
          .map((linha) => linha.trim())
          .filter(Boolean),
      });
      const referencia = await adicionarJSON(metadados);
      setMetadadosEtapaURI(referencia);
    } catch (erroUpload) {
      setErroIpfs(erroUpload instanceof Error ? erroUpload.message : "Não foi possível enviar ao IPFS.");
    } finally {
      setEnviandoIpfs(false);
    }
  }

  async function enviar() {
    const motivo = motivoReferenciaInvalida(metadadosEtapaURI);
    if (motivo) {
      setErro(motivo);
      return;
    }
    if (!localizacao.trim()) {
      setErro("Informe a localização.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const contrato = obterContrato("ContratoLote", chainId, signer);
      const tx = await contrato.registrarEtapaProdutiva(loteId, etapaEsperada, localizacao.trim(), metadadosEtapaURI);
      await tx.wait();
      setLocalizacao("");
      setMetadadosEtapaURI("");
      aoRegistrar();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Registrar próxima etapa: {RETULO_ETAPA[etapaEsperada]}</legend>
      <label>
        Localização
        <input value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} />
      </label>
      <label>
        Documentos desta etapa (um por linha, opcional — vira um JSON enviado ao IPFS)
        <textarea rows={3} value={documentos} onChange={(e) => setDocumentos(e.target.value)} />
      </label>
      <button type="button" onClick={() => void enviarParaIpfs()} disabled={enviandoIpfs}>
        {enviandoIpfs ? "Enviando ao IPFS…" : "Gerar referência no IPFS"}
      </button>
      {erroIpfs && <p className="erro">{erroIpfs}</p>}
      <label>
        Metadados (ipfs://…, opcional — preenchido automaticamente pelo botão acima, ou cole uma referência já existente)
        <input value={metadadosEtapaURI} onChange={(e) => setMetadadosEtapaURI(e.target.value.trim())} />
      </label>
      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Registrando…" : "Registrar etapa"}
      </button>
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}
