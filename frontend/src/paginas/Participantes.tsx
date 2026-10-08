import type { Contract } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexto/AuthContexto";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { encurtarEndereco } from "../lib/formatadores";
import { PAPEL_ADMIN, PAPEL_ENVASADOR, PAPEL_FORNECEDOR, PAPEL_PRODUTOR } from "../lib/papeis";
import { API_URL, fetchApi } from "../lib/api";

interface ParticipanteDB {
  address: string;
  nome_responsavel: string;
  nome_empresa: string;
  tipo_participante: string | null;
}

interface Participante extends ParticipanteDB {
  admin: boolean;
  fornecedor: boolean;
  produtor: boolean;
  envasador: boolean;
}

async function listarMembros(acesso: Contract, papel: string): Promise<string[]> {
  const total = Number(await acesso.getRoleMemberCount(papel));
  return Promise.all(
    Array.from({ length: total }, (_, i) => acesso.getRoleMember(papel, i) as Promise<string>),
  );
}

const ROTULO_TIPO: Record<string, string> = {
  admin: "Administrador",
  fornecedor: "Fornecedor",
  produtor: "Produtor",
  envasador: "Envasador",
};

export function Participantes() {
  const { token } = useAuth();
  const { chainId, signer } = useCarteira();
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!token || !chainId || !signer) return;
    setCarregando(true);
    setErro(null);
    try {
      const acesso = obterContrato("ContratoAcesso", chainId, signer);

      const [resDB, membrosAdmin, membrosFornecedor, membrosProdutor, membrosEnvasador] =
        await Promise.all([
          fetchApi(`${API_URL}/admin/participantes`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          listarMembros(acesso, PAPEL_ADMIN),
          listarMembros(acesso, PAPEL_FORNECEDOR),
          listarMembros(acesso, PAPEL_PRODUTOR),
          listarMembros(acesso, PAPEL_ENVASADOR),
        ]);

      if (!resDB.ok) throw new Error(`Erro ao carregar participantes (HTTP ${resDB.status})`);
      const { participantes: lista } = (await resDB.json()) as { participantes: ParticipanteDB[] };

      const setAdmin      = new Set(membrosAdmin.map((a) => a.toLowerCase()));
      const setFornecedor = new Set(membrosFornecedor.map((a) => a.toLowerCase()));
      const setProdutor   = new Set(membrosProdutor.map((a) => a.toLowerCase()));
      const setEnvasador  = new Set(membrosEnvasador.map((a) => a.toLowerCase()));

      setParticipantes(
        lista.map((p) => ({
          ...p,
          admin:      setAdmin.has(p.address.toLowerCase()),
          fornecedor: setFornecedor.has(p.address.toLowerCase()),
          produtor:   setProdutor.has(p.address.toLowerCase()),
          envasador:  setEnvasador.has(p.address.toLowerCase()),
        })),
      );
    } catch (erroCarregar) {
      setErro(
        erroCarregar instanceof Error ? erroCarregar.message : mapearErroContrato(erroCarregar),
      );
    } finally {
      setCarregando(false);
    }
  }, [token, chainId, signer]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!chainId || !signer) return null;

  return (
    <section>
      <h1>Participantes</h1>
      <Link to="/participantes/papeis" className="link-acao">
        Gerenciar papéis →
      </Link>

      {carregando && (
        <div className="carregando">
          <span className="carregando__indicador" aria-hidden="true" />
          <span>Carregando participantes…</span>
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
      {!carregando && !erro && participantes.length === 0 && (
        <p className="dica">Nenhuma carteira autorizada ainda.</p>
      )}
      {!carregando && !erro && participantes.length > 0 && (
        <div className="tabela-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Carteira</th>
                <th>Papéis ativos</th>
              </tr>
            </thead>
            <tbody>
              {participantes.map((p) => {
                const papeis = [
                  p.admin      && "Administrador",
                  p.fornecedor && "Fornecedor",
                  p.produtor   && "Produtor",
                  p.envasador  && "Envasador",
                ].filter(Boolean) as string[];

                return (
                  <tr key={p.address}>
                    <td>
                      <span style={{ fontWeight: 500 }}>{p.nome_responsavel}</span>
                      <br />
                      <span style={{ fontSize: "0.8125rem", color: "var(--cor-texto-secundario)" }}>
                        {p.nome_empresa}
                        {p.tipo_participante && (
                          <> · {ROTULO_TIPO[p.tipo_participante] ?? p.tipo_participante}</>
                        )}
                      </span>
                    </td>
                    <td title={p.address} className="mono">
                      {encurtarEndereco(p.address)}
                    </td>
                    <td>
                      {papeis.length === 0 ? (
                        <span style={{ color: "var(--cor-texto-secundario)", fontStyle: "italic" }}>
                          Nenhum
                        </span>
                      ) : (
                        <div className="acoes-tabela">
                          {papeis.map((r) => (
                            <span key={r} className="badge badge--ok">{r}</span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </section>
  );
}
