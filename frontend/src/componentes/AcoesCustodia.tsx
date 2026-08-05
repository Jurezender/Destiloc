import type { JsonRpcSigner } from "ethers";
import { useEffect, useState } from "react";
import { obterContrato } from "../contracts";
import { mapearErroContrato } from "../lib/erros";
import { PAPEL_DISTRIBUIDOR, PAPEL_VAREJISTA } from "../lib/papeis";

interface Props {
  tokenId: bigint;
  chainId: number;
  signer: JsonRpcSigner;
  conta: string;
  custodianteAtual: string;
  pendente: boolean;
  destinatarioPendente: string;
  aoAtualizar: () => void;
}

/**
 * Ações de custódia (expedir / confirmar recebimento / cancelar expedição),
 * reaproveitadas na lista "Garrafas" e no detalhe de uma garrafa. Os botões
 * só aparecem quando a conta conectada está na posição certa para a ação —
 * o contrato recusaria de qualquer forma, mas evita uma transação fadada a
 * reverter.
 */
export function AcoesCustodia({
  tokenId,
  chainId,
  signer,
  conta,
  custodianteAtual,
  pendente,
  destinatarioPendente,
  aoAtualizar,
}: Props) {
  const souCustodiante = conta.toLowerCase() === custodianteAtual.toLowerCase();
  const souDestinatarioPendente = pendente && conta.toLowerCase() === destinatarioPendente.toLowerCase();

  if (souCustodiante && !pendente) return <FormExpedir {...{ tokenId, chainId, signer, conta, aoAtualizar }} />;
  if (souCustodiante && pendente) return <FormCancelar {...{ tokenId, chainId, signer, aoAtualizar }} />;
  if (souDestinatarioPendente) return <FormConfirmar {...{ tokenId, chainId, signer, aoAtualizar }} />;
  return null;
}

function FormExpedir({
  tokenId,
  chainId,
  signer,
  conta,
  aoAtualizar,
}: {
  tokenId: bigint;
  chainId: number;
  signer: JsonRpcSigner;
  conta: string;
  aoAtualizar: () => void;
}) {
  const [destinatarios, setDestinatarios] = useState<string[]>([]);
  const [destinatario, setDestinatario] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const rastreamento = obterContrato("ContratoRastreamento", chainId, signer);
      const [distribuidores, varejistas] = (await Promise.all([
        rastreamento.detentoresDoPapel(PAPEL_DISTRIBUIDOR),
        rastreamento.detentoresDoPapel(PAPEL_VAREJISTA),
      ])) as string[][];
      setDestinatarios([...distribuidores, ...varejistas].filter((e) => e.toLowerCase() !== conta.toLowerCase()));
    })();
  }, [chainId, signer, conta]);

  async function enviar() {
    if (!destinatario) {
      setErro("Selecione ou informe um destinatário.");
      return;
    }
    if (!localizacao.trim()) {
      setErro("Informe a localização.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const rastreamento = obterContrato("ContratoRastreamento", chainId, signer);
      const tx = await rastreamento.expedir(tokenId, destinatario, localizacao.trim());
      await tx.wait();
      setLocalizacao("");
      aoAtualizar();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Expedir</legend>
      <label>
        Destinatário (distribuidor ou varejista)
        <input list={`destinatarios-${tokenId}`} value={destinatario} onChange={(e) => setDestinatario(e.target.value.trim())} placeholder="0x…" />
        <datalist id={`destinatarios-${tokenId}`}>
          {destinatarios.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
      </label>
      <label>
        Localização
        <input value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} />
      </label>
      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Expedindo…" : "Expedir"}
      </button>
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

function FormConfirmar({
  tokenId,
  chainId,
  signer,
  aoAtualizar,
}: {
  tokenId: bigint;
  chainId: number;
  signer: JsonRpcSigner;
  aoAtualizar: () => void;
}) {
  const [localizacao, setLocalizacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    if (!localizacao.trim()) {
      setErro("Informe a localização.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const rastreamento = obterContrato("ContratoRastreamento", chainId, signer);
      const tx = await rastreamento.confirmarRecebimento(tokenId, localizacao.trim());
      await tx.wait();
      aoAtualizar();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Confirmar recebimento</legend>
      <label>
        Localização
        <input value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} />
      </label>
      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Confirmando…" : "Confirmar recebimento"}
      </button>
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}

function FormCancelar({
  tokenId,
  chainId,
  signer,
  aoAtualizar,
}: {
  tokenId: bigint;
  chainId: number;
  signer: JsonRpcSigner;
  aoAtualizar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    setErro(null);
    setEnviando(true);
    try {
      const rastreamento = obterContrato("ContratoRastreamento", chainId, signer);
      const tx = await rastreamento.cancelarExpedicao(tokenId, motivo.trim());
      await tx.wait();
      setMotivo("");
      aoAtualizar();
    } catch (erroEnvio) {
      setErro(mapearErroContrato(erroEnvio));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <fieldset disabled={enviando}>
      <legend>Há uma expedição pendente</legend>
      <label>
        Motivo do cancelamento (opcional)
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <button type="button" onClick={() => void enviar()}>
        {enviando ? "Cancelando…" : "Cancelar expedição"}
      </button>
      {erro && <p className="erro">{erro}</p>}
    </fieldset>
  );
}
