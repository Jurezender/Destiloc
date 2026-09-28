import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexto/AuthContexto";
import { API_URL, fetchApi } from "../lib/api";

interface CarteiraAdmin {
  address: string;
  status: string;
  vinculada_em: string;
  revisada_em: string | null;
  revisada_por: string | null;
  usuario_email: string;
  usuario_id: number;
}

export function AdminCarteiras() {
  const { token } = useAuth();
  const [carteiras, setCarteiras] = useState<CarteiraAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetchApi(`${API_URL}/admin/carteiras`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setErro("Acesso restrito a administradores.");
        return;
      }
      if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
      const data = (await res.json()) as { carteiras: CarteiraAdmin[] };
      setCarteiras(data.carteiras);
    } catch (erroCarregar) {
      setErro(erroCarregar instanceof Error ? erroCarregar.message : "Erro ao carregar carteiras.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atualizarStatus = async (address: string, novoStatus: string) => {
    if (!token) return;
    setAtualizando(address);
    try {
      const res = await fetchApi(`${API_URL}/admin/carteiras/${address}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: novoStatus }),
      });
      if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
      await carregar();
    } catch (erroAtualizar) {
      setErro(
        erroAtualizar instanceof Error ? erroAtualizar.message : "Erro ao atualizar status."
      );
    } finally {
      setAtualizando(null);
    }
  };

  if (carregando) {
    return (
      <section>
        <h1>Gerenciar carteiras</h1>
        <div className="carregando">
          <span className="carregando__indicador" aria-hidden="true" />
          <span>Carregando…</span>
        </div>
      </section>
    );
  }

  if (erro) {
    return (
      <section>
        <h1>Gerenciar carteiras</h1>
        <p className="erro">{erro}</p>
        <button onClick={() => void carregar()}>Tentar novamente</button>
      </section>
    );
  }

  return (
    <section>
      <h1>Gerenciar carteiras</h1>
      {carteiras.length === 0 ? (
        <p>Nenhuma carteira vinculada ainda.</p>
      ) : (
        <div className="tabela-wrapper">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Endereço</th>
                <th>Status</th>
                <th>Vinculada em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {carteiras.map((c) => (
                <tr key={c.address}>
                  <td>{c.usuario_email}</td>
                  <td title={c.address} className="mono">
                    {c.address.slice(0, 10)}…{c.address.slice(-6)}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        c.status === "autorizada"
                          ? "badge--ok"
                          : c.status === "pendente"
                            ? "badge--aviso"
                            : "badge--erro"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td>{new Date(c.vinculada_em).toLocaleDateString("pt-BR")}</td>
                  <td>
                    <div className="acoes-tabela">
                      {c.status !== "autorizada" && (
                        <button
                          onClick={() => void atualizarStatus(c.address, "autorizada")}
                          disabled={atualizando === c.address}
                        >
                          Autorizar
                        </button>
                      )}
                      {c.status !== "revogada" && (
                        <button
                          className="botao--perigo"
                          onClick={() => void atualizarStatus(c.address, "revogada")}
                          disabled={atualizando === c.address}
                        >
                          Revogar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button onClick={() => void carregar()}>Atualizar</button>
    </section>
  );
}
