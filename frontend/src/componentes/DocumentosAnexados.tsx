import { useEffect, useState } from "react";
import { useAuth } from "../contexto/AuthContexto";
import { API_URL, fetchApi } from "../lib/api";
import { ipfsParaUrl } from "../lib/ipfs";

interface Props {
  metadataUri: string;
}

type Estado = "carregando" | "ok" | "vazio" | "erro";

export function DocumentosAnexados({ metadataUri }: Props) {
  const { token } = useAuth();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [documentos, setDocumentos] = useState<string[]>([]);

  useEffect(() => {
    if (!metadataUri.startsWith("ipfs://") || !token) return;
    setEstado("carregando");
    setDocumentos([]);
    let cancelado = false;

    void fetchApi(`${API_URL}/ipfs/conteudo?uri=${encodeURIComponent(metadataUri)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: unknown) => {
        if (cancelado) return;
        const docs = json && typeof json === "object"
          ? (json as { documentos?: unknown }).documentos
          : undefined;
        if (Array.isArray(docs) && docs.length > 0) {
          setDocumentos(docs as string[]);
          setEstado("ok");
        } else {
          setEstado("vazio");
        }
      })
      .catch(() => {
        if (!cancelado) setEstado("erro");
      });

    return () => { cancelado = true; };
  }, [metadataUri, token]);

  if (estado === "carregando") {
    return <p className="dica" style={{ marginTop: "0.5rem" }}>Buscando documentos…</p>;
  }
  if (estado === "erro") {
    return <p className="dica" style={{ marginTop: "0.5rem" }}>Não foi possível carregar os documentos.</p>;
  }
  if (estado === "vazio") return null;

  return (
    <ul className="documentos-anexados">
      {documentos.map((cid, i) => (
        <li key={cid} className="documentos-anexados__item">
          <span className="documentos-anexados__nome">Documento {i + 1}</span>
          <button
            type="button"
            className="botao--compacto"
            onClick={() => window.open(ipfsParaUrl(cid), "_blank", "noopener,noreferrer")}
          >
            Abrir documento
          </button>
        </li>
      ))}
    </ul>
  );
}
