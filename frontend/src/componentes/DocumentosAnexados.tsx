import { useEffect, useState } from "react";
import { ipfsParaUrl } from "../lib/ipfs";

interface Props {
  metadataUri: string;
}

type Estado = "carregando" | "ok" | "vazio" | "erro";

export function DocumentosAnexados({ metadataUri }: Props) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [documentos, setDocumentos] = useState<string[]>([]);

  useEffect(() => {
    if (!metadataUri.startsWith("ipfs://")) return;
    setEstado("carregando");
    setDocumentos([]);
    let cancelado = false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    void fetch(ipfsParaUrl(metadataUri), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: unknown) => {
        if (cancelado) return;
        clearTimeout(timeout);
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
        clearTimeout(timeout);
      });

    return () => {
      cancelado = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [metadataUri]);

  if (estado === "carregando") {
    return <p className="dica" style={{ marginTop: "0.5rem" }}>Buscando documentos anexados…</p>;
  }
  if (estado === "erro") {
    return (
      <p className="dica" style={{ marginTop: "0.5rem" }}>
        Não foi possível carregar os documentos (gateway IPFS indisponível).
      </p>
    );
  }
  if (estado === "vazio") return null;

  return (
    <ul className="documentos-anexados">
      {documentos.map((cid, i) => (
        <li key={cid} className="documentos-anexados__item">
          <span className="documentos-anexados__nome">Documento {i + 1}</span>
          <a href={ipfsParaUrl(cid)} target="_blank" rel="noopener noreferrer" className="link-ipfs">
            Abrir documento
          </a>
        </li>
      ))}
    </ul>
  );
}
