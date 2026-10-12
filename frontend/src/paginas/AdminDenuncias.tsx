import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexto/AuthContexto";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao, type FeedbackTx } from "../lib/erros";
import { API_URL } from "../lib/api";

type StatusDenuncia = "pendente" | "em_analise" | "descartada" | "confirmada";

interface Denuncia {
  id: number;
  chain_id: number;
  lote_id: string;
  token_id: string;
  motivo: string;
  local_consumo: string | null;
  data_consumo: string | null;
  status: StatusDenuncia;
  criado_em: string;
  atualizado_em: string;
}

const ROTULO_STATUS: Record<StatusDenuncia, string> = {
  pendente:    "Pendente",
  em_analise:  "Em análise",
  descartada:  "Descartada",
  confirmada:  "Confirmada",
};

const COR_STATUS: Record<StatusDenuncia, string> = {
  pendente:   "badge--neutro",
  em_analise: "badge--aviso",
  descartada: "badge--inativo",
  confirmada: "badge--erro",
};

export function AdminDenuncias() {
  const { token } = useAuth();
  const { signer, chainId } = useCarteira();
  const [denuncias, setDenuncias] = useState<Denuncia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<StatusDenuncia | "todas">("todas");
  const [feedbacks, setFeedbacks] = useState<Record<number, FeedbackTx>>({});
  const [atualizando, setAtualizando] = useState<number | null>(null);
  const [motivoOnChain, setMotivoOnChain] = useState<Record<number, string>>({});

  const carregarDenuncias = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`${API_URL}/admin/denuncias`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao carregar denúncias.");
      const data = (await res.json()) as { denuncias: Denuncia[] };
      setDenuncias(data.denuncias);
    } catch {
      setErro("Não foi possível carregar as denúncias.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => { void carregarDenuncias(); }, [carregarDenuncias]);

  async function atualizarStatus(id: number, status: StatusDenuncia) {
    setAtualizando(id);
    try {
      const res = await fetch(`${API_URL}/admin/denuncia/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Falha ao atualizar status.");
      setDenuncias((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status } : d))
      );
      setFeedbacks((prev) => ({ ...prev, [id]: { tipo: "ok", texto: `Status atualizado para "${ROTULO_STATUS[status]}".` } }));
    } catch {
      setFeedbacks((prev) => ({ ...prev, [id]: { tipo: "erro", texto: "Erro ao atualizar status." } }));
    } finally {
      setAtualizando(null);
    }
  }

  async function confirmarOnChain(denuncia: Denuncia) {
    if (!signer || !chainId) {
      setFeedbacks((prev) => ({ ...prev, [denuncia.id]: { tipo: "erro", texto: "Conecte a carteira para registrar na blockchain." } }));
      return;
    }
    const motivo = motivoOnChain[denuncia.id]?.trim();
    if (!motivo) {
      setFeedbacks((prev) => ({ ...prev, [denuncia.id]: { tipo: "erro", texto: "Informe o motivo para registrar na blockchain." } }));
      return;
    }
    setAtualizando(denuncia.id);
    try {
      const producao = obterContrato("ContratoProducao", chainId, signer);
      const tx = await producao.marcarComoAdulterado(denuncia.lote_id, motivo);
      await tx.wait();
      await atualizarStatus(denuncia.id, "confirmada");
    } catch (erroTx) {
      setFeedbacks((prev) => ({ ...prev, [denuncia.id]: feedbackDaTransacao(erroTx) }));
    } finally {
      setAtualizando(null);
    }
  }

  const listagem = denuncias.filter(
    (d) => filtro === "todas" || d.status === filtro
  );

  const contadores: Record<StatusDenuncia | "todas", number> = {
    todas:      denuncias.length,
    pendente:   denuncias.filter((d) => d.status === "pendente").length,
    em_analise: denuncias.filter((d) => d.status === "em_analise").length,
    descartada: denuncias.filter((d) => d.status === "descartada").length,
    confirmada: denuncias.filter((d) => d.status === "confirmada").length,
  };

  return (
    <div className="pagina">
      <h1>Denúncias de lotes suspeitos</h1>

      {carregando && <p className="dica">Carregando denúncias…</p>}
      {erro && <p className="erro">{erro}</p>}

      {!carregando && (
        <>
          <div className="abas">
            {(["todas", "pendente", "em_analise", "descartada", "confirmada"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`aba${filtro === s ? " aba--ativa" : ""}`}
                onClick={() => setFiltro(s)}
              >
                {s === "todas" ? "Todas" : ROTULO_STATUS[s]}
                {contadores[s] > 0 && (
                  <span className="aba__contador">{contadores[s]}</span>
                )}
              </button>
            ))}
          </div>

          {listagem.length === 0 ? (
            <p className="dica">Nenhuma denúncia{filtro !== "todas" ? ` com status "${ROTULO_STATUS[filtro as StatusDenuncia]}"` : ""}.</p>
          ) : (
            <ul className="lista-denuncias">
              {listagem.map((d) => (
                <li key={d.id} className={`denuncia-card denuncia-card--${d.status}`}>
                  <header className="denuncia-card__header">
                    <span className="denuncia-card__id">#{d.id}</span>
                    <span className={`badge ${COR_STATUS[d.status]}`}>{ROTULO_STATUS[d.status]}</span>
                    <span className="denuncia-card__meta">
                      Lote #{d.lote_id} · Garrafa #{d.token_id} · {new Date(d.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </header>

                  <div className="denuncia-card__corpo">
                    <p className="denuncia-card__motivo">{d.motivo}</p>
                    {(d.local_consumo ?? d.data_consumo) && (
                      <p className="denuncia-card__detalhes">
                        {d.local_consumo && <span>📍 {d.local_consumo}</span>}
                        {d.data_consumo && <span>📅 {new Date(d.data_consumo).toLocaleDateString("pt-BR")}</span>}
                      </p>
                    )}
                  </div>

                  <div className="denuncia-card__acoes">
                    {d.status === "pendente" && (
                      <>
                        <button
                          type="button"
                          disabled={atualizando === d.id}
                          onClick={() => void atualizarStatus(d.id, "em_analise")}
                        >
                          Abrir investigação
                        </button>
                        <button
                          type="button"
                          className="botao--secundario"
                          disabled={atualizando === d.id}
                          onClick={() => void atualizarStatus(d.id, "descartada")}
                        >
                          Arquivar
                        </button>
                      </>
                    )}
                    {d.status === "em_analise" && (
                      <>
                        <div className="denuncia-card__confirmacao">
                          <label>
                            Motivo para blockchain
                            <input
                              type="text"
                              placeholder="Motivo oficial da adulteração"
                              value={motivoOnChain[d.id] ?? ""}
                              onChange={(e) =>
                                setMotivoOnChain((prev) => ({ ...prev, [d.id]: e.target.value }))
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="botao--perigo"
                            disabled={atualizando === d.id}
                            onClick={() => void confirmarOnChain(d)}
                          >
                            {atualizando === d.id ? "Registrando…" : "Confirmar adulteração (blockchain)"}
                          </button>
                        </div>
                        <button
                          type="button"
                          className="botao--secundario"
                          disabled={atualizando === d.id}
                          onClick={() => void atualizarStatus(d.id, "descartada")}
                        >
                          Arquivar
                        </button>
                      </>
                    )}
                    {d.status === "confirmada" && (
                      <p className="dica">Adulteração confirmada e registrada na blockchain.</p>
                    )}
                  </div>

                  {feedbacks[d.id] && (
                    <p className={feedbacks[d.id].tipo}>{feedbacks[d.id].texto}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
