import type { JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { useCarteira } from "../contexto/CarteiraContexto";
import { usePapeis } from "../contexto/PapeisContexto";
import { obterContrato, type NomeContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { PAPEL_ADMIN, PAPEL_DISTRIBUIDOR, PAPEL_FABRICANTE, PAPEL_VAREJISTA } from "../lib/papeis";

const TODOS_CONTRATOS: NomeContrato[] = ["ContratoLote", "ContratoTokenizacao", "ContratoRastreamento"];

interface Detentores {
  lote: { admin: string[]; fabricante: string[] };
  tokenizacao: { admin: string[]; fabricante: string[] };
  rastreamento: { admin: string[]; fabricante: string[]; distribuidor: string[]; varejista: string[] };
}

async function aplicarPapel(
  contratosAlvo: NomeContrato[],
  papel: string,
  conta: string,
  acao: "conceder" | "revogar",
  signer: JsonRpcSigner,
  chainId: number,
  aoProgredir: (mensagem: string) => void
) {
  for (const nome of contratosAlvo) {
    aoProgredir(`${acao === "conceder" ? "Concedendo" : "Revogando"} papel em ${nome}…`);
    const contrato = obterContrato(nome, chainId, signer);
    const tx =
      acao === "conceder" ? await contrato.grantRole(papel, conta) : await contrato.revokeRole(papel, conta);
    await tx.wait();
  }
}

/**
 * `DEFAULT_ADMIN_ROLE`/`FABRICANTE_ROLE` são registros separados por
 * contrato (ver nota no README). Este formulário deixa explícito em quais
 * dos três contratos a concessão/revogação deve ser aplicada, em vez de
 * assumir um papel global único.
 */
function SecaoContratosMultiplos({
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
  const [alvos, setAlvos] = useState<Record<NomeContrato, boolean>>({
    ContratoLote: true,
    ContratoTokenizacao: true,
    ContratoRastreamento: true,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [executando, setExecutando] = useState(false);

  const contratosSelecionados = TODOS_CONTRATOS.filter((nome) => alvos[nome]);

  async function executar(acao: "conceder" | "revogar") {
    setErro(null);
    if (!endereco) {
      setErro("Informe o endereço da conta.");
      return;
    }
    if (contratosSelecionados.length === 0) {
      setErro("Selecione ao menos um contrato.");
      return;
    }
    setExecutando(true);
    try {
      await aplicarPapel(contratosSelecionados, papel, endereco, acao, signer, chainId, setStatus);
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
      <div className="checkboxes">
        {TODOS_CONTRATOS.map((nome) => (
          <label key={nome}>
            <input
              type="checkbox"
              checked={alvos[nome]}
              onChange={(e) => setAlvos((atual) => ({ ...atual, [nome]: e.target.checked }))}
            />
            {nome}
          </label>
        ))}
      </div>
      <div className="acoes">
        <button type="button" onClick={() => void executar("conceder")}>
          Conceder
        </button>
        <button type="button" onClick={() => void executar("revogar")}>
          Revogar
        </button>
      </div>
      {executando && status && <p>{status}</p>}
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

function SecaoRastreamento({
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
  const [erro, setErro] = useState<string | null>(null);
  const [executando, setExecutando] = useState(false);

  async function executar(acao: "conceder" | "revogar") {
    setErro(null);
    if (!endereco) {
      setErro("Informe o endereço da conta.");
      return;
    }
    setExecutando(true);
    try {
      await aplicarPapel(["ContratoRastreamento"], papel, endereco, acao, signer, chainId, () => undefined);
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
      <p className="dica">Papel existente apenas em ContratoRastreamento.</p>
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
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

function ListaEnderecos({ titulo, enderecos }: { titulo: string; enderecos: string[] }) {
  return (
    <div>
      <h4>{titulo}</h4>
      {enderecos.length === 0 ? <p className="dica">Nenhuma conta.</p> : <ul>{enderecos.map((e) => <li key={e}>{e}</li>)}</ul>}
    </div>
  );
}

export function Participantes() {
  const { chainId, signer } = useCarteira();
  const papeis = usePapeis();
  const [detentores, setDetentores] = useState<Detentores | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregarDetentores = useCallback(async () => {
    if (!chainId || !signer) return;
    try {
      const lote = obterContrato("ContratoLote", chainId, signer);
      const tokenizacao = obterContrato("ContratoTokenizacao", chainId, signer);
      const rastreamento = obterContrato("ContratoRastreamento", chainId, signer);

      const [
        adminsLote,
        fabricantesLote,
        adminsToken,
        fabricantesToken,
        adminsRastro,
        fabricantesRastro,
        distribuidores,
        varejistas,
      ] = (await Promise.all([
        lote.detentoresDoPapel(PAPEL_ADMIN),
        lote.detentoresDoPapel(PAPEL_FABRICANTE),
        tokenizacao.detentoresDoPapel(PAPEL_ADMIN),
        tokenizacao.detentoresDoPapel(PAPEL_FABRICANTE),
        rastreamento.detentoresDoPapel(PAPEL_ADMIN),
        rastreamento.detentoresDoPapel(PAPEL_FABRICANTE),
        rastreamento.detentoresDoPapel(PAPEL_DISTRIBUIDOR),
        rastreamento.detentoresDoPapel(PAPEL_VAREJISTA),
      ])) as string[][];

      setDetentores({
        lote: { admin: adminsLote, fabricante: fabricantesLote },
        tokenizacao: { admin: adminsToken, fabricante: fabricantesToken },
        rastreamento: {
          admin: adminsRastro,
          fabricante: fabricantesRastro,
          distribuidor: distribuidores,
          varejista: varejistas,
        },
      });
    } catch (erroLeitura) {
      setErro(mapearErroContrato(erroLeitura));
    }
  }, [chainId, signer]);

  useEffect(() => {
    void carregarDetentores();
  }, [carregarDetentores]);

  if (!chainId || !signer) return null;

  return (
    <section>
      <h1>Participantes</h1>
      <p className="dica">
        Fabricante e administrador são papéis separados por contrato — marque em quais dos três a ação deve
        valer. Distribuidor e varejista só existem em ContratoRastreamento. Os três papéis operacionais
        (fabricante, distribuidor, varejista) são mutuamente exclusivos por conta.
      </p>

      <div className="grade-formularios">
        <SecaoContratosMultiplos
          titulo="Fabricante"
          papel={PAPEL_FABRICANTE}
          chainId={chainId}
          signer={signer}
          aoConcluir={() => {
            void carregarDetentores();
            papeis.recarregar();
          }}
        />
        <SecaoContratosMultiplos
          titulo="Administrador"
          papel={PAPEL_ADMIN}
          chainId={chainId}
          signer={signer}
          aoConcluir={() => {
            void carregarDetentores();
            papeis.recarregar();
          }}
        />
        <SecaoRastreamento
          titulo="Distribuidor"
          papel={PAPEL_DISTRIBUIDOR}
          chainId={chainId}
          signer={signer}
          aoConcluir={() => {
            void carregarDetentores();
            papeis.recarregar();
          }}
        />
        <SecaoRastreamento
          titulo="Varejista"
          papel={PAPEL_VAREJISTA}
          chainId={chainId}
          signer={signer}
          aoConcluir={() => {
            void carregarDetentores();
            papeis.recarregar();
          }}
        />
      </div>

      <h2>Contas atuais por papel</h2>
      {erro && <p className="erro">{erro}</p>}
      {detentores && (
        <div className="grade-listas">
          <ListaEnderecos titulo="Admin — ContratoLote" enderecos={detentores.lote.admin} />
          <ListaEnderecos titulo="Fabricante — ContratoLote" enderecos={detentores.lote.fabricante} />
          <ListaEnderecos titulo="Admin — ContratoTokenizacao" enderecos={detentores.tokenizacao.admin} />
          <ListaEnderecos titulo="Fabricante — ContratoTokenizacao" enderecos={detentores.tokenizacao.fabricante} />
          <ListaEnderecos titulo="Admin — ContratoRastreamento" enderecos={detentores.rastreamento.admin} />
          <ListaEnderecos titulo="Fabricante — ContratoRastreamento" enderecos={detentores.rastreamento.fabricante} />
          <ListaEnderecos titulo="Distribuidor" enderecos={detentores.rastreamento.distribuidor} />
          <ListaEnderecos titulo="Varejista" enderecos={detentores.rastreamento.varejista} />
        </div>
      )}
    </section>
  );
}
