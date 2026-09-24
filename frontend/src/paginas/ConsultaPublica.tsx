import { useEffect, useState } from "react";
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
  return "Ocorreu um erro ao buscar as informações. Tente novamente em instantes.";
}

/**
 * Página do consumidor final. Não usa CarteiraContexto, window.ethereum
 * nem chamadas diretas à blockchain — consulta via API backend com cache Neon.
 */
export function ConsultaPublica() {
  const { chainId: chainIdParam, tokenId } = useParams<{ chainId: string; tokenId: string }>();
  const [dados, setDados] = useState<DadosConsulta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const chainId = chainIdParam ? Number(chainIdParam) : NaN;
  const rede = REDES[chainId];

  useEffect(() => {
    if (!tokenId || Number.isNaN(chainId)) {
      setErro("Link de consulta inválido.");
      setCarregando(false);
      return;
    }
    let cancelado = false;
    (async () => {
      setCarregando(true);
      setErro(null);
      try {
        const resposta = await fetch(`${API_URL}/garrafa/${chainId}/${tokenId}`);
        if (!resposta.ok) {
          const corpo = (await resposta.json()) as { erro: string };
          if (!cancelado) setErro(corpo.erro ?? "Erro desconhecido.");
          return;
        }
        const json = (await resposta.json()) as DadosConsulta;
        if (!cancelado) setDados(json);
      } catch {
        if (!cancelado) setErro("Ocorreu um erro ao buscar as informações. Tente novamente em instantes.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [chainId, tokenId]);

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

      {carregando && (
        <div className="cp-carregando">
          <span className="cp-carregando__indicador" aria-hidden="true" />
          <span>Buscando o histórico desta garrafa…</span>
        </div>
      )}

      {erro && (
        <div className="cp-estado-erro">
          <p>{mensagemAmigavel(erro)}</p>
        </div>
      )}

      {dados && (
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
