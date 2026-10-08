import type { JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexto/AuthContexto";
import { useCarteira } from "../contexto/CarteiraContexto";
import { obterContrato } from "../contracts";
import { feedbackDaTransacao } from "../lib/erros";
import { encurtarEndereco } from "../lib/formatadores";
import { PAPEL_ADMIN, PAPEL_ENVASADOR, PAPEL_FORNECEDOR, PAPEL_PRODUTOR } from "../lib/papeis";
import { API_URL, fetchApi } from "../lib/api";

interface CarteiraPendente {
  address: string;
  vinculada_em: string;
  usuario_email: string;
  nome_responsavel: string;
  nome_empresa: string;
  tipo_participante: string | null;
}

const PAPEL_MAP: Record<string, string> = {
  fornecedor: PAPEL_FORNECEDOR,
  produtor: PAPEL_PRODUTOR,
  envasador: PAPEL_ENVASADOR,
  admin: PAPEL_ADMIN,
};

const OPCOES_PAPEL = [
  { value: "fornecedor", label: "Fornecedor" },
  { value: "produtor", label: "Produtor" },
  { value: "envasador", label: "Envasador" },
  { value: "admin", label: "Administrador" },
];

function CardSolicitacao({
  carteira,
  chainId,
  signer,
  aoRemover,
}: {
  carteira: CarteiraPendente;
  chainId: number;
  signer: JsonRpcSigner;
  aoRemover: (address: string) => void;
}) {
  const { token } = useAuth();
  const [papelSelecionado, setPapelSelecionado] = useState(
    carteira.tipo_participante ?? "fornecedor",
  );
  const [processando, setProcessando] = useState(false);
  const [dbAprovado, setDbAprovado] = useState(false);
  const [erroChain, setErroChain] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const patchStatus = async (status: "autorizada" | "revogada") => {
    const res = await fetchApi(`${API_URL}/admin/carteiras/${carteira.address}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { erro?: string };
      throw new Error(body.erro ?? `Erro HTTP ${res.status}`);
    }
  };

  const concederPapelNaChain = async () => {
    const acesso = obterContrato("ContratoAcesso", chainId, signer);
    const tx = await acesso.grantRole(PAPEL_MAP[papelSelecionado], carteira.address);
    await tx.wait();
  };

  const aprovar = async () => {
    setErroGeral(null);
    setErroChain(null);
    setProcessando(true);
    let jaAprovadoDB = dbAprovado;
    try {
      if (!jaAprovadoDB) {
        await patchStatus("autorizada");
        jaAprovadoDB = true;
        setDbAprovado(true);
      }
      await concederPapelNaChain();
      aoRemover(carteira.address);
    } catch (err) {
      if (jaAprovadoDB) {
        setErroChain(feedbackDaTransacao(err).texto);
      } else {
        setErroGeral(err instanceof Error ? err.message : "Erro ao aprovar solicitação.");
      }
    } finally {
      setProcessando(false);
    }
  };

  const tentarNovamente = async () => {
    setErroChain(null);
    setProcessando(true);
    try {
      await concederPapelNaChain();
      aoRemover(carteira.address);
    } catch (err) {
      setErroChain(feedbackDaTransacao(err).texto);
    } finally {
      setProcessando(false);
    }
  };

  const reprovar = async () => {
    setErroGeral(null);
    setProcessando(true);
    try {
      await patchStatus("revogada");
      aoRemover(carteira.address);
    } catch (err) {
      setErroGeral(err instanceof Error ? err.message : "Erro ao reprovar solicitação.");
      setProcessando(false);
    }
  };

  const dataFormatada = new Date(carteira.vinculada_em).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="card-solicitacao">
      <div className="card-solicitacao__cabecalho">
        <div>
          <span className="card-solicitacao__nome">{carteira.nome_responsavel}</span>
          {carteira.nome_empresa && (
            <span className="card-solicitacao__detalhe"> · {carteira.nome_empresa}</span>
          )}
        </div>
        <span className="card-solicitacao__data">Solicitado em {dataFormatada}</span>
      </div>

      <span className="card-solicitacao__detalhe">{carteira.usuario_email}</span>
      <span className="card-solicitacao__detalhe mono" title={carteira.address}>
        {encurtarEndereco(carteira.address)}
      </span>

      <div className="card-solicitacao__papel">
        <label className="card-solicitacao__label-papel" htmlFor={`papel-${carteira.address}`}>
          Papel a conceder
        </label>
        <div className="card-solicitacao__papel-linha">
          <select
            id={`papel-${carteira.address}`}
            value={papelSelecionado}
            onChange={(e) => setPapelSelecionado(e.target.value)}
            disabled={processando || dbAprovado}
          >
            {OPCOES_PAPEL.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {carteira.tipo_participante && papelSelecionado !== carteira.tipo_participante && (
            <span className="badge badge--aviso">Solicitou: {carteira.tipo_participante}</span>
          )}
        </div>
      </div>

      {erroChain && (
        <div className="card-solicitacao__erro-chain">
          <p className="erro">
            Carteira aprovada no sistema, mas o papel não foi concedido no blockchain: {erroChain}
          </p>
          <p className="dica">
            Clique em "Tentar novamente" para repetir apenas essa etapa. Se o problema persistir,
            conceda o papel manualmente em Gerenciar papéis.
          </p>
        </div>
      )}
      {erroGeral && <p className="erro">{erroGeral}</p>}

      <div className="card-solicitacao__acoes">
        {erroChain ? (
          <button onClick={() => void tentarNovamente()} disabled={processando}>
            {processando ? "Tentando…" : "Tentar novamente"}
          </button>
        ) : (
          <button onClick={() => void aprovar()} disabled={processando}>
            {processando ? "Aprovando…" : "Aprovar"}
          </button>
        )}
        {!dbAprovado && (
          <button className="botao--perigo" onClick={() => void reprovar()} disabled={processando}>
            {processando ? "Aguarde…" : "Reprovar"}
          </button>
        )}
      </div>
    </div>
  );
}

export function AdminCarteiras() {
  const { token } = useAuth();
  const { chainId, signer } = useCarteira();
  const [carteiras, setCarteiras] = useState<CarteiraPendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

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
      const data = (await res.json()) as { carteiras: CarteiraPendente[] };
      setCarteiras(data.carteiras);
    } catch (erroCarregar) {
      setErro(
        erroCarregar instanceof Error ? erroCarregar.message : "Erro ao carregar solicitações.",
      );
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const remover = (address: string) =>
    setCarteiras((prev) => prev.filter((c) => c.address !== address));

  if (carregando) {
    return (
      <section>
        <h1>Solicitações de acesso</h1>
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
        <h1>Solicitações de acesso</h1>
        <p className="erro">{erro}</p>
        <button onClick={() => void carregar()}>Tentar novamente</button>
      </section>
    );
  }

  return (
    <section>
      <h1>Solicitações de acesso</h1>
      {!chainId || !signer ? (
        <p className="dica">Conecte a MetaMask para aprovar solicitações.</p>
      ) : carteiras.length === 0 ? (
        <p className="dica">Nenhuma solicitação pendente no momento.</p>
      ) : (
        <div className="lista-solicitacoes">
          {carteiras.map((c) => (
            <CardSolicitacao
              key={c.address}
              carteira={c}
              chainId={chainId}
              signer={signer}
              aoRemover={remover}
            />
          ))}
        </div>
      )}
    </section>
  );
}
