import { useState } from "react";
import { useParams } from "react-router-dom";
import { REDES } from "../contracts/redes";
import {
  encurtarEndereco,
  formatarTimestamp,
  RETULO_ESTADO_PRODUCAO,
  RETULO_ETAPA_PRODUCAO,
  RETULO_TIPO_BEBIDA,
  RETULO_TIPO_INSUMO,
} from "../lib/formatadores";
import { EstadoProducao, EtapaProducao, TipoBebida, TipoInsumo } from "../lib/tipos";

// Todos os valores uint256/uint64 da blockchain chegam como string
// para preservar precisão — os enums chegam como number.
interface DadosConsulta {
  garrafa: {
    tokenId: string;
    envasamentoId: string;
    emitidaEm: string;
  };
  envasamento: {
    envasador: string;
    quantidadeDeclarada: string;
    quantidadeEmitida: string;
    registradoEm: string;
    concluidoEm: string;
    metadataURI: string;
  };
  lote: {
    id: string;
    produtor: string;
    tipoBebida: TipoBebida;
    estado: EstadoProducao;
    criadoEm: string;
    concluidoEm: string;
    metadataURI: string;
    metadataURIConclusao: string;
  };
  configuracao: {
    maturacaoAplicavel: boolean;
    retificacaoAplicavel: boolean;
    blendagemAplicavel: boolean;
    ajusteFinalAplicavel: boolean;
  };
  insumosVinculados: Array<{
    id: string;
    tipo: TipoInsumo;
    fornecedor: string;
    metadataURI: string;
  }>;
  etapas: Array<{
    indice: number;
    etapa: EtapaProducao;
    executadoPor: string;
    inicioInformado: string;
    fimInformado: string;
    registradoEm: string;
    metadataURI: string;
    insumosUtilizados: string[];
  }>;
  nomesCarteiras: Record<string, string>;
}

interface ItemHistorico {
  id: number;
  cidade: string | null;
  estado: string | null;
  pais: string | null;
  escaneadoEm: string;
  suspeito: boolean;
  motivo: string | null;
}

interface HistoricoScans {
  total: number;
  scans: ItemHistorico[];
}

type EstadoConsulta =
  | "consentimento"
  | "solicitando"
  | "carregando"
  | "carregado"
  | "recusado"
  | "erro-localizacao"
  | "erro-consulta";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function ipfsParaUrl(uri: string): string {
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  return uri;
}

function mensagemAmigavel(erro: string): string {
  if (erro.includes("não existe") || erro.includes("não encontrad")) {
    return "Não foi possível verificar esta garrafa. O QR Code pode estar incompleto ou a garrafa não está cadastrada no sistema.";
  }
  if (erro.includes("inválido") || erro.includes("inválida")) {
    return "O link de consulta parece estar incorreto. Verifique se o QR Code foi lido corretamente.";
  }
  if (erro.includes("temporariamente") || erro.includes("indisponível")) {
    return "O serviço está temporariamente indisponível. Tente novamente em instantes.";
  }
  return "Ocorreu um erro ao buscar as informações. Tente novamente em instantes.";
}

function mensagemErroGeo(codigo: number): string {
  if (codigo === GeolocationPositionError.PERMISSION_DENIED)
    return "Permissão de localização negada. Para acessar esta consulta, autorize o acesso à localização nas configurações do navegador e tente novamente.";
  if (codigo === GeolocationPositionError.POSITION_UNAVAILABLE)
    return "Não foi possível determinar sua localização. Verifique se o GPS está ativo.";
  if (codigo === GeolocationPositionError.TIMEOUT)
    return "Tempo esgotado ao obter localização. Tente novamente.";
  return "Não foi possível obter sua localização.";
}

/**
 * Página do consumidor final. Fluxo: consentimento → localização → POST /scans
 * + GET /garrafa em paralelo → exibir consulta e histórico.
 * Não usa CarteiraContexto, window.ethereum nem chamadas diretas à blockchain.
 */
