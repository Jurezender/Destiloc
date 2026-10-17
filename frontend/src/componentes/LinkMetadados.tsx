import { ipfsParaUrl } from "../lib/ipfs";
import { DocumentosAnexados } from "./DocumentosAnexados";

interface Props {
  uri: string;
  exibirDocumentos?: boolean;
}

export function LinkMetadados({ uri, exibirDocumentos = false }: Props) {
  if (!uri) return null;
  return (
    <>
      <span className="mono" style={{ display: "block", wordBreak: "break-all" }}>{uri}</span>
      {uri.startsWith("ipfs://") && (
        <>
          <a
            href={ipfsParaUrl(uri)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-ipfs"
          >
            Ver metadados
          </a>
          {exibirDocumentos && <DocumentosAnexados metadataUri={uri} />}
        </>
      )}
    </>
  );
}
