import type { Contract, JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { PAPEL_ADMIN, PAPEL_ENVASADOR, PAPEL_FORNECEDOR, PAPEL_PRODUTOR } from "../lib/papeis";

interface Detentores {
  admin: string[];
  fornecedor: string[];
  produtor: string[];
  envasador: string[];
}

async function aplicarPapel(
  papel: string,
  conta: string,
  acao: "conceder" | "revogar",
  signer: JsonRpcSigner,
  chainId: number
) {
  const acesso = obterContrato("ContratoAcesso", chainId, signer);
  const tx = acao === "conceder" ? await acesso.grantRole(papel, conta) : await acesso.revokeRole(papel, conta);
  await tx.wait();
}

async function listarDetentores(acesso: Contract, papel: string): Promise<string[]> {
  const total = Number(await acesso.getRoleMemberCount(papel));
  return Promise.all(
    Array.from({ length: total }, (_, indice) => acesso.getRoleMember(papel, indice) as Promise<string>)
  );
}

function SecaoPapel({
  titulo,
  papel,
  chainId,
  signer,
  aoConcluir,
}: {
  titulo: string;
  papel: string;
  chainId: number;
  signer: JsonRpcSigner;
  aoConcluir: () => void;
}) {
  const [endereco, setEndereco] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [executando, setExecutando] = useState(false);

  async function executar(acao: "conceder" | "revogar") {
    setErro(null);
    setStatus(null);
    if (!endereco) {
      setErro("Informe o endereço da conta.");
      return;
    }

    setExecutando(true);
    try {
      setStatus(`${acao === "conceder" ? "Concedendo" : "Revogando"} papel no ContratoAcesso…`);
      await aplicarPapel(papel, endereco, acao, signer, chainId);
      setStatus("Concluído.");
      aoConcluir();
    } catch (erroAcao) {
      setErro(mapearErroContrato(erroAcao));
    } finally {
      setExecutando(false);
    }
  }

  return (
    <fieldset disabled={executando}>
      <legend>{titulo}</legend>
      <label>
        Endereço da conta
        <input value={endereco} onChange={(e) => setEndereco(e.target.value.trim())} placeholder="0x…" />
      </label>
      <div className="acoes">
        <button type="button" onClick={() => void executar("conceder")}>
          Conceder
        </button>
        <button type="button" onClick={() => void executar("revogar")}>
          Revogar
        </button>
      </div>
      {status && <p>{status}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

function ListaEnderecos({ titulo, enderecos }: { titulo: string; enderecos: string[] }) {
  return (
    <div>
      <h4>{titulo}</h4>
      {enderecos.length === 0 ? (
        <p className="dica">Nenhuma conta.</p>
      ) : (
        <ul>
          {enderecos.map((endereco) => (
            <li key={endereco}>{endereco}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Participantes() {
  const { chainId, signer } = useCarteira();
  const papeis = usePapeis();
  const [detentores, setDetentores] = useState<Detentores | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarDetentores = useCallback(async () => {
    if (!chainId || !signer) return;

    setCarregando(true);
    setErro(null);
    try {
      const acesso = obterContrato("ContratoAcesso", chainId, signer);
      const [admin, fornecedor, produtor, envasador] = await Promise.all([
        listarDetentores(acesso, PAPEL_ADMIN),
        listarDetentores(acesso, PAPEL_FORNECEDOR),
        listarDetentores(acesso, PAPEL_PRODUTOR),
        listarDetentores(acesso, PAPEL_ENVASADOR),
      ]);
      setDetentores({ admin, fornecedor, produtor, envasador });
    } catch (erroLeitura) {
      setErro(mapearErroContrato(erroLeitura));
    } finally {
      setCarregando(false);
    }
  }, [chainId, signer]);

  useEffect(() => {
    void carregarDetentores();
  }, [carregarDetentores]);

  if (!chainId || !signer) return null;

  const aoConcluir = () => {
    void carregarDetentores();
    papeis.recarregar();
  };

  return (
    <section>
      <h1>Participantes</h1>
      <p className="dica">
        Os papéis são centralizados no ContratoAcesso. Uma mesma conta pode acumular os papéis de
        administrador, fornecedor, produtor e envasador.
      </p>

      <div className="grade-formularios">
        <SecaoPapel
          titulo="Fornecedor"
          papel={PAPEL_FORNECEDOR}
          chainId={chainId}
          signer={signer}
          aoConcluir={aoConcluir}
        />
        <SecaoPapel
          titulo="Produtor"
          papel={PAPEL_PRODUTOR}
          chainId={chainId}
          signer={signer}
          aoConcluir={aoConcluir}
        />
        <SecaoPapel
          titulo="Envasador"
          papel={PAPEL_ENVASADOR}
          chainId={chainId}
          signer={signer}
          aoConcluir={aoConcluir}
        />
        <SecaoPapel
          titulo="Administrador"
          papel={PAPEL_ADMIN}
          chainId={chainId}
          signer={signer}
          aoConcluir={aoConcluir}
        />
      </div>

      <h2>Contas atuais por papel</h2>
      {carregando && <p>Carregando participantes…</p>}
      {erro && <p className="erro">{erro}</p>}
      {detentores && (
        <div className="grade-listas">
          <ListaEnderecos titulo="Administradores" enderecos={detentores.admin} />
          <ListaEnderecos titulo="Fornecedores" enderecos={detentores.fornecedor} />
          <ListaEnderecos titulo="Produtores" enderecos={detentores.produtor} />
          <ListaEnderecos titulo="Envasadores" enderecos={detentores.envasador} />
        </div>
      )}
    </section>
  );
}