export function ConsultaPublica() {
  const { chainId: chainIdParam, tokenId } = useParams<{
    chainId: string;
    tokenId: string;
  }>();
  const [estado, setEstado] = useState<EstadoConsulta>("consentimento");
  const [dados, setDados] = useState<DadosConsulta | null>(null);
  const [historico, setHistorico] = useState<HistoricoScans | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const chainId = chainIdParam ? Number(chainIdParam) : NaN;
  const rede = REDES[chainId];

  function solicitarLocalizacao() {
    setEstado("solicitando");
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setEstado("carregando");
        void carregarDados({
          latitude: posicao.coords.latitude,
          longitude: posicao.coords.longitude,
          precisao: Math.round(posicao.coords.accuracy),
        });
      },
      (erro) => {
        setEstado("erro-localizacao");
        setMensagemErro(mensagemErroGeo(erro.code));
      },
      { timeout: 10_000, maximumAge: 60_000 }
    );
  }

  async function carregarDados(loc: {
    latitude: number;
    longitude: number;
    precisao: number;
  }) {
    if (!tokenId || Number.isNaN(chainId)) {
      setMensagemErro("Link de consulta inválido.");
      setEstado("erro-consulta");
      return;
    }
    try {
      const [scanResposta, garrafaResposta] = await Promise.all([
        fetch(`${API_URL}/scans`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chainId,
            tokenId,
            latitude: loc.latitude,
            longitude: loc.longitude,
            precisao: loc.precisao,
          }),
        }),
        fetch(`${API_URL}/garrafa/${chainId}/${tokenId}`),
      ]);

      if (!garrafaResposta.ok) {
        let erroMsg = garrafaResposta.status >= 500
          ? "Serviço temporariamente indisponível."
          : "Erro desconhecido.";
        try {
          const corpo = (await garrafaResposta.json()) as { erro?: string };
          if (corpo.erro) erroMsg = corpo.erro;
        } catch {
          // Corpo não é JSON (ex: 504 HTML da Vercel) — usa mensagem pelo status
        }
        setMensagemErro(mensagemAmigavel(erroMsg));
        setEstado("erro-consulta");
        return;
      }

      // 422 = garrafa inexistente; erros 5xx são não-bloqueantes
      if (!scanResposta.ok && scanResposta.status === 422) {
        const corpo = (await scanResposta.json()) as { erro: string };
        setMensagemErro(mensagemAmigavel(corpo.erro ?? "Garrafa não encontrada."));
        setEstado("erro-consulta");
        return;
      }

      const dadosGarrafa = (await garrafaResposta.json()) as DadosConsulta;

      // Histórico é uma consulta rápida (só banco) — feita após registrar o scan
      const historicoResposta = await fetch(
        `${API_URL}/garrafa/${chainId}/${tokenId}/scans`
      );
      const dadosHistorico = historicoResposta.ok
        ? ((await historicoResposta.json()) as HistoricoScans)
        : { total: 0, scans: [] };

      setDados(dadosGarrafa);
      setHistorico(dadosHistorico);
      setEstado("carregado");
    } catch (erro) {
      console.error("[ConsultaPublica] carregarDados falhou:", erro);
      const isNetworkError = erro instanceof TypeError;
      setMensagemErro(
        isNetworkError
          ? "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
          : "Ocorreu um erro ao buscar as informações. Tente novamente em instantes."
      );
      setEstado("erro-consulta");
    }
  }

  const processosAplicados = dados
    ? ([
        dados.configuracao.maturacaoAplicavel && "Maturação",
        dados.configuracao.retificacaoAplicavel && "Retificação",
        dados.configuracao.blendagemAplicavel && "Blendagem",
        dados.configuracao.ajusteFinalAplicavel && "Ajuste final",
      ].filter(Boolean) as string[])
    : [];

  const tiposInsumos = dados
    ? [...new Set(dados.insumosVinculados.map((i) => i.tipo))]
    : [];

  return (
    <div className="consulta-publica">

      <header className="cp-hero">
        <p className="cp-hero__sistema">Destiloc</p>
        <h1 className="cp-hero__titulo">Conheça a origem desta garrafa</h1>
      </header>

      {estado === "consentimento" && (
        <div className="cp-consentimento">
          <div className="cp-consentimento__corpo">
            <h2 className="cp-consentimento__titulo">Localização necessária</h2>
            <p className="cp-consentimento__texto">
              Para garantir a rastreabilidade pós-consumo desta garrafa, esta consulta
              registra uma localização aproximada de onde ela está sendo verificada.
            </p>
            <p className="cp-consentimento__texto">
              Sua privacidade é protegida por{" "}
              <strong>minimização de dados</strong>: apenas a cidade e o estado são
              armazenados — nunca o endereço exato.
            </p>
            <div className="cp-consentimento__acoes">
              <button type="button" onClick={solicitarLocalizacao}>
                Autorizar e continuar
              </button>
              <button
                type="button"
                className="cp-botao--neutro"
                onClick={() => setEstado("recusado")}
              >
                Não autorizar
              </button>
            </div>
          </div>
        </div>
      )}

      {estado === "solicitando" && (
        <div className="cp-carregando">
          <span className="cp-carregando__indicador" aria-hidden="true" />
          <span>Obtendo localização…</span>
        </div>
      )}

      {estado === "carregando" && (
        <div className="cp-carregando">
          <span className="cp-carregando__indicador" aria-hidden="true" />
          <span>Buscando o histórico dessa garrafa…</span>
        </div>
      )}

      {estado === "recusado" && (
        <div className="cp-estado-informativo">
          <p>A localização é necessária para acessar o histórico desta garrafa.</p>
          <button
            type="button"
            className="cp-estado-informativo__acao"
            onClick={() => setEstado("consentimento")}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {estado === "erro-localizacao" && (
        <div className="cp-estado-informativo">
          <p>{mensagemErro}</p>
          <button
            type="button"
            className="cp-estado-informativo__acao"
            onClick={() => setEstado("consentimento")}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {estado === "erro-consulta" && (
        <div className="cp-estado-erro">
          <p>{mensagemErro}</p>
        </div>
      )}

      {estado === "carregado" && dados && (
        <div className="cp-conteudo">

          {/* Identidade da garrafa */}
          <div className="cp-identidade">
            <div className="cp-identidade__cabecalho">
              <span className="cp-identidade__rotulo">Garrafa certificada</span>
              <span className="cp-identidade__numero">#{dados.garrafa.tokenId}</span>
              <span className="cp-identidade__bebida">{RETULO_TIPO_BEBIDA[dados.lote.tipoBebida]}</span>
            </div>
            <div className="cp-identidade__meta">
              <span>Lote #{dados.lote.id}</span>
              <span className="cp-sep">·</span>
              <span>Envasamento #{dados.garrafa.envasamentoId}</span>
              <span className="cp-sep">·</span>
              <span>Emitida em {formatarTimestamp(Number(dados.garrafa.emitidaEm))}</span>
            </div>
            <div className="cp-autenticidade">
              <span className="cp-autenticidade__icone" aria-hidden="true">✓</span>
              <span>Produto registrado na blockchain</span>
            </div>
          </div>

          {/* Origem */}
          <section className="cp-secao">
            <header className="cp-secao__header">
              <h2 className="cp-secao__titulo">Origem</h2>
            </header>
            <div className="cp-secao__corpo">
              <dl className="cp-campos">
                <div className="cp-campo cp-campo--largo">
                  <dt className="cp-campo__rotulo">Produtor</dt>
                  <dd className="cp-campo__valor">
                    {dados.nomesCarteiras[dados.lote.produtor] ?? encurtarEndereco(dados.lote.produtor)}
                  </dd>
                </div>
                {processosAplicados.length > 0 && (
                  <div className="cp-campo cp-campo--largo">
                    <dt className="cp-campo__rotulo">Processo aplicado</dt>
                    <dd className="cp-campo__valor cp-tags">
                      {processosAplicados.map((p) => (
                        <span key={p} className="cp-tag">{p}</span>
                      ))}
                    </dd>
                  </div>
                )}
                {tiposInsumos.length > 0 && (
                  <div className="cp-campo cp-campo--largo">
                    <dt className="cp-campo__rotulo">Ingredientes</dt>
                    <dd className="cp-campo__valor cp-tags">
                      {tiposInsumos.map((tipo) => (
                        <span key={tipo} className="cp-tag">{RETULO_TIPO_INSUMO[tipo]}</span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          {/* Jornada de produção */}
          {dados.etapas.length > 0 && (
            <section className="cp-secao">
              <header className="cp-secao__header">
                <h2 className="cp-secao__titulo">Jornada de produção</h2>
              </header>
              <div className="cp-secao__corpo">
                <ol className="cp-timeline">
                  {dados.etapas.map((evento) => (
                    <li key={evento.indice} className="cp-timeline__item">
                      <div className="cp-timeline__ponto" aria-hidden="true" />
                      <div className="cp-timeline__conteudo">
                        <span className="cp-timeline__etapa">{RETULO_ETAPA_PRODUCAO[evento.etapa]}</span>
                        {(evento.inicioInformado !== "0" || evento.fimInformado !== "0") && (
                          <span className="cp-timeline__periodo">
                            {evento.inicioInformado !== "0" && formatarTimestamp(Number(evento.inicioInformado))}
                            {evento.inicioInformado !== "0" && evento.fimInformado !== "0" && " — "}
                            {evento.fimInformado !== "0" && formatarTimestamp(Number(evento.fimInformado))}
                          </span>
                        )}
                        {evento.metadataURI && (
                          <a
                            href={ipfsParaUrl(evento.metadataURI)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cp-link-ipfs"
                          >
                            Ver detalhes →
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}

          {/* Histórico de consultas */}
          <section className="cp-secao">
            <header className="cp-secao__header">
              <h2 className="cp-secao__titulo">Histórico desta garrafa</h2>
              {historico && historico.total > 0 && (
                <span className="cp-secao__badge">
                  {historico.total} consulta{historico.total !== 1 ? "s" : ""}
                </span>
              )}
            </header>
            <div className="cp-secao__corpo cp-secao__corpo--sem-padding">
              {!historico || historico.scans.length === 0 ? (
                <p className="cp-vazio">Nenhuma consulta registrada.</p>
              ) : (
                <ul className="cp-historico">
                  {historico.scans.map((scan) => (
                    <li
                      key={scan.id}
                      className={`cp-historico__item${scan.suspeito ? " cp-historico__item--suspeito" : ""}`}
                    >
                      <span className="cp-historico__local">
                        {[scan.cidade, scan.estado].filter(Boolean).join(", ") ||
                          scan.pais ||
                          "Localização não identificada"}
                      </span>
                      <span className="cp-historico__data">
                        {new Date(scan.escaneadoEm).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                      {scan.suspeito && scan.motivo && (
                        <span className="cp-historico__alerta">{scan.motivo}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Verificação técnica */}
          <details className="cp-tecnico">
            <summary className="cp-tecnico__gatilho">
              <span>Verificação técnica</span>
              <span className="cp-tecnico__chevron" aria-hidden="true">▾</span>
            </summary>
            <div className="cp-tecnico__corpo">
              <dl className="cp-campos">
                {rede && (
                  <div className="cp-campo">
                    <dt className="cp-campo__rotulo">Rede blockchain</dt>
                    <dd className="cp-campo__valor">{rede.rotulo}</dd>
                  </div>
                )}
                <div className="cp-campo">
                  <dt className="cp-campo__rotulo">Estado do lote</dt>
                  <dd className="cp-campo__valor">
                    <span className={`cp-badge ${dados.lote.estado === EstadoProducao.Concluido ? "cp-badge--ok" : "cp-badge--neutro"}`}>
                      {RETULO_ESTADO_PRODUCAO[dados.lote.estado]}
                    </span>
                  </dd>
                </div>
                <div className="cp-campo">
                  <dt className="cp-campo__rotulo">Garrafas deste envasamento</dt>
                  <dd className="cp-campo__valor">
                    {dados.envasamento.quantidadeEmitida} emitidas de {dados.envasamento.quantidadeDeclarada} declaradas
                  </dd>
                </div>
                <div className="cp-campo">
                  <dt className="cp-campo__rotulo">Data de registro do lote</dt>
                  <dd className="cp-campo__valor">{formatarTimestamp(Number(dados.lote.criadoEm))}</dd>
                </div>
                <div className="cp-campo cp-campo--largo">
                  <dt className="cp-campo__rotulo">Endereço do produtor</dt>
                  <dd className="cp-campo__valor cp-mono">{dados.lote.produtor}</dd>
                </div>
                <div className="cp-campo cp-campo--largo">
                  <dt className="cp-campo__rotulo">Endereço do envasador</dt>
                  <dd className="cp-campo__valor cp-mono">{dados.envasamento.envasador}</dd>
                </div>
                {dados.lote.metadataURI && (
                  <div className="cp-campo">
                    <dt className="cp-campo__rotulo">Metadados do lote (IPFS)</dt>
                    <dd className="cp-campo__valor">
                      <a href={ipfsParaUrl(dados.lote.metadataURI)} target="_blank" rel="noopener noreferrer" className="cp-link-ipfs">
                        Abrir no IPFS →
                      </a>
                    </dd>
                  </div>
                )}
                {dados.lote.estado === EstadoProducao.Concluido && dados.lote.metadataURIConclusao && (
                  <div className="cp-campo">
                    <dt className="cp-campo__rotulo">Metadados de conclusão (IPFS)</dt>
                    <dd className="cp-campo__valor">
                      <a href={ipfsParaUrl(dados.lote.metadataURIConclusao)} target="_blank" rel="noopener noreferrer" className="cp-link-ipfs">
                        Abrir no IPFS →
                      </a>
                    </dd>
                  </div>
                )}
                {dados.envasamento.metadataURI && (
                  <div className="cp-campo">
                    <dt className="cp-campo__rotulo">Metadados do envasamento (IPFS)</dt>
                    <dd className="cp-campo__valor">
                      <a href={ipfsParaUrl(dados.envasamento.metadataURI)} target="_blank" rel="noopener noreferrer" className="cp-link-ipfs">
                        Abrir no IPFS →
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </details>

        </div>
      )}
    </div>
  );
}
