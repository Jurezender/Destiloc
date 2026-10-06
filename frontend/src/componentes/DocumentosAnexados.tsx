import { useEffect, useState } from "react";
import { ipfsParaUrl } from "../lib/ipfs";

interface Props {
  metadataUri: string;
}

export function DocumentosAnexados({ metadataUri }: Props) {
  const [documentos, setDocumentos] = useState<string[] | null>(null);

  useEffect(() => {
    if (!metadataUri.startsWith("ipfs://")) return;
    let cancelado = false;

    void fetch(ipfsParaUrl(metadataUri))
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => {
        if (cancelado || !json || typeof json !== "object") return;
        const docs = (json as { documentos?: unknown }).documentos;
        if (Array.isArray(docs) && docs.length > 0) {
          setDocumentos(docs as string[]);
        }
      })
      .catch(() => {});

    return () => {
      cancelado = true;
    };
  }, [metadataUri]);

  if (!documentos) return null;

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
